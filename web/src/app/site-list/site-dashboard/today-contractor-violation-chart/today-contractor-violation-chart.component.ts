import { Component, ElementRef, ViewChild, OnInit, Input, SimpleChanges, OnChanges, AfterViewInit } from '@angular/core';
import { Chart } from 'chart.js/auto';
import { MongodbService } from '../../../services/mongodb.service';
import dayjs from 'dayjs';

@Component({
  selector: 'app-today-contractor-violation-chart',
  imports: [],
  templateUrl: './today-contractor-violation-chart.component.html',
  styleUrl: './today-contractor-violation-chart.component.scss'
})
export class TodayContractorViolationChartComponent implements OnInit, OnChanges, AfterViewInit {
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
      // 取得今日的工安缺失記錄表
      const today = dayjs().format('YYYY-MM-DD');

      // 查詢今日所有工安缺失記錄表
      const safetyIssueRecords = await this.mongodbService.getArray('siteForm', {
        siteId: this.siteId,
        formType: 'safetyIssueRecord',
        status: { $ne: 'revoked' },
        issueDate: today
      });

      // 統計各供應商的違規次數
      const contractorViolationMap = new Map<string, number>();

      safetyIssueRecords.forEach((record: any) => {
        // 檢查 responsibleUnit 是否為供應商
        if (record.responsibleUnit === 'supplier' && record.supplierName) {
          const supplierName = record.supplierName.trim();
          if (supplierName) {
            const currentCount = contractorViolationMap.get(supplierName) || 0;
            contractorViolationMap.set(supplierName, currentCount + 1);
          }
        }
      });

      // 轉換為陣列並排序
      const contractorData = Array.from(contractorViolationMap.entries())
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count); // 按違規次數降序排列

      const labels = contractorData.map(d => d.name);
      const data = contractorData.map(d => d.count);

      // 生成顏色（違規統計使用紅色系）
      const colors = this.generateColors(labels.length);

      // 創建或更新圖表
      this.createChart(labels, data, colors);

    } catch (error) {
      console.error('載入今日供應商違規次數圖表資料失敗:', error);
    }
  }

  private generateColors(count: number): string[] {
    const colorPalette = [
      '#ff4d4f', '#ff7a45', '#ffa940', '#ffc53d',
      '#ff85c0', '#f759ab', '#ff4d4f', '#cf1322',
      '#fa541c', '#d4380d', '#ad2102', '#871400'
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
          label: '違規次數',
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
              text: '次數',
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
              text: '供應商',
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
                return tooltipItems[0].label;
              },
              label: function(context) {
                return '違規次數: ' + context.parsed.y + ' 次';
              }
            }
          }
        }
      }
    });
  }
}
