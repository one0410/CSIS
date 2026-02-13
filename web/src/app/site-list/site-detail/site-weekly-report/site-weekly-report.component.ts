import { Component, OnInit, OnDestroy, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { CurrentSiteService } from '../../../services/current-site.service';
import { WeeklyContractorWorkerCountComponent } from './weekly-contractor-worker-count/weekly-contractor-worker-count.component';
import { WeeklyConstructionPermitsComponent } from './weekly-construction-permits/weekly-construction-permits.component';
import { WeeklyDefectSummaryComponent } from './weekly-defect-summary/weekly-defect-summary.component';
import { WeeklyChecklistStatsComponent } from './weekly-checklist-stats/weekly-checklist-stats.component';
import { WeeklyImprovementPhotosComponent } from './weekly-improvement-photos/weekly-improvement-photos.component';
import { WeeklyWorkContentComponent } from './weekly-work-content/weekly-work-content.component';
import dayjs from 'dayjs';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-site-weekly-report',
  standalone: true,
  imports: [CommonModule, FormsModule, WeeklyContractorWorkerCountComponent, WeeklyConstructionPermitsComponent, WeeklyDefectSummaryComponent, WeeklyChecklistStatsComponent, WeeklyImprovementPhotosComponent, WeeklyWorkContentComponent],
  templateUrl: './site-weekly-report.component.html',
  styleUrl: './site-weekly-report.component.scss'
})
export class SiteWeeklyReportComponent implements OnInit, OnDestroy {
  siteId: string = '';
  selectedWeek: string = this.getCurrentWeek();
  selectedWeekInput: string = '';
  site = computed(() => this.currentSiteService.currentSite());
  
  // 私有變數
  private routeSubscription: Subscription | null = null;
  private isInitialized = false;

  constructor(
    private route: ActivatedRoute,
    private currentSiteService: CurrentSiteService
  ) {}

  async ngOnInit(): Promise<void> {
    // 避免重複初始化
    if (this.isInitialized) {
      return;
    }
    this.isInitialized = true;

    // 初始化週別輸入值
    this.selectedWeekInput = this.getCurrentWeekInput();

    // 從父路由獲取工地ID - 與其他頁面保持一致
    const parent = this.route.parent;
    if (parent) {
      this.routeSubscription = parent.paramMap.subscribe(async (params: any) => {
        const id = params.get('id');
        if (id && id !== this.siteId) {
          this.siteId = id;
          // 確保工地資料載入完成
          await this.currentSiteService.setCurrentSiteById(id);
        }
      });
    }
  }

  ngOnDestroy(): void {
    if (this.routeSubscription) {
      this.routeSubscription.unsubscribe();
    }
  }

  // 獲取當前週的週一日期（YYYY-MM-DD 格式）
  getCurrentWeek(): string {
    return dayjs().startOf('week').add(1, 'day').format('YYYY-MM-DD'); // 週一開始
  }

  // 獲取當前週的輸入格式（YYYY-Www）- 使用 ISO 8601 標準
  getCurrentWeekInput(): string {
    return this.getISOWeekString(new Date());
  }

  // 將日期轉換為 ISO 8601 週格式 (YYYY-Www)
  private getISOWeekString(date: Date): string {
    // 複製日期避免修改原始日期
    const tempDate = new Date(date.getTime());
    
    // 設定到該週的星期四（ISO 8601 標準）
    tempDate.setDate(tempDate.getDate() + (4 - (tempDate.getDay() || 7)));
    
    // 取得年份
    const year = tempDate.getFullYear();
    
    // 計算週數
    const yearStart = new Date(year, 0, 1);
    const weekNumber = Math.ceil(((tempDate.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
    
    return `${year}-W${weekNumber.toString().padStart(2, '0')}`;
  }

  // 獲取週的顯示字串
  getWeekDisplayString(weekStart: string): string {
    const startDate = dayjs(weekStart);
    const endDate = startDate.add(6, 'day');
    return `${startDate.format('YYYY/MM/DD')} - ${endDate.format('YYYY/MM/DD')}`;
  }

  // 快速選擇週別
  selectWeek(type: 'current' | 'previous'): void {
    const now = new Date();
    
    if (type === 'current') {
      const currentWeekStart = dayjs().startOf('week').add(1, 'day'); // 週一
      this.selectedWeek = currentWeekStart.format('YYYY-MM-DD');
      this.selectedWeekInput = this.getISOWeekString(now);
    } else if (type === 'previous') {
      const prevWeek = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000); // 上週
      const prevWeekStart = dayjs(prevWeek).startOf('week').add(1, 'day');
      this.selectedWeek = prevWeekStart.format('YYYY-MM-DD');
      this.selectedWeekInput = this.getISOWeekString(prevWeek);
    }
  }

  // 檢查是否選中特定週別
  isWeekSelected(type: 'current' | 'previous'): boolean {
    const currentWeekStart = dayjs().startOf('week').add(1, 'day');
    
    if (type === 'current') {
      return this.selectedWeek === currentWeekStart.format('YYYY-MM-DD');
    } else if (type === 'previous') {
      return this.selectedWeek === currentWeekStart.subtract(1, 'week').format('YYYY-MM-DD');
    }
    
    return false;
  }

  // 前一週
  previousWeek(): void {
    const weekStart = dayjs(this.selectedWeek).subtract(1, 'week');
    this.selectedWeek = weekStart.format('YYYY-MM-DD');
    this.selectedWeekInput = this.getISOWeekString(weekStart.toDate());
  }

  // 後一週
  nextWeek(): void {
    const weekStart = dayjs(this.selectedWeek).add(1, 'week');
    this.selectedWeek = weekStart.format('YYYY-MM-DD');
    this.selectedWeekInput = this.getISOWeekString(weekStart.toDate());
  }

  // 檢查是否為當前週
  isCurrentWeek(): boolean {
    const currentWeekStart = dayjs().startOf('week').add(1, 'day');
    return this.selectedWeek === currentWeekStart.format('YYYY-MM-DD');
  }

  // 週別變更事件
  onWeekChange(): void {
    // 將 week input 格式轉換為我們使用的日期格式
    if (this.selectedWeekInput) {
      // 解析 YYYY-Www 格式並轉換為該週的週一日期
      const weekDate = this.parseISOWeekString(this.selectedWeekInput);
      if (weekDate) {
        this.selectedWeek = dayjs(weekDate).startOf('week').add(1, 'day').format('YYYY-MM-DD');
      }
    }
  }

  // 解析 ISO 8601 週格式字串並返回該週內的任一日期
  private parseISOWeekString(weekString: string): Date | null {
    const match = weekString.match(/(\d{4})-W(\d{2})/);
    if (!match) return null;
    
    const year = parseInt(match[1]);
    const week = parseInt(match[2]);
    
    // 計算該年第一週的開始日期
    const jan1 = new Date(year, 0, 1);
    const jan1DayOfWeek = jan1.getDay();
    
    // 找到第一個星期四（ISO 8601 標準）
    const firstThursday = new Date(year, 0, 1 + (4 - jan1DayOfWeek + 7) % 7);
    
    // 計算指定週的日期
    const targetDate = new Date(firstThursday.getTime() + (week - 1) * 7 * 24 * 60 * 60 * 1000);
    
    return targetDate;
  }
} 