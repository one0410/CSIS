import { Component, Input, OnInit, OnChanges, OnDestroy, computed, signal, inject, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MongodbService } from '../../../../services/mongodb.service';
import { CurrentSiteService } from '../../../../services/current-site.service';
import dayjs from 'dayjs';

// 導入 Bootstrap Modal 相關類型
declare const bootstrap: {
  Modal: new (element: HTMLElement, options?: any) => {
    show: () => void;
    hide: () => void;
    dispose: () => void;
  };
};

interface WorkerCountRecord {
  siteId: string;
  date: string; // YYYY-MM-DD 格式
  count: number;
  createdAt?: Date;
  updatedAt?: Date;
}

interface ChartData {
  x: string;
  y: number;
}

@Component({
  selector: 'app-fanshien-worker-count',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="card h-100">
      <div class="card-header d-flex justify-content-between align-items-center">
        <h6 class="mb-0">
          <i class="bi bi-person-plus me-2"></i>帆宣出工人數
        </h6>
        <button 
          class="btn btn-outline-primary btn-sm" 
          type="button"
          (click)="showUpdateModal()"
        >
          <i class="bi bi-pencil me-1"></i>更新
        </button>
      </div>
      <div class="card-body">
        @if (isLoading()) {
          <div class="text-center">
            <div class="spinner-border spinner-border-sm text-primary" role="status">
              <span class="visually-hidden">載入中...</span>
            </div>
          </div>
        } @else {
          @if (fanshienWorkerCounts().length > 0) {
            <div class="chart-container">
              <div class="d-flex align-items-end" style="height: 120px;">
                @for (item of fanshienWorkerCounts(); track item.x) {
                  <div class="d-flex flex-column align-items-center me-1 flex-grow-1">
                    <div 
                      class="bg-success rounded-top"
                      [style.height]="getBarHeight(item.y) + 'px'"
                      [style.width]="'100%'"
                      [title]="formatDate(item.x) + ': ' + item.y + ' 人'"
                    ></div>
                    <small class="text-muted" style="font-size: 0.7rem;">{{ formatDate(item.x) }}</small>
                  </div>
                }
              </div>
            </div>
          } @else {
            <p class="text-muted mb-0 small">無帆宣出工人數數據</p>
          }
        }
      </div>
    </div>

    <!-- 更新人數 Modal -->
    <div class="modal fade" id="updateWorkerCountModal" tabindex="-1" aria-labelledby="updateWorkerCountModalLabel" aria-hidden="true">
      <div class="modal-dialog">
        <div class="modal-content">
          <div class="modal-header">
            <h5 class="modal-title" id="updateWorkerCountModalLabel">
              <i class="bi bi-person-plus me-2"></i>更新帆宣出工人數
            </h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="關閉"></button>
          </div>
          <div class="modal-body">
            <div class="mb-3">
              <label for="modalDate" class="form-label">日期</label>
              <input 
                type="date" 
                class="form-control"
                id="modalDate"
                [(ngModel)]="modalDate"
                (change)="onModalDateChange()"
              >
            </div>
            <div class="mb-3">
              <label for="modalWorkerCount" class="form-label">人數</label>
              <input 
                type="number" 
                class="form-control"
                id="modalWorkerCount"
                [(ngModel)]="modalWorkerCount"
                min="0"
                placeholder="請輸入人數"
              >
            </div>
            @if (updateMessage()) {
              <div class="alert alert-success small">{{ updateMessage() }}</div>
            }
            @if (updateError()) {
              <div class="alert alert-danger small">{{ updateError() }}</div>
            }
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">取消</button>
            <button 
              type="button" 
              class="btn btn-primary"
              (click)="updateWorkerCountFromModal()"
              [disabled]="isUpdating()"
            >
              @if (isUpdating()) {
                <span class="spinner-border spinner-border-sm me-1" role="status"></span>
              }
              更新
            </button>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .chart-container {
      font-size: 0.8rem;
    }
    .bg-success {
      min-height: 3px;
    }
    .input-group-sm .form-control,
    .input-group-sm .input-group-text,
    .input-group-sm .btn {
      font-size: 0.875rem;
    }
  `]
})
export class FanshienWorkerCountComponent implements OnInit, OnChanges, OnDestroy {
  @Input() selectedDate!: string;
  
  private mongodbService = inject(MongodbService);
  private currentSiteService = inject(CurrentSiteService);
  
  fanshienWorkerCounts = signal<ChartData[]>([]);
  isLoading = signal<boolean>(false);
  isUpdating = signal<boolean>(false);
  updateMessage = signal<string>('');
  updateError = signal<string>('');
  
  // Modal 相關屬性
  modalDate = signal<string>('');
  modalWorkerCount = signal<number | null>(null);
  private updateModal: any;
  
  private maxFanshienCount = computed(() => {
    return Math.max(...this.fanshienWorkerCounts().map(item => item.y), 1);
  });
  
  private lastLoadedDate: string | null = null;
  private loadingPromise: Promise<void> | null = null;
  private isDestroyed = false;

  constructor() {
    // 使用 effect 監聽 currentSite 的變化
    effect(() => {
      const currentSite = this.currentSiteService.currentSite();
      
      if (currentSite?._id && this.selectedDate && !this.isDestroyed) {
        this.loadFanshienWorkerCounts();
      }
    });
  }

  ngOnInit() {
    // 初始載入會由 effect 處理，這裡不需要主動載入
    
    // 初始化 Bootstrap Modal
    setTimeout(() => {
      const modalElement = document.getElementById('updateWorkerCountModal');
      if (modalElement) {
        this.updateModal = new bootstrap.Modal(modalElement);
      }
    });
  }

  ngOnChanges() {
    // 當 selectedDate 變化時，如果有工地資料就重新載入
    const currentSite = this.currentSiteService.currentSite();
    if (currentSite?._id && this.selectedDate && this.selectedDate !== this.lastLoadedDate) {
      this.loadFanshienWorkerCounts();
    }
  }

  ngOnDestroy() {
    this.isDestroyed = true;
  }

  showUpdateModal() {
    // 預設設定為當前選擇的日期
    this.modalDate.set(this.selectedDate);
    this.modalWorkerCount.set(null);
    this.updateMessage.set('');
    this.updateError.set('');
    
    // 載入該日期的現有數據
    this.loadExistingDataForDate(this.selectedDate);
    
    if (this.updateModal) {
      this.updateModal.show();
    }
  }

  onModalDateChange() {
    const selectedDate = this.modalDate();
    if (selectedDate) {
      this.loadExistingDataForDate(selectedDate);
    }
  }

  async loadExistingDataForDate(date: string) {
    try {
      const currentSite = this.currentSiteService.currentSite();
      if (!currentSite?._id) return;

      const existingRecords = await this.mongodbService.get('workerCount', {
        siteId: currentSite._id,
        date: date
      });

      if (existingRecords.length > 0) {
        this.modalWorkerCount.set(existingRecords[0].count);
      } else {
        this.modalWorkerCount.set(null);
      }
    } catch (error) {
      console.error('載入現有數據失敗:', error);
    }
  }

  async updateWorkerCountFromModal() {
    const inputCount = this.modalWorkerCount();
    const selectedDate = this.modalDate();
    
    if (inputCount === null || inputCount < 0) {
      this.updateError.set('請輸入有效的人數');
      return;
    }

    if (!selectedDate) {
      this.updateError.set('請選擇日期');
      return;
    }

    this.isUpdating.set(true);
    this.updateMessage.set('');
    this.updateError.set('');

    try {
      const currentSite = this.currentSiteService.currentSite();
      if (!currentSite?._id) {
        this.updateError.set('無法取得工地資訊');
        return;
      }

      const siteId = currentSite._id;
      
      // 檢查該日期是否已有記錄
      const existingRecords = await this.mongodbService.get('workerCount', {
        siteId: siteId,
        date: selectedDate
      });

      const workerCountData: WorkerCountRecord = {
        siteId: siteId,
        date: selectedDate,
        count: inputCount
      };

      if (existingRecords.length > 0) {
        // 已有記錄，使用 PUT 更新
        const existingRecord = existingRecords[0];
        workerCountData.updatedAt = new Date();
        
        await this.mongodbService.put('workerCount', existingRecord._id, workerCountData);
        this.updateMessage.set('人數已更新');
      } else {
        // 沒有記錄，使用 POST 新增
        workerCountData.createdAt = new Date();
        
        await this.mongodbService.post('workerCount', workerCountData);
        this.updateMessage.set('人數已記錄');
      }

      // 重新載入數據以更新圖表
      await this.loadFanshienWorkerCounts();
      
      // 延遲關閉 Modal 並清除訊息
      setTimeout(() => {
        if (this.updateModal) {
          this.updateModal.hide();
        }
        this.updateMessage.set('');
      }, 1500);

    } catch (error) {
      console.error('更新帆宣出工人數失敗:', error);
      this.updateError.set('更新失敗，請稍後再試');
    } finally {
      this.isUpdating.set(false);
    }
  }

  private async loadFanshienWorkerCounts() {
    // 如果正在載入中，等待完成
    if (this.loadingPromise) {
      return this.loadingPromise;
    }

    this.loadingPromise = this.doLoadFanshienWorkerCounts();
    try {
      await this.loadingPromise;
    } finally {
      this.loadingPromise = null;
    }
  }

  private async doLoadFanshienWorkerCounts() {
    this.isLoading.set(true);
    try {
      const currentSite = this.currentSiteService.currentSite();
      if (!currentSite?._id) {
        this.resetData();
        return;
      }

      const siteId = currentSite._id;
      
      // 記錄當前載入的日期
      this.lastLoadedDate = this.selectedDate;
      const selectedDate = dayjs(this.selectedDate);
      
      // 查詢最近7天的帆宣出工人數記錄
      const endDate = selectedDate;
      const startDate = endDate.subtract(6, 'day');
      
      const filter = {
        siteId: siteId,
        date: {
          $gte: startDate.format('YYYY-MM-DD'),
          $lte: endDate.format('YYYY-MM-DD')
        }
      };

      const workerCountRecords = await this.mongodbService.get('workerCount', filter);
      
      // 建立日期對應的數據映射
      const dataMap = new Map<string, number>();
      workerCountRecords.forEach((record: WorkerCountRecord) => {
        dataMap.set(record.date, record.count);
      });
      
      // 生成最近7天的圖表數據
      const chartData: ChartData[] = [];
      for (let i = 0; i < 7; i++) {
        const date = startDate.add(i, 'day');
        const dateStr = date.format('YYYY-MM-DD');
        const count = dataMap.get(dateStr) || 0;
        
        chartData.push({
          x: dateStr,
          y: count
        });
      }

      this.fanshienWorkerCounts.set(chartData);
      
    } catch (error) {
      console.error('載入帆宣出工人數失敗:', error);
      this.resetData();
    } finally {
      this.isLoading.set(false);
    }
  }

  private resetData() {
    this.fanshienWorkerCounts.set([]);
  }

  getBarHeight(count: number): number {
    if (count === 0) return 3;
    const percentage = (count / this.maxFanshienCount()) * 90;
    return Math.max(percentage, 3);
  }

  formatDate(dateStr: string): string {
    return dayjs(dateStr).format('MM/DD');
  }
} 