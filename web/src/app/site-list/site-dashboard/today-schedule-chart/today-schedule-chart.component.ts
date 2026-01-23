import { Component, ElementRef, ViewChild, OnInit, Input, SimpleChanges, OnChanges, AfterViewInit } from '@angular/core';
import { Chart } from 'chart.js/auto';
import { MongodbService } from '../../../services/mongodb.service';
import dayjs from 'dayjs';

interface ScheduleItem {
  taskName: string;
  progress: number;
  scheduledProgress: number;
}

@Component({
  selector: 'app-today-schedule-chart',
  imports: [],
  templateUrl: './today-schedule-chart.component.html',
  styleUrl: './today-schedule-chart.component.scss'
})
export class TodayScheduleChartComponent implements OnInit, OnChanges, AfterViewInit {
  @Input() siteId: string = '';
  @ViewChild('chartCanvas') canvas?: ElementRef;

  chart: any;

  constructor(private mongodbService: MongodbService) {}

  ngOnInit(): void {
    if (this.siteId) {
      this.loadChartData();
    }
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['siteId'] && !changes['siteId'].firstChange) {
      this.loadChartData();
    }
  }

  ngAfterViewInit(): void {
    setTimeout(() => {
      if (this.siteId && this.canvas) {
        this.loadChartData();
      }
    }, 0);
  }

  async loadChartData(): Promise<void> {
    if (!this.siteId || !this.canvas) return;

    try {
      const today = dayjs().format('YYYY-MM-DD');

      // 獲取今日預計施作的任務
      const tasks = await this.mongodbService.getArray('task', {
        siteId: this.siteId,
        $or: [
          // 任務進行中（開始日期 <= 今天 <= 結束日期）
          {
            start: { $lte: today },
            end: { $gte: today }
          }
        ]
      });

      // 處理任務資料
      const scheduleItems: ScheduleItem[] = tasks.map((task: any) => {
        // 計算預計進度（基於日期）
        let scheduledProgress = 0;
        if (task.start && task.end) {
          const startDate = dayjs(task.start);
          const endDate = dayjs(task.end);
          const todayDate = dayjs(today);

          const totalDays = endDate.diff(startDate, 'day') + 1;
          const elapsedDays = todayDate.diff(startDate, 'day') + 1;

          scheduledProgress = Math.min(100, Math.max(0, (elapsedDays / totalDays) * 100));
        }

        // 獲取實際進度
        let actualProgress = task.progress || 0;
        if (task.progressHistory && task.progressHistory.length > 0) {
          const sortedHistory = [...task.progressHistory].sort((a: any, b: any) =>
            dayjs(a.date).valueOf() - dayjs(b.date).valueOf()
          );

          for (const record of sortedHistory) {
            if (dayjs(record.date).isBefore(dayjs(today).add(1, 'day'))) {
              actualProgress = record.progress;
            }
          }
        }

        return {
          taskName: task.text || task.name || '未命名任務',
          progress: actualProgress,
          scheduledProgress: Math.round(scheduledProgress * 10) / 10
        };
      });

      // 只取前10個任務顯示
      const displayItems = scheduleItems.slice(0, 10);

      const labels = displayItems.map(item => {
        // 截斷過長的任務名稱
        return item.taskName.length > 15 ? item.taskName.substring(0, 15) + '...' : item.taskName;
      });
      const actualData = displayItems.map(item => item.progress);
      const scheduledData = displayItems.map(item => item.scheduledProgress);

      // 創建圖表
      this.createChart(labels, actualData, scheduledData);

    } catch (error) {
      console.error('載入今日進度預計施作圖表資料失敗:', error);
    }
  }

  private createChart(labels: string[], actualData: number[], scheduledData: number[]): void {
    if (!this.canvas) return;

    if (this.chart) {
      this.chart.destroy();
    }

    const ctx = this.canvas.nativeElement.getContext('2d');
    this.chart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [
          {
            label: '實際進度',
            data: actualData,
            backgroundColor: 'rgba(54, 162, 235, 0.8)',
            borderColor: 'rgba(54, 162, 235, 1)',
            borderWidth: 1,
            borderRadius: 4,
          },
          {
            label: '預計進度',
            data: scheduledData,
            backgroundColor: 'rgba(255, 206, 86, 0.8)',
            borderColor: 'rgba(255, 206, 86, 1)',
            borderWidth: 1,
            borderRadius: 4,
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        indexAxis: 'y', // 水平條形圖
        scales: {
          x: {
            beginAtZero: true,
            max: 100,
            title: {
              display: true,
              text: '進度 (%)',
              color: '#ffffff'
            },
            ticks: {
              color: '#ffffff',
              callback: function(value) {
                return value + '%';
              }
            },
            grid: {
              color: 'rgba(255, 255, 255, 0.1)'
            }
          },
          y: {
            title: {
              display: false
            },
            ticks: {
              color: '#ffffff',
              font: {
                size: 11
              }
            },
            grid: {
              color: 'rgba(255, 255, 255, 0.1)'
            }
          }
        },
        plugins: {
          legend: {
            display: true,
            position: 'top',
            labels: {
              color: '#ffffff',
              usePointStyle: true,
              padding: 15
            }
          },
          tooltip: {
            callbacks: {
              label: function(context) {
                return context.dataset.label + ': ' + context.parsed.x + '%';
              }
            }
          }
        }
      }
    });
  }
}
