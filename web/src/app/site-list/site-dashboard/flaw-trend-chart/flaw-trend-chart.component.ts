import { Component, Input, ViewChild, ElementRef, OnInit, OnChanges, AfterViewInit, SimpleChanges } from '@angular/core';
import { Chart } from 'chart.js/auto';
import dayjs from 'dayjs';
import { MongodbService } from '../../../services/mongodb.service';

@Component({
  selector: 'app-flaw-trend-chart',
  imports: [],
  templateUrl: './flaw-trend-chart.component.html',
  styleUrl: './flaw-trend-chart.component.scss'
})
export class FlawTrendChartComponent implements OnInit, OnChanges, AfterViewInit {
  @Input() siteId: string = '';
  @ViewChild('chartCanvas') canvas?: ElementRef;

  private chart: any;

  constructor(private mongodbService: MongodbService) {}

  ngOnInit(): void {
    // 不在這裡初始化圖表，等待 AfterViewInit
  }

  ngAfterViewInit(): void {
    // ViewChild 已經初始化，可以安全地創建圖表
    if (this.siteId) {
      // 使用 setTimeout 避免 ExpressionChangedAfterItHasBeenCheckedError
      setTimeout(() => {
        this.initChart();
      }, 0);
    }
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['siteId'] && !changes['siteId'].firstChange && this.canvas) {
      this.initChart();
    }
  }

  async initChart(): Promise<void> {
    if (!this.canvas || !this.siteId) return;

    // 如果圖表已存在，先銷毀
    if (this.chart) {
      this.chart.destroy();
    }

    // 生成過去30天的日期
    let last30Days: Date[] = [];
    for (let i = 30; i > 0; i--) {
      last30Days.push(dayjs().subtract(i, 'day').toDate());
    }
    const last30DayLabels = last30Days.map(
      (date) => `${date.getMonth() + 1}/${date.getDate()}`
    );

    // 獲取缺失數據
    let flawData30Days: number[] = [];

    try {
      // 計算查詢日期範圍
      const startDate = dayjs().subtract(30, 'day').format('YYYY-MM-DD');
      const endDate = dayjs().format('YYYY-MM-DD');

      // 一次性查詢過去30天的所有缺失資料
      const flawForms = await this.mongodbService.getArray('siteForm', {
        formType: 'siteFlaw',
        siteId: this.siteId,
        applyDate: { $gte: startDate, $lte: endDate }
      });

      // 建立日期計數對應表
      const dateCounts: { [key: string]: number } = {};
      last30Days.forEach(date => {
        const dateStr = dayjs(date).format('YYYY-MM-DD');
        dateCounts[dateStr] = 0;
      });

      // 統計每天的缺失數量
      flawForms.forEach((form: any) => {
        if (form.applyDate && dateCounts.hasOwnProperty(form.applyDate)) {
          dateCounts[form.applyDate]++;
        }
      });

      // 產生圖表資料
      flawData30Days = last30Days.map(date => {
        const dateStr = dayjs(date).format('YYYY-MM-DD');
        return dateCounts[dateStr] || 0;
      });

    } catch (error) {
      console.error('獲取缺失資料失敗:', error);
      // 如果查詢失敗，填入全部為0的資料
      flawData30Days = last30Days.map(() => 0);
    }

    console.log('缺失趨勢資料:', flawData30Days);

    // 創建缺失圖表
    this.chart = new Chart(this.canvas.nativeElement.getContext('2d'), {
      type: 'bar',
      data: {
        labels: last30DayLabels,
        datasets: [
          {
            label: '缺失數量',
            data: flawData30Days,
            backgroundColor: '#ff4d4f',
            borderRadius: 4,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          y: {
            beginAtZero: true,
            title: {
              display: true,
              text: '缺失數量',
              color: '#ffffff',
            },
            ticks: {
              color: '#ffffff',
              precision: 0,
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
            },
            grid: {
              color: 'rgba(255, 255, 255, 0.1)',
            },
          },
        },
        plugins: {
          annotation: false as any, // 禁用 annotation 插件
          legend: {
            labels: {
              color: '#ffffff',
            },
          },
          tooltip: {
            callbacks: {
              title: function (tooltipItems) {
                return '日期: ' + tooltipItems[0].label;
              },
              label: function (context) {
                return '缺失數量: ' + context.parsed.y;
              },
            },
          },
        },
      },
    });
  }

  ngOnDestroy(): void {
    if (this.chart) {
      this.chart.destroy();
    }
  }
}
