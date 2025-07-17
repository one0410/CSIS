import { Component, Input, OnInit, OnChanges, OnDestroy, computed, signal, inject, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MongodbService } from '../../../../services/mongodb.service';
import { CurrentSiteService } from '../../../../services/current-site.service';
import dayjs from 'dayjs';

interface ChecklistStats {
  formType: string;
  displayName: string;
  totalCount: number;
  passCount: number;
  failCount: number;
  passRate: number;
  failRate: number;
  color: string;
}

@Component({
  selector: 'app-weekly-checklist-stats',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="card h-100">
      <div class="card-header">
        <h6 class="mb-0">
          <i class="bi bi-clipboard-check me-2"></i>自檢表數量統計
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
        } @else {
          <!-- 總計概覽 -->
          <div class="mb-3">
            <div class="row text-center">
              <div class="col-3">
                <div class="stat-item">
                  <h5 class="text-primary mb-0">{{ getTotalChecklists() }}</h5>
                  <small class="text-muted">總表單</small>
                </div>
              </div>
              <div class="col-3">
                <div class="stat-item">
                  <h5 class="text-success mb-0">{{ getTotalPassCount() }}</h5>
                  <small class="text-muted">合格</small>
                </div>
              </div>
              <div class="col-3">
                <div class="stat-item">
                  <h5 class="text-danger mb-0">{{ getTotalFailCount() }}</h5>
                  <small class="text-muted">不合格</small>
                </div>
              </div>
              <div class="col-3">
                <div class="stat-item">
                  <h5 class="text-warning mb-0">{{ getOverallPassRate() }}%</h5>
                  <small class="text-muted">總合格率</small>
                </div>
              </div>
            </div>
          </div>

          <!-- 分類統計 -->
          @if (checklistStats().length > 0) {
            <div class="checklist-stats">
              @for (stat of checklistStats(); track stat.formType) {
                <div class="stat-card mb-3 p-3 border rounded">
                  <div class="d-flex justify-content-between align-items-start mb-2">
                    <div>
                      <h6 class="mb-1" [style.color]="stat.color">{{ stat.displayName }}</h6>
                      <small class="text-muted">{{ stat.formType }}</small>
                    </div>
                    <div class="text-end">
                      <span class="badge" [style.background-color]="stat.color">{{ stat.totalCount }}</span>
                    </div>
                  </div>
                  
                  <!-- 合格率進度條 -->
                  <div class="mb-2">
                    <div class="d-flex justify-content-between align-items-center mb-1">
                      <small class="text-muted">合格率</small>
                      <small class="fw-medium text-success">{{ stat.passRate }}% ({{ stat.passCount }}/{{ stat.totalCount }})</small>
                    </div>
                    <div class="progress" style="height: 6px;">
                      <div 
                        class="progress-bar bg-success"
                        [style.width]="stat.passRate + '%'"
                        role="progressbar">
                      </div>
                    </div>
                  </div>
                  
                  <!-- 缺失率進度條 -->
                  <div>
                    <div class="d-flex justify-content-between align-items-center mb-1">
                      <small class="text-muted">缺失率</small>
                      <small class="fw-medium text-danger">{{ stat.failRate }}% ({{ stat.failCount }}/{{ stat.totalCount }})</small>
                    </div>
                    <div class="progress" style="height: 6px;">
                      <div 
                        class="progress-bar bg-danger"
                        [style.width]="stat.failRate + '%'"
                        role="progressbar">
                      </div>
                    </div>
                  </div>
                </div>
              }
            </div>
          } @else {
            <div class="text-center text-muted">
              <i class="bi bi-clipboard-x fs-1 mb-2 opacity-50"></i>
              <p class="mb-0">該週無自檢表記錄</p>
              <small>暫無任何自檢表建立</small>
            </div>
          }
        }
      </div>
    </div>
  `,
  styles: [`
    .stat-item {
      padding: 0.5rem;
    }
    .stat-card {
      background-color: #f8f9fa;
      transition: all 0.2s ease;
    }
    .stat-card:hover {
      background-color: #e9ecef;
      transform: translateY(-1px);
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    }
    .progress {
      border-radius: 3px;
    }
    .progress-bar {
      transition: width 0.6s ease;
    }
    .checklist-stats {
      max-height: 300px;
      overflow-y: auto;
    }
    .checklist-stats::-webkit-scrollbar {
      width: 6px;
    }
    .checklist-stats::-webkit-scrollbar-track {
      background: #f1f1f1;
    }
    .checklist-stats::-webkit-scrollbar-thumb {
      background: #888;
      border-radius: 3px;
    }
    .checklist-stats::-webkit-scrollbar-thumb:hover {
      background: #555;
    }
  `]
})
export class WeeklyChecklistStatsComponent implements OnInit, OnChanges, OnDestroy {
  @Input() selectedWeek!: string;
  
  private mongodbService = inject(MongodbService);
  private currentSiteService = inject(CurrentSiteService);
  
  checklistStats = signal<ChecklistStats[]>([]);
  isLoading = signal<boolean>(false);
  
  private lastLoadedWeek: string | null = null;
  private loadingPromise: Promise<void> | null = null;
  private isDestroyed = false;

  // 自檢表類型配置
  private checklistTypeConfigs = {
    'environmentChecklist': {
      displayName: '環安衛自檢表',
      color: '#17a2b8'
    },
    'specialWorkChecklist': {
      displayName: '特殊作業自檢表',
      color: '#ffc107'
    },
    'safetyPatrolChecklist': {
      displayName: '工安巡迴檢查表',
      color: '#fd7e14'
    }
  };

  constructor() {
    // 使用 effect 監聽 currentSite 的變化
    effect(() => {
      const currentSite = this.currentSiteService.currentSite();
      
      if (currentSite?._id && this.selectedWeek && !this.isDestroyed) {
        this.loadWeeklyChecklistStats();
      }
    });
  }

  ngOnInit() {
    // 初始載入會由 effect 處理
  }

  ngOnChanges() {
    const currentSite = this.currentSiteService.currentSite();
    if (currentSite?._id && this.selectedWeek && this.selectedWeek !== this.lastLoadedWeek) {
      this.loadWeeklyChecklistStats();
    }
  }

  ngOnDestroy() {
    this.isDestroyed = true;
  }

  private async loadWeeklyChecklistStats(): Promise<void> {
    if (!this.selectedWeek || this.selectedWeek === this.lastLoadedWeek) {
      return;
    }

    if (this.loadingPromise) {
      await this.loadingPromise;
      return;
    }

    const currentSite = this.currentSiteService.currentSite();
    if (!currentSite?._id) {
      this.checklistStats.set([]);
      return;
    }

    this.isLoading.set(true);
    this.lastLoadedWeek = this.selectedWeek;

    this.loadingPromise = this.performWeeklyChecklistStatsLoad(currentSite._id, this.selectedWeek);
    await this.loadingPromise;
    this.loadingPromise = null;
  }

  private async performWeeklyChecklistStatsLoad(siteId: string, weekStart: string): Promise<void> {
    try {
      const startDate = dayjs(weekStart);
      const endDate = startDate.add(6, 'day');

      const stats: ChecklistStats[] = [];

      // 查詢各種自檢表類型
      for (const [formType, config] of Object.entries(this.checklistTypeConfigs)) {
        const query = {
          siteId: siteId,
          formType: formType,
          $or: [
            { 
              checkDate: {
                $gte: startDate.format('YYYY-MM-DD'),
                $lte: endDate.format('YYYY-MM-DD')
              }
            },
            {
              inspectionDate: {
                $gte: startDate.format('YYYY-MM-DD'),
                $lte: endDate.format('YYYY-MM-DD')
              }
            },
            {
              applyDate: {
                $gte: startDate.format('YYYY-MM-DD'),
                $lte: endDate.format('YYYY-MM-DD')
              }
            }
          ]
        };

        console.log(`查詢 ${formType} 自檢表:`, query);

        const forms = await this.mongodbService.get('siteForm', query);
        
        if (forms && forms.length > 0) {
          const result = this.calculateChecklistStats(formType, config, forms);
          if (result.totalCount > 0) {
            stats.push(result);
          }
        }
      }

      // 按總數排序
      stats.sort((a, b) => b.totalCount - a.totalCount);
      this.checklistStats.set(stats);

    } catch (error) {
      console.error('載入週報表自檢表統計時發生錯誤:', error);
      this.checklistStats.set([]);
    } finally {
      this.isLoading.set(false);
    }
  }

  private calculateChecklistStats(
    formType: string, 
    config: any, 
    forms: any[]
  ): ChecklistStats {
    let passCount = 0;
    let failCount = 0;
    const totalCount = forms.length;

    forms.forEach(form => {
      const hasDefects = this.checkFormForDefects(form);
      if (hasDefects) {
        failCount++;
      } else {
        passCount++;
      }
    });

    const passRate = totalCount > 0 ? Math.round((passCount / totalCount) * 100) : 0;
    const failRate = totalCount > 0 ? Math.round((failCount / totalCount) * 100) : 0;

    return {
      formType,
      displayName: config.displayName,
      totalCount,
      passCount,
      failCount,
      passRate,
      failRate,
      color: config.color
    };
  }

  private checkFormForDefects(form: any): boolean {
    // 檢查表單中是否有異常項目
    if (!form.items) return false;

    const items = form.items;
    
    // 遍歷所有檢查項目
    for (const [key, value] of Object.entries(items)) {
      if (value === '異常' || value === '不符合' || value === 'fail' || value === false) {
        return true; // 有缺失
      }
    }

    return false; // 無缺失
  }

  getWeekRangeDisplay(): string {
    const startDate = dayjs(this.selectedWeek);
    const endDate = startDate.add(6, 'day');
    return `${startDate.format('YYYY/MM/DD')} - ${endDate.format('YYYY/MM/DD')}`;
  }

  getTotalChecklists(): number {
    return this.checklistStats().reduce((sum, stat) => sum + stat.totalCount, 0);
  }

  getTotalPassCount(): number {
    return this.checklistStats().reduce((sum, stat) => sum + stat.passCount, 0);
  }

  getTotalFailCount(): number {
    return this.checklistStats().reduce((sum, stat) => sum + stat.failCount, 0);
  }

  getOverallPassRate(): number {
    const total = this.getTotalChecklists();
    const pass = this.getTotalPassCount();
    return total > 0 ? Math.round((pass / total) * 100) : 0;
  }
} 