import { Component, Input, OnInit, OnChanges, OnDestroy, computed, signal, inject, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MongodbService } from '../../../../services/mongodb.service';
import { CurrentSiteService } from '../../../../services/current-site.service';
import dayjs from 'dayjs';

interface ConstructionPermitCount {
  categoryName: string;
  count: number;
  percentage: number;
}

@Component({
  selector: 'app-weekly-construction-permits',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="card h-100">
      <div class="card-header">
        <h6 class="mb-0">
          <i class="fas fa-clipboard-check me-2"></i>各項施工申請數量統計
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
        } @else if (permitCounts().length > 0) {
          <div class="chart-container">
            <div class="mb-3">
              <div class="d-flex justify-content-between align-items-center mb-2">
                <span class="text-muted small">總申請數量</span>
                <span class="fw-bold text-primary">{{ getTotalCount() }} 件</span>
              </div>
            </div>
            
            @for (item of permitCounts(); track item.categoryName) {
              <div class="chart-item mb-3">
                <div class="d-flex justify-content-between align-items-center mb-1">
                  <span class="fw-medium">{{ item.categoryName }}</span>
                  <div class="d-flex align-items-center">
                    <span class="text-primary fw-bold me-2">{{ item.count }} 件</span>
                    <span class="text-muted small">{{ item.percentage }}%</span>
                  </div>
                </div>
                <div class="progress">
                  <div 
                    class="progress-bar"
                    [style.width]="item.percentage + '%'"
                    [class]="getProgressBarClass(item.categoryName)"
                    role="progressbar"
                  ></div>
                </div>
              </div>
            }
          </div>
        } @else {
          <div class="text-center text-muted">
            <i class="fas fa-clipboard-list fs-1 mb-2 opacity-50"></i>
            <p class="mb-0">該週無施工申請記錄</p>
            <small>暫無任何工地許可單申請</small>
          </div>
        }
      </div>
    </div>
  `,
  styles: [`
    .chart-container {
      font-size: 0.9rem;
    }
    .chart-item {
      margin-bottom: 0.75rem !important;
    }
    .progress {
      height: 8px;
    }
    .progress-bar {
      transition: width 0.6s ease;
    }
    .bg-fire {
      background-color: #dc3545 !important;
    }
    .bg-height {
      background-color: #fd7e14 !important;
    }
    .bg-confined {
      background-color: #6f42c1 !important;
    }
    .bg-electrical {
      background-color: #ffc107 !important;
    }
    .bg-crane {
      background-color: #20c997 !important;
    }
    .bg-lifting {
      background-color: #e83e8c !important;
    }
    .bg-scaffold {
      background-color: #6c757d !important;
    }
    .bg-pipeline {
      background-color: #17a2b8 !important;
    }
    .bg-opening {
      background-color: #28a745 !important;
    }
    .bg-chemical {
      background-color: #343a40 !important;
    }
    .bg-other {
      background-color: #007bff !important;
    }
  `]
})
export class WeeklyConstructionPermitsComponent implements OnInit, OnChanges, OnDestroy {
  @Input() selectedWeek!: string;
  
  private mongodbService = inject(MongodbService);
  private currentSiteService = inject(CurrentSiteService);
  
  permitCounts = signal<ConstructionPermitCount[]>([]);
  isLoading = signal<boolean>(false);
  
  private lastLoadedWeek: string | null = null;
  private loadingPromise: Promise<void> | null = null;
  private isDestroyed = false;

  // 標準作業類別
  private standardCategories = [
    '動火作業',
    '高架作業', 
    '局限空間作業',
    '電力作業',
    '吊籠作業',
    '起重吊掛作業',
    '施工架組裝作業',
    '管線拆裝作業',
    '開口作業',
    '化學作業'
  ];

  constructor() {
    // 使用 effect 監聽 currentSite 的變化
    effect(() => {
      const currentSite = this.currentSiteService.currentSite();
      
      if (currentSite?._id && this.selectedWeek && !this.isDestroyed) {
        this.loadWeeklyPermitCounts();
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
      this.loadWeeklyPermitCounts();
    }
  }

  ngOnDestroy() {
    this.isDestroyed = true;
  }

  private async loadWeeklyPermitCounts(): Promise<void> {
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
      this.permitCounts.set([]);
      return;
    }

    this.isLoading.set(true);
    this.lastLoadedWeek = this.selectedWeek;

    this.loadingPromise = this.performWeeklyPermitLoad(currentSite._id, this.selectedWeek);
    await this.loadingPromise;
    this.loadingPromise = null;
  }

  private async performWeeklyPermitLoad(siteId: string, weekStart: string): Promise<void> {
    try {
      // 計算週的日期範圍
      const startDate = dayjs(weekStart);
      const endDate = startDate.add(6, 'day');

      // 建立查詢條件
      const query = {
        siteId: siteId,
        formType: 'sitePermit',
        applyDate: {
          $gte: startDate.format('YYYY-MM-DD'),
          $lte: endDate.format('YYYY-MM-DD')
        }
      };

      console.log('查詢週報表施工申請數量:', query);

      // 查詢工地許可單記錄
      const permits = await this.mongodbService.getArray('siteForm', query);

      if (!permits || !Array.isArray(permits)) {
        console.warn('未找到工地許可單資料或格式不正確');
        this.permitCounts.set([]);
        return;
      }

      // 統計各作業類別的數量
      const categoryMap = new Map<string, number>();

      // 初始化所有標準類別
      this.standardCategories.forEach(category => {
        categoryMap.set(category, 0);
      });

      permits.forEach((permit: any) => {
        if (permit.selectedCategories && Array.isArray(permit.selectedCategories)) {
          permit.selectedCategories.forEach((category: string) => {
            const count = categoryMap.get(category) || 0;
            categoryMap.set(category, count + 1);
          });
        }
      });

      // 計算總數和百分比
      const totalCount = Array.from(categoryMap.values()).reduce((sum, count) => sum + count, 0);
      
      const result: ConstructionPermitCount[] = Array.from(categoryMap.entries())
        .map(([categoryName, count]) => ({
          categoryName,
          count,
          percentage: totalCount > 0 ? Math.round((count / totalCount) * 100) : 0
        }))
        .filter(item => item.count > 0) // 只顯示有數據的類別
        .sort((a, b) => b.count - a.count); // 按數量排序

      this.permitCounts.set(result);

    } catch (error) {
      console.error('載入週報表施工申請數量時發生錯誤:', error);
      this.permitCounts.set([]);
    } finally {
      this.isLoading.set(false);
    }
  }

  getWeekRangeDisplay(): string {
    const startDate = dayjs(this.selectedWeek);
    const endDate = startDate.add(6, 'day');
    return `${startDate.format('YYYY/MM/DD')} - ${endDate.format('YYYY/MM/DD')}`;
  }

  getTotalCount(): number {
    return this.permitCounts().reduce((sum, item) => sum + item.count, 0);
  }

  getProgressBarClass(categoryName: string): string {
    const classMap: { [key: string]: string } = {
      '動火作業': 'bg-fire',
      '高架作業': 'bg-height', 
      '局限空間作業': 'bg-confined',
      '電力作業': 'bg-electrical',
      '吊籠作業': 'bg-crane',
      '起重吊掛作業': 'bg-lifting',
      '施工架組裝作業': 'bg-scaffold',
      '管線拆裝作業': 'bg-pipeline',
      '開口作業': 'bg-opening',
      '化學作業': 'bg-chemical'
    };
    
    return classMap[categoryName] || 'bg-other';
  }
} 