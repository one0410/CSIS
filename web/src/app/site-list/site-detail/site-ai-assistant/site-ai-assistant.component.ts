import { Component, ElementRef, OnDestroy, ViewChild, computed, effect, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import dayjs from 'dayjs';
import {
  AI_ALLOWED_EXTENSIONS,
  AI_MAX_FILE_SIZE,
  AiChatLink,
  AiCitation,
  AiDocument,
  AiService
} from '../../../services/ai.service';
import { AuthService } from '../../../services/auth.service';
import { CurrentSiteService } from '../../../services/current-site.service';
import { MongodbService } from '../../../services/mongodb.service';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  sources?: AiCitation[];
  links?: AiChatLink[];
  noEvidence?: boolean;
  error?: string;
}

interface AiConversation {
  _id: string;
  siteId: string;
  sessionId: string;
  userId: string | null;
  messages: { role: 'user' | 'assistant'; content: string; sources?: AiCitation[]; links?: AiChatLink[]; timestamp: string }[];
  createdAt: string;
  updatedAt: string;
}

// crypto.randomUUID() 只在 secure context(HTTPS/localhost)存在;院內以 http://ip 存取時
// 會整頁白屏。非安全環境退回一個夠用的 fallback(僅作對話分組鍵,無密碼學需求)。
function newSessionId(): string {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
  } catch { /* 非安全環境 → 走 fallback */ }
  return `sess-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

@Component({
  selector: 'app-site-ai-assistant',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './site-ai-assistant.component.html',
  styleUrls: ['./site-ai-assistant.component.scss']
})
export class SiteAiAssistantComponent implements OnDestroy {
  private aiService = inject(AiService);
  private authService = inject(AuthService);
  private currentSiteService = inject(CurrentSiteService);
  private mongodbService = inject(MongodbService);

  @ViewChild('chatScroll') chatScroll?: ElementRef<HTMLDivElement>;

  site = computed(() => this.currentSiteService.currentSite());

  // 使用者頭像:比照 top-bar——有 avatar 用圖,否則名字首字(藍紫漸層圓形)
  userAvatar = computed(() => this.authService.user()?.avatar || null);
  userInitial = computed(() => this.authService.user()?.name?.charAt(0) || 'U');

  activeTab = signal<'chat' | 'history' | 'docs'>('chat');

  // --- 問答 tab ---
  messages = signal<ChatMessage[]>([]);
  input = signal('');
  streaming = signal(false);
  toolStatus = signal<string | null>(null);
  private sessionId: string = newSessionId();
  private abortController: AbortController | null = null;

  // --- 歷史對話 ---
  historyList = signal<AiConversation[]>([]);
  loadingHistory = signal(false);

  // --- 文件管理 tab ---
  documents = signal<AiDocument[]>([]);
  loadingDocs = signal(false);
  uploading = signal(false);
  uploadProgress = signal('');
  dragOver = signal(false);
  private pollTimer: ReturnType<typeof setInterval> | null = null;

  readonly acceptExtensions = AI_ALLOWED_EXTENSIONS.join(',');

  constructor() {
    effect(() => {
      const currentSite = this.site();
      if (currentSite?._id) {
        this.loadDocuments();
      }
    });
  }

  ngOnDestroy() {
    this.stopPolling();
    this.abortController?.abort();
  }

  // ==========================================================================
  // 問答
  // ==========================================================================
  async send() {
    const question = this.input().trim();
    const siteId = this.site()?._id;
    if (!question || !siteId || this.streaming()) return;

    // history 帶「本則之前」的完整對話(後端取最近 10 則)
    const history = this.messages()
      .filter(m => !m.error && m.content)
      .map(m => ({ role: m.role, content: m.content }));

    this.input.set('');
    this.messages.update(msgs => [...msgs, { role: 'user', content: question }, { role: 'assistant', content: '' }]);
    this.streaming.set(true);
    this.toolStatus.set(null);
    this.abortController = new AbortController();
    this.scrollToBottom();

    try {
      const userId = this.authService.user()?._id || '';
      await this.aiService.chatStream(siteId, question, history, this.sessionId, userId, event => {
        switch (event.type) {
          case 'citations':
            this.updateLastMessage(m => {
              m.sources = event.items;
              m.noEvidence = event.items.length === 0;
            });
            break;
          case 'tool':
            this.toolStatus.set(this.toolLabel(event.name));
            break;
          case 'links':
            this.updateLastMessage(m => (m.links = [...(m.links || []), ...event.items]));
            break;
          case 'clause':
            this.toolStatus.set(null);
            this.updateLastMessage(m => (m.content += event.text));
            this.scrollToBottom();
            break;
          case 'rag_unavailable':
            this.updateLastMessage(m => (m.noEvidence = true));
            break;
          case 'error':
            this.updateLastMessage(m => (m.error = event.error));
            break;
          case 'done':
            break;
        }
      }, this.abortController.signal);
    } catch (error: any) {
      if (error?.name !== 'AbortError') {
        console.error(error);
        this.updateLastMessage(m => (m.error = error?.message || '查詢失敗,請稍後再試'));
      }
    } finally {
      this.streaming.set(false);
      this.toolStatus.set(null);
      this.abortController = null;
      this.scrollToBottom();
    }
  }

  stop() {
    this.abortController?.abort();
  }

  onInputKeydown(event: KeyboardEvent) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      this.send();
    }
  }

  openCitation(citation: AiCitation) {
    const siteId = this.site()?._id;
    // documentId 可能為 null(原檔已刪但向量殘留),避免開出 /null/file 的 400 分頁
    if (!siteId || !citation.documentId) {
      alert('此出處的原始文件已不存在');
      return;
    }
    window.open(this.aiService.documentFileUrl(siteId, citation.documentId, citation.page), '_blank');
  }

  openLink(link: AiChatLink) {
    // 只接受站內相對路徑 —— 歷史對話的 links 來自 DB,擋 javascript:/外部 URL 注入
    if (!link.url || !link.url.startsWith('/')) {
      console.warn('拒絕開啟非站內連結:', link.url);
      return;
    }
    window.open(link.url, '_blank'); // 新分頁開表單頁,保留當前對話
  }

  // ==========================================================================
  // 歷史對話
  // ==========================================================================
  newConversation() {
    this.abortController?.abort(); // 停掉進行中的串流,否則舊 clause 會寫進新對話
    this.messages.set([]);
    this.sessionId = newSessionId();
    this.activeTab.set('chat');
  }

  openHistoryTab() {
    this.activeTab.set('history');
    this.loadHistoryList();
  }

  async loadHistoryList() {
    const siteId = this.site()?._id;
    const userId = this.authService.user()?._id;
    if (!siteId || !userId) return;
    try {
      this.loadingHistory.set(true);
      // 列表只取第一則訊息當標題($slice),完整內容點開時再載
      const list = await this.mongodbService.getArray('ai_conversations',
        { siteId, userId },
        { sort: { updatedAt: -1 }, projection: { messages: { $slice: 1 } }, limit: 50 });
      this.historyList.set(list);
    } catch (error) {
      console.error('載入歷史對話失敗:', error);
    } finally {
      this.loadingHistory.set(false);
    }
  }

  conversationTitle(conv: AiConversation): string {
    const first = conv.messages?.find(m => m.role === 'user')?.content || '(無內容)';
    return first.length > 60 ? first.slice(0, 60) + '…' : first;
  }

  async openConversation(conv: AiConversation) {
    const siteId = this.site()?._id;
    if (!siteId) return;
    this.abortController?.abort(); // 停掉進行中的串流,否則舊 clause 會污染載入的對話
    try {
      const full = await this.mongodbService.getArray('ai_conversations',
        { siteId, sessionId: conv.sessionId }, { limit: 1 });
      const messages = full[0]?.messages || [];
      this.messages.set(messages.map((m: any) => ({
        role: m.role,
        content: m.content,
        sources: m.sources?.length ? m.sources : undefined,
        links: m.links?.length ? m.links : undefined,
      })));
      this.sessionId = conv.sessionId; // 沿用原 session,繼續追問會 append 到同一筆
      this.activeTab.set('chat');
      this.scrollToBottom();
    } catch (error) {
      console.error('載入對話失敗:', error);
      alert('載入對話失敗');
    }
  }

  formatHistoryTime(time: string): string {
    return dayjs(time).format('MM-DD HH:mm');
  }

  scorePercent(score: number): string {
    return `${Math.round(score * 100)}%`;
  }

  private toolLabel(name: string): string {
    const labels: Record<string, string> = {
      get_project_progress: '查詢工程進度中…',
      get_worker_count: '查詢人員數量中…',
      get_active_permits: '查詢許可單中…',
      get_site_info: '查詢工地資料中…',
      get_expected_workforce: '查詢預計出工中…',
      get_safety_violations: '查詢違規統計中…',
      get_zero_accident_hours: '查詢零事故時數中…',
      get_equipment_status: '查詢機具狀態中…',
      get_weather: '查詢天氣資訊中…'
    };
    return labels[name] || '查詢工地資料中…';
  }

  private updateLastMessage(mutate: (m: ChatMessage) => void) {
    this.messages.update(msgs => {
      const copy = [...msgs];
      const last = { ...copy[copy.length - 1] };
      mutate(last);
      copy[copy.length - 1] = last;
      return copy;
    });
  }

  private scrollToBottom() {
    setTimeout(() => {
      const el = this.chatScroll?.nativeElement;
      if (el) el.scrollTop = el.scrollHeight;
    });
  }

  // ==========================================================================
  // 文件管理
  // ==========================================================================
  async loadDocuments() {
    const siteId = this.site()?._id;
    if (!siteId) return;
    try {
      this.loadingDocs.set(true);
      const docs = await this.aiService.listDocuments(siteId);
      this.documents.set(docs);
      this.syncPolling(docs);
    } catch (error) {
      console.error('載入文件列表失敗:', error);
    } finally {
      this.loadingDocs.set(false);
    }
  }

  onFileSelected(event: any) {
    const files = event.target.files;
    if (files?.length > 0) {
      this.handleFiles(files);
      event.target.value = ''; // 重置才能重選同一檔
    }
  }

  onDragOver(event: DragEvent) {
    event.preventDefault();
    this.dragOver.set(true);
  }

  onDragLeave(event: DragEvent) {
    event.preventDefault();
    this.dragOver.set(false);
  }

  onDrop(event: DragEvent) {
    event.preventDefault();
    this.dragOver.set(false);
    if (event.dataTransfer?.files?.length) {
      this.handleFiles(event.dataTransfer.files);
    }
  }

  private async handleFiles(files: FileList) {
    const siteId = this.site()?._id;
    if (!siteId) return;

    const fileArray: File[] = Array.from(files); // FileList 會被清空,先轉 Array
    const uploadedBy = this.authService.user()?.name || '';

    // 前端先驗格式與大小(後端會再驗一次)
    for (const file of fileArray) {
      const ext = file.name.slice(file.name.lastIndexOf('.')).toLowerCase();
      if (!AI_ALLOWED_EXTENSIONS.includes(ext)) {
        alert(`「${file.name}」格式不支援,僅支援:${AI_ALLOWED_EXTENSIONS.join(', ')}`);
        return;
      }
      if (file.size > AI_MAX_FILE_SIZE) {
        alert(`「${file.name}」超過 50MB 上限`);
        return;
      }
    }

    this.uploading.set(true);
    let uploaded = 0;
    try {
      for (const file of fileArray) {
        this.uploadProgress.set(`上傳中 ${uploaded + 1}/${fileArray.length}:${file.name}`);
        await this.aiService.uploadDocument(siteId, file, uploadedBy);
        uploaded++;
      }
    } catch (error: any) {
      console.error(error);
      alert(error?.message || '上傳失敗');
    } finally {
      this.uploading.set(false);
      this.uploadProgress.set('');
      await this.loadDocuments();
    }
  }

  async deleteDocument(doc: AiDocument) {
    const siteId = this.site()?._id;
    if (!siteId) return;
    if (!confirm(`確定刪除「${doc.filename}」?刪除後將無法在問答中檢索到此文件。`)) return;
    try {
      await this.aiService.deleteDocument(siteId, doc._id);
      await this.loadDocuments();
    } catch (error: any) {
      console.error(error);
      alert(error?.message || '刪除失敗');
    }
  }

  openDocument(doc: AiDocument) {
    const siteId = this.site()?._id;
    if (!siteId) return;
    window.open(this.aiService.documentFileUrl(siteId, doc._id), '_blank');
  }

  formatSize(size: number): string {
    if (size >= 1024 * 1024) return `${(size / 1024 / 1024).toFixed(1)} MB`;
    return `${Math.ceil(size / 1024)} KB`;
  }

  formatTime(time: string): string {
    return dayjs(time).format('YYYY-MM-DD HH:mm');
  }

  // pending/processing 存在時每 3 秒輪詢,全部終態即停(AC-1.2 狀態可觀察)
  private syncPolling(docs: AiDocument[]) {
    const hasActive = docs.some(d => d.embeddingStatus === 'pending' || d.embeddingStatus === 'processing');
    if (hasActive && !this.pollTimer) {
      this.pollTimer = setInterval(() => this.loadDocuments(), 3000);
    } else if (!hasActive) {
      this.stopPolling();
    }
  }

  private stopPolling() {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }
}
