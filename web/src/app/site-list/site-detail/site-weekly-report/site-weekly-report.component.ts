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
import dayjs from 'dayjs';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-site-weekly-report',
  standalone: true,
  imports: [CommonModule, FormsModule, WeeklyContractorWorkerCountComponent, WeeklyConstructionPermitsComponent, WeeklyDefectSummaryComponent, WeeklyChecklistStatsComponent, WeeklyImprovementPhotosComponent],
  templateUrl: './site-weekly-report.component.html',
  styleUrl: './site-weekly-report.component.scss'
})
export class SiteWeeklyReportComponent implements OnInit, OnDestroy {
  siteId: string = '';
  selectedWeek: string = this.getCurrentWeek();
  selectedWeekInput: string = this.getCurrentWeekInput();
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

  // 獲取當前週的輸入格式（YYYY-Www）
  getCurrentWeekInput(): string {
    const startOfWeek = dayjs().startOf('week').add(1, 'day'); // 週一
    return startOfWeek.format('YYYY-[W]WW');
  }

  // 獲取週的顯示字串
  getWeekDisplayString(weekStart: string): string {
    const startDate = dayjs(weekStart);
    const endDate = startDate.add(6, 'day');
    return `${startDate.format('YYYY/MM/DD')} - ${endDate.format('YYYY/MM/DD')}`;
  }

  // 快速選擇週別
  selectWeek(type: 'current' | 'previous'): void {
    const currentWeekStart = dayjs().startOf('week').add(1, 'day'); // 週一
    
    if (type === 'current') {
      this.selectedWeek = currentWeekStart.format('YYYY-MM-DD');
      this.selectedWeekInput = currentWeekStart.format('YYYY-[W]WW');
    } else if (type === 'previous') {
      const prevWeekStart = currentWeekStart.subtract(1, 'week');
      this.selectedWeek = prevWeekStart.format('YYYY-MM-DD');
      this.selectedWeekInput = prevWeekStart.format('YYYY-[W]WW');
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
    this.selectedWeekInput = weekStart.format('YYYY-[W]WW');
  }

  // 後一週
  nextWeek(): void {
    const weekStart = dayjs(this.selectedWeek).add(1, 'week');
    this.selectedWeek = weekStart.format('YYYY-MM-DD');
    this.selectedWeekInput = weekStart.format('YYYY-[W]WW');
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
      // 解析 YYYY-Www 格式
      const match = this.selectedWeekInput.match(/(\d{4})-W(\d{2})/);
      if (match) {
        const year = parseInt(match[1]);
        const week = parseInt(match[2]);
        // 計算該週的週一日期
        const jan1 = dayjs().year(year).month(0).date(1);
        const weekStart = jan1.add((week - 1) * 7, 'day').startOf('week').add(1, 'day');
        this.selectedWeek = weekStart.format('YYYY-MM-DD');
      }
    }
  }
} 