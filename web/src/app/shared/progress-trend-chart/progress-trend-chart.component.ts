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
  private scheduleCompletionPoints: { date: Date; cumulativeProgress: number }[] = [];
  private actualProgressDates: Map<string, number> = new Map();

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

    // 計算任務的實際開始和結束日期範圍
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

    // 先計算實際進度以取得有數據的日期範圍
    this.calculateActualProgressByNewAlgorithm(tasks);
    
    // 收集所有線條的日期範圍
    const allStartDates: Date[] = [];
    const allEndDates: Date[] = [];
    
    // 1. 綠色線（合約進度）- 只有專案經理可以看到
    if (this.isProjectManager()) {
      allStartDates.push(contractStartDate);
      allEndDates.push(contractEndDate);
    }
    
    // 2. 橘色線（預期進度）- 基於任務日期範圍
    if (taskStartDate && taskEndDate) {
      allStartDates.push(taskStartDate);
      allEndDates.push(taskEndDate);
    }
    
    // 3. 藍色線（實際進度）- 基於有進度回報的日期
    if (this.actualProgressDates.size > 0) {
      const actualDates = Array.from(this.actualProgressDates.keys()).sort();
      allStartDates.push(new Date(actualDates[0]));
      allEndDates.push(new Date(actualDates[actualDates.length - 1]));
    }
    
    // 決定最終的日期範圍：取所有線條的最早和最晚日期
    let overallStartDate: Date;
    let overallEndDate: Date;
    
    if (allStartDates.length > 0 && allEndDates.length > 0) {
      overallStartDate = new Date(Math.min(...allStartDates.map(d => d.getTime())));
      overallEndDate = new Date(Math.max(...allEndDates.map(d => d.getTime())));
    } else {
      // 如果沒有任何數據，回退到合約日期
      overallStartDate = contractStartDate;
      overallEndDate = contractEndDate;
    }

    // 產生完整的日期範圍
    const dateRange = this.getDatesInRange(overallStartDate, overallEndDate);
    
    // 計算基於任務權重的預期進度曲線
    const scheduledProgressCurve = this.calculateScheduledProgressCurve(tasks, dateRange);
    
    // 實際進度已經在上面計算過了，不需要重複計算
    
    // 計算每日進度資料
    const progressData: ProgressData[] = dateRange.map((date, index) => {
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

      // 2. 預期進度：基於任務權重和完成時間點的曲線
      let scheduledProgress: number | undefined = scheduledProgressCurve[index];

      // 3. 實際進度：基於新算法計算
      let actualProgress: number | undefined = undefined;
      if (this.actualProgressDates.has(dateStr)) {
        actualProgress = this.actualProgressDates.get(dateStr);
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

    // 計算基於任務權重的預期進度曲線
  private calculateScheduledProgressCurve(tasks: any[], dateRange: Date[]): (number | undefined)[] {
    if (!tasks || tasks.length === 0) {
      return dateRange.map(() => undefined);
    }

    // 過濾有效任務並收集任務完成點
    const validTasks = tasks.filter((task: any) => 
      task.start && task.end && (task.weight !== undefined || task.weight !== null)
    );

    if (validTasks.length === 0) {
      return dateRange.map(() => undefined);
    }

    // 計算總權重
    const totalWeight = validTasks.reduce((sum: number, task: any) => {
      return sum + (task.weight || 1); // 如果沒有權重則預設為1
    }, 0);

    // 創建任務完成點陣列
    interface TaskCompletionPoint {
      date: Date;
      cumulativeProgress: number;
    }

    const completionPoints: TaskCompletionPoint[] = [];
    let cumulativeWeight = 0;

    // 按結束日期排序任務
    const sortedTasks = [...validTasks].sort((a: any, b: any) => 
      new Date(a.end).getTime() - new Date(b.end).getTime()
    );

    // 找到第一個任務開始日期
    const firstTaskStart = new Date(Math.min(...validTasks.map((task: any) => new Date(task.start).getTime())));
    
    // 添加起始點 (0%)
    completionPoints.push({
      date: firstTaskStart,
      cumulativeProgress: 0
    });

    // 計算每個任務完成時的累積進度
    sortedTasks.forEach((task: any) => {
      cumulativeWeight += (task.weight || 1);
      const progressPercentage = (cumulativeWeight / totalWeight) * 100;
      
      completionPoints.push({
        date: new Date(task.end),
        cumulativeProgress: progressPercentage
      });
    });

    // 存儲完成點以供圖表使用
    this.scheduleCompletionPoints = completionPoints;
    
    // 創建稀疏數組，只在關鍵點提供數據
    const sparseData: (number | undefined)[] = dateRange.map(() => undefined);
    
    // 為每個關鍵完成點設置數據
    completionPoints.forEach(point => {
      const dateIndex = dateRange.findIndex(date => 
        date.getTime() === point.date.getTime()
      );
      if (dateIndex !== -1) {
        sparseData[dateIndex] = point.cumulativeProgress;
      }
    });
    
    console.log('橘色線關鍵點數據:', completionPoints.map(p => ({
      date: p.date.toISOString().split('T')[0],
      progress: p.cumulativeProgress
    })));
    
    return sparseData;
  }

  // 新算法：計算實際進度
  private calculateActualProgressByNewAlgorithm(tasks: any[]) {
    this.actualProgressDates.clear();
    
    if (!tasks || tasks.length === 0) return;
    
    // 1. 過濾有效任務
    const validTasks = tasks.filter((task: any) => 
      task.start && task.end && (task.weight !== undefined || task.weight !== null)
    );
    
    if (validTasks.length === 0) return;
    
    // 2. 找出所有有進度回報的日期
    const allProgressDates = new Set<string>();
    validTasks.forEach(task => {
      if (task.progressHistory && task.progressHistory.length > 0) {
        task.progressHistory.forEach((record: any) => {
          allProgressDates.add(new Date(record.date).toISOString().split('T')[0]);
        });
      }
    });
    
    if (allProgressDates.size === 0) return;
    
    // 3. 排序日期，找出起點和結束點
    const sortedDates = Array.from(allProgressDates).sort();
    const startDate = sortedDates[0];
    const endDate = sortedDates[sortedDates.length - 1];
    
    console.log('實際進度計算範圍:', { startDate, endDate, totalDays: sortedDates.length });
    
    // 4. 計算總權重
    const totalWeight = validTasks.reduce((sum: number, task: any) => {
      return sum + (task.weight || 1);
    }, 0);
    
    // 5. 從起點到結束點，逐日檢查
    const currentDate = new Date(startDate);
    const lastDate = new Date(endDate);
    
    while (currentDate <= lastDate) {
      const dateStr = currentDate.toISOString().split('T')[0];
      
      // 檢查當天是否有任何工項回報進度
      const hasProgressOnThisDate = validTasks.some(task => 
        this.hasProgressReportOnDate(task, dateStr)
      );
      
      if (hasProgressOnThisDate) {
        // 有進度回報，計算當天的總進度
        let weightedProgress = 0;
        
        validTasks.forEach(task => {
          const taskWeight = task.weight || 1;
          const taskProgress = this.getTaskProgressOnOrBeforeDate(task, dateStr);
          weightedProgress += (taskProgress * taskWeight);
        });
        
        const totalProgress = weightedProgress / totalWeight;
        this.actualProgressDates.set(dateStr, totalProgress);
        
        console.log(`${dateStr} 實際進度計算:`, {
          totalWeight,
          weightedProgress: weightedProgress.toFixed(2),
          totalProgress: totalProgress.toFixed(2) + '%',
          tasksProgress: validTasks.map(t => ({
            name: t.name,
            weight: t.weight || 1,
            progress: this.getTaskProgressOnOrBeforeDate(t, dateStr)
          })).filter(t => t.progress > 0)
        });
      }
      
      // 移到下一天
      currentDate.setDate(currentDate.getDate() + 1);
    }
  }
  
  // 檢查工項在特定日期是否有進度回報
  private hasProgressReportOnDate(task: any, dateStr: string): boolean {
    if (!task.progressHistory || task.progressHistory.length === 0) return false;
    
    return task.progressHistory.some((record: any) => {
      const recordDate = new Date(record.date).toISOString().split('T')[0];
      return recordDate === dateStr;
    });
  }
  
  // 獲取工項在特定日期或之前最後一次回報的進度
  private getTaskProgressOnOrBeforeDate(task: any, dateStr: string): number {
    if (!task.progressHistory || task.progressHistory.length === 0) {
      return task.progress || 0;
    }
    
    const targetDate = new Date(dateStr);
    const sortedHistory = [...task.progressHistory].sort((a: any, b: any) => 
      new Date(a.date).getTime() - new Date(b.date).getTime()
    );
    
    let lastProgress = 0;
    for (const record of sortedHistory) {
      const recordDate = new Date(record.date);
      if (recordDate <= targetDate) {
        lastProgress = record.progress;
      } else {
        break;
      }
    }
    
    return lastProgress;
  }

  // 計算特定日期的實際進度（基於權重）
  private getActualProgressForDate(tasks: any[], date: Date): number {
    if (!tasks || tasks.length === 0) return 0;
    
    // 過濾有效任務
    const validTasks = tasks.filter((task: any) => 
      task.start && task.end && (task.weight !== undefined || task.weight !== null)
    );
    
    if (validTasks.length === 0) return 0;
    
    // 計算總權重
    const totalWeight = validTasks.reduce((sum: number, task: any) => {
      return sum + (task.weight || 1);
    }, 0);
    
    if (totalWeight === 0) return 0;
    
    let weightedProgress = 0;
    
    validTasks.forEach((task: any) => {
      const taskWeight = task.weight || 1;
      let taskProgress = 0;
      
      // 從進度歷史記錄中獲取該日期的進度
      if (task.progressHistory && task.progressHistory.length > 0) {
        // 尋找指定日期或最近的歷史記錄
        const sortedHistory = [...task.progressHistory].sort((a: any, b: any) => 
          new Date(a.date).getTime() - new Date(b.date).getTime()
        );
        
        for (const record of sortedHistory) {
          if (new Date(record.date) <= date) {
            taskProgress = record.progress;
          } else {
            break;
          }
        }
      } else if (task.progress !== undefined) {
        // 如果沒有歷史記錄但有進度值，使用當前進度
        taskProgress = task.progress;
      }
      
      // 計算加權進度：任務進度 × 任務權重
      weightedProgress += (taskProgress * taskWeight);
    });
    
    // 返回加權平均進度
    const actualProgress = weightedProgress / totalWeight;
    
    // 只有當有實際進度回報時才記錄日誌
    if (actualProgress > 0) {
      console.log(`${date.toISOString().split('T')[0]} 實際進度計算:`, {
        totalWeight,
        weightedProgress,
        actualProgress: actualProgress.toFixed(2) + '%',
        tasksProgress: validTasks.map(t => ({
          name: t.name,
          weight: t.weight || 1,
          progress: this.getTaskProgressForDate(t, date)
        })).filter(t => t.progress > 0) // 只顯示有進度的任務
      });
    }
    
    return actualProgress;
  }
  
  // 獲取單個任務在特定日期的進度
  private getTaskProgressForDate(task: any, date: Date): number {
    if (task.progressHistory && task.progressHistory.length > 0) {
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
      return taskProgress;
    } else if (task.progress !== undefined) {
      return task.progress;
    }
    return 0;
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
        tension: 0.4, // 增加曲線平滑度
        fill: false,
        pointRadius: 3, // 顯示關鍵點
        pointHoverRadius: 5,
        spanGaps: true, // 跳過undefined值，連接有效點
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
        spanGaps: true, // 跳過undefined值，連接有效點
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
        tension: 0.4, // 增加曲線平滑度
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
        spanGaps: true, // 跳過undefined值，連接有效點
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