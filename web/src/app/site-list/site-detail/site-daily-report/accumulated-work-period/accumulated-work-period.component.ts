import { Component, Input, OnInit, OnChanges, OnDestroy, computed, signal, inject, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MongodbService } from '../../../../services/mongodb.service';
import { CurrentSiteService } from '../../../../services/current-site.service';
import dayjs from 'dayjs';

interface ChartData {
  x: string;
  y: number;
}

@Component({
  selector: 'app-accumulated-work-period',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="card h-100">
      <div class="card-header">
        <h6 class="mb-0">
          <i class="fas fa-chart-line me-2"></i>累積工期與人數
        </h6>
      </div>
      <div class="card-body">
        @if (isLoading()) {
          <div class="text-center">
            <div class="spinner-border spinner-border-sm text-primary" role="status">
              <span class="visually-hidden">載入中...</span>
            </div>
          </div>
        } @else {
          <div class="row mb-3">
            <div class="col-6">
              <div class="text-center">
                <h4 class="text-primary mb-0">{{ accumulatedDays() }}</h4>
                <small class="text-muted">累積工期 (天)</small>
              </div>
            </div>
            <div class="col-6">
              <div class="text-center">
                <h4 class="text-success mb-0">{{ totalWorkerCount() }}</h4>
                <small class="text-muted">累積總人數</small>
              </div>
            </div>
          </div>
          @if (accumulatedWorkerCounts().length > 0) {
            <div class="chart-container">
              <div class="d-flex align-items-end" style="height: 120px;">
                @for (item of accumulatedWorkerCounts(); track item.x) {
                  <div class="d-flex flex-column align-items-center me-1 flex-grow-1">
                    <div 
                      class="bg-info rounded-top"
                      [style.height]="(item.y / maxAccumulatedCount()) * 100 + 'px'"
                      [style.width]="'100%'"
                      [title]="formatDate(item.x) + ': ' + item.y + ' 人'"
                    ></div>
                    <small class="text-muted" style="font-size: 0.7rem;">{{ formatDate(item.x) }}</small>
                  </div>
                }
              </div>
            </div>
          } @else {
            <p class="text-muted mb-0 small">無累積工期數據</p>
          }
        }
      </div>
    </div>
  `,
  styles: [`
    .chart-container {
      font-size: 0.8rem;
    }
    .bg-info {
      min-height: 3px;
    }
  `]
})
export class AccumulatedWorkPeriodComponent implements OnInit, OnChanges, OnDestroy {
  @Input() selectedDate!: string;
  
  private mongodbService = inject(MongodbService);
  private currentSiteService = inject(CurrentSiteService);
  
  accumulatedWorkerCounts = signal<ChartData[]>([]);
  accumulatedDays = signal<number>(0);
  totalWorkerCount = signal<number>(0);
  isLoading = signal<boolean>(false);
  
  maxAccumulatedCount = computed(() => {
    return Math.max(...this.accumulatedWorkerCounts().map(item => item.y), 1);
  });
  
  private lastLoadedDate: string | null = null;
  private loadingPromise: Promise<void> | null = null;
  private isDestroyed = false;

  constructor() {
    // 使用 effect 監聽 currentSite 的變化
    effect(() => {
      const currentSite = this.currentSiteService.currentSite();
      
      if (currentSite?._id && this.selectedDate && !this.isDestroyed) {
        this.loadAccumulatedData();
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
      this.loadAccumulatedData();
    }
  }

  ngOnDestroy() {
    this.isDestroyed = true;
  }

  private async loadAccumulatedData() {
    // 如果正在載入中，等待完成
    if (this.loadingPromise) {
      return this.loadingPromise;
    }

    this.loadingPromise = this.doLoadAccumulatedData();
    try {
      await this.loadingPromise;
    } finally {
      this.loadingPromise = null;
    }
  }

  private async doLoadAccumulatedData() {
    this.isLoading.set(true);
    try {
      const currentSite = this.currentSiteService.currentSite();
      if (!currentSite?._id || !currentSite.startDate) {
        this.resetData();
        return;
      }

      const siteId = currentSite._id;
      
      // 記錄當前載入的日期
      this.lastLoadedDate = this.selectedDate;
      const startDate = dayjs(currentSite.startDate);
      const selectedDate = dayjs(this.selectedDate);
      
      // 計算累積工期天數
      const days = selectedDate.diff(startDate, 'day') + 1;
      this.accumulatedDays.set(Math.max(days, 0));

      // 查詢從開始日期到選定日期的所有工具箱會議記錄
      const filter = {
        siteId: siteId,
        formType: 'toolboxMeeting',
        applyDate: {
          $gte: startDate.format('YYYY-MM-DD'),
          $lte: selectedDate.format('YYYY-MM-DD')
        }
      };

      const toolboxMeetings = await this.mongodbService.get('siteForm', filter);
      
      // 按日期分組統計簽名人數
      const dailyCountMap = new Map<string, Set<string>>();
      let totalUniqueWorkers = new Set<string>();
      
      for (const meeting of toolboxMeetings) {
        if (meeting.healthWarnings) {
          const meetingDate = meeting.applyDate; // 直接使用 applyDate
          
          if (!dailyCountMap.has(meetingDate)) {
            dailyCountMap.set(meetingDate, new Set());
          }
          
          // 收集所有4個廠商的簽名
          const allSignatureArrays = [
            meeting.healthWarnings.attendeeMainContractorSignatures || [],
            meeting.healthWarnings.attendeeSubcontractor1Signatures || [],
            meeting.healthWarnings.attendeeSubcontractor2Signatures || [],
            meeting.healthWarnings.attendeeSubcontractor3Signatures || []
          ];
          
          for (const signatures of allSignatureArrays) {
            for (const signature of signatures) {
              if (signature && signature.name && signature.signature) {
                dailyCountMap.get(meetingDate)!.add(signature.name);
                totalUniqueWorkers.add(signature.name);
              }
            }
          }
        }
      }

      // 轉換為圖表數據格式 (只顯示最近7天)
      const chartData: ChartData[] = [];
      const endDate = selectedDate;
      const startChartDate = endDate.subtract(6, 'day');
      
      for (let i = 0; i < 7; i++) {
        const date = startChartDate.add(i, 'day');
        const dateStr = date.format('YYYY-MM-DD');
        const count = dailyCountMap.get(dateStr)?.size || 0;
        
        chartData.push({
          x: dateStr,
          y: count
        });
      }

      this.accumulatedWorkerCounts.set(chartData);
      this.totalWorkerCount.set(totalUniqueWorkers.size);
      
    } catch (error) {
      console.error('載入累積工期數據失敗:', error);
      this.resetData();
    } finally {
      this.isLoading.set(false);
    }
  }

  private resetData() {
    this.accumulatedWorkerCounts.set([]);
    this.accumulatedDays.set(0);
    this.totalWorkerCount.set(0);
  }

  formatDate(dateStr: string): string {
    return dayjs(dateStr).format('MM/DD');
  }
} 