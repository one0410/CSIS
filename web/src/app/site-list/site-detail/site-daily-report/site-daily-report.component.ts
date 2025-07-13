import { Component, OnInit, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { MongodbService } from '../../../services/mongodb.service';
import { CurrentSiteService } from '../../../services/current-site.service';
import { PhotoService } from '../../../services/photo.service';
import { AuthService } from '../../../services/auth.service';
import dayjs from 'dayjs';
import { SignatureData } from '../../../model/signatureData.model';
import { Photo } from '../site-photos/site-photos.component';

interface ChartData {
  x: string;
  y: number;
}

interface ContractorWorkerCount {
  contractorName: string;
  workerCount: number;
}

interface SitePermitWork {
  contractor: string;
  system: string;
  location: string;
  workItem: string;
  permitDate: string;
}

interface FormSummary {
  formType: string;
  formName: string;
  totalCount: number;
  completedCount: number;
  pendingCount: number;
}

interface PhotoCategory {
  category: string;
  count: number;
  photos: Photo[];
}

@Component({
  selector: 'app-site-daily-report',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './site-daily-report.component.html',
  styleUrls: ['./site-daily-report.component.scss']
})
export class SiteDailyReportComponent implements OnInit {
  // 提供 Math 物件給模板使用
  Math = Math;
  
  siteId: string = '';
  selectedDate: string = dayjs().format('YYYY-MM-DD');
  site = computed(() => this.currentSiteService.currentSite());
  
  // 各廠商實際出工人數
  contractorWorkerCounts = signal<ContractorWorkerCount[]>([]);
  
  // 累積工期與人數
  accumulatedWorkerCounts = signal<ChartData[]>([]);
  
  // 帆宣出工人數 (手動輸入)
  fanshienWorkerCounts = signal<ChartData[]>([]);
  fanshienWorkerInput: number = 0;
  
  // 各廠商當日執行內容
  dailyWorks = signal<SitePermitWork[]>([]);
  
  // 照片分類
  photoCategories = signal<PhotoCategory[]>([]);
  
  // 表單總數
  formSummaries = signal<FormSummary[]>([]);
  
  // 載入狀態
  isLoading = signal<boolean>(false);

  constructor(
    private route: ActivatedRoute,
    private mongodbService: MongodbService,
    private currentSiteService: CurrentSiteService,
    private photoService: PhotoService,
    private authService: AuthService
  ) {}

  async ngOnInit(): Promise<void> {
    this.route.paramMap.subscribe(async (params: any) => {
      const id = params.get('id');
      if (id) {
        this.siteId = id;
        await this.currentSiteService.setCurrentSiteById(id);
        await this.loadDailyReportData();
      }
    });
  }

  async onDateChange(): Promise<void> {
    await this.loadDailyReportData();
  }

  private async loadDailyReportData(): Promise<void> {
    this.isLoading.set(true);
    
    try {
      await Promise.all([
        this.loadContractorWorkerCounts(),
        this.loadAccumulatedWorkerCounts(),
        this.loadFanshienWorkerCounts(),
        this.loadDailyWorks(),
        this.loadPhotoCategories(),
        this.loadFormSummaries()
      ]);
    } catch (error) {
      console.error('載入日報表數據失敗:', error);
    } finally {
      this.isLoading.set(false);
    }
  }

  // 1. 各廠商實際出工人數 (從工具箱會議簽名取得)
  private async loadContractorWorkerCounts(): Promise<void> {
    try {
      const filter = {
        siteId: this.siteId,
        formType: 'toolboxMeeting',
        applyDate: this.selectedDate
      };
      
      const toolboxMeetings = await this.mongodbService.get('siteForm', filter);
      const contractorCounts: { [key: string]: number } = {};
      
      toolboxMeetings.forEach((meeting: any) => {
        // 統計主承攬商簽名
        if (meeting.healthWarnings?.attendeeMainContractorSignatures) {
          meeting.healthWarnings.attendeeMainContractorSignatures.forEach((sig: SignatureData) => {
            if (sig.company && sig.signature) {
              contractorCounts[sig.company] = (contractorCounts[sig.company] || 0) + 1;
            }
          });
        }
        
        // 統計各再承攬商簽名
        ['attendeeSubcontractor1Signatures', 'attendeeSubcontractor2Signatures', 'attendeeSubcontractor3Signatures'].forEach(key => {
          if (meeting.healthWarnings?.[key]) {
            meeting.healthWarnings[key].forEach((sig: SignatureData) => {
              if (sig.company && sig.signature) {
                contractorCounts[sig.company] = (contractorCounts[sig.company] || 0) + 1;
              }
            });
          }
        });
      });
      
      const result = Object.entries(contractorCounts).map(([contractorName, workerCount]) => ({
        contractorName,
        workerCount
      }));
      
      this.contractorWorkerCounts.set(result);
    } catch (error) {
      console.error('載入廠商出工人數失敗:', error);
      this.contractorWorkerCounts.set([]);
    }
  }

  // 2. 累積工期與人數
  private async loadAccumulatedWorkerCounts(): Promise<void> {
    try {
      const site = this.site();
      if (!site?.startDate) {
        this.accumulatedWorkerCounts.set([]);
        return;
      }
      
      const startDate = dayjs(site.startDate);
      const endDate = dayjs(this.selectedDate);
      const result: ChartData[] = [];
      
      // 從開工日到選定日期，逐日統計
      for (let date = startDate; date.isBefore(endDate) || date.isSame(endDate); date = date.add(1, 'day')) {
        const dateStr = date.format('YYYY-MM-DD');
        
        const filter = {
          siteId: this.siteId,
          formType: 'toolboxMeeting',
          applyDate: dateStr
        };
        
        const toolboxMeetings = await this.mongodbService.get('siteForm', filter);
        let totalWorkers = 0;
        
        toolboxMeetings.forEach((meeting: any) => {
          // 統計所有簽名人數
          if (meeting.healthWarnings?.attendeeMainContractorSignatures) {
            totalWorkers += meeting.healthWarnings.attendeeMainContractorSignatures.filter((sig: SignatureData) => sig.signature).length;
          }
          
          ['attendeeSubcontractor1Signatures', 'attendeeSubcontractor2Signatures', 'attendeeSubcontractor3Signatures'].forEach(key => {
            if (meeting.healthWarnings?.[key]) {
              totalWorkers += meeting.healthWarnings[key].filter((sig: SignatureData) => sig.signature).length;
            }
          });
        });
        
        result.push({
          x: dateStr,
          y: totalWorkers
        });
      }
      
      this.accumulatedWorkerCounts.set(result);
    } catch (error) {
      console.error('載入累積工期與人數失敗:', error);
      this.accumulatedWorkerCounts.set([]);
    }
  }

  // 3. 帆宣出工人數 (手動輸入)
  private async loadFanshienWorkerCounts(): Promise<void> {
    try {
      const site = this.site();
      if (!site?.startDate) {
        this.fanshienWorkerCounts.set([]);
        return;
      }
      
      const startDate = dayjs(site.startDate);
      const endDate = dayjs(this.selectedDate);
      const result: ChartData[] = [];
      
      // 從開工日到選定日期，預設都是 0 人
      for (let date = startDate; date.isBefore(endDate) || date.isSame(endDate); date = date.add(1, 'day')) {
        result.push({
          x: date.format('YYYY-MM-DD'),
          y: 0
        });
      }
      
      this.fanshienWorkerCounts.set(result);
    } catch (error) {
      console.error('載入帆宣出工人數失敗:', error);
      this.fanshienWorkerCounts.set([]);
    }
  }

  // 手動更新帆宣出工人數
  updateFanshienWorkerCount(): void {
    const counts = this.fanshienWorkerCounts();
    const index = counts.findIndex((item: any) => item.x === this.selectedDate);
    if (index !== -1) {
      counts[index].y = this.fanshienWorkerInput;
      this.fanshienWorkerCounts.set([...counts]);
    }
  }

  // 4. 各廠商當日執行內容 (從工地許可單取得)
  private async loadDailyWorks(): Promise<void> {
    try {
      const filter = {
        siteId: this.siteId,
        formType: 'permit',
        applyDate: this.selectedDate
      };
      
      const permits = await this.mongodbService.get('siteForm', filter);
      const result: SitePermitWork[] = [];
      
      permits.forEach((permit: any) => {
        if (permit.workItems && permit.workItems.length > 0) {
          permit.workItems.forEach((workItem: any) => {
            result.push({
              contractor: permit.applicantCompany || '未指定',
              system: permit.workSystem || '未指定',
              location: permit.workLocation || '未指定',
              workItem: workItem.description || workItem.title || '未指定',
              permitDate: permit.applyDate
            });
          });
        }
      });
      
      this.dailyWorks.set(result);
    } catch (error) {
      console.error('載入當日執行內容失敗:', error);
      this.dailyWorks.set([]);
    }
  }

  // 5. 照片分類統計
  private async loadPhotoCategories(): Promise<void> {
    try {
      // 使用 PhotoService 取得當日照片
      const photos = await this.getPhotosByDate(this.selectedDate);
      
      const categories = ['工具箱會議', '施工過程', '稽核照片', '教育訓練', '機具管理'];
      const result: PhotoCategory[] = [];
      
      categories.forEach(category => {
        const categoryPhotos = photos.filter(photo => 
          photo.metadata.tags?.some(tag => tag.title === category)
        );
        
        result.push({
          category,
          count: categoryPhotos.length,
          photos: categoryPhotos
        });
      });
      
      this.photoCategories.set(result);
    } catch (error) {
      console.error('載入照片分類失敗:', error);
      this.photoCategories.set([]);
    }
  }

  // 取得指定日期的照片
  private async getPhotosByDate(date: string): Promise<Photo[]> {
    try {
      // 這裡需要根據實際的 PhotoService 實作調整
      // 暫時返回空陣列，等待實際整合
      return [];
    } catch (error) {
      console.error('取得照片失敗:', error);
      return [];
    }
  }

  // 7. 表單總數及彙整
  private async loadFormSummaries(): Promise<void> {
    try {
      const formTypes = [
        { type: 'permit', name: '工地許可單' },
        { type: 'toolboxMeeting', name: '工具箱會議' },
        { type: 'environmentCheckList', name: '環境檢查表' },
        { type: 'specialWorkChecklist', name: '特殊作業檢查表' },
        { type: 'safetyIssueRecord', name: '工安缺失記錄' },
        { type: 'safetyPatrolChecklist', name: '安全巡檢表' }
      ];
      
      const result: FormSummary[] = [];
      
      for (const formType of formTypes) {
        const filter = {
          siteId: this.siteId,
          formType: formType.type,
          applyDate: this.selectedDate
        };
        
        const forms = await this.mongodbService.get('siteForm', filter);
        const completedCount = forms.filter((form: any) => form.status === 'approved' || form.status === 'completed').length;
        
        result.push({
          formType: formType.type,
          formName: formType.name,
          totalCount: forms.length,
          completedCount,
          pendingCount: forms.length - completedCount
        });
      }
      
      this.formSummaries.set(result);
    } catch (error) {
      console.error('載入表單總數失敗:', error);
      this.formSummaries.set([]);
    }
  }

  // 取得廠商出工人數圖表的最大值
  getMaxWorkerCount(): number {
    const counts = this.contractorWorkerCounts();
    return counts.length > 0 ? Math.max(...counts.map((c: any) => c.workerCount)) : 0;
  }

  // 取得累積人數圖表的最大值
  getMaxAccumulatedCount(): number {
    const counts = this.accumulatedWorkerCounts();
    return counts.length > 0 ? Math.max(...counts.map((c: any) => c.y)) : 0;
  }

  // 取得帆宣人數圖表的最大值
  getMaxFanshienCount(): number {
    const counts = this.fanshienWorkerCounts();
    return counts.length > 0 ? Math.max(...counts.map((c: any) => c.y)) : 0;
  }

  // 計算長條圖的寬度百分比
  getBarWidth(value: number, maxValue: number): string {
    if (maxValue === 0) return '0%';
    return `${(value / maxValue) * 100}%`;
  }

  // 格式化日期顯示
  formatDate(dateStr: string): string {
    return dayjs(dateStr).format('MM/DD');
  }

  // 取得表單總數
  getTotalFormCount(): number {
    return this.formSummaries().reduce((sum, form) => sum + form.totalCount, 0);
  }

  // 取得完成表單總數
  getCompletedFormCount(): number {
    return this.formSummaries().reduce((sum, form) => sum + form.completedCount, 0);
  }
} 