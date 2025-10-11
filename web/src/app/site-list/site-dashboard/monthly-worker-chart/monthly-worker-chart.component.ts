import { Component, ElementRef, ViewChild, OnInit, Input, SimpleChanges, OnChanges, AfterViewInit } from '@angular/core';
import { Chart } from 'chart.js/auto';
import { MongodbService } from '../../../services/mongodb.service';
import dayjs from 'dayjs';

@Component({
  selector: 'app-monthly-worker-chart',
  imports: [],
  templateUrl: './monthly-worker-chart.component.html',
  styleUrl: './monthly-worker-chart.component.scss'
})
export class MonthlyWorkerChartComponent implements OnInit, OnChanges, AfterViewInit {
  @Input() siteId: string = '';
  @ViewChild('chartCanvas') canvas?: ElementRef;

  chart: any;

  constructor(private mongodbService: MongodbService) {}

  ngOnInit(): void {
    // 初始化時載入資料
    if (this.siteId) {
      this.loadChartData();
    }
  }

  ngOnChanges(changes: SimpleChanges): void {
    // 當 siteId 改變時重新載入資料
    if (changes['siteId'] && !changes['siteId'].firstChange) {
      this.loadChartData();
    }
  }

  ngAfterViewInit(): void {
    // ViewChild 初始化後載入圖表
    setTimeout(() => {
      if (this.siteId && this.canvas) {
        this.loadChartData();
      }
    }, 0);
  }

  async loadChartData(): Promise<void> {
    if (!this.siteId || !this.canvas) return;

    try {
      // 取得過去12個月的工具箱會議記錄
      const startDate = dayjs().subtract(11, 'month').startOf('month');
      const endDate = dayjs().endOf('month');

      // 查詢所有工具箱會議表單
      const toolboxMeetings = await this.mongodbService.getArray('siteForm', {
        siteId: this.siteId,
        formType: 'toolboxMeeting',
        status: { $ne: 'revoked' }, // 排除已作廢的表單
        applyDate: {
          $gte: startDate.format('YYYY-MM-DD'),
          $lte: endDate.format('YYYY-MM-DD')
        }
      });

      // 建立月份標籤和資料
      const monthLabels: string[] = [];
      const workerCounts: number[] = [];

      // 生成過去12個月的標籤
      for (let i = 11; i >= 0; i--) {
        const month = dayjs().subtract(i, 'month');
        monthLabels.push(month.format('YYYY-MM'));
      }

      // 計算每個月的出工人數（簽名數量）
      monthLabels.forEach(monthLabel => {
        let monthWorkerCount = 0;

        // 篩選該月份的工具箱會議
        const monthMeetings = toolboxMeetings.filter((meeting: any) => {
          if (!meeting.applyDate) return false;
          const meetingMonth = dayjs(meeting.applyDate).format('YYYY-MM');
          return meetingMonth === monthLabel;
        });

        // 統計該月份所有會議的簽名數量
        monthMeetings.forEach((meeting: any) => {
          if (meeting.healthWarnings) {
            // 統計四個承攬商欄位的簽名數
            const signatureArrays = [
              meeting.healthWarnings.attendeeMainContractorSignatures || [],
              meeting.healthWarnings.attendeeSubcontractor1Signatures || [],
              meeting.healthWarnings.attendeeSubcontractor2Signatures || [],
              meeting.healthWarnings.attendeeSubcontractor3Signatures || []
            ];

            signatureArrays.forEach(signatures => {
              if (Array.isArray(signatures)) {
                // 計算有效簽名數（signature 欄位不為空）
                const validSignatures = signatures.filter((sig: any) =>
                  sig.signature && sig.signature.trim() !== ''
                );
                monthWorkerCount += validSignatures.length;
              }
            });
          }
        });

        workerCounts.push(monthWorkerCount);
      });

      // 格式化月份標籤為 MM月
      const formattedLabels = monthLabels.map(label => {
        const month = dayjs(label).month() + 1;
        return `${month}月`;
      });

      // 創建或更新圖表
      this.createChart(formattedLabels, workerCounts);

    } catch (error) {
      console.error('載入每月出工人數圖表資料失敗:', error);
    }
  }

  private createChart(labels: string[], data: number[]): void {
    if (!this.canvas) return;

    // 如果圖表已存在，先銷毀
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
          backgroundColor: '#1890ff',
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
              text: '月份',
              color: '#ffffff'
            },
            ticks: {
              color: '#ffffff'
            },
            grid: {
              color: 'rgba(255, 255, 255, 0.1)'
            }
          }
        },
        plugins: {
          annotation: false as any, // 禁用 annotation 插件
          legend: {
            labels: {
              color: '#ffffff'
            }
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
