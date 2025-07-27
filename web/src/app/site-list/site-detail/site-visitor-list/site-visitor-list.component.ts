import { Component, computed, signal, inject, OnInit, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { QRCodeComponent } from 'angularx-qrcode';
import { Worker } from '../../../model/worker.model';
import { Visitor } from '../../../model/visitor.model';
import { MongodbService } from '../../../services/mongodb.service';
import { CurrentSiteService } from '../../../services/current-site.service';

@Component({
  selector: 'app-site-visitor-list',
  imports: [CommonModule, FormsModule, QRCodeComponent],
  templateUrl: './site-visitor-list.component.html',
  styleUrl: './site-visitor-list.component.scss'
})
export class SiteVisitorListComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private mongodbService = inject(MongodbService);
  private currentSiteService = inject(CurrentSiteService);

  //siteId = signal<string>('');
  site = computed(() => this.currentSiteService.currentSite());
  visitors = signal<Visitor[]>([]);
  loading = signal<boolean>(false);
  showAddForm = signal<boolean>(false);
  editingVisitorId = signal<string | null>(null);
  editingVisitor = signal<{ idno: string; tel: string }>({ idno: '', tel: '' });

  // 危害告知狀態 (現在從 visitor.hazardNoticeCompleted 直接取得)
  // visitorHazardNoticeStatus = signal<Map<string, boolean>>(new Map());

  // QR Code modal 相關
  showQRModal = signal<boolean>(false);
  hazardNoticeUrl = computed(() => {
    const currentSite = this.site();
    if (!currentSite?._id) return '';
    const baseUrl = window.location.origin;
    return `${baseUrl}/visitor-hazard-notice/${currentSite._id}`;
  });

  // 危害告知事項設定相關
  showSettingsModal = signal<boolean>(false);
  editingHazardNoticeContent = signal<string>('');
  hazardNoticeContent = signal<string>(`01. 本人承諾絕對遵守職業安全衛生法規定與相關設施規則及帆宣系統科技股份有限公司之安全衛生規定，且依規定佩戴個人防護具(安全帽、安全帶、繫帽扣…等)、穿背心，決不打赤膊及穿拖(涼)鞋進場。
02. 承攬商進入本公司作業前需指派一位現場負責人或安衛人員，負責於現場督導現場工作之安全衛生、環境維護、品質及進度等事項，並作為本公司與承攬商間之溝通窗口，與本公司工安及工程承辦人員密切配合及討論，以了解工作環境及潛在危險因素，並應向其所屬施工人員（含下屬承包商）告知以防止災害之發生，否則本公司人員有權終止承攬商之現場作業。
03. 人員未取得工作證資格者，禁止從事施工作業之行為，緊急搶修及來賓訪客須由陪同人員全程陪同。
04. 本人絕對確實執行作業前、中及作業後之自動檢點事項，並使用相關安全防護具，遵守作業安全規定。
05. 廠內嚴禁攜帶、夾帶、販賣、飲用含酒精性飲料與禁藥及賭博、鬥毆、起鬨、鬧事…等行為，否則驅逐出場（嚴重者依法究辦）。
06. 廠內禁菸、檳榔，吸煙區外其餘區域一律禁菸及禁食檳榔。
07. 非指定區域禁止用餐，廠內電氣室、監控室…等管制區域非經申請不得進入，且不得於此飲食。
08. 使用電源、電器設備應使用壓接端子，嚴禁裸線搭接，線路應架高或以堅硬物件加以保護，並使用標準插頭、插座、接地裝置、漏電斷路裝置、線路絕緣不得破損且須避開積水之處。
09. 廠內各開關、閥件應予以管制、標示，非經申請或許可不得擅自操作或動作。
10. 如發現突發狀況應叫支援及通知相關單位處理，如火警時應立即停止手上工作並關閉所有開關、閥件後立即使用滅火器滅火，並高聲喊叫支援及通知相關單位。
11. 如因工作需求，需打開或拆除安全設施或設備時，須事先提出申請，於現場做好開口防護措施及派專人於現場監督管制，施工告一段落或完畢後應隨手復原並檢查有無牢固，確保他人安全。
12. 絕對遵守潔淨室之安全衛生規定，違反者依規定處置辦理。
13. 廠內產生之生活廢棄物應放置於設置定點之生活廢棄物專用桶，不得隨意丟棄。
14. 易生蚊蠅之液體食物、檳榔汁不得隨地丟棄，以保持環境衛生。
15. 場內人員嚴禁有言語挑釁、傷害、暴力…等行為，否則除驅逐出場外並負一切賠償責任，嚴重者甚至依法究辦。
16. 若於廠內聽到警報時，應注意聆聽警衛室廣播，若有緊急疏散廣播時，依照廣播指示或廠內引導人員指示疏散，廠區皆有張貼逃生路線。
17. 如有違背上述規定願接受帆宣系統科技股份有限公司罰責處理。
18. 如有未盡告知之安全衛生相關法規得依帆宣系統科技股份有限公司之承攬商安全衛生管理辦法執行辦理。`);

  // 新增訪客表單
  newVisitor: Partial<Visitor> = {
    name: '',
    idno: '',
    tel: '',
    hazardNoticeCompleted: false
  };

  constructor() {
    // 監聽 site() 變化，當有值時載入訪客列表
    effect(() => {
      const currentSite = this.site();
      if (currentSite?._id) {
        this.loadVisitors();
      }
    });
  }

  async ngOnInit() {
    await this.loadHazardNoticeSettings();
    // 可以移除這裡的 loadVisitors() 呼叫，因為 effect 會處理
  }

  async loadVisitors() {
    this.loading.set(true);
    try {
      const currentSite = this.site();
      if (!currentSite?._id) {
        console.warn('工地資訊尚未載入');
        return;
      }

      // 查詢該工地的訪客
      const filter = {
        'siteId': currentSite._id
      };

      const visitors = await this.mongodbService.get('visitor', filter) as Visitor[];
      this.visitors.set(visitors);

    } catch (error) {
      console.error('載入訪客列表失敗:', error);
    } finally {
      this.loading.set(false);
    }
  }

  // 檢查訪客是否有危害告知
  hasHazardNotice(visitor: Visitor): boolean {
    return visitor.hazardNoticeCompleted || false;
  }

  showAddVisitorForm() {
    // 導航到危害告知頁面供現場簽名（強制新增模式）
    const currentSite = this.site();
    if (currentSite?._id) {
      this.router.navigate(['/visitor-hazard-notice', currentSite._id, 'new']);
    } else {
      alert('工地資訊尚未載入');
    }
  }

  hideAddVisitorForm() {
    this.showAddForm.set(false);
    this.resetNewVisitor();
  }

  resetNewVisitor() {
    this.newVisitor = {
      name: '',
      idno: '',
      tel: '',
      hazardNoticeCompleted: false
    };
  }

  async saveVisitor() {
    const visitor = this.newVisitor;

    // 驗證必填欄位
    if (!visitor.name?.trim()) {
      alert('請輸入姓名');
      return;
    }

    // 檢查是否已存在同名訪客
    const currentSite = this.site();
    if (!currentSite?._id) {
      alert('工地資訊尚未載入');
      return;
    }

    const existingVisitor = await this.mongodbService.get('visitor', {
      name: visitor.name.trim(),
      siteId: currentSite._id
    });

    if (existingVisitor && existingVisitor.length > 0) {
      alert(`訪客 "${visitor.name.trim()}" 已存在，請勿重複新增`);
      return;
    }

    try {
      this.loading.set(true);

      // 設定 visitor 物件
      const newVisitorData: Omit<Visitor, '_id'> = {
        name: visitor.name!.trim(),
        idno: visitor.idno?.trim(),
        tel: visitor.tel?.trim(),
        hazardNoticeCompleted: false,
        siteId: currentSite._id,
        entryDate: new Date(),
        createdAt: new Date(),
        updatedAt: new Date()
      };

      const result = await this.mongodbService.post('visitor', newVisitorData);

      if (result.insertedId) {
        this.hideAddVisitorForm();
        await this.loadVisitors();
      } else {
        alert('新增訪客失敗');
      }
    } catch (error) {
      console.error('新增訪客失敗:', error);
      alert('新增訪客失敗');
    } finally {
      this.loading.set(false);
    }
  }

  async deleteVisitor(visitor: Visitor) {
    if (!confirm(`確定要刪除訪客 ${visitor.name} 嗎？`)) {
      return;
    }

    try {
      this.loading.set(true);

      const result = await this.mongodbService.delete('visitor', visitor._id!);

      if (result) {
        await this.loadVisitors();
      } else {
        alert('刪除訪客失敗');
      }
    } catch (error) {
      console.error('刪除訪客失敗:', error);
      alert('刪除訪客失敗');
    } finally {
      this.loading.set(false);
    }
  }

  startEditVisitor(visitor: Visitor) {
    this.editingVisitorId.set(visitor._id!);
    this.editingVisitor.set({
      idno: visitor.idno || '',
      tel: visitor.tel || ''
    });
  }

  cancelEditVisitor() {
    this.editingVisitorId.set(null);
    this.editingVisitor.set({ idno: '', tel: '' });
  }

  async saveEditVisitor(visitor: Visitor) {
    const editData = this.editingVisitor();
    if (!editData) return;

    try {
      this.loading.set(true);

      const updateData = {
        idno: editData.idno,
        tel: editData.tel,
        updatedAt: new Date()
      };

      const result = await this.mongodbService.patch('visitor', visitor._id!, updateData);

      if (result) {
        this.cancelEditVisitor();
        await this.loadVisitors();
      } else {
        alert('更新訪客資料失敗');
      }
    } catch (error) {
      console.error('更新訪客資料失敗:', error);
      alert('更新訪客資料失敗');
    } finally {
      this.loading.set(false);
    }
  }

  // QR Code modal 相關方法
  showQRCodeModal() {
    this.showQRModal.set(true);
  }

  hideQRCodeModal() {
    this.showQRModal.set(false);
  }

  copyUrl(inputElement: HTMLInputElement) {
    inputElement.select();
    inputElement.setSelectionRange(0, 99999); // For mobile devices
    navigator.clipboard.writeText(inputElement.value).then(() => {
      alert('網址已複製到剪貼簿');
    }).catch(() => {
      // Fallback for older browsers
      document.execCommand('copy');
      alert('網址已複製到剪貼簿');
    });
  }

  // 查看訪客危害告知單
  viewVisitorDetail(visitor: Visitor) {
    const currentSite = this.site();
    if (currentSite?._id && visitor._id) {
      this.router.navigate(['/visitor-hazard-notice', currentSite._id, visitor._id]);
    } else {
      alert('無法查看訪客詳情');
    }
  }

  // 危害告知事項設定功能
  async openSettingsModal() {
    // 載入現有設定
    await this.loadHazardNoticeSettings();
    this.editingHazardNoticeContent.set(this.hazardNoticeContent());
    this.showSettingsModal.set(true);
  }

  closeSettingsModal() {
    this.showSettingsModal.set(false);
    this.editingHazardNoticeContent.set('');
  }

  async saveHazardNoticeSettings() {
    try {
      this.loading.set(true);
      const currentSite = this.site();
      if (!currentSite?._id) {
        alert('找不到工地資訊');
        return;
      }

      // 準備設定資料
      const settingData = {
        type: 'visitorHazardNotice',
        siteId: currentSite._id,
        content: this.editingHazardNoticeContent(),
        createdAt: new Date(),
        updatedAt: new Date()
      };

      // 先查詢是否已有設定
      const existingSettings = await this.mongodbService.get('setting',
        {
          type: 'visitorHazardNotice',
          siteId: currentSite._id
        });

      if (existingSettings && existingSettings.length > 0) {
        // 更新現有設定
        const updateData = {
          content: this.editingHazardNoticeContent(),
          updatedAt: new Date()
        };
        await this.mongodbService.patch('setting', existingSettings[0]._id, updateData);
      } else {
        // 新增設定
        await this.mongodbService.post('setting', settingData);
      }

      // 更新本地狀態
      this.hazardNoticeContent.set(this.editingHazardNoticeContent());
      this.closeSettingsModal();
      alert('危害告知事項設定已儲存');
    } catch (error) {
      console.error('儲存設定失敗:', error);
      alert('儲存設定失敗');
    } finally {
      this.loading.set(false);
    }
  }

  // 載入危害告知設定
  async loadHazardNoticeSettings() {
    try {
      const currentSite = this.site();
      if (!currentSite?._id) return;

      const settings = await this.mongodbService.get('setting',
        {
          type: 'visitorHazardNotice',
          siteId: currentSite._id
        });

      if (settings && settings.length > 0) {
        this.hazardNoticeContent.set(settings[0].content);
      }
    } catch (error) {
      console.error('載入危害告知設定失敗:', error);
    }
  }
}
