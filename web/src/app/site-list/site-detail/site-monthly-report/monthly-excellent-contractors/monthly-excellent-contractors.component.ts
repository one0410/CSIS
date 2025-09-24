import { Component, Input, computed, signal, OnInit, OnChanges, SimpleChanges, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MongodbService } from '../../../../services/mongodb.service';
import { CurrentSiteService } from '../../../../services/current-site.service';
import dayjs from 'dayjs';
import { Worker } from '../../../../model/worker.model';
import { IssueRecord } from '../../site-form-list/safety-issue-record/safety-issue-record.component';

interface ContractorStats {
  contractorName: string;
  totalWorkers: number;
  hasDefects: boolean;
  defectCount: number;
}

@Component({
  selector: 'app-monthly-excellent-contractors',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './monthly-excellent-contractors.component.html',
  styleUrls: ['./monthly-excellent-contractors.component.scss']
})
export class MonthlyExcellentContractorsComponent implements OnInit, OnChanges {
  @Input() selectedMonth!: string;

  private contractorStats = signal<ContractorStats[]>([]);
  private loading = signal<boolean>(false);

  // 計算屬性
  excellentContractors = computed(() =>
    this.contractorStats().filter(contractor => !contractor.hasDefects)
  );

  totalContractors = computed(() => this.contractorStats().length);
  contractorsWithDefects = computed(() =>
    this.contractorStats().filter(contractor => contractor.hasDefects).length
  );

  excellentRate = computed(() => {
    const total = this.totalContractors();
    if (total === 0) return 0;
    return Math.round((this.excellentContractors().length / total) * 100);
  });

  constructor(
    private mongodbService: MongodbService,
    private currentSiteService: CurrentSiteService
  ) {
    // 監聽工地變化
    effect(() => {
      const currentSite = this.currentSiteService.currentSite();

      // 當工地變化時，重新載入資料
      if (currentSite?._id && this.selectedMonth) {
        console.log('工地變化，重新載入廠商統計');
        this.loadContractorStats();
      }
    });
  }

  ngOnInit() {
    console.log('MonthlyExcellentContractorsComponent ngOnInit');

    // 如果 currentSite 已經存在，立即載入
    if (this.selectedMonth && this.currentSiteService.currentSite()?._id) {
      console.log('初始載入廠商統計');
      this.loadContractorStats();
    }
  }

  ngOnChanges(changes: SimpleChanges) {
    // 當 selectedMonth 輸入屬性變化時，重新載入資料
    if (changes['selectedMonth'] && !changes['selectedMonth'].firstChange) {
      console.log('月份變化:', {
        previousValue: changes['selectedMonth'].previousValue,
        currentValue: changes['selectedMonth'].currentValue
      });

      if (this.currentSiteService.currentSite()?._id) {
        this.loadContractorStats();
      }
    }
  }

  private async loadContractorStats() {
    if (!this.selectedMonth) return;

    this.loading.set(true);

    try {
      // 從 currentSiteService 取得工地資訊
      const currentSite = this.currentSiteService.currentSite();
      
      console.log('載入廠商統計:', {
        selectedMonth: this.selectedMonth,
        currentSiteId: currentSite?._id
      });
      
      if (!currentSite?._id) {
        console.warn('找不到工地ID，無法載入廠商統計');
        this.contractorStats.set([]);
        return;
      }

      // 1. 讀取所有工人，取得主承攬商
      const workers = await this.mongodbService.getArray('worker', {
        'belongSites.siteId': currentSite._id
      });

      // 統計各主承攬商及其工人數量
      const contractorMap = new Map<string, number>();
      workers.forEach((worker: Worker) => {
        if (worker.contractingCompanyName) {
          const currentCount = contractorMap.get(worker.contractingCompanyName) || 0;
          contractorMap.set(worker.contractingCompanyName, currentCount + 1);
        }
      });

      // 2. 讀取這個月的缺失單
      const monthStart = dayjs(this.selectedMonth).startOf('month').format('YYYY-MM-DD');
      const monthEnd = dayjs(this.selectedMonth).endOf('month').format('YYYY-MM-DD');

      const defects = await this.mongodbService.getArray('siteForm', {
        siteId: currentSite._id,
        formType: 'safetyIssueRecord',
        applyDate: {
          $gte: monthStart,
          $lte: monthEnd
        }
      }) as IssueRecord[];

      // 統計有缺失的廠商
      const contractorsWithDefects = new Set<string>();
      const contractorDefectCounts = new Map<string, number>();

      defects.forEach((defect: IssueRecord) => {
        if (defect.supplierName) {
          contractorsWithDefects.add(defect.supplierName);
          const currentCount = contractorDefectCounts.get(defect.supplierName) || 0;
          contractorDefectCounts.set(defect.supplierName, currentCount + 1);
        }
      });

      // 3. 建立廠商統計資料
      const stats: ContractorStats[] = Array.from(contractorMap.entries()).map(([name, workerCount]) => ({
        contractorName: name,
        totalWorkers: workerCount,
        hasDefects: contractorsWithDefects.has(name),
        defectCount: contractorDefectCounts.get(name) || 0
      }));

      // 排序：優良廠商在前，再按工人數排序
      stats.sort((a, b) => {
        if (a.hasDefects !== b.hasDefects) {
          return a.hasDefects ? 1 : -1; // 優良廠商排前面
        }
        return b.totalWorkers - a.totalWorkers; // 工人數多的排前面
      });

      this.contractorStats.set(stats);

      console.log('廠商統計載入完成:', {
        totalContractors: stats.length,
        excellentContractors: stats.filter(s => !s.hasDefects).length,
        contractorsWithDefects: stats.filter(s => s.hasDefects).length
      });

    } catch (error) {
      console.error('載入廠商統計失敗:', error);
      this.contractorStats.set([]);
    } finally {
      this.loading.set(false);
    }
  }

  // Getter methods for template
  isLoading(): boolean {
    return this.loading();
  }

  getContractorStats(): ContractorStats[] {
    return this.contractorStats();
  }
} 