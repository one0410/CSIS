import { Component, signal, computed, OnInit, inject, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { MongodbService } from '../services/mongodb.service';
import { EmbeddedSignaturePadComponent } from '../shared/embedded-signature-pad/embedded-signature-pad.component';
import { Visitor } from '../model/visitor.model';
import { CurrentSiteService } from '../services/current-site.service';
import { AuthService } from '../services/auth.service';

@Component({
  selector: 'app-visitor-hazard-notice',
  imports: [CommonModule, FormsModule, EmbeddedSignaturePadComponent],
  templateUrl: './visitor-hazard-notice.component.html',
  styleUrl: './visitor-hazard-notice.component.scss'
})
export class VisitorHazardNoticeComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private mongodbService = inject(MongodbService);
  private currentSiteService = inject(CurrentSiteService);
  private authService = inject(AuthService);
  
  @ViewChild('signaturePad') signaturePad!: EmbeddedSignaturePadComponent;

  // 路由參數
  siteId = signal<string>('');
  visitorId = signal<string>(''); // 如果有值表示是查看模式
  forceNewMode = signal<boolean>(false); // 強制新增模式
  
  // 工地資訊
  currentSite = computed(() => this.currentSiteService.currentSite());
  
  // 訪客資訊（查看模式時使用）
  existingVisitor = signal<Visitor | null>(null);
  
  // 今日記錄
  todayVisitors = signal<Visitor[]>([]);
  showVisitorSelection = signal<boolean>(false);
  
  // 瀏覽器歷史記錄
  browserVisitors = signal<Visitor[]>([]);
  showBrowserHistory = signal<boolean>(false);
  
  // 歷史記錄統計計算屬性
  completedVisitorsCount = computed(() => 
    this.browserVisitors().filter(v => v.hazardNoticeCompleted).length
  );
  
  todayVisitorsCount = computed(() => {
    const today = new Date();
    return this.browserVisitors().filter(v => {
      const recordDate = new Date(v.createdAt || '');
      return recordDate.toDateString() === today.toDateString();
    }).length;
  });
  
  // 動態計算返回按鈕文字
  backButtonText = computed(() => {
    return this.authService.isLoggedIn() ? '返回訪客列表' : '返回上一頁';
  });
  
  // 表單資料
  visitorName = signal<string>('');
  visitorTel = signal<string>('');
  signature = signal<string>('');
  
  // 狀態
  loading = signal<boolean>(false);
  saving = signal<boolean>(false);
  completed = signal<boolean>(false);
  
  // 計算是否為查看模式
  isViewMode = computed(() => this.visitorId().length > 0);
  isNewMode = computed(() => !this.isViewMode() && !this.showVisitorSelection() && !this.showBrowserHistory());
  isSelectionMode = computed(() => this.showVisitorSelection());
  isHistoryMode = computed(() => this.showBrowserHistory());
  
  // 危害告知內容（從設定載入）
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

  ngOnInit() {
    const siteId = this.route.snapshot.paramMap.get('siteId');
    const visitorId = this.route.snapshot.paramMap.get('visitorId');
    const pathSegments = this.route.snapshot.url;
    
    // 檢查是否為強制新增模式
    const isForceNewMode = pathSegments.some(segment => segment.path === 'new');
    this.forceNewMode.set(isForceNewMode);
    
    if (siteId) {
      this.siteId.set(siteId);
      if (visitorId) {
        this.visitorId.set(visitorId);
      }
      
      this.loadSiteInfo();
    } else {
      alert('工地參數錯誤');
      this.router.navigate(['/']);
    }
  }

  async loadSiteInfo() {
    this.loading.set(true);
    try {
      // 先嘗試使用 CurrentSiteService 設定工地
      await this.currentSiteService.setCurrentSiteById(this.siteId());
      
      // 如果 CurrentSiteService 沒有成功載入，直接從資料庫獲取
      if (!this.currentSite()) {
        console.log('CurrentSiteService 未載入工地資訊，直接從資料庫獲取');
        const site = await this.mongodbService.getById('site', this.siteId()) as any;
        if (site) {
          // 手動設定到 CurrentSiteService
          await this.currentSiteService.setCurrentSite(site);
        } else {
          alert('找不到指定的工地');
          this.router.navigate(['/']);
          return;
        }
      }

      // 如果是查看模式，載入訪客資訊
      if (this.isViewMode()) {
        const visitor = await this.mongodbService.getById('visitor', this.visitorId()) as Visitor;
        if (visitor) {
          this.existingVisitor.set(visitor);
          // 填入表單資料以供顯示
          this.visitorName.set(visitor.name);
          this.visitorTel.set(visitor.tel || '');
          this.signature.set(visitor.signature || '');
          
                  // 如果訪客記錄中有儲存的注意事項內容，則使用它
        if (visitor.hazardNoticeContent) {
          this.hazardNoticeContent.set(visitor.hazardNoticeContent);
        }
          
          // 查看模式不設定completed狀態，讓內容可以正常顯示
        } else {
          alert('找不到指定的訪客');
          this.router.navigate(['/']);
          return;
        }
      } else {
        // 新增模式：載入設定並檢查今日同設備記錄
        await this.loadHazardNoticeSettings();
        await this.checkTodayVisitors();
      }
    } catch (error) {
      console.error('載入資訊失敗:', error);
      alert('載入資訊失敗');
      this.router.navigate(['/']);
    } finally {
      this.loading.set(false);
    }
  }

  onSignatureComplete(signatureData: string) {
    this.signature.set(signatureData);
  }

  clearSignature() {
    if (this.signaturePad) {
      this.signaturePad.clear();
    }
    this.signature.set('');
  }

  async submitHazardNotice() {
    // 驗證必填欄位
    if (!this.visitorName().trim()) {
      alert('請輸入姓名');
      return;
    }

    if (!this.signature()) {
      alert('請完成簽名');
      return;
    }

    this.saving.set(true);
    try {
      // 創建訪客記錄
      const visitor: Omit<Visitor, '_id'> = {
        name: this.visitorName().trim(),
        tel: this.visitorTel().trim() || undefined,
        signature: this.signature(),
        signedAt: new Date(),
        hazardNoticeCompleted: true,
        hazardNoticeCompletedAt: new Date(),
        hazardNoticeContent: this.hazardNoticeContent(), // 儲存當前的注意事項內容
        siteId: this.siteId(),
        entryDate: new Date(),
        createdAt: new Date(),
        updatedAt: new Date()
      };

      const result = await this.mongodbService.post('visitor', visitor);

      if (result.insertedId) {
        // 將今日的訪客記錄存入 localStorage
        this.saveTodayVisitorToStorage(result.insertedId);
        
        this.completed.set(true);
        setTimeout(() => {
          // 3秒後可以選擇關閉頁面或導向其他頁面
        }, 3000);
      } else {
        alert('提交失敗，請稍後再試');
      }
    } catch (error) {
      console.error('提交危害告知失敗:', error);
      alert('提交失敗，請稍後再試');
    } finally {
      this.saving.set(false);
    }
  }

  isFormValid(): boolean {
    return this.visitorName().trim().length > 0 && this.signature().length > 0;
  }

  goBack(): void {
    // 檢查用戶是否已登入
    if (this.authService.isLoggedIn()) {
      // 已登入：返回訪客列表頁面
      this.router.navigate(['/site', this.siteId(), 'visitorList']);
    } else {
      // 未登入（訪客）：返回上一頁或關閉視窗
      if (window.history.length > 1) {
        window.history.back();
      } else {
        window.close();
      }
    }
  }

  // 保存今日訪客記錄到localStorage
  saveTodayVisitorToStorage(visitorId: string): void {
    const today = new Date().toDateString();
    const storageKey = `visitor_records_${today}`;
    
    // 獲取今日已有的記錄
    const existingRecords = JSON.parse(localStorage.getItem(storageKey) || '[]') as string[];
    
    // 添加新的訪客ID
    if (!existingRecords.includes(visitorId)) {
      existingRecords.push(visitorId);
      localStorage.setItem(storageKey, JSON.stringify(existingRecords));
    }
  }

  // 檢查今日瀏覽器記錄
  async checkTodayVisitors(): Promise<void> {
    if (this.forceNewMode() || this.visitorId()) return; // 強制新增或查看模式不檢查

    try {
      const today = new Date().toDateString();
      const storageKey = `visitor_records_${today}`;
      const todayVisitorIds = JSON.parse(localStorage.getItem(storageKey) || '[]') as string[];

      if (todayVisitorIds.length > 0) {
        // 從資料庫獲取今日的訪客記錄詳情
        const todayRecords: Visitor[] = [];
        for (const visitorId of todayVisitorIds) {
          try {
            const visitor = await this.mongodbService.getById('visitor', visitorId) as Visitor;
            if (visitor) {
              todayRecords.push(visitor);
            }
          } catch (error) {
            console.warn(`無法載入訪客記錄 ${visitorId}:`, error);
          }
        }

        if (todayRecords.length > 0) {
          this.todayVisitors.set(todayRecords);
          this.showVisitorSelection.set(true);
        }
      }
    } catch (error) {
      console.error('檢查今日訪客記錄失敗:', error);
    }
  }

  // 選擇查看特定訪客記錄
  viewVisitor(visitor: Visitor): void {
    this.router.navigate(['/visitor-hazard-notice', this.siteId(), visitor._id]);
  }

  // 選擇新增新的訪客記錄
  createNewVisitor(): void {
    // 重置所有狀態以進入新增模式
    this.showVisitorSelection.set(false);
    this.showBrowserHistory.set(false);
    this.completed.set(false);
    this.visitorId.set(''); // 確保不是查看模式
    
    // 重置表單數據
    this.visitorName.set('');
    this.visitorTel.set('');
    this.signature.set('');
    this.existingVisitor.set(null);
    
    // 已切換到新增訪客模式
  }

  // 載入危害告知設定
  async loadHazardNoticeSettings(): Promise<void> {
    try {
      if (!this.siteId()) return;

      const settingsResult = await this.mongodbService.getArray('setting',
        {
          type: 'visitorHazardNotice',
          siteId: this.siteId()
        });
      
      // 處理返回結果
      let settings: any[] = [];
      if (settingsResult && typeof settingsResult === 'object' && 'data' in settingsResult && 'pagination' in settingsResult) {
        // 新的分頁格式
        settings = settingsResult.data as any[];
      } else {
        // 舊格式，直接是陣列
        settings = Array.isArray(settingsResult) ? settingsResult : [];
      }
      
      if (settings && settings.length > 0) {
        this.hazardNoticeContent.set(settings[0].content);
      }
    } catch (error) {
      console.error('載入危害告知設定失敗:', error);
    }
  }

  // 查看瀏覽器歷史記錄
  async viewBrowserHistory(): Promise<void> {
    this.loading.set(true);
    try {
      // 從localStorage獲取所有歷史記錄
      const allVisitorIds = this.getAllVisitorIdsFromStorage();
      const allRecords: Visitor[] = [];

      for (const visitorId of allVisitorIds) {
        try {
          const visitor = await this.mongodbService.getById('visitor', visitorId) as Visitor;
          if (visitor) {
            allRecords.push(visitor);
          }
        } catch (error) {
          console.warn(`無法載入訪客記錄 ${visitorId}:`, error);
        }
      }

      // 按創建時間倒序排列
      allRecords.sort((a, b) => new Date(b.createdAt || '').getTime() - new Date(a.createdAt || '').getTime());

      this.browserVisitors.set(allRecords);
      this.showBrowserHistory.set(true);
    } catch (error) {
      console.error('載入瀏覽器歷史記錄失敗:', error);
      alert('載入歷史記錄失敗，請稍後再試');
    } finally {
      this.loading.set(false);
    }
  }

  // 從localStorage獲取所有訪客ID
  private getAllVisitorIdsFromStorage(): string[] {
    const allIds: string[] = [];
    
    // 遍歷localStorage，找出所有visitor_records_開頭的key
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith('visitor_records_')) {
        const ids = JSON.parse(localStorage.getItem(key) || '[]') as string[];
        allIds.push(...ids);
      }
    }
    
    // 去重並返回
    return [...new Set(allIds)];
  }

  // 返回感謝頁面
  backToThankYou(): void {
    this.showBrowserHistory.set(false);
  }
} 