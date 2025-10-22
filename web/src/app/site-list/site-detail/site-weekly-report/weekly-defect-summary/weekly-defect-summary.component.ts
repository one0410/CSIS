import { Component, Input, OnInit, OnChanges, OnDestroy, computed, signal, inject, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MongodbService } from '../../../../services/mongodb.service';
import { CurrentSiteService } from '../../../../services/current-site.service';
import dayjs from 'dayjs';

interface DefectByContractor {
  contractorName: string;
  count: number;
  percentage: number;
}

interface DefectByType {
  typeName: string;
  count: number;
  percentage: number;
  typeCode: string;
}

@Component({
  selector: 'app-weekly-defect-summary',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="card h-100">
      <div class="card-header">
        <div class="d-flex justify-content-between align-items-center">
          <h6 class="mb-0">
            <i class="fas fa-exclamation-triangle me-2"></i>當週缺失累計
          </h6>
          <div class="btn-group btn-group-sm" role="group">
            <button 
              type="button" 
              class="btn"
              [class]="viewMode() === 'contractor' ? 'btn-primary' : 'btn-outline-secondary'"
              (click)="setViewMode('contractor')"
            >
              依廠商
            </button>
            <button 
              type="button" 
              class="btn"
              [class]="viewMode() === 'type' ? 'btn-primary' : 'btn-outline-secondary'"
              (click)="setViewMode('type')"
            >
              依類型
            </button>
          </div>
        </div>
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
          <!-- 統計總覽 -->
          <div class="mb-3">
            <div class="d-flex justify-content-between align-items-center mb-2">
              <span class="text-muted small">總缺失數量</span>
              <span class="fw-bold text-danger">{{ getTotalCount() }} 件</span>
            </div>
          </div>

          @if (viewMode() === 'contractor') {
            <!-- 依廠商統計 -->
            @if (defectsByContractor().length > 0) {
              <div class="chart-container">
                @for (item of defectsByContractor(); track item.contractorName) {
                  <div class="chart-item mb-3">
                    <div class="d-flex justify-content-between align-items-center mb-1">
                      <span class="fw-medium">{{ item.contractorName }}</span>
                      <div class="d-flex align-items-center">
                        <span class="text-danger fw-bold me-2">{{ item.count }} 件</span>
                        <span class="text-muted small">{{ item.percentage }}%</span>
                      </div>
                    </div>
                    <div class="progress">
                      <div 
                        class="progress-bar bg-danger"
                        [style.width]="item.percentage + '%'"
                        role="progressbar"
                      ></div>
                    </div>
                  </div>
                }
              </div>
            } @else {
              <div class="text-center text-muted">
                <i class="fas fa-check-circle fs-1 mb-2 text-success opacity-50"></i>
                <p class="mb-0">該週無缺失記錄</p>
                <small>各廠商均無工安缺失</small>
              </div>
            }
          } @else {
            <!-- 依缺失類型統計 -->
            @if (defectsByType().length > 0) {
              <div class="chart-container">
                @for (item of defectsByType(); track item.typeCode) {
                  <div class="chart-item mb-3">
                    <div class="d-flex justify-content-between align-items-center mb-1">
                      <div class="d-flex align-items-center">
                        <span class="fw-medium me-2">{{ item.typeName }}</span>
                        <span class="badge bg-secondary">{{ item.typeCode }}</span>
                      </div>
                      <div class="d-flex align-items-center">
                        <span class="text-danger fw-bold me-2">{{ item.count }} 件</span>
                        <span class="text-muted small">{{ item.percentage }}%</span>
                      </div>
                    </div>
                    <div class="progress">
                      <div 
                        class="progress-bar"
                        [style.width]="item.percentage + '%'"
                        [class]="getTypeProgressBarClass(item.typeCode)"
                        role="progressbar"
                      ></div>
                    </div>
                  </div>
                }
              </div>
            } @else {
              <div class="text-center text-muted">
                <i class="fas fa-check-circle fs-1 mb-2 text-success opacity-50"></i>
                <p class="mb-0">該週無缺失記錄</p>
                <small>各類型均無工安缺失</small>
              </div>
            }
          }
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
    .btn-group .btn {
      font-size: 0.75rem;
      padding: 0.25rem 0.5rem;
    }
    
    /* 不同缺失類型的顏色 */
    .bg-safety {
      background-color: #dc3545 !important;
    }
    .bg-environment {
      background-color: #28a745 !important;
    }
    .bg-quality {
      background-color: #ffc107 !important;
    }
    .bg-management {
      background-color: #17a2b8 !important;
    }
    .bg-electrical {
      background-color: #6f42c1 !important;
    }
    .bg-fire {
      background-color: #fd7e14 !important;
    }
    .bg-height {
      background-color: #e83e8c !important;
    }
    .bg-confined {
      background-color: #6c757d !important;
    }
    .bg-other {
      background-color: #343a40 !important;
    }
  `]
})
export class WeeklyDefectSummaryComponent implements OnInit, OnChanges, OnDestroy {
  @Input() selectedWeek!: string;
  
  private mongodbService = inject(MongodbService);
  private currentSiteService = inject(CurrentSiteService);
  
  defectsByContractor = signal<DefectByContractor[]>([]);
  defectsByType = signal<DefectByType[]>([]);
  isLoading = signal<boolean>(false);
  viewMode = signal<'contractor' | 'type'>('contractor');
  
  private lastLoadedWeek: string | null = null;
  private loadingPromise: Promise<void> | null = null;
  private isDestroyed = false;

  // 缺失類型映射表
  private defectTypeMap: { [key: string]: string } = {
    'S': '安全衛生',
    'E': '環境保護', 
    'Q': '品質管理',
    'M': '現場管理',
    'EL': '電力作業',
    'F': '動火作業',
    'H': '高架作業',
    'C': '局限空間',
    'OTHER': '其他'
  };

  constructor() {
    // 使用 effect 監聽 currentSite 的變化
    effect(() => {
      const currentSite = this.currentSiteService.currentSite();
      
      if (currentSite?._id && this.selectedWeek && !this.isDestroyed) {
        this.loadWeeklyDefectSummary();
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
      this.loadWeeklyDefectSummary();
    }
  }

  ngOnDestroy() {
    this.isDestroyed = true;
  }

  setViewMode(mode: 'contractor' | 'type'): void {
    this.viewMode.set(mode);
  }

  private async loadWeeklyDefectSummary(): Promise<void> {
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
      this.defectsByContractor.set([]);
      this.defectsByType.set([]);
      return;
    }

    this.isLoading.set(true);
    this.lastLoadedWeek = this.selectedWeek;

    this.loadingPromise = this.performWeeklyDefectLoad(currentSite._id, this.selectedWeek);
    await this.loadingPromise;
    this.loadingPromise = null;
  }

  private async performWeeklyDefectLoad(siteId: string, weekStart: string): Promise<void> {
    try {
      // 計算週的日期範圍
      const startDate = dayjs(weekStart);
      const endDate = startDate.add(6, 'day');

      // 建立查詢條件 - 查詢工安缺失紀錄
      const query = {
        siteId: siteId,
        formType: 'safetyIssueRecord',
        issueDate: {
          $gte: startDate.format('YYYY-MM-DD'),
          $lte: endDate.format('YYYY-MM-DD')
        }
      };

      console.log('查詢週報表缺失記錄:', query);

      // 查詢工安缺失紀錄
      const defectRecords = await this.mongodbService.getArray('siteForm', query);

      if (!defectRecords || !Array.isArray(defectRecords)) {
        console.warn('未找到工安缺失紀錄資料或格式不正確');
        this.defectsByContractor.set([]);
        this.defectsByType.set([]);
        return;
      }

      // 統計依廠商
      this.calculateDefectsByContractor(defectRecords);
      
      // 統計依缺失類型
      this.calculateDefectsByType(defectRecords);

    } catch (error) {
      console.error('載入週報表缺失統計時發生錯誤:', error);
      this.defectsByContractor.set([]);
      this.defectsByType.set([]);
    } finally {
      this.isLoading.set(false);
    }
  }

  private calculateDefectsByContractor(records: any[]): void {
    const contractorMap = new Map<string, number>();

    records.forEach((record: any) => {
      // 從responsibleUnit或establishUnit獲取廠商名稱
      let contractor = record.responsibleUnit || record.establishUnit || '未知廠商';
      
      // 統一廠商名稱顯示
      if (contractor === 'MIC') {
        contractor = 'MIC';
      } else if (contractor === 'supplier') {
        contractor = '供應商';
      }

      const count = contractorMap.get(contractor) || 0;
      contractorMap.set(contractor, count + 1);
    });

    // 計算百分比並排序
    const totalCount = records.length;
    const result: DefectByContractor[] = Array.from(contractorMap.entries())
      .map(([contractorName, count]) => ({
        contractorName,
        count,
        percentage: totalCount > 0 ? Math.round((count / totalCount) * 100) : 0
      }))
      .sort((a, b) => b.count - a.count);

    this.defectsByContractor.set(result);
  }

  private calculateDefectsByType(records: any[]): void {
    const typeMap = new Map<string, number>();

    records.forEach((record: any) => {
      // 從缺失代碼解析缺失類型
      let typeCode = this.parseDefectTypeFromCode(record.deductionCode);
      
      const count = typeMap.get(typeCode) || 0;
      typeMap.set(typeCode, count + 1);
    });

    // 計算百分比並排序
    const totalCount = records.length;
    const result: DefectByType[] = Array.from(typeMap.entries())
      .map(([typeCode, count]) => ({
        typeName: this.defectTypeMap[typeCode] || typeCode,
        typeCode,
        count,
        percentage: totalCount > 0 ? Math.round((count / totalCount) * 100) : 0
      }))
      .sort((a, b) => b.count - a.count);

    this.defectsByType.set(result);
  }

  private parseDefectTypeFromCode(deductionCode: string): string {
    return deductionCode || '';
  }

  getWeekRangeDisplay(): string {
    const startDate = dayjs(this.selectedWeek);
    const endDate = startDate.add(6, 'day');
    return `${startDate.format('YYYY/MM/DD')} - ${endDate.format('YYYY/MM/DD')}`;
  }

  getTotalCount(): number {
    if (this.viewMode() === 'contractor') {
      return this.defectsByContractor().reduce((sum, item) => sum + item.count, 0);
    } else {
      return this.defectsByType().reduce((sum, item) => sum + item.count, 0);
    }
  }

  getTypeProgressBarClass(typeCode: string): string {
    const classMap: { [key: string]: string } = {
      'S': 'bg-safety',
      'E': 'bg-environment',
      'Q': 'bg-quality',
      'M': 'bg-management',
      'EL': 'bg-electrical',
      'F': 'bg-fire',
      'H': 'bg-height',
      'C': 'bg-confined',
      'OTHER': 'bg-other'
    };
    
    return classMap[typeCode] || 'bg-other';
  }
} 