import { Component, signal, computed, OnInit, inject, ViewChild, ElementRef } from '@angular/core';
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
  
  // 危害告知內容
  hazardNoticeContent = signal<string[]>([
    '1. 工地內禁止吸菸、嚼檳榔、酗酒',
    '2. 進入工地必須配戴安全帽',
    '3. 注意工地內機械設備運作，避免進入危險區域',
    '4. 遵守工地安全標示及指示',
    '5. 如有緊急狀況，請立即通知工地負責人',
    '6. 工地內請勿奔跑，注意腳下安全',
    '7. 未經許可不得操作任何機械設備',
    '8. 離開工地前請確實清點隨身物品'
  ]);

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
          // 查看模式不設定completed狀態，讓內容可以正常顯示
        } else {
          alert('找不到指定的訪客');
          this.router.navigate(['/']);
          return;
        }
      } else {
        // 新增模式：檢查今日同設備記錄
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
    this.showVisitorSelection.set(false);
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