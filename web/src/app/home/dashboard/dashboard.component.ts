import { Component, OnInit } from '@angular/core';

import { Router } from '@angular/router';
import { ProgressTrendChartComponent, ProgressData } from '../../shared/progress-trend-chart/progress-trend-chart.component';
import { MongodbService } from '../../services/mongodb.service';

interface Site {
  _id: string;
  projectName: string;
  startDate: string;
  endDate: string;
  county?: string;
  location?: string;
  [key: string]: any;
}

@Component({
    selector: 'app-dashboard',
    imports: [ProgressTrendChartComponent],
    templateUrl: './dashboard.component.html',
    styleUrl: './dashboard.component.scss'
})
export class DashboardComponent implements OnInit {

  // 所有工地的進度趨勢資料
  allSitesProgressData: ProgressData[] = [];
  
  // 所有工地列表
  sites: Site[] = [];
  
  // 載入狀態
  isLoading = true;

  constructor(
    private mongodbService: MongodbService,
    private router: Router
  ) { }

  ngOnInit() {
    this.loadAllSitesData();
  }

  // 格式化日期顯示
  formatDate(dateString: string): string {
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString('zh-TW', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      });
    } catch (error) {
      return dateString;
    }
  }

  // 導航到專案詳細頁面
  navigateToSite(siteId: string): void {
    this.router.navigate(['/site', siteId, 'dashboard']);
  }

  // 載入所有專案資料
  async loadAllSitesData() {
    try {
      this.isLoading = true;
      
      // 同時載入專案列表和整體進度資料
      await Promise.all([
        this.loadSitesList(),
      ]);
      
    } catch (error) {
      console.error('載入專案資料失敗:', error);
    } finally {
      this.isLoading = false;
    }
  }

  // 載入專案列表
  async loadSitesList() {
    try {
      const sitesData = await this.mongodbService.getArray<Site>('site', {});
      
      this.sites = sitesData || [];
      console.log('載入專案列表完成:', this.sites.length, '個專案');
    } catch (error) {
      console.error('載入專案列表失敗:', error);
      this.sites = [];
    }
  }


  // 計算特定工地在特定日期的進度
  async calculateSiteProgressForDate(siteId: string, dateStr: string): Promise<{scheduledProgress: number, actualProgress: number} | null> {
    try {
      // 獲取工地資訊
      const site = await this.mongodbService.getById('site', siteId);
      if (!site) return null;

      // 獲取工地的所有任務
      const tasks = await this.mongodbService.getArray('task', { siteId: siteId });
      
      if (!tasks || tasks.length === 0) return null;

      // 計算規劃進度（基於任務的實際開始和結束日期）
      const validTasks = tasks.filter((task: any) => task.start && task.end);
      let scheduledProgress = 0;
      
      if (validTasks.length > 0) {
        const taskStartDates = validTasks.map((task: any) => new Date(task.start));
        const taskEndDates = validTasks.map((task: any) => new Date(task.end));
        
        const taskStartDate = new Date(Math.min(...taskStartDates.map((d: Date) => d.getTime())));
        const taskEndDate = new Date(Math.max(...taskEndDates.map((d: Date) => d.getTime())));
        const date = new Date(dateStr);
        
        if (date < taskStartDate) {
          scheduledProgress = 0;
        } else if (date > taskEndDate) {
          scheduledProgress = 100;
        } else {
          const totalTaskDays = Math.max(1, Math.floor(
            (taskEndDate.getTime() - taskStartDate.getTime()) / (1000 * 60 * 60 * 24)
          ));
          const daysFromTaskStart = Math.floor(
            (date.getTime() - taskStartDate.getTime()) / (1000 * 60 * 60 * 24)
          );
          scheduledProgress = Math.min(100, Math.max(0, (daysFromTaskStart / totalTaskDays) * 100));
        }
      }

      // 計算實際進度（基於 progressHistory）
      let totalProgress = 0;
      let taskCount = 0;
      
      tasks.forEach((task: any) => {
        if (task.progressHistory && task.progressHistory.length > 0) {
          // 尋找指定日期或最近的歷史記錄
          const sortedHistory = [...task.progressHistory].sort((a: any, b: any) => 
            new Date(a.date).getTime() - new Date(b.date).getTime()
          );
          
          let taskProgress = 0;
          for (const record of sortedHistory) {
            if (new Date(record.date) <= new Date(dateStr)) {
              taskProgress = record.progress;
            } else {
              break;
            }
          }
          
          totalProgress += taskProgress;
          taskCount++;
        } else if (task.progress !== undefined) {
          // 如果沒有歷史記錄但有進度值，使用當前進度
          totalProgress += task.progress;
          taskCount++;
        }
      });

      const actualProgress = taskCount > 0 ? totalProgress / taskCount : 0;

      return {
        scheduledProgress: scheduledProgress,
        actualProgress: actualProgress
      };
      
    } catch (error) {
      console.error(`計算工地 ${siteId} 在 ${dateStr} 的進度失敗:`, error);
      return null;
    }
  }

  // 產生日期範圍的輔助方法
  private getDatesInRange(start: Date, end: Date): Date[] {
    const dates: Date[] = [];
    const currentDate = new Date(start);
    while (currentDate <= end) {
      dates.push(new Date(currentDate));
      currentDate.setDate(currentDate.getDate() + 1);
    }
    return dates;
  }
}
