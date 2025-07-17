import { Component, Input, OnInit, OnChanges, OnDestroy, computed, signal, inject, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MongodbService } from '../../../../services/mongodb.service';
import { CurrentSiteService } from '../../../../services/current-site.service';

interface ContractorWorkerCount {
  contractorName: string;
  workerCount: number;
}

@Component({
  selector: 'app-contractor-worker-count',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="card h-100">
      <div class="card-header">
        <h6 class="mb-0">
          <i class="bi bi-bar-chart me-2"></i>各廠商實際出工人數
        </h6>
      </div>
      <div class="card-body">
        @if (isLoading()) {
          <div class="text-center">
            <div class="spinner-border spinner-border-sm text-primary" role="status">
              <span class="visually-hidden">載入中...</span>
            </div>
          </div>
        } @else if (contractorWorkerCounts().length > 0) {
          <div class="chart-container">
            @for (item of contractorWorkerCounts(); track item.contractorName) {
              <div class="chart-item mb-3">
                <div class="d-flex justify-content-between align-items-center mb-1">
                  <span class="fw-medium">{{ item.contractorName }}</span>
                  <span class="text-primary fw-bold">{{ item.workerCount }} 人</span>
                </div>
                <div class="progress">
                  <div 
                    class="progress-bar bg-primary" 
                    [style.width]="getBarWidth(item.workerCount)"
                    role="progressbar"
                  ></div>
                </div>
              </div>
            }
          </div>
        } @else {
          <p class="text-muted mb-0 small">當日無工具箱會議簽名記錄</p>
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
      height: 6px;
    }
  `]
})
export class ContractorWorkerCountComponent implements OnInit, OnChanges, OnDestroy {
  @Input() selectedDate!: string;
  
  private mongodbService = inject(MongodbService);
  private currentSiteService = inject(CurrentSiteService);
  
  contractorWorkerCounts = signal<ContractorWorkerCount[]>([]);
  isLoading = signal<boolean>(false);
  
  private maxWorkerCount = computed(() => {
    return Math.max(...this.contractorWorkerCounts().map(item => item.workerCount), 1);
  });
  
  private lastLoadedDate: string | null = null;
  private loadingPromise: Promise<void> | null = null;
  private isDestroyed = false;

  constructor() {
    // 使用 effect 監聽 currentSite 的變化
    effect(() => {
      const currentSite = this.currentSiteService.currentSite();
      
      if (currentSite?._id && this.selectedDate && !this.isDestroyed) {
        this.loadContractorWorkerCounts();
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
      this.loadContractorWorkerCounts();
    }
  }

  ngOnDestroy() {
    this.isDestroyed = true;
  }

  private async loadContractorWorkerCounts() {
    // 如果正在載入中，等待完成
    if (this.loadingPromise) {
      return this.loadingPromise;
    }

    this.loadingPromise = this.doLoadContractorWorkerCounts();
    try {
      await this.loadingPromise;
    } finally {
      this.loadingPromise = null;
    }
  }

  private async doLoadContractorWorkerCounts() {
    this.isLoading.set(true);
    try {
      const currentSite = this.currentSiteService.currentSite();
      if (!currentSite?._id) {
        this.contractorWorkerCounts.set([]);
        return;
      }
      const siteId = currentSite._id;
      
      // 記錄當前載入的日期
      this.lastLoadedDate = this.selectedDate;

      // 查詢當日工具箱會議簽名記錄
      const filter = {
        siteId: siteId,
        formType: 'toolboxMeeting',
        applyDate: this.selectedDate
      };

      const toolboxMeetings = await this.mongodbService.get('siteForm', filter);
      
      // 統計各廠商簽名人數
      const contractorCountMap = new Map<string, Set<string>>();
      
      for (const meeting of toolboxMeetings) {
        // 從 healthWarnings 中取得4個簽名陣列
        if (meeting.healthWarnings) {
          const allSignatureArrays = [
            meeting.healthWarnings.attendeeMainContractorSignatures || [],
            meeting.healthWarnings.attendeeSubcontractor1Signatures || [],
            meeting.healthWarnings.attendeeSubcontractor2Signatures || [],
            meeting.healthWarnings.attendeeSubcontractor3Signatures || []
          ];
          
          for (const signatures of allSignatureArrays) {
            for (const signature of signatures) {
              if (signature && signature.name && signature.signature && signature.company) {
                const companyName = signature.company.trim();
                
                if (!contractorCountMap.has(companyName)) {
                  contractorCountMap.set(companyName, new Set());
                }
                
                // 使用工人姓名作為唯一識別（同一個工人在同一公司只計算一次）
                contractorCountMap.get(companyName)!.add(signature.name);
              }
            }
          }
        }
      }

      // 轉換為陣列格式，過濾掉沒有簽名或公司名稱為空的項目
      const counts: ContractorWorkerCount[] = Array.from(contractorCountMap.entries())
        .filter(([contractorName, workerSet]) => 
          workerSet.size > 0 && 
          contractorName && 
          contractorName.trim() !== ''
        )
        .map(([contractorName, workerSet]) => ({
          contractorName,
          workerCount: workerSet.size
        }))
        .sort((a, b) => b.workerCount - a.workerCount);

      this.contractorWorkerCounts.set(counts);
    } catch (error) {
      console.error('載入廠商出工人數失敗:', error);
      this.contractorWorkerCounts.set([]);
    } finally {
      this.isLoading.set(false);
    }
  }

  getBarWidth(count: number): string {
    const percentage = (count / this.maxWorkerCount()) * 100;
    return `${Math.max(percentage, 5)}%`;
  }
} 