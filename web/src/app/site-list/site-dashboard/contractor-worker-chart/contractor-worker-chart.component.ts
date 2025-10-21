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
        applyDate: {
          $gte: startOfMonth,
          $lte: endOfMonth
        }
      });

      // 統計各廠商的不重複工人數（當月累積出工人數）- 使用 Set 避免重複計算
      const contractorWorkerMap = new Map<string, Set<string>>();

      toolboxMeetings.forEach((meeting: any) => {
        if (meeting.healthWarnings) {
          // 收集所有4個廠商的簽名陣列（與 WorkerCountService 相同邏輯）
          const allSignatureArrays = [
            meeting.healthWarnings.attendeeMainContractorSignatures || [],
            meeting.healthWarnings.attendeeSubcontractor1Signatures || [],
            meeting.healthWarnings.attendeeSubcontractor2Signatures || [],
            meeting.healthWarnings.attendeeSubcontractor3Signatures || []
          ];

          for (const signatures of allSignatureArrays) {
            for (const signature of signatures) {
              // 檢查有效簽名（name, signature, company 都要存在）
              if (signature && signature.name && signature.signature && signature.company) {
                const companyName = signature.company.trim();
                const workerName = signature.name.trim();

                if (companyName !== '' && workerName !== '') {
                  // 使用 Set 儲存不重複的工人名稱
                  if (!contractorWorkerMap.has(companyName)) {
                    contractorWorkerMap.set(companyName, new Set());
                  }
                  contractorWorkerMap.get(companyName)!.add(workerName);
                }
              }
            }
          }
        }
      });

      // 轉換為陣列並排序，計算每個廠商的不重複工人數
      const contractorData = Array.from(contractorWorkerMap.entries())
        .filter(([name, workerSet]) => name && name.trim() !== '' && workerSet.size > 0)
        .map(([name, workerSet]) => ({ name, count: workerSet.size }))
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
