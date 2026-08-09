import { Injectable } from '@angular/core';

export interface AiDocument {
  _id: string;
  siteId: string;
  filename: string;
  fileExt: string;
  size: number;
  category: string;
  metadata: { pageCount: number | null };
  chunkCount: number;
  embeddingStatus: 'pending' | 'processing' | 'completed' | 'failed';
  errorMessage: string | null;
  uploadedBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface AiCitation {
  documentId: string;
  filename: string;
  fileExt: string;
  page: number | null;
  score: number;
  preview: string;
}

export type AiSseEvent =
  | { type: 'citations'; items: AiCitation[] }
  | { type: 'tool'; name: string }
  | { type: 'clause'; text: string }
  | { type: 'rag_unavailable'; details: string }
  | { type: 'done'; text: string }
  | { type: 'error'; error: string };

export interface AiChatHistoryMessage {
  role: 'user' | 'assistant';
  content: string;
}

export const AI_ALLOWED_EXTENSIONS = ['.pdf', '.docx', '.xlsx', '.pptx', '.txt', '.md'];
export const AI_MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

@Injectable({
  providedIn: 'root'
})
export class AiService {
  private apiBaseUrl = window.location.port === '4200' ? 'http://localhost:3000' : '';

  async uploadDocument(siteId: string, file: File, uploadedBy: string): Promise<any> {
    const formData = new FormData();
    formData.append('file', file, file.name);
    formData.append('uploadedBy', uploadedBy);

    const response = await fetch(`${this.apiBaseUrl}/api/ai/sites/${siteId}/documents/upload`, {
      method: 'POST',
      body: formData
    });
    const result = await response.json();
    if (!response.ok || !result.success) {
      throw new Error(result.message || `上傳失敗 (${response.status})`);
    }
    return result;
  }

  async listDocuments(siteId: string): Promise<AiDocument[]> {
    const response = await fetch(`${this.apiBaseUrl}/api/ai/sites/${siteId}/documents`);
    const result = await response.json();
    if (!response.ok || !result.success) {
      throw new Error(result.message || '查詢文件列表失敗');
    }
    return result.documents;
  }

  async deleteDocument(siteId: string, documentId: string): Promise<void> {
    const response = await fetch(`${this.apiBaseUrl}/api/ai/sites/${siteId}/documents/${documentId}`, {
      method: 'DELETE'
    });
    const result = await response.json();
    if (!response.ok || !result.success) {
      throw new Error(result.message || '刪除文件失敗');
    }
  }

  /** 出處原檔連結(PDF 可帶 page 讓瀏覽器跳頁) */
  documentFileUrl(documentId: string, page?: number | null): string {
    const url = `${this.apiBaseUrl}/api/ai/documents/${documentId}/file`;
    return page ? `${url}#page=${page}` : url;
  }

  /**
   * SSE 串流問答。onEvent 依序收到 citations → (tool | clause)* → done。
   * 呼叫端用 AbortController 的 signal 可隨時中止。
   */
  async chatStream(
    siteId: string,
    message: string,
    history: AiChatHistoryMessage[],
    sessionId: string,
    onEvent: (event: AiSseEvent) => void,
    signal: AbortSignal
  ): Promise<void> {
    const response = await fetch(`${this.apiBaseUrl}/api/ai/sites/${siteId}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, history, sessionId }),
      signal
    });

    if (!response.ok || !response.body) {
      let detail = `伺服器回應 ${response.status}`;
      try {
        const err = await response.json();
        detail = err.message || err.error || detail;
      } catch { /* 非 JSON 回應 */ }
      throw new Error(detail);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const frames = buffer.split('\n\n');
      buffer = frames.pop()!;
      for (const frame of frames) {
        if (frame.startsWith('data: ')) {
          try {
            onEvent(JSON.parse(frame.slice(6)) as AiSseEvent);
          } catch {
            // 不完整/畸形 frame 直接略過
          }
        }
      }
    }
  }
}
