import { Component, ElementRef, ViewChild, OnInit, Input, SimpleChanges, OnChanges, AfterViewInit } from '@angular/core';
import { Chart } from 'chart.js/auto';
import { MongodbService } from '../../../services/mongodb.service';
import dayjs from 'dayjs';

@Component({
  selector: 'app-violation-type-chart',
  imports: [],
  templateUrl: './violation-type-chart.component.html',
  styleUrl: './violation-type-chart.component.scss'
})
export class ViolationTypeChartComponent implements OnInit, OnChanges, AfterViewInit {
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
      // 取得本月的工安缺失記錄表
      const startOfMonth = dayjs().startOf('month').format('YYYY-MM-DD');
      const endOfMonth = dayjs().endOf('month').format('YYYY-MM-DD');

      // 查詢本月所有工安缺失記錄表
      const safetyIssueRecords = await this.mongodbService.getArray('siteForm', {
        siteId: this.siteId,
        formType: 'safetyIssueRecord',
        status: { $ne: 'revoked' },
        issueDate: {
          $gte: startOfMonth,
          $lte: endOfMonth
        }
      });

      // 統計各缺失代碼的數量
      const deductionCodeMap = new Map<string, number>();

      safetyIssueRecords.forEach((record: any) => {
        if (record.deductionCode) {
          const code = record.deductionCode.trim();
          if (code) {
            const currentCount = deductionCodeMap.get(code) || 0;
            deductionCodeMap.set(code, currentCount + 1);
          }
        }
      });

      // 轉換為陣列並排序
      const violationData = Array.from(deductionCodeMap.entries())
        .map(([code, count]) => ({ code, count }))
        .sort((a, b) => b.count - a.count); // 按數量降序排列

      const labels = violationData.map(d => d.code);
      const data = violationData.map(d => d.count);

      // 生成顏色（違規種類統計使用橙紅色系）
      const colors = this.generateColors(labels.length);

      // 創建或更新圖表
      this.createChart(labels, data, colors);

    } catch (error) {
      console.error('載入違規種類圖表資料失敗:', error);
    }
  }

  private generateColors(count: number): string[] {
    const colorPalette = [
      '#ff7a45', '#ff4d4f', '#ffa940', '#fa541c',
      '#ff85c0', '#f759ab', '#cf1322', '#ffc53d',
      '#d4380d', '#ad2102', '#fa8c16', '#d48806'
    ];

    const colors: string[] = [];
    for (let i = 0; i < count; i++) {
      colors.push(colorPalette[i % colorPalette.length]);
    }
    return colors;
  }

  private createChart(labels: string[], data: number[], colors: string[]): void {
    if (!this.canvas) return;

    if (this.chart) {
      this.chart.destroy();
    }

    const ctx = this.canvas.nativeElement.getContext('2d');
    this.chart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [{
          label: '違規數量',
          data: data,
          backgroundColor: colors,
          borderRadius: 4,
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          y: {
            beginAtZero: true,
            title: {
              display: true,
              text: '數量',
              color: '#ffffff'
            },
            ticks: {
              color: '#ffffff',
              precision: 0
            },
            grid: {
              color: 'rgba(255, 255, 255, 0.1)'
            }
          },
          x: {
            title: {
              display: true,
              text: '缺失代碼',
              color: '#ffffff'
            },
            ticks: {
              color: '#ffffff',
              maxRotation: 45,
              minRotation: 45
            },
            grid: {
              color: 'rgba(255, 255, 255, 0.1)'
            }
          }
        },
        plugins: {
          annotation: false as any, // 禁用 annotation 插件
          legend: {
            display: false
          },
          tooltip: {
            callbacks: {
              title: function(tooltipItems) {
                return '缺失代碼: ' + tooltipItems[0].label;
              },
              label: function(context) {
                return '數量: ' + context.parsed.y + ' 次';
              }
            }
          }
        }
      }
    });
  }
}
