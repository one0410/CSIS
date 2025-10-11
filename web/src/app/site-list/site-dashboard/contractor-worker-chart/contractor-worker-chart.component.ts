import { Component, ElementRef, ViewChild, OnInit, Input, SimpleChanges, OnChanges, AfterViewInit } from '@angular/core';
import { Chart } from 'chart.js/auto';
import { MongodbService } from '../../../services/mongodb.service';
import dayjs from 'dayjs';

@Component({
  selector: 'app-contractor-worker-chart',
  imports: [],
  templateUrl: './contractor-worker-chart.component.html',
  styleUrl: './contractor-worker-chart.component.scss'
})
export class ContractorWorkerChartComponent implements OnInit, OnChanges, AfterViewInit {
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
      // 取得本月的工具箱會議記錄
      const startOfMonth = dayjs().startOf('month').format('YYYY-MM-DD');
      const endOfMonth = dayjs().endOf('month').format('YYYY-MM-DD');

      // 查詢本月所有工具箱會議表單
      const toolboxMeetings = await this.mongodbService.getArray('siteForm', {
        siteId: this.siteId,
        formType: 'toolboxMeeting',
        status: { $ne: 'revoked' },
        applyDate: {
          $gte: startOfMonth,
          $lte: endOfMonth
        }
      });

      // 統計各主承攬商的簽名數（出工人數）
      const contractorCountMap = new Map<string, number>();

      toolboxMeetings.forEach((meeting: any) => {
        // 檢查 contractors 陣列中的主承攬商
        if (meeting.contractors && Array.isArray(meeting.contractors)) {
          const mainContractors = meeting.contractors.filter((c: any) =>
            c.type === '主承攬商' && c.company && c.company.trim() !== ''
          );

          mainContractors.forEach((contractor: any) => {
            const contractorName = contractor.company;

            // 統計該主承攬商在 healthWarnings.attendeeMainContractorSignatures 中的簽名數
            if (meeting.healthWarnings && meeting.healthWarnings.attendeeMainContractorSignatures) {
              const signatures = meeting.healthWarnings.attendeeMainContractorSignatures;
              if (Array.isArray(signatures)) {
                // 計算屬於該主承攬商的有效簽名數
                const validSignatures = signatures.filter((sig: any) =>
                  sig.signature && sig.signature.trim() !== '' &&
                  sig.company === contractorName
                );

                const currentCount = contractorCountMap.get(contractorName) || 0;
                contractorCountMap.set(contractorName, currentCount + validSignatures.length);
              }
            }
          });
        }
      });

      // 轉換為陣列並排序
      const contractorData = Array.from(contractorCountMap.entries())
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count); // 按出工人數降序排列

      const labels = contractorData.map(d => d.name);
      const data = contractorData.map(d => d.count);

      // 生成顏色
      const colors = this.generateColors(labels.length);

      // 創建或更新圖表
      this.createChart(labels, data, colors);

    } catch (error) {
      console.error('載入供應商出工人數圖表資料失敗:', error);
    }
  }

  private generateColors(count: number): string[] {
    const colorPalette = [
      '#1890ff', '#52c41a', '#faad14', '#f5222d',
      '#722ed1', '#13c2c2', '#eb2f96', '#fa8c16',
      '#a0d911', '#2f54eb', '#fa541c', '#1abc9c'
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
          label: '出工人數',
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
              text: '人數',
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
              text: '主承攬商',
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
                return '出工人數: ' + context.parsed.y + ' 人';
              }
            }
          }
        }
      }
    });
  }
}
