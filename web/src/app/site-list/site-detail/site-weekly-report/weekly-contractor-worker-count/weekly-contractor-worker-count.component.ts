import { Component, Input, OnInit, OnChanges, OnDestroy, computed, signal, inject, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { CurrentSiteService } from '../../../../services/current-site.service';
import { WorkerCountService, WeeklyContractorWorkerCount } from '../../../../services/worker-count.service';
import dayjs from 'dayjs';

@Component({
  selector: 'app-weekly-contractor-worker-count',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="card h-100">
      <div class="card-header">
        <h6 class="mb-0">
          <i class="fas fa-chart-bar me-2"></i>各廠商實際出工人數（週統計）
        </h6>
        <small class="text-muted">{{ getWeekRangeDisplay() }}</small>
      </div>
      <div class="card-body">
        @if (isLoading()) {
          <div class="text-center">
            <div class="spinner-border spinner-border-sm text-primary" role="status">
              <span class="visually-hidden">載入中...</span>
            </div>
          </div>
        } @else if (weeklyContractorWorkerCounts().length > 0) {
          <div class="chart-container">
            @for (item of weeklyContractorWorkerCounts(); track item.contractorName) {
              <div class="chart-item mb-3">
                <div class="d-flex justify-content-between align-items-center mb-1">
                  <span class="fw-medium">{{ item.contractorName }}</span>
                  <div class="d-flex align-items-center">
                    <span class="text-primary fw-bold me-2">
                      總計: {{ item.totalWorkerCount }} 人次
                    </span>
                    <span class="text-muted small">
                      平均: {{ item.averageWorkerCount }} 人/日
                    </span>
                  </div>
                </div>
                <div class="progress mb-2">
                  <div 
                    class="progress-bar bg-primary" 
                    [style.width]="getBarWidth(item.totalWorkerCount)"
                    role="progressbar"
                  ></div>
                </div>
                <!-- 每日明細 -->
                <div class="daily-breakdown">
                  <small class="text-muted">每日明細:</small>
                  <div class="row g-1 mt-1">
                    @for (daily of item.dailyBreakdown; track daily.date) {
                      <div class="col-auto">
                        <span class="badge bg-light text-dark border" 
                              [title]="getDayDisplay(daily.date) + ': ' + daily.workerCount + ' 人'">
                          {{ getDayAbbr(daily.date) }}: {{ daily.workerCount }}
                        </span>
                      </div>
                    }
                  </div>
                </div>
              </div>
            }
          </div>
        } @else {
          <p class="text-muted mb-0 small">該週無工具箱會議簽名記錄</p>
        }
      </div>
    </div>
  `,
  styles: [`
    .chart-container {
      font-size: 0.9rem;
    }
    .chart-item {
      margin-bottom: 1rem !important;
      padding-bottom: 0.75rem;
      border-bottom: 1px solid #eee;
    }
    .chart-item:last-child {
      border-bottom: none;
    }
    .progress {
      height: 6px;
    }
    .daily-breakdown {
      margin-top: 0.5rem;
    }
    .badge {
      font-size: 0.65rem;
    }
  `]
})
export class WeeklyContractorWorkerCountComponent implements OnInit, OnChanges, OnDestroy {
  @Input() selectedWeek!: string;
  
  private workerCountService = inject(WorkerCountService);
  private currentSiteService = inject(CurrentSiteService);
  
  weeklyContractorWorkerCounts = signal<WeeklyContractorWorkerCount[]>([]);
  isLoading = signal<boolean>(false);
  
  private maxWorkerCount = computed(() => {
    return Math.max(...this.weeklyContractorWorkerCounts().map(item => item.totalWorkerCount), 1);
  });
  
  private lastLoadedWeek: string | null = null;
  private loadingPromise: Promise<void> | null = null;
  private isDestroyed = false;

  constructor() {
    // 使用 effect 監聽 currentSite 的變化
    effect(() => {
      const currentSite = this.currentSiteService.currentSite();
      
      if (currentSite?._id && this.selectedWeek && !this.isDestroyed) {
        this.loadWeeklyContractorWorkerCounts();
      }
    });
  }

  ngOnInit() {
    // 初始載入會由 effect 處理，這裡不需要主動載入
  }

  ngOnChanges() {
    // 當 selectedWeek 變化時，如果有工地資料就重新載入
    const currentSite = this.currentSiteService.currentSite();
    if (currentSite?._id && this.selectedWeek && this.selectedWeek !== this.lastLoadedWeek) {
      this.loadWeeklyContractorWorkerCounts();
    }
  }

  ngOnDestroy() {
    this.isDestroyed = true;
  }

  private async loadWeeklyContractorWorkerCounts(): Promise<void> {
    if (!this.selectedWeek || this.selectedWeek === this.lastLoadedWeek) {
      return;
    }

    // 如果已經在載入中，等待現有的載入完成
    if (this.loadingPromise) {
      await this.loadingPromise;
      return;
    }

    const currentSite = this.currentSiteService.currentSite();
    if (!currentSite?._id) {
      this.weeklyContractorWorkerCounts.set([]);
      return;
    }

    this.isLoading.set(true);
    this.lastLoadedWeek = this.selectedWeek;

    this.loadingPromise = this.performWeeklyLoad(currentSite._id, this.selectedWeek);
    await this.loadingPromise;
    this.loadingPromise = null;
  }

  private async performWeeklyLoad(siteId: string, weekStart: string): Promise<void> {
    try {
      // 使用統一的服務查詢週出工人數
      const result = await this.workerCountService.getWeeklyContractorWorkerCount(siteId, weekStart);
      this.weeklyContractorWorkerCounts.set(result);
    } catch (error) {
      console.error('載入週報表廠商出工人數時發生錯誤:', error);
      this.weeklyContractorWorkerCounts.set([]);
    } finally {
      this.isLoading.set(false);
    }
  }

  getBarWidth(count: number): string {
    const maxCount = this.maxWorkerCount();
    return `${Math.min((count / maxCount) * 100, 100)}%`;
  }

  getWeekRangeDisplay(): string {
    const startDate = dayjs(this.selectedWeek);
    const endDate = startDate.add(6, 'day');
    return `${startDate.format('YYYY/MM/DD')} - ${endDate.format('YYYY/MM/DD')}`;
  }

  getDayDisplay(date: string): string {
    return dayjs(date).format('MM/DD (ddd)');
  }

  getDayAbbr(date: string): string {
    return dayjs(date).format('MM/DD');
  }
} 