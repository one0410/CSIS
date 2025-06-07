import { Component, ElementRef, ViewChild, OnInit, Input, OnChanges, SimpleChanges, inject } from '@angular/core';
import { Chart } from 'chart.js/auto';

import { MongodbService } from '../../services/mongodb.service';
import { AuthService } from '../../services/auth.service';

export interface ProgressData {
  date: string;
  actualProgress?: number;
  plannedProgress: number;
  scheduledProgress?: number;
}

@Component({
  selector: 'app-progress-trend-chart',
  imports: [],
  template: `
    <div class="chart-wrapper">
      <canvas #chartCanvas></canvas>
    </div>
  `,
  styles: [`
    .chart-wrapper {
      position: relative;
      height: 300px;
      width: 100%;
    }
  `]
})
export class ProgressTrendChartComponent implements OnInit, OnChanges {
  @ViewChild('chartCanvas') chartCanvas?: ElementRef;
  @Input() siteId?: string;
  @Input() title: string = '工程進度趨勢';
  @Input() height: number = 300;
  
  private chart: any;
  private mongodbService = inject(MongodbService);
  private authService = inject(AuthService);
  private loadedProgressData: ProgressData[] = [];

  ngOnInit() {
    setTimeout(() => {
      this.loadData();
    }, 0);
  }

  ngOnChanges(changes: SimpleChanges) {
    if (changes['siteId'] || changes['progressData']) {
      this.loadData();
    }
  }

  ngOnDestroy() {
    if (this.chart) {
      this.chart.destroy();
    }
  }

  private async loadData() {

    // 如果有 siteId，自己載入資料
    if (this.siteId) {
      try {
        this.loadedProgressData = await this.loadSiteProgressData(this.siteId);
        console.log('ProgressTrendChart 載入工地進度資料完成:', this.loadedProgressData.length, '筆資料');
        this.initChart();
      } catch (error) {
        console.error('ProgressTrendChart 載入工地進度資料失敗:', error);
        this.loadedProgressData = [];
        this.initChart();
      }
    } else {
      // 沒有資料源，顯示空圖表
      this.loadedProgressData = [];
      this.initChart();
    }
  }

  // 載入工地進度趨勢資料
  private async loadSiteProgressData(siteId: string): Promise<ProgressData[]> {
    // 獲取工地資訊
    const site = await this.mongodbService.getById('site', siteId);
    if (!site || !site.startDate || !site.endDate) {
      throw new Error('工地資訊不完整');
    }

    const contractStartDate = new Date(site.startDate);
    const contractEndDate = new Date(site.endDate);
    const today = new Date();

    // 獲取任務資料
    const tasks = await this.mongodbService.get('task', { siteId });

    // 計算任務的實際開始和結束日期範圍（預期進度用）
    let taskStartDate: Date | null = null;
    let taskEndDate: Date | null = null;
    
    if (tasks && tasks.length > 0) {
      const validTasks = tasks.filter((task: any) => task.start && task.end);
      if (validTasks.length > 0) {
        const startDates: Date[] = validTasks.map((task: any) => new Date(task.start));
        const endDates: Date[] = validTasks.map((task: any) => new Date(task.end));
        
        const startTimes = startDates.map(d => d.getTime());
        const endTimes = endDates.map(d => d.getTime());
        
        taskStartDate = new Date(Math.min(...startTimes));
        taskEndDate = new Date(Math.max(...endTimes));
      }
    }

    // 決定總體的日期範圍：從最早的開始日期到最晚的結束日期
    let overallStartDate = contractStartDate;
    let overallEndDate = contractEndDate;
    
    if (taskStartDate && taskEndDate) {
      overallStartDate = new Date(Math.min(contractStartDate.getTime(), taskStartDate.getTime()));
      overallEndDate = new Date(Math.max(contractEndDate.getTime(), taskEndDate.getTime()));
    }

    // 產生完整的日期範圍
    const dateRange = this.getDatesInRange(overallStartDate, overallEndDate);
    
    // 計算每日進度資料
    const progressData: ProgressData[] = dateRange.map((date) => {
      const dateStr = date.toISOString().split('T')[0];

      // 1. 合約進度：基於合約時程的線性進度
      let plannedProgress = 0;
      if (date >= contractStartDate && date <= contractEndDate) {
        const contractDays = Math.max(1, Math.floor(
          (contractEndDate.getTime() - contractStartDate.getTime()) / (1000 * 60 * 60 * 24)
        ));
        const daysFromContractStart = Math.floor(
          (date.getTime() - contractStartDate.getTime()) / (1000 * 60 * 60 * 24)
        );
        plannedProgress = Math.min(100, Math.max(0, (daysFromContractStart / contractDays) * 100));
      } else if (date > contractEndDate) {
        plannedProgress = 100;
      }

      // 2. 預期進度：基於任務實際開始和結束日期的線性進度
      let scheduledProgress: number | undefined = undefined;
      if (taskStartDate && taskEndDate) {
        if (date >= taskStartDate && date <= taskEndDate) {
          const totalTaskDays = Math.max(1, Math.floor(
            (taskEndDate.getTime() - taskStartDate.getTime()) / (1000 * 60 * 60 * 24)
          ));
          const daysFromTaskStart = Math.floor(
            (date.getTime() - taskStartDate.getTime()) / (1000 * 60 * 60 * 24)
          );
          scheduledProgress = Math.min(100, Math.max(0, (daysFromTaskStart / totalTaskDays) * 100));
        } else if (date > taskEndDate) {
          scheduledProgress = 100;
        }
        // 當 date < taskStartDate 時，scheduledProgress 保持 undefined
      }

      // 3. 實際進度：從進度歷史計算（只有在任務時程範圍內才有實際進度）
      let actualProgress: number | undefined = undefined;
      if (taskStartDate && date >= taskStartDate && date <= today) {
        actualProgress = this.getActualProgressForDate(tasks, date);
      }

      return {
        date: dateStr,
        plannedProgress: plannedProgress,
        scheduledProgress: scheduledProgress,
        actualProgress: actualProgress
      };
    });

    return progressData;
  }

  // 計算特定日期的實際進度
  private getActualProgressForDate(tasks: any[], date: Date): number {
    if (!tasks || tasks.length === 0) return 0;
    
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
          if (new Date(record.date) <= date) {
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
    
    return taskCount > 0 ? totalProgress / taskCount : 0;
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

  // 檢查當前使用者是否為專案經理
  private isProjectManager(): boolean {
    const user = this.authService.user();
    if (!user || !this.siteId) return false;
    
    // 取得當前使用者在此工地的角色
    const userSiteRole = user.belongSites?.find(site => site.siteId === this.siteId)?.role;
    
    // 只有專案經理可以看到合約進度
    return userSiteRole === 'projectManager';
  }

  private initChart() {
    if (!this.chartCanvas) return;

    // 如果圖表已存在，先銷毀
    if (this.chart) {
      this.chart.destroy();
    }

    // 如果沒有資料，顯示空的圖表
    if (this.loadedProgressData.length === 0) {
      this.createEmptyChart();
      return;
    }

    const ctx = this.chartCanvas.nativeElement.getContext('2d');
    
    const labels = this.loadedProgressData.map(item => {
      const date = new Date(item.date);
      return `${date.getMonth() + 1}/${date.getDate()}`;
    });

    const actualData = this.loadedProgressData.map(item => item.actualProgress);
    const plannedData = this.loadedProgressData.map(item => item.plannedProgress);
    const scheduledData = this.loadedProgressData.map(item => item.scheduledProgress);

    // 根據使用者角色決定要顯示的資料集
    const datasets = [];
    
    // 只有專案經理才能看到合約進度
    if (this.isProjectManager()) {
      datasets.push({
        label: '合約進度',
        data: plannedData,
        borderColor: '#52c41a',
        borderDash: [5, 5],
        tension: 0.1,
        fill: false,
        pointRadius: 0,
      });
    }

    // 預期進度和實際進度所有人都可以看到
    datasets.push(
      {
        label: '預期進度',
        data: scheduledData,
        borderColor: '#ff7f00',
        borderDash: [10, 5],
        tension: 0.1,
        fill: false,
        pointRadius: 0,
        pointHoverRadius: 3,
      },
      {
        label: '實際總進度',
        data: actualData,
        borderColor: '#1890ff',
        backgroundColor: 'rgba(24, 144, 255, 0.1)',
        tension: 0.4,
        fill: false,
        pointRadius: 2,
        pointHoverRadius: 4,
      }
    );

    this.chart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: labels,
        datasets: datasets,
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          y: {
            beginAtZero: true,
            max: 100,
            title: {
              display: true,
              text: '進度百分比 (%)',
              color: '#ffffff',
            },
            ticks: {
              color: '#ffffff',
              callback: function (value) {
                return value + '%';
              },
            },
            grid: {
              color: 'rgba(255, 255, 255, 0.1)',
            },
          },
          x: {
            ticks: {
              color: '#ffffff',
              maxRotation: 45,
              minRotation: 45,
              autoSkip: true,
              maxTicksLimit: 20,
            },
            grid: {
              color: 'rgba(255, 255, 255, 0.1)',
            },
          },
        },
        plugins: {
          legend: {
            labels: {
              color: '#ffffff',
              font: {
                size: 12,
              },
            },
          },
          tooltip: {
            mode: 'index',
            intersect: false,
            callbacks: {
              label: function (context) {
                let label = context.dataset.label || '';
                if (label) {
                  label += ': ';
                }
                if (context.parsed.y !== null) {
                  label += context.parsed.y.toFixed(1) + '%';
                }
                return label;
              },
            },
          },
        },
      },
    });
  }

  private createEmptyChart() {
    if (!this.chartCanvas) return;

    const ctx = this.chartCanvas.nativeElement.getContext('2d');
    
    // 根據使用者角色決定要顯示的資料集
    const datasets = [];
    
    // 只有專案經理才能看到合約進度
    if (this.isProjectManager()) {
      datasets.push({
        label: '合約進度',
        data: [],
        borderColor: '#52c41a',
        borderDash: [5, 5],
        tension: 0.1,
        fill: false,
        pointRadius: 0,
      });
    }

    // 預期進度和實際進度所有人都可以看到
    datasets.push(
      {
        label: '規劃進度',
        data: [],
        borderColor: '#ff7f00',
        borderDash: [10, 5],
        tension: 0.1,
        fill: false,
        pointRadius: 0,
        pointHoverRadius: 3,
      },
      {
        label: '實際總進度',
        data: [],
        borderColor: '#1890ff',
        backgroundColor: 'rgba(24, 144, 255, 0.1)',
        tension: 0.4,
        fill: false,
        pointRadius: 2,
        pointHoverRadius: 4,
      }
    );
    
    this.chart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: ['無資料'],
        datasets: datasets,
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          y: {
            beginAtZero: true,
            max: 100,
            title: {
              display: true,
              text: '進度百分比 (%)',
              color: '#ffffff',
            },
            ticks: {
              color: '#ffffff',
              callback: function (value) {
                return value + '%';
              },
            },
            grid: {
              color: 'rgba(255, 255, 255, 0.1)',
            },
          },
          x: {
            ticks: {
              color: '#ffffff',
              maxRotation: 45,
              minRotation: 45,
              autoSkip: true,
              maxTicksLimit: 20,
            },
            grid: {
              color: 'rgba(255, 255, 255, 0.1)',
            },
          },
        },
        plugins: {
          legend: {
            labels: {
              color: '#ffffff',
              font: {
                size: 12,
              },
            },
          },
          tooltip: {
            mode: 'index',
            intersect: false,
            callbacks: {
              label: function (context) {
                return '無資料';
              },
            },
          },
        },
      },
    });
  }
} 