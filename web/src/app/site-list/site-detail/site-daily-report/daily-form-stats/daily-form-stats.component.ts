import { Component, Input, OnInit, OnChanges, OnDestroy, signal, computed, effect, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { CurrentSiteService } from '../../../../services/current-site.service';
import { MongodbService } from '../../../../services/mongodb.service';
import dayjs from 'dayjs';

interface FormTypeStat {
  formType: string;
  displayName: string;
  count: number;
  color: string;
  icon: string;
}

@Component({
  selector: 'app-daily-form-stats',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="card h-100">
      <div class="card-header d-flex justify-content-between align-items-center">
        <h6 class="mb-0">
          <i class="fas fa-file-excel me-2"></i>當日表單總數及彙整
        </h6>
        @if (totalFormsCount() > 0) {
          <small class="text-muted">
            共 {{ totalFormsCount() }} 張表單
          </small>
        }
      </div>
      <div class="card-body">
        @if (isLoading()) {
          <div class="text-center">
            <div class="spinner-border spinner-border-sm text-primary" role="status">
              <span class="visually-hidden">載入中...</span>
            </div>
          </div>
        } @else if (formStats().length > 0) {
          <!-- 表單統計列表 -->
          <div class="form-stats-list">
            @for (stat of formStats(); track stat.formType) {
              <div 
                class="form-stat-item mb-2 p-3 border rounded cursor-pointer"
                [title]="stat.displayName + ' - 點擊查看列表'"
                (click)="navigateToFormList(stat.formType)">
                <div class="d-flex justify-content-between align-items-center">
                  <div class="d-flex align-items-center">
                    <div 
                      class="form-icon me-3 d-flex align-items-center justify-content-center"
                      [style.background-color]="stat.color">
                      <i [class]="'bi ' + stat.icon + ' text-white'"></i>
                    </div>
                    <div>
                      <div class="fw-medium">{{ stat.displayName }}</div>
                      <small class="text-muted">{{ stat.formType }}</small>
                    </div>
                  </div>
                  <div class="text-end">
                    <span class="badge fs-6 px-2" [style.background-color]="stat.color">
                      {{ stat.count }}
                    </span>
                    <div>
                      <i class="fas fa-chevron-right text-muted small"></i>
                    </div>
                  </div>
                </div>
              </div>
            }
          </div>
          
          <!-- 總計資訊 -->
          <div class="mt-3 pt-3 border-top">
            <div class="row text-center">
              <div class="col-4">
                <div class="text-center">
                  <h5 class="text-primary mb-0">{{ totalFormsCount() }}</h5>
                  <small class="text-muted">總表單數</small>
                </div>
              </div>
              <div class="col-4">
                <div class="text-center">
                  <h5 class="text-success mb-0">{{ completedFormsCount() }}</h5>
                  <small class="text-muted">已完成</small>
                </div>
              </div>
              <div class="col-4">
                <div class="text-center">
                  <h5 class="text-warning mb-0">{{ pendingFormsCount() }}</h5>
                  <small class="text-muted">進行中</small>
                </div>
              </div>
            </div>
          </div>
        } @else if (!isLoading()) {
          <div class="text-center text-muted">
            <i class="fas fa-file fs-1 mb-2 opacity-50"></i>
            <p class="mb-0">當日無表單記錄</p>
            <small>暫無任何表單建立</small>
          </div>
        }
      </div>
    </div>
  `,
  styles: [`
    .form-stat-item {
      transition: all 0.2s ease;
      background-color: #f8f9fa;
    }
    
    .form-stat-item:hover {
      background-color: #e9ecef;
      border-color: #007bff !important;
      transform: translateY(-1px);
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    }
    
    .cursor-pointer {
      cursor: pointer;
    }
    
    .form-icon {
      width: 40px;
      height: 40px;
      border-radius: 8px;
    }
    
    .form-stats-list {
      max-height: 300px;
      overflow-y: auto;
    }
    
    .form-stats-list::-webkit-scrollbar {
      width: 6px;
    }
    
    .form-stats-list::-webkit-scrollbar-track {
      background: #f1f1f1;
    }
    
    .form-stats-list::-webkit-scrollbar-thumb {
      background: #888;
      border-radius: 3px;
    }
    
    .form-stats-list::-webkit-scrollbar-thumb:hover {
      background: #555;
    }
  `]
})
export class DailyFormStatsComponent implements OnInit, OnChanges, OnDestroy {
  @Input() selectedDate!: string;
  
  private mongodbService = inject(MongodbService);
  private currentSiteService = inject(CurrentSiteService);
  private router = inject(Router);
  
  formStats = signal<FormTypeStat[]>([]);
  isLoading = signal<boolean>(false);
  
  // 計算屬性
  totalFormsCount = computed(() => 
    this.formStats().reduce((sum, stat) => sum + stat.count, 0)
  );
  
  completedFormsCount = computed(() => {
    // 這裡需要額外的狀態統計，先暫時返回總數的70%作為示例
    return Math.floor(this.totalFormsCount() * 0.7);
  });
  
  pendingFormsCount = computed(() => 
    this.totalFormsCount() - this.completedFormsCount()
  );
  
  private lastLoadedDate: string | null = null;
  private loadingPromise: Promise<void> | null = null;
  private isDestroyed = false;

  constructor() {
    // 使用 effect 監聽 currentSite 的變化
    effect(() => {
      const currentSite = this.currentSiteService.currentSite();
      
      if (currentSite?._id && this.selectedDate && !this.isDestroyed) {
        this.loadDailyFormStats();
      }
    });
  }

  ngOnInit() {
    this.loadDailyFormStats();
  }

  ngOnChanges() {
    // 當 selectedDate 變化時，如果有工地資料就重新載入
    const currentSite = this.currentSiteService.currentSite();
    if (currentSite?._id && this.selectedDate && this.selectedDate !== this.lastLoadedDate) {
      this.loadDailyFormStats();
    }
  }

  ngOnDestroy() {
    this.isDestroyed = true;
  }

  private async loadDailyFormStats() {
    // 如果正在載入中，等待完成
    if (this.loadingPromise) {
      return this.loadingPromise;
    }

    this.loadingPromise = this.doLoadDailyFormStats();
    try {
      await this.loadingPromise;
    } finally {
      this.loadingPromise = null;
    }
  }

  private async doLoadDailyFormStats() {
    this.isLoading.set(true);
    try {
      const currentSite = this.currentSiteService.currentSite();
      if (!currentSite?._id) {
        this.formStats.set([]);
        return;
      }

      const siteId = currentSite._id;
      
      // 記錄當前載入的日期
      this.lastLoadedDate = this.selectedDate;

      // 查詢當日的所有表單
      const allForms = await this.mongodbService.get('siteForm', {
        siteId: siteId
      });

      // 過濾當日的表單
      const dailyForms = allForms.filter((form: any) => {
        let formDate: dayjs.Dayjs | null = null;
        
        // 根據表單類型決定使用哪個日期欄位
        if (form.formType === 'sitePermit' && form.workStartTime && form.workEndTime) {
          // 工地許可單：檢查選定日期是否在工作期間內
          const workStart = dayjs(form.workStartTime);
          const workEnd = dayjs(form.workEndTime);
          const selectedDateObj = dayjs(this.selectedDate);
          return selectedDateObj.isSameOrAfter(workStart, 'day') && 
                 selectedDateObj.isSameOrBefore(workEnd, 'day');
        } else if (form.applyDate) {
          formDate = dayjs(form.applyDate);
        } else if (form.meetingDate) {
          formDate = dayjs(form.meetingDate);
        } else if (form.checkDate) {
          formDate = dayjs(form.checkDate);
        } else if (form.trainingDate) {
          formDate = dayjs(form.trainingDate);
        } else if (form.createdAt) {
          formDate = dayjs(form.createdAt);
        }
        
        if (formDate) {
          return formDate.format('YYYY-MM-DD') === this.selectedDate;
        }
        
        return false;
      });

      // 統計各表單類型的數量
      const formTypeCount = new Map<string, number>();
      dailyForms.forEach((form: any) => {
        const formType = form.formType || 'unknown';
        formTypeCount.set(formType, (formTypeCount.get(formType) || 0) + 1);
      });

      // 轉換為統計數據
      const stats: FormTypeStat[] = [];
      
      // 定義表單類型配置
      const formTypeConfigs = this.getFormTypeConfigs();
      
      formTypeCount.forEach((count, formType) => {
        const config = formTypeConfigs[formType] || formTypeConfigs['default'];
        stats.push({
          formType,
          displayName: config.displayName,
          count,
          color: config.color,
          icon: config.icon
        });
      });

      // 按數量降序排列
      stats.sort((a, b) => b.count - a.count);

      this.formStats.set(stats);
      
    } catch (error) {
      console.error('載入當日表單統計失敗:', error);
      this.formStats.set([]);
    } finally {
      this.isLoading.set(false);
    }
  }

  private getFormTypeConfigs(): Record<string, {displayName: string, color: string, icon: string}> {
    return {
      'sitePermit': {
        displayName: '工地許可單',
        color: '#007bff',
        icon: 'bi-card-checklist'
      },
      'toolboxMeeting': {
        displayName: '工具箱會議',
        color: '#28a745',
        icon: 'bi-people'
      },
      'environmentChecklist': {
        displayName: '環安衛自檢表',
        color: '#17a2b8',
        icon: 'bi-shield-check'
      },
      'specialWorkChecklist': {
        displayName: '特殊作業自檢表',
        color: '#ffc107',
        icon: 'bi-exclamation-triangle'
      },
      'safetyPatrolChecklist': {
        displayName: '工安巡迴檢查表',
        color: '#fd7e14',
        icon: 'bi-binoculars'
      },
      'safetyIssueRecord': {
        displayName: '安全缺失記錄單',
        color: '#dc3545',
        icon: 'bi-exclamation-circle'
      },
      'hazardNotice': {
        displayName: '危害告知單',
        color: '#e83e8c',
        icon: 'bi-cone-striped'
      },
      'training': {
        displayName: '教育訓練',
        color: '#6f42c1',
        icon: 'bi-mortarboard'
      },
      'default': {
        displayName: '其他表單',
        color: '#6c757d',
        icon: 'bi-file-earmark'
      }
    };
  }

  navigateToFormList(formType: string): void {
    // 導航到表單列表頁面，並設置篩選條件
    const currentSite = this.currentSiteService.currentSite();
    if (currentSite) {
      this.router.navigate(['/site', currentSite._id, 'formList'], {
        queryParams: { 
          formType: formType,
          date: this.selectedDate
        }
      });
    }
  }
}
