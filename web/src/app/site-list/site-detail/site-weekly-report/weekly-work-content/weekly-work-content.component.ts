import { Component, Input, OnInit, OnChanges, OnDestroy, signal, inject, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { MongodbService } from '../../../../services/mongodb.service';
import { CurrentSiteService } from '../../../../services/current-site.service';
import { WordDownloadService, DownloadProgress } from '../../../../services/word-download.service';
import dayjs from 'dayjs';

interface WorkItem {
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
  selector: 'app-weekly-work-content',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="card h-100">
      <div class="card-header d-flex justify-content-between align-items-center">
        <div>
          <h6 class="mb-0">
            <i class="fas fa-list-ul me-2"></i>各廠商當週執行內容
          </h6>
          <small class="text-muted">{{ getWeekRangeDisplay() }}</small>
        </div>
        @if (weeklyWorkItems().length > 0) {
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

        @if (weeklyWorkItems().length > 0) {
          <div class="work-items-list">
            @for (item of weeklyWorkItems(); track item.id) {
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
            <p class="mb-0">當週無執行內容記錄</p>
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
    .cursor-pointer { cursor: pointer; }
    .text-sm { font-size: 0.875rem; }
    .badge-secondary { font-size: 0.75rem; }
    .work-items-list {
      max-height: 500px;
      overflow-y: auto;
    }
    .work-items-list::-webkit-scrollbar { width: 6px; }
    .work-items-list::-webkit-scrollbar-track { background: #f1f1f1; }
    .work-items-list::-webkit-scrollbar-thumb { background: #888; border-radius: 3px; }
    .work-items-list::-webkit-scrollbar-thumb:hover { background: #555; }
  `]
})
export class WeeklyWorkContentComponent implements OnInit, OnChanges, OnDestroy {
  @Input() selectedWeek!: string;

  private mongodbService = inject(MongodbService);
  private currentSiteService = inject(CurrentSiteService);
  private wordDownloadService = inject(WordDownloadService);
  private router = inject(Router);

  weeklyWorkItems = signal<WorkItem[]>([]);
  isLoading = signal<boolean>(false);
  isDownloading = signal<boolean>(false);
  downloadProgress = signal<DownloadProgress | null>(null);

  private lastLoadedWeek: string | null = null;
  private loadingPromise: Promise<void> | null = null;
  private isDestroyed = false;

  constructor() {
    effect(() => {
      const currentSite = this.currentSiteService.currentSite();
      if (currentSite?._id && this.selectedWeek && !this.isDestroyed) {
        this.loadWeeklyWorkContent();
      }
    });
  }

  ngOnInit() {}

  ngOnChanges() {
    const currentSite = this.currentSiteService.currentSite();
    if (currentSite?._id && this.selectedWeek && this.selectedWeek !== this.lastLoadedWeek) {
      this.loadWeeklyWorkContent();
    }
  }

  ngOnDestroy() {
    this.isDestroyed = true;
  }

  getWeekRangeDisplay(): string {
    if (!this.selectedWeek) return '';
    const startDate = dayjs(this.selectedWeek);
    const endDate = startDate.add(6, 'day');
    return `${startDate.format('YYYY/MM/DD')} - ${endDate.format('YYYY/MM/DD')}`;
  }

  private async loadWeeklyWorkContent() {
    if (this.loadingPromise) return this.loadingPromise;
    this.loadingPromise = this.doLoadWeeklyWorkContent();
    try {
      await this.loadingPromise;
    } finally {
      this.loadingPromise = null;
    }
  }

  private async doLoadWeeklyWorkContent() {
    this.isLoading.set(true);
    try {
      const currentSite = this.currentSiteService.currentSite();
      if (!currentSite?._id) {
        this.weeklyWorkItems.set([]);
        return;
      }

      const siteId = currentSite._id;
      this.lastLoadedWeek = this.selectedWeek;

      const weekStart = this.selectedWeek;
      const weekEnd = dayjs(weekStart).add(6, 'day').format('YYYY-MM-DD');
      const nextDayAfterWeekEnd = dayjs(weekEnd).add(1, 'day').format('YYYY-MM-DD');

      const forms = await this.mongodbService.getArray('siteForm', {
        siteId: siteId,
        $or: [
          {
            formType: 'sitePermit',
            workStartTime: { $lte: weekEnd },
            workEndTime: { $gte: weekStart }
          },
          { applyDate: { $gte: weekStart, $lte: weekEnd } },
          { meetingDate: { $gte: weekStart, $lte: weekEnd } },
          { checkDate: { $gte: weekStart, $lte: weekEnd } },
          { trainingDate: { $gte: weekStart, $lte: weekEnd } },
          { createdAt: { $gte: weekStart, $lt: nextDayAfterWeekEnd } }
        ]
      });

      const workItems: WorkItem[] = [];

      for (const form of forms) {
        const title = this.getFormTypeDisplay(form.formType);
        let contractor = '';
        let system = '';
        let location = '';
        let workItem = '';

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
            contractor = form.contractor || form.company || '';
            location = form.location || '';
            workItem = form.description || form.remarks || '';
        }

        workItems.push({
          id: form._id,
          formType: form.formType,
          title,
          status: form.status || 'draft',
          contractor,
          system,
          location,
          workItem,
          statusColor: this.getStatusColor(form.status || 'draft'),
          originalData: form
        });
      }

      workItems.sort((a, b) => {
        const priority: Record<string, number> = {
          'sitePermit': 1,
          'toolboxMeeting': 2,
          'environmentChecklist': 3,
          'specialWorkChecklist': 4,
          'safetyPatrolChecklist': 5,
          'safetyIssueRecord': 6,
          'hazardNotice': 7,
          'training': 8
        };
        return (priority[a.formType] || 99) - (priority[b.formType] || 99);
      });

      this.weeklyWorkItems.set(workItems);

    } catch (error) {
      console.error('載入當週執行內容失敗:', error);
      this.weeklyWorkItems.set([]);
    } finally {
      this.isLoading.set(false);
    }
  }

  getFormTypeDisplay(formType: string): string {
    const map: Record<string, string> = {
      'sitePermit': '工地許可單',
      'toolboxMeeting': '工具箱會議',
      'environmentChecklist': '環安衛自檢表',
      'specialWorkChecklist': '特殊作業自檢表',
      'safetyPatrolChecklist': '工安巡迴檢查表',
      'safetyIssueRecord': '工安缺失紀錄單',
      'hazardNotice': '危害告知單',
      'training': '教育訓練'
    };
    return map[formType] || formType;
  }

  getStatusDisplay(status: string): string {
    const map: Record<string, string> = {
      'draft': '草稿', 'pending': '待審核', 'approved': '已核准', 'rejected': '已拒絕'
    };
    return map[status] || status;
  }

  getStatusColor(status: string): string {
    const map: Record<string, string> = {
      'draft': '#6c757d', 'pending': '#ffc107', 'approved': '#28a745', 'rejected': '#dc3545'
    };
    return map[status] || '#6c757d';
  }

  getStatusBadgeClass(status: string): string {
    const map: Record<string, string> = {
      'draft': 'bg-secondary', 'pending': 'bg-warning text-dark', 'approved': 'bg-success', 'rejected': 'bg-danger'
    };
    return map[status] || 'bg-secondary';
  }

  async downloadSingleForm(item: WorkItem): Promise<void> {
    this.isDownloading.set(true);
    try {
      await this.wordDownloadService.downloadSingleFormWord(item);
    } catch (error) {
      console.error('下載單個表單失敗:', error);
    } finally {
      this.isDownloading.set(false);
    }
  }

  async downloadAllForms(): Promise<void> {
    this.isDownloading.set(true);
    this.downloadProgress.set(null);
    try {
      await this.wordDownloadService.downloadAllFormsWord(
        this.weeklyWorkItems(),
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

  navigateToForm(item: WorkItem): void {
    const currentSite = this.currentSiteService.currentSite();
    if (!currentSite?._id) return;

    const siteId = currentSite._id;
    const routeMap: Record<string, string[]> = {
      'sitePermit': ['/site', siteId, 'forms', 'permit', item.id],
      'toolboxMeeting': ['/site', siteId, 'forms', 'toolbox-meeting', item.id],
      'environmentChecklist': ['/site', siteId, 'forms', 'environment-check-list', item.id],
      'specialWorkChecklist': ['/site', siteId, 'forms', 'special-work-checklist', item.id],
      'safetyPatrolChecklist': ['/site', siteId, 'forms', 'safety-patrol-checklist', item.id],
      'safetyIssueRecord': ['/site', siteId, 'forms', 'safety-issue-record', item.id],
      'hazardNotice': ['/site', siteId, 'forms', 'hazard-notice', item.id],
      'training': ['/site', siteId, 'training', item.id]
    };

    const route = routeMap[item.formType] || ['/site', siteId, 'forms', 'view', item.id];
    this.router.navigate(route);
  }
}
