import { Component, Input, OnInit, OnChanges, OnDestroy, computed, signal, inject, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { MongodbService } from '../../../../services/mongodb.service';
import { CurrentSiteService } from '../../../../services/current-site.service';
import { WordDownloadService, DownloadProgress } from '../../../../services/word-download.service';
import { SiteForm } from '../../../../model/siteForm.model';
import dayjs from 'dayjs';

interface DailyWorkItem {
  id: string;
  formType: string;
  title: string;
  status: string;
  contractor?: string;
  system?: string;
  location?: string;
  workItem?: string;
  statusColor: string;
  originalData: any;
}

@Component({
  selector: 'app-daily-work-content',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="card h-100">
      <div class="card-header d-flex justify-content-between align-items-center">
        <h6 class="mb-0">
          <i class="fas fa-list-ul me-2"></i>各廠商當日執行內容
        </h6>
        @if (dailyWorkItems().length > 0) {
          <button 
            type="button" 
            class="btn btn-sm btn-primary"
            [disabled]="isDownloading()"
            (click)="downloadAllForms()"
            title="下載所有表單Word">
            @if (isDownloading()) {
              <span class="spinner-border spinner-border-sm me-1" role="status"></span>
              下載中...
            } @else {
              <i class="fas fa-download me-1"></i>
              下載全部
            }
          </button>
        }
      </div>
      <div class="card-body">
        @if (isLoading()) {
          <div class="text-center">
            <div class="spinner-border spinner-border-sm text-primary" role="status">
              <span class="visually-hidden">載入中...</span>
            </div>
          </div>
        } @else if (isDownloading() && downloadProgress()) {
          <div class="text-center mb-3">
            <div class="progress mb-2">
              <div class="progress-bar" 
                   role="progressbar" 
                   [style.width.%]="(downloadProgress()!.current / downloadProgress()!.total) * 100">
                {{ downloadProgress()!.current }} / {{ downloadProgress()!.total }}
              </div>
            </div>
            <small class="text-muted">正在處理: {{ downloadProgress()!.currentItem }}</small>
          </div>
        }
        
        @if (dailyWorkItems().length > 0) {
          <div class="work-items-list">
            @for (item of dailyWorkItems(); track item.id) {
              <div class="work-item-card mb-2 p-3 border rounded" 
                   [title]="item.title + ' - 點擊查看詳情'">
                <div class="d-flex justify-content-between align-items-start">
                  <div class="flex-grow-1 cursor-pointer" (click)="navigateToForm(item)">
                    <div class="d-flex align-items-center mb-1">
                      <span class="badge me-2" [style.background-color]="item.statusColor">
                        {{ getFormTypeDisplay(item.formType) }}
                      </span>
                      <span class="badge badge-secondary" [ngClass]="getStatusBadgeClass(item.status)">
                        {{ getStatusDisplay(item.status) }}
                      </span>
                    </div>
                    <div class="work-details">
                      @if (item.contractor) {
                        <div class="text-sm text-muted">
                          <i class="fas fa-building me-1"></i>{{ item.contractor }}
                        </div>
                      }
                      @if (item.system || item.location) {
                        <div class="text-sm text-muted">
                          @if (item.system) {
                            <i class="fas fa-cog me-1"></i>{{ item.system }}
                          }
                          @if (item.location) {
                            <i class="fas fa-map-marker-alt me-1 ms-2"></i>{{ item.location }}
                          }
                        </div>
                      }
                      @if (item.workItem) {
                        <div class="text-sm fw-medium mt-1">
                          {{ item.workItem }}
                        </div>
                      }
                    </div>
                  </div>
                  <div class="d-flex align-items-center">
                    <button 
                      type="button" 
                      class="btn btn-sm btn-outline-secondary me-2"
                      [disabled]="isDownloading()"
                      (click)="downloadSingleForm(item); $event.stopPropagation()"
                      title="下載此表單Word">
                      @if (isDownloading()) {
                        <span class="spinner-border spinner-border-sm" role="status"></span>
                      } @else {
                        <i class="fas fa-file-word"></i>
                      }
                    </button>
                    <i class="fas fa-chevron-right text-muted cursor-pointer" (click)="navigateToForm(item)"></i>
                  </div>
                </div>
              </div>
            }
          </div>
        } @else if (!isLoading()) {
          <div class="text-center text-muted">
            <i class="fas fa-clipboard-list fs-1 mb-2"></i>
            <p class="mb-0">當日無執行內容記錄</p>
            <small>暫無任何表單或工作項目</small>
          </div>
        }
      </div>
    </div>
  `,
  styles: [`
    .work-item-card {
      transition: all 0.2s ease;
      background-color: #f8f9fa;
    }
    
    .work-item-card:hover {
      background-color: #e9ecef;
      border-color: #007bff !important;
      transform: translateY(-1px);
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    }
    
    .cursor-pointer {
      cursor: pointer;
    }
    
    .text-sm {
      font-size: 0.875rem;
    }
    
    .badge-secondary {
      font-size: 0.75rem;
    }
    
    .work-items-list {
      max-height: 400px;
      overflow-y: auto;
    }
    
    .work-items-list::-webkit-scrollbar {
      width: 6px;
    }
    
    .work-items-list::-webkit-scrollbar-track {
      background: #f1f1f1;
    }
    
    .work-items-list::-webkit-scrollbar-thumb {
      background: #888;
      border-radius: 3px;
    }
    
    .work-items-list::-webkit-scrollbar-thumb:hover {
      background: #555;
    }
  `]
})
export class DailyWorkContentComponent implements OnInit, OnChanges, OnDestroy {
  @Input() selectedDate!: string;
  
  private mongodbService = inject(MongodbService);
  private currentSiteService = inject(CurrentSiteService);
  private wordDownloadService = inject(WordDownloadService);
  private router = inject(Router);
  
  dailyWorkItems = signal<DailyWorkItem[]>([]);
  isLoading = signal<boolean>(false);
  isDownloading = signal<boolean>(false);
  downloadProgress = signal<DownloadProgress | null>(null);
  
  private lastLoadedDate: string | null = null;
  private loadingPromise: Promise<void> | null = null;
  private isDestroyed = false;

  constructor() {
    // 使用 effect 監聽 currentSite 的變化
    effect(() => {
      const currentSite = this.currentSiteService.currentSite();
      
      if (currentSite?._id && this.selectedDate && !this.isDestroyed) {
        this.loadDailyWorkContent();
      }
    });
  }

  ngOnInit() {
    // 初始載入會由 effect 處理，這裡不需要主動載入
  }

  ngOnChanges() {
    // 當 selectedDate 變化時，如果有工地資料就重新載入
    const currentSite = this.currentSiteService.currentSite();
    if (currentSite?._id && this.selectedDate && this.selectedDate !== this.lastLoadedDate) {
      this.loadDailyWorkContent();
    }
  }

  ngOnDestroy() {
    this.isDestroyed = true;
  }

  private async loadDailyWorkContent() {
    // 如果正在載入中，等待完成
    if (this.loadingPromise) {
      return this.loadingPromise;
    }

    this.loadingPromise = this.doLoadDailyWorkContent();
    try {
      await this.loadingPromise;
    } finally {
      this.loadingPromise = null;
    }
  }

  private async doLoadDailyWorkContent() {
    this.isLoading.set(true);
    try {
      const currentSite = this.currentSiteService.currentSite();
      if (!currentSite?._id) {
        this.dailyWorkItems.set([]);
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

      // 轉換為 DailyWorkItem 格式
      const workItems: DailyWorkItem[] = [];

      for (const form of dailyForms) {
        let title = this.getFormTypeDisplay(form.formType);
        let contractor = '';
        let system = '';
        let location = '';
        let workItem = '';

        // 根據表單類型提取相關資訊
        switch (form.formType) {
          case 'sitePermit':
            contractor = form.applicantCompany || '';
            system = form.workSystem || '';
            location = form.workLocation || '';
            if (form.workItems && form.workItems.length > 0) {
              workItem = form.workItems.map((item: any) => 
                item.description || item.title || ''
              ).join(', ');
            }
            break;
          case 'toolboxMeeting':
            if (form.meeting) {
              contractor = form.meeting.conductedBy || '';
              location = form.meeting.location || '';
              workItem = form.meeting.mainPoints || '';
            }
            break;
          case 'hazardNotice':
            contractor = form.contractorCompany || '';
            workItem = form.workName || '';
            break;
          case 'training':
            workItem = form.courseName || '';
            location = form.trainingLocation || '';
            break;
          default:
            // 其他表單類型的基本資訊
            contractor = form.contractor || form.company || '';
            location = form.location || '';
            workItem = form.description || form.remarks || '';
        }

        workItems.push({
          id: form._id,
          formType: form.formType,
          title: title,
          status: form.status || 'draft',
          contractor: contractor,
          system: system,
          location: location,
          workItem: workItem,
          statusColor: this.getStatusColor(form.status || 'draft'),
          originalData: form
        });
      }

      // 按表單類型排序（工地許可單優先）
      workItems.sort((a, b) => {
        const priority = {
          'sitePermit': 1,
          'toolboxMeeting': 2,
          'environmentChecklist': 3,
          'specialWorkChecklist': 4,
          'safetyPatrolChecklist': 5,
          'safetyIssueRecord': 6,
          'hazardNotice': 7,
          'training': 8
        };
        
        const aPriority = (priority as any)[a.formType] || 99;
        const bPriority = (priority as any)[b.formType] || 99;
        
        return aPriority - bPriority;
      });

      this.dailyWorkItems.set(workItems);
      
    } catch (error) {
      console.error('載入當日執行內容失敗:', error);
      this.dailyWorkItems.set([]);
    } finally {
      this.isLoading.set(false);
    }
  }

  // 獲取表單類型顯示名稱（參考 SiteFormListComponent）
  getFormTypeDisplay(formType: string): string {
    switch(formType) {
      case 'sitePermit':
        return '工地許可單';
      case 'toolboxMeeting':
        return '工具箱會議';
      case 'environmentChecklist':
        return '環安衛自檢表';
      case 'specialWorkChecklist':
        return '特殊作業自檢表';
      case 'safetyPatrolChecklist':
        return '工安巡迴檢查表';
      case 'safetyIssueRecord':
        return '安全缺失記錄單';
      case 'hazardNotice':
        return '危害告知單';
      case 'training':
        return '教育訓練';
      default:
        return formType;
    }
  }

  // 獲取狀態顯示名稱
  getStatusDisplay(status: string): string {
    switch(status) {
      case 'draft':
        return '草稿';
      case 'pending':
        return '待審核';
      case 'approved':
        return '已核准';
      case 'rejected':
        return '已拒絕';
      default:
        return status;
    }
  }

  // 獲取狀態對應的顏色（參考 SiteFormListComponent）
  getStatusColor(status: string): string {
    switch(status) {
      case 'draft':
        return '#6c757d'; // 灰色-草稿
      case 'pending':
        return '#ffc107'; // 黃色-待審核
      case 'approved':
        return '#28a745'; // 綠色-已核准
      case 'rejected':
        return '#dc3545'; // 紅色-已拒絕
      default:
        return '#6c757d'; // 預設灰色
    }
  }

  // 獲取狀態徽章的 CSS 類別
  getStatusBadgeClass(status: string): string {
    switch(status) {
      case 'draft':
        return 'bg-secondary';
      case 'pending':
        return 'bg-warning text-dark';
      case 'approved':
        return 'bg-success';
      case 'rejected':
        return 'bg-danger';
      default:
        return 'bg-secondary';
    }
  }

  // 下載單個表單Word
  async downloadSingleForm(item: DailyWorkItem): Promise<void> {
    this.isDownloading.set(true);
    try {
      await this.wordDownloadService.downloadSingleFormWord(item);
    } catch (error) {
      console.error('下載單個表單失敗:', error);
    } finally {
      this.isDownloading.set(false);
    }
  }

  // 下載所有表單Word
  async downloadAllForms(): Promise<void> {
    this.isDownloading.set(true);
    this.downloadProgress.set(null);
    
    try {
      await this.wordDownloadService.downloadAllFormsWord(
        this.dailyWorkItems(),
        (progress: DownloadProgress) => {
          this.downloadProgress.set(progress);
        }
      );
    } catch (error) {
      console.error('批量下載表單失敗:', error);
    } finally {
      this.isDownloading.set(false);
      this.downloadProgress.set(null);
    }
  }

  // 導航到表單詳情頁面（參考 SiteFormListComponent 的 handleEventClick 邏輯）
  navigateToForm(item: DailyWorkItem): void {
    const currentSite = this.currentSiteService.currentSite();
    if (!currentSite?._id) return;

    const siteId = currentSite._id;
    let route: string[] = [];
    
    // 根據表單類型構建路由（參考 SiteFormListComponent）
    switch (item.formType) {
      case 'sitePermit':
        route = ['/site', siteId, 'forms', 'permit', item.id];
        break;
      case 'toolboxMeeting':
        route = ['/site', siteId, 'forms', 'toolbox-meeting', item.id];
        break;
      case 'environmentChecklist':
        route = ['/site', siteId, 'forms', 'environment-check-list', item.id];
        break;
      case 'specialWorkChecklist':
        route = ['/site', siteId, 'forms', 'special-work-checklist', item.id];
        break;
      case 'safetyPatrolChecklist':
        route = ['/site', siteId, 'forms', 'safety-patrol-checklist', item.id];
        break;
      case 'safetyIssueRecord':
        route = ['/site', siteId, 'forms', 'safety-issue-record', item.id];
        break;
      case 'hazardNotice':
        route = ['/site', siteId, 'forms', 'hazard-notice', item.id];
        break;
      case 'training':
        route = ['/site', siteId, 'training', item.id];
        break;
      default:
        route = ['/site', siteId, 'forms', 'view', item.id];
    }
    
    // 導航到表單頁面
    this.router.navigate(route);
  }
} 