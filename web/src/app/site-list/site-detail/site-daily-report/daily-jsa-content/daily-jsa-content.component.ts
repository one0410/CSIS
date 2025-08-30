import { Component, Input, OnInit, OnChanges, OnDestroy, computed, signal, inject, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { MongodbService } from '../../../../services/mongodb.service';
import { CurrentSiteService } from '../../../../services/current-site.service';
import dayjs from 'dayjs';
import { SitePermitForm } from '../../site-form-list/site-permit-form/site-permit-form.component';

interface JSAItem {
    id: string;
    workName: string; // 作業名稱
    step: string; // 步驟/節點
    highRiskProject: string; // 高風險項目
    possibleHazardFactor: string; // 可能危害因素(危害類型)
    protectiveEquipment: string; // 防護具
    safetyProtectionMeasures: string; // 安全防護措施
    emergencyMeasures: string; // 緊急/搶救措施
    workDate: string; // 施作日期
    workPersonCount: number | null; // 施作人數
    contractor: string; // 承攬商
    maker: string; // 製表人
    makerDate: string; // 製表日期
    originalData: any;
}

@Component({
    selector: 'app-daily-jsa-content',
    standalone: true,
    imports: [CommonModule],
    template: `
    <div class="card h-100">
      <div class="card-header">
        <h6 class="mb-0">
          <i class="fas fa-shield-alt me-2"></i>當日 JSA
        </h6>
      </div>
      <div class="card-body">
        @if (isLoading()) {
          <div class="text-center">
            <div class="spinner-border spinner-border-sm text-primary" role="status">
              <span class="visually-hidden">載入中...</span>
            </div>
          </div>
        } @else if (jsaItems().length > 0) {
          <div class="table-responsive">
          @for (item of jsaItems(); track item.id) {
            <div class="d-flex justify-content-between">
                <span>作業名稱:{{ item.workName || '未填寫' }}</span>
                <span>承攬商:{{ item.contractor || '未填寫承攬商' }}</span>
                <span>製表人:{{ item.maker || '未填寫製表人' }}</span>
                <span>製表日期:{{ item.makerDate || '未填寫製表日期' }}</span>
            </div>
            <table class="table table-bordered table-sm">
              <thead class="table-dark">
                <tr>
                  <th>步驟/節點</th>
                  <th>高風險項目</th>
                  <th>可能危害因素<br>(危害類型)</th>
                  <th>防護具</th>
                  <th>安全防護措施</th>
                  <th>緊急/搶救措施</th>
                  <th>施作日期</th>
                  <th>施作人數</th>
                </tr>
              </thead>
              <tbody>
                  <tr class="cursor-pointer" (click)="navigateToForm(item)" [title]="'點擊查看詳情'">
                    <td>{{ item.step || '未填寫' }}</td>
                    <td>{{ item.highRiskProject || '未填寫' }}</td>
                    <td>{{ item.possibleHazardFactor || '未填寫' }}</td>
                    <td>{{ item.protectiveEquipment || '未填寫' }}</td>
                    <td>{{ item.safetyProtectionMeasures || '未填寫' }}</td>
                    <td>{{ item.emergencyMeasures || '未填寫' }}</td>
                    <td>{{ item.workDate ? (item.workDate | date:'yyyy-MM-dd') : '未填寫' }}</td>
                    <td class="text-center">{{ item.workPersonCount ?? '' }}</td>
                  </tr>
                </tbody>
            </table>
            }
          </div>
        } @else {
          <div class="text-center text-muted">
            <i class="fas fa-clipboard-list fs-1 mb-2"></i>
            <p class="mb-0">當日無 JSA 記錄</p>
            <small>暫無任何工作安全分析資料</small>
          </div>
        }
      </div>
    </div>
  `,
    styles: [`
    .table {
      font-size: 0.875rem;
      margin-bottom: 0;
    }
    
    .table th {
      font-size: 0.8rem;
      vertical-align: middle;
      text-align: center;
      white-space: nowrap;
      background-color: #343a40;
      color: white;
      border: 1px solid #dee2e6;
      padding: 0.5rem;
    }
    
    .table td {
      vertical-align: top;
      max-width: 150px;
      word-wrap: break-word;
      border: 1px solid #dee2e6;
      padding: 0.5rem;
      font-size: 0.8rem;
    }
    
    .cursor-pointer {
      cursor: pointer;
    }
    
    .cursor-pointer:hover {
      background-color: #f8f9fa;
    }
    
    .table-responsive {
      max-height: 400px;
      overflow-y: auto;
    }
    
    .table-responsive::-webkit-scrollbar {
      width: 6px;
    }
    
    .table-responsive::-webkit-scrollbar-track {
      background: #f1f1f1;
    }
    
    .table-responsive::-webkit-scrollbar-thumb {
      background: #888;
      border-radius: 3px;
    }
    
    .table-responsive::-webkit-scrollbar-thumb:hover {
      background: #555;
    }
    
    .work-name {
      font-weight: bold;
      color: #007bff;
      margin-bottom: 0.25rem;
    }
    
    .contractor-name {
      font-size: 0.8rem;
      color: #6c757d;
      margin-bottom: 0.25rem;
    }
    
    .step-content {
      font-size: 0.85rem;
      line-height: 1.3;
    }
    
    .table th:nth-child(1) {
      min-width: 180px;
    }
    
    .table th:nth-child(3) {
      min-width: 160px;
    }
    
    .table th:nth-child(5) {
      min-width: 160px;
    }
    
    .table th:nth-child(7),
    .table th:nth-child(8) {
      min-width: 80px;
    }
  `]
})
export class DailyJSAContentComponent implements OnInit, OnChanges, OnDestroy {
    @Input() selectedDate!: string;

    private mongodbService = inject(MongodbService);
    private currentSiteService = inject(CurrentSiteService);
    private router = inject(Router);

    private site = computed(() => this.currentSiteService.currentSite());

    isLoading = signal(true);
    jsaItems = signal<JSAItem[]>([]);

    private lastLoadedDate: string | null = null;
    private loadingPromise: Promise<void> | null = null;
    private isDestroyed = false;

    constructor() {
        // 使用 effect 監聽 currentSite 的變化
        effect(() => {
            const currentSite = this.currentSiteService.currentSite();

            if (currentSite?._id && this.selectedDate && !this.isDestroyed) {
                this.loadJSAData();
            }
        });
    }

    ngOnInit(): void {
        // 初始載入會由 effect 處理
    }

    ngOnChanges(): void {
        // 當 selectedDate 變化時，如果有工地資料就重新載入
        const currentSite = this.currentSiteService.currentSite();
        if (currentSite?._id && this.selectedDate && this.selectedDate !== this.lastLoadedDate) {
            this.loadJSAData();
        }
    }

    ngOnDestroy(): void {
        this.isDestroyed = true;
    }

    private async loadJSAData(): Promise<void> {
        // 如果正在載入中，等待完成
        if (this.loadingPromise) {
            return this.loadingPromise;
        }

        this.loadingPromise = this.doLoadJSAData();
        try {
            await this.loadingPromise;
        } finally {
            this.loadingPromise = null;
        }
    }

    private async doLoadJSAData(): Promise<void> {
        if (!this.selectedDate) {
            this.isLoading.set(false);
            return;
        }

        // 記錄當前載入的日期
        this.lastLoadedDate = this.selectedDate;

        this.isLoading.set(true);

        try {
            const currentSite = this.currentSiteService.currentSite();
            if (!currentSite?._id) {
                this.jsaItems.set([]);
                return;
            }

            const siteId = currentSite._id;

            // 使用 MongoDB 查詢條件直接過濾當日的工作許可單
            // 參考 current-site.service.ts 的優化方式
            const dailyPermits = await this.mongodbService.get('siteForm', {
                formType: 'sitePermit',
                siteId: siteId,
                $or: [
                    // 條件1: 工作期間包含選定日期
                    {
                        workStartTime: { $lte: this.selectedDate },
                        workEndTime: { $gte: this.selectedDate }
                    },
                    // 條件2: 申請日期等於選定日期（作為備用條件）
                    { applyDate: this.selectedDate }
                ]
            });

            console.log(`📊 JSA 查詢結果: 找到 ${dailyPermits.length} 張當日工作許可單`);

            // 轉換為 JSA 項目格式
            const jsaItems: JSAItem[] = [];

            for (const permit of dailyPermits) {
                // 檢查是否有 JSA 相關資料
                if (permit.workName || permit.step || permit.highRiskProject ||
                    permit.possibleHazardFactor || permit.protectiveEquipment ||
                    permit.safetyProtectionMeasures || permit.emergencyMeasures) {

                    jsaItems.push({
                        id: permit._id,
                        workName: permit.workName || '',
                        step: permit.step || '',
                        highRiskProject: permit.highRiskProject || '',
                        possibleHazardFactor: permit.possibleHazardFactor || '',
                        protectiveEquipment: permit.protectiveEquipment || '',
                        safetyProtectionMeasures: permit.safetyProtectionMeasures || '',
                        emergencyMeasures: permit.emergencyMeasures || '',
                        workDate: permit.workDate || '',
                        workPersonCount: permit.workPersonCount ?? '',
                        contractor: permit.contractor || '',
                        maker: permit.maker || '',
                        makerDate: permit.makerDate || '',
                        originalData: permit
                    });
                }
            }

            console.log(`📋 JSA 資料過濾結果: ${jsaItems.length} 張表單包含 JSA 資料`);

            this.jsaItems.set(jsaItems);

        } catch (error) {
            console.error('載入 JSA 資料失敗:', error);
            this.jsaItems.set([]);
        } finally {
            this.isLoading.set(false);
        }
    }

    navigateToForm(item: JSAItem): void {
        const currentSite = this.currentSiteService.currentSite();
        if (currentSite?._id) {
            this.router.navigate(['/site', currentSite._id, 'forms', 'permit', item.id]);
        }
    }
}
