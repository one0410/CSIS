import { Component, Input, OnInit, OnChanges, OnDestroy, computed, signal, inject, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { CurrentSiteService } from '../../../../services/current-site.service';
import { WorkerCountService, ContractorMonthlyStats, WeeklyWorkerCount } from '../../../../services/worker-count.service';
import dayjs from 'dayjs';

@Component({
  selector: 'app-monthly-worker-count',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="card h-100">
      <div class="card-header">
        <h6 class="mb-0">
          <i class="bi bi-people me-2"></i>本月出工人數統計
        </h6>
        <small class="text-muted">{{ getMonthRangeDisplay() }}</small>
      </div>
      <div class="card-body">
        @if (isLoading()) {
          <div class="text-center">
            <div class="spinner-border spinner-border-sm text-primary" role="status">
              <span class="visually-hidden">載入中...</span>
            </div>
          </div>
        } @else {
          <!-- 總計概覽 -->
          <div class="mb-3">
            <div class="row text-center">
              <div class="col-3">
                <div class="text-center">
                  <h5 class="text-info mb-0">{{ getTotalMonthlyContractors() }}</h5>
                  <small class="text-muted">廠商數量</small>
                </div>
              </div>
              <div class="col-3">
                <div class="text-center">
                  <h5 class="text-primary mb-0">{{ getTotalMonthlyWorkers() }}</h5>
                  <small class="text-muted">總人次</small>
                </div>
              </div>
              <div class="col-3">
                <div class="text-center">
                  <h5 class="text-success mb-0">{{ getAverageWeeklyWorkers() }}</h5>
                  <small class="text-muted">平均人數/週</small>
                </div>
              </div>
              <div class="col-3">
                <div class="text-center">
                  <h5 class="text-warning mb-0">{{ getPeakWeekWorkers() }}</h5>
                  <small class="text-muted">最高人數</small>
                </div>
              </div>
            </div>
          </div>

          @if (contractorStats().length > 0) {
            <div class="contractors-stats">
              @for (contractor of contractorStats(); track contractor.contractorName) {
                <div class="contractor-card mb-4 p-3 border rounded">
                  <!-- 廠商標題和總覽 -->
                  <div class="d-flex justify-content-between align-items-center mb-3">
                    <h6 class="mb-0 fw-bold">{{ contractor.contractorName }}</h6>
                    <div class="text-end">
                      <div class="text-primary fw-bold">總計: {{ contractor.totalWorkers }} 人次</div>
                      <small class="text-muted">平均: {{ contractor.averageWorkers }} 人/週</small>
                    </div>
                  </div>

                  <!-- 週統計詳細表格 -->
                  <div class="table-responsive">
                    <table class="table table-sm table-bordered">
                      <thead class="table-light">
                        <tr>
                          <th style="width: 15%">週次</th>
                          <th style="width: 25%">日期範圍</th>
                          <th style="width: 15%">總人次</th>
                          <th style="width: 15%">工作天數</th>
                          <th style="width: 15%">平均人數</th>
                          <th style="width: 15%">趨勢</th>
                        </tr>
                      </thead>
                      <tbody>
                        @for (week of contractor.weeklyStats; track week.weekNumber) {
                          <tr [class.table-warning]="week.weekNumber === contractor.peakWeek">
                            <td class="fw-medium">第{{ week.weekNumber }}週</td>
                            <td class="small">
                              {{ formatWeekRange(week.startDate, week.endDate) }}
                            </td>
                            <td class="text-center">
                              <span class="badge bg-primary">{{ week.totalWorkers }}</span>
                            </td>
                            <td class="text-center">{{ week.workDays }}</td>
                            <td class="text-center">{{ week.averageWorkers }}</td>
                            <td>
                              <div class="trend-container" style="height: 20px; display: flex; align-items: end;">
                                <div class="trend-bar" 
                                     [style.height]="getTrendBarHeight(week.averageWorkers, getMaxAverageWorkers(contractor)) + '%'"
                                     [style.background-color]="week.weekNumber === contractor.peakWeek ? '#ffc107' : '#007bff'">
                                </div>
                              </div>
                            </td>
                          </tr>
                        }
                      </tbody>
                    </table>
                  </div>
                </div>
              }
            </div>
          } @else if (!isLoading()) {
            <div class="text-center text-muted">
              <i class="bi bi-people-x fs-1 mb-2 opacity-50"></i>
              <p class="mb-0">本月無出工記錄</p>
              <small>暫無工具箱會議簽名資料</small>
            </div>
          }
        }
      </div>
    </div>
  `,
  styles: [`
    .contractor-card {
      border: 1px solid #dee2e6;
      background-color: #f8f9fa;
    }
    .trend-bar {
      flex: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
      height: 100%;
    }
    .trend-bar-fill {
      width: 100%;
      border-radius: 2px 2px 0 0;
      transition: height 0.5s ease;
      min-height: 2px;
    }
    .trend-label {
      margin-top: 0.25rem;
      color: #6c757d;
      font-size: 0.7rem;
    }
    .contractors-stats {
      max-height: 500px;
      overflow-y: auto;
    }
    .contractors-stats::-webkit-scrollbar {
      width: 6px;
    }
    .contractors-stats::-webkit-scrollbar-track {
      background: #f1f1f1;
    }
    .contractors-stats::-webkit-scrollbar-thumb {
      background: #888;
      border-radius: 3px;
    }
    .contractors-stats::-webkit-scrollbar-thumb:hover {
      background: #555;
    }
  `]
})
export class MonthlyWorkerCountComponent implements OnInit, OnChanges, OnDestroy {
  @Input() selectedMonth!: string;
  
  private workerCountService = inject(WorkerCountService);
  private currentSiteService = inject(CurrentSiteService);
  
  contractorStats = signal<ContractorMonthlyStats[]>([]);
  isLoading = signal<boolean>(false);
  
  private lastLoadedMonth: string | null = null;
  private loadingPromise: Promise<void> | null = null;
  private isDestroyed = false;

  constructor() {
    effect(() => {
      const currentSite = this.currentSiteService.currentSite();
      
      if (currentSite?._id && this.selectedMonth && !this.isDestroyed) {
        this.loadMonthlyWorkerCount();
      }
    });
  }

  ngOnInit() {
    // 初始載入會由 effect 處理
  }

  ngOnChanges() {
    const currentSite = this.currentSiteService.currentSite();
    if (currentSite?._id && this.selectedMonth && this.selectedMonth !== this.lastLoadedMonth) {
      this.loadMonthlyWorkerCount();
    }
  }

  ngOnDestroy() {
    this.isDestroyed = true;
  }

  private async loadMonthlyWorkerCount(): Promise<void> {
    if (!this.selectedMonth || this.selectedMonth === this.lastLoadedMonth) {
      return;
    }

    if (this.loadingPromise) {
      await this.loadingPromise;
      return;
    }

    const currentSite = this.currentSiteService.currentSite();
    if (!currentSite?._id) {
      this.contractorStats.set([]);
      return;
    }

    this.isLoading.set(true);
    this.lastLoadedMonth = this.selectedMonth;

    this.loadingPromise = this.performMonthlyWorkerCountLoad(currentSite._id, this.selectedMonth);
    await this.loadingPromise;
    this.loadingPromise = null;
  }

  private async performMonthlyWorkerCountLoad(siteId: string, monthStr: string): Promise<void> {
    try {
      // 使用統一的服務查詢月出工人數
      const stats = await this.workerCountService.getMonthlyContractorWorkerCount(siteId, monthStr);
      this.contractorStats.set(stats);
    } catch (error) {
      console.error('載入月報表出工統計時發生錯誤:', error);
      this.contractorStats.set([]);
    } finally {
      this.isLoading.set(false);
    }
  }

  getTotalMonthlyContractors(): number {
    return this.contractorStats().length;
  }

  getTotalMonthlyWorkers(): number {
    return this.contractorStats().reduce((sum, contractor) => sum + contractor.totalWorkers, 0);
  }

  getAverageWeeklyWorkers(): number {
    const totalWorkers = this.getTotalMonthlyWorkers();
    const totalContractors = this.contractorStats().length;
    if (totalContractors === 0) return 0;
    
    const weeksCount = this.contractorStats().length > 0 ? this.contractorStats()[0].weeklyStats.length : 0;
    return weeksCount > 0 ? Math.round((totalWorkers / totalContractors / weeksCount) * 10) / 10 : 0;
  }

  getPeakWeekWorkers(): number {
    let peak = 0;
    this.contractorStats().forEach(contractor => {
      contractor.weeklyStats.forEach(week => {
        if (week.peakWorkers > peak) {
          peak = week.peakWorkers;
        }
      });
    });
    return peak;
  }

  getMonthRangeDisplay(): string {
    const month = dayjs(this.selectedMonth);
    return month.format('YYYY年MM月');
  }

  formatWeekRange(start: string, end: string): string {
    const startDate = dayjs(start);
    const endDate = dayjs(end);
    return `${startDate.format('MM/DD')} - ${endDate.format('MM/DD')}`;
  }

  getTrendBarHeight(value: number, peak: number): number {
    return peak > 0 ? (value / peak) * 100 : 0;
  }

  getMaxAverageWorkers(contractor: ContractorMonthlyStats): number {
    return Math.max(...contractor.weeklyStats.map(week => week.averageWorkers), 0);
  }
} 