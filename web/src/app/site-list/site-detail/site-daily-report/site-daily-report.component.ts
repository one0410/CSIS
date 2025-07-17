import { Component, OnInit, OnDestroy, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { CurrentSiteService } from '../../../services/current-site.service';
import dayjs from 'dayjs';
import { ContractorWorkerCountComponent } from './contractor-worker-count/contractor-worker-count.component';
import { AccumulatedWorkPeriodComponent } from './accumulated-work-period/accumulated-work-period.component';
import { FanshienWorkerCountComponent } from './fanshien-worker-count/fanshien-worker-count.component';
import { DailyWorkContentComponent } from './daily-work-content/daily-work-content.component';
import { DailyPhotoStatsComponent } from './daily-photo-stats/daily-photo-stats.component';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-site-daily-report',
  standalone: true,
  imports: [CommonModule, FormsModule, ContractorWorkerCountComponent, AccumulatedWorkPeriodComponent, FanshienWorkerCountComponent, DailyWorkContentComponent, DailyPhotoStatsComponent],
  templateUrl: './site-daily-report.component.html',
  styleUrls: ['./site-daily-report.component.scss']
})
export class SiteDailyReportComponent implements OnInit, OnDestroy {
  siteId: string = '';
  selectedDate: string = dayjs().format('YYYY-MM-DD');
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
    // 清理訂閱
    if (this.routeSubscription) {
      this.routeSubscription.unsubscribe();
    }
  }

  async onDateChange(): Promise<void> {
    // 日期變更時，子組件會透過 @Input 的變化自動重新載入資料
    // 不需要在這裡做任何額外的處理
  }

  // 快速選擇日期
  selectDate(type: 'today' | 'yesterday'): void {
    let newDate: string;
    
    switch (type) {
      case 'today':
        newDate = dayjs().format('YYYY-MM-DD');
        break;
      case 'yesterday':
        newDate = dayjs().subtract(1, 'day').format('YYYY-MM-DD');
        break;
      default:
        return;
    }
    
    if (newDate !== this.selectedDate) {
      this.selectedDate = newDate;
      this.onDateChange();
    }
  }

  // 檢查是否為選定的日期類型
  isDateSelected(type: 'today' | 'yesterday'): boolean {
    const today = dayjs().format('YYYY-MM-DD');
    const yesterday = dayjs().subtract(1, 'day').format('YYYY-MM-DD');
    
    switch (type) {
      case 'today':
        return this.selectedDate === today;
      case 'yesterday':
        return this.selectedDate === yesterday;
      default:
        return false;
    }
  }

  // 前一天
  previousDay(): void {
    const newDate = dayjs(this.selectedDate).subtract(1, 'day').format('YYYY-MM-DD');
    if (newDate !== this.selectedDate) {
      this.selectedDate = newDate;
      this.onDateChange();
    }
  }

  // 後一天
  nextDay(): void {
    const today = dayjs().format('YYYY-MM-DD');
    const newDate = dayjs(this.selectedDate).add(1, 'day').format('YYYY-MM-DD');
    
    // 不允許選擇未來日期
    if (newDate <= today && newDate !== this.selectedDate) {
      this.selectedDate = newDate;
      this.onDateChange();
    }
  }

  // 檢查是否為今天
  isToday(): boolean {
    const today = dayjs().format('YYYY-MM-DD');
    return this.selectedDate === today;
  }
} 