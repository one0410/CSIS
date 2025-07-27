import { Component, Input, OnInit, OnChanges, OnDestroy, computed, signal, inject, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { MongodbService } from '../../../../services/mongodb.service';
import { CurrentSiteService } from '../../../../services/current-site.service';
import dayjs from 'dayjs';
import { SitePermitForm } from '../../site-form-list/site-permit-form/site-permit-form.component';

interface PermitWorkItem {
  id: string;
  contractor: string; // 廠商
  area: string; // 區域
  workItems: string[]; // 工項
  workContent: string; // 施作內容
  workLocation: string; // 施作地點
  originalData: any;
}

@Component({
  selector: 'app-daily-permit-content',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="card h-100">
      <div class="card-header">
        <h6 class="mb-0">
          <i class="fas fa-clipboard-check me-2"></i>各廠商當日執行內容
        </h6>
      </div>
      <div class="card-body">
        @if (isLoading()) {
          <div class="text-center">
            <div class="spinner-border spinner-border-sm text-primary" role="status">
              <span class="visually-hidden">載入中...</span>
            </div>
          </div>
        } @else if (permitWorkItems().length > 0) {
          <div class="permit-items-list">
            @for (item of permitWorkItems(); track item.id) {
              <div class="permit-item-card mb-3 p-3 border rounded cursor-pointer" 
                   (click)="navigateToForm(item)"
                   [title]="'點擊查看詳情'">
                <div class="row">
                  <div class="col-md-6">
                    <div class="mb-2">
                      <span class="fw-bold text-primary">廠商：</span>
                      <span class="text-dark">{{ item.contractor || '未填寫' }}</span>
                    </div>
                    <div class="mb-2">
                      <span class="fw-bold text-primary">區域：</span>
                      <span class="text-dark">{{ item.area || '未填寫' }}</span>
                    </div>
                  </div>
                  <div class="col-md-6">
                    <div class="mb-2">
                      <span class="fw-bold text-primary">工項：</span>
                      @if (item.workItems.length > 0) {
                        <div class="mt-1">
                          @for (workItem of item.workItems; track $index) {
                            <span class="badge bg-secondary me-1 mb-1">{{ workItem }}</span>
                          }
                        </div>
                      } @else {
                        <span class="text-muted">未填寫</span>
                      }
                    </div>
                  </div>
                </div>
                <div class="row">
                  <div class="col-12">
                    <div class="mb-0">
                      <span class="fw-bold text-primary">施作內容：</span>
                      <div class="mt-1 text-muted">
                        {{ item.workContent || '未填寫' }}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            }
          </div>
        } @else {
          <div class="text-center text-muted">
            <i class="fas fa-clipboard fs-1 mb-2"></i>
            <p class="mb-0">當日無工地許可單記錄</p>
            <small>暫無任何許可單申請</small>
          </div>
        }
      </div>
    </div>
  `,
  styles: [`
    .permit-item-card {
      transition: all 0.2s ease;
      background-color: #f8f9fa;
      border: 1px solid #dee2e6;
    }
    
    .permit-item-card:hover {
      background-color: #e9ecef;
      border-color: #007bff !important;
      transform: translateY(-1px);
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    }
    
    .cursor-pointer {
      cursor: pointer;
    }
    
    .permit-items-list {
      max-height: 400px;
      overflow-y: auto;
    }
    
    .permit-items-list::-webkit-scrollbar {
      width: 6px;
    }
    
    .permit-items-list::-webkit-scrollbar-track {
      background: #f1f1f1;
    }
    
    .permit-items-list::-webkit-scrollbar-thumb {
      background: #888;
      border-radius: 3px;
    }
    
    .permit-items-list::-webkit-scrollbar-thumb:hover {
      background: #555;
    }
    
    .badge {
      font-size: 0.75rem;
    }
  `]
})
export class DailyPermitContentComponent implements OnInit, OnChanges, OnDestroy {
  @Input() selectedDate!: string;
  
  private mongodbService = inject(MongodbService);
  private currentSiteService = inject(CurrentSiteService);
  private router = inject(Router);
  
  permitWorkItems = signal<PermitWorkItem[]>([]);
  isLoading = signal<boolean>(false);
  
  private lastLoadedDate: string | null = null;
  private loadingPromise: Promise<void> | null = null;
  private isDestroyed = false;

  constructor() {
    // 使用 effect 監聽 currentSite 的變化
    effect(() => {
      const currentSite = this.currentSiteService.currentSite();
      
      if (currentSite?._id && this.selectedDate && !this.isDestroyed) {
        this.loadDailyPermitContent();
      }
    });
  }

  ngOnInit() {
    // 初始載入會由 effect 處理
  }

  ngOnChanges() {
    // 當 selectedDate 變化時，如果有工地資料就重新載入
    const currentSite = this.currentSiteService.currentSite();
    if (currentSite?._id && this.selectedDate && this.selectedDate !== this.lastLoadedDate) {
      this.loadDailyPermitContent();
    }
  }

  ngOnDestroy() {
    this.isDestroyed = true;
  }

  private async loadDailyPermitContent() {
    // 如果正在載入中，等待完成
    if (this.loadingPromise) {
      return this.loadingPromise;
    }

    this.loadingPromise = this.doLoadDailyPermitContent();
    try {
      await this.loadingPromise;
    } finally {
      this.loadingPromise = null;
    }
  }

  private async doLoadDailyPermitContent() {
    this.isLoading.set(true);
    try {
      const currentSite = this.currentSiteService.currentSite();
      if (!currentSite?._id) {
        this.permitWorkItems.set([]);
        return;
      }

      const siteId = currentSite._id;
      
      // 記錄當前載入的日期
      this.lastLoadedDate = this.selectedDate;

      // 只查詢工地許可單
      const allPermits = await this.mongodbService.get('siteForm', {
        siteId: siteId,
        formType: 'sitePermit'
      });

      // 過濾當日的工地許可單
      const dailyPermits = allPermits.filter((permit: SitePermitForm) => {
        if (permit.workStartTime && permit.workEndTime) {
          // 檢查選定日期是否在工作期間內
          const workStart = dayjs(permit.workStartTime);
          const workEnd = dayjs(permit.workEndTime);
          const selectedDateObj = dayjs(this.selectedDate);
          return selectedDateObj.isSameOrAfter(workStart, 'day') && 
                 selectedDateObj.isSameOrBefore(workEnd, 'day');
        } else if (permit.applyDate) {
          const formDate = dayjs(permit.applyDate);
          return formDate.format('YYYY-MM-DD') === this.selectedDate;
        }
        return false;
      });

      // 轉換為 PermitWorkItem 格式
      const workItems: PermitWorkItem[] = dailyPermits.map((permit: SitePermitForm) => {
        let workItems: string[] = [];
        let workContent = '';

        // 提取申請作業名稱
        if (permit.selectedCategories && permit.selectedCategories.length > 0) {
          workItems = permit.selectedCategories.map((item: string) => 
            item || '未命名作業'
          ).filter((item: string) => item && item.trim() !== '');
        }

        // 提取施作內容
        if (permit.workContent) {
          workContent = permit.workContent;
        } else if (permit.remarks) {
          workContent = permit.remarks;
        }

        return {
          id: permit._id,
          contractor: permit.applicant || '',
          area: permit.workLocation || '',
          workItems: workItems,
          workContent: workContent,
          workLocation: permit.workLocation || '',
          originalData: permit
        };
      });

      this.permitWorkItems.set(workItems);
      
    } catch (error) {
      console.error('載入當日工地許可單內容失敗:', error);
      this.permitWorkItems.set([]);
    } finally {
      this.isLoading.set(false);
    }
  }

  // 導航到工地許可單詳情頁面
  navigateToForm(item: PermitWorkItem): void {
    const currentSite = this.currentSiteService.currentSite();
    if (!currentSite?._id) return;

    const siteId = currentSite._id;
    const route = ['/site', siteId, 'forms', 'permit', item.id];
    
    // 導航到表單頁面
    this.router.navigate(route);
  }
} 