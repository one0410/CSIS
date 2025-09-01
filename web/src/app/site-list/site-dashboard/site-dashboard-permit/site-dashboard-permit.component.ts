import { Component, OnInit, ViewChild, ElementRef, AfterViewInit } from '@angular/core';
import { Location } from '@angular/common';
import { ActivatedRoute, RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { Site } from '../../site-list.component';
import { MongodbService } from '../../../services/mongodb.service';
import dayjs from 'dayjs';
import { Chart, ChartConfiguration, ChartTypeRegistry } from 'chart.js/auto';

interface DailyPermitCount {
  date: string;
  count: number;
}

@Component({
  selector: 'app-site-dashboard-permit',
  standalone: true,
  imports: [RouterModule, FormsModule],
  templateUrl: './site-dashboard-permit.component.html',
  styleUrl: './site-dashboard-permit.component.scss'
})
export class SiteDashboardPermitComponent implements OnInit, AfterViewInit {
  @ViewChild('permitChart') permitChart!: ElementRef;
  
  siteId: string = '';
  site: Site | null = null;
  permits: any[] = [];
  loading: boolean = true;
  error: string = '';
  
  // 圖表相關
  chartInstance: Chart | null = null;
  dailyPermitCounts: DailyPermitCount[] = [];
  
  // 日期範圍相關
  selectedRange: string = '30'; // 預設為30天
  customStartDate: string = '';
  customEndDate: string = '';
  
  constructor(
    private route: ActivatedRoute,
    private mongodbService: MongodbService,
    public location: Location
  ) {
    // 初始化自訂日期範圍為最近30天
    const today = dayjs();
    this.customEndDate = today.format('YYYY-MM-DD');
    this.customStartDate = today.subtract(30, 'day').format('YYYY-MM-DD');
  }

  ngOnInit(): void {
    // 獲取父路由的siteId參數
    const parent = this.route.parent;
    if (parent) {
      parent.paramMap.subscribe(async (params) => {
        this.siteId = params.get('id') || '';
        if (this.siteId) {
          await this.loadSiteData();
          await this.loadPermitData();
        }
      });
    }
  }

  ngAfterViewInit(): void {
    // 在視圖初始化後，如果資料已載入就繪製圖表
    if (!this.loading && this.permits.length > 0) {
      this.renderChart();
    }
  }

  // 加載專案資料
  async loadSiteData(): Promise<void> {
    try {
      this.site = await this.mongodbService.getById('site', this.siteId);
    } catch (error) {
      console.error('加載專案資料時出錯:', error);
      this.error = '無法載入專案資料';
    }
  }

  // 加載許可單資料
  async loadPermitData(): Promise<void> {
    if (!this.siteId) {
      this.error = '專案ID不存在，無法獲取許可單資料';
      this.loading = false;
      return;
    }

    this.loading = true;

    try {
      // 獲取該專案的所有許可單
      this.permits = await this.mongodbService.getArray('siteForm', {
        formType: 'sitePermit',
        siteId: this.siteId
      });
      
      // 計算每日許可單數量
      this.calculateDailyPermitCounts();
      
      this.loading = false;
      
      // 確保DOM已經渲染後繪製圖表
      setTimeout(() => {
        if (this.permitChart) {
          this.renderChart();
        }
      }, 0);
      
    } catch (error) {
      console.error('加載許可單資料時出錯:', error);
      this.error = '無法獲取許可單資料';
      this.loading = false;
    }
  }

  // 當選擇範圍變更時
  onRangeChange(): void {
    if (this.selectedRange === 'custom') {
      // 如果選擇自訂，不需要進一步處理，等待用戶選擇日期
      return;
    }
    
    // 重新計算日期範圍
    const days = parseInt(this.selectedRange);
    const today = dayjs();
    this.customEndDate = today.format('YYYY-MM-DD');
    this.customStartDate = today.subtract(days, 'day').format('YYYY-MM-DD');
    
    // 重新計算數據並更新圖表
    this.calculateDailyPermitCounts();
    this.renderChart();
  }

  // 當自訂日期變更時
  onCustomDateChange(): void {
    if (!this.customStartDate || !this.customEndDate) {
      return;
    }
    
    // 檢查開始日期是否晚於結束日期
    if (dayjs(this.customStartDate).isAfter(dayjs(this.customEndDate))) {
      // 如果是，將結束日期設為開始日期之後的一天
      this.customEndDate = dayjs(this.customStartDate).add(1, 'day').format('YYYY-MM-DD');
    }
    
    // 重新計算數據並更新圖表
    this.calculateDailyPermitCounts();
    this.renderChart();
  }

  // 計算指定日期範圍內每天的許可單數量
  calculateDailyPermitCounts(): void {
    // 建立日期範圍內的日期映射
    const startDate = dayjs(this.customStartDate);
    const endDate = dayjs(this.customEndDate);
    const dateRange = endDate.diff(startDate, 'day') + 1; // 包括結束日期
    const dailyCounts: Record<string, number> = {};
    
    // 初始化日期範圍內每一天，計數為0
    for (let i = 0; i < dateRange; i++) {
      const date = startDate.add(i, 'day').format('YYYY-MM-DD');
      dailyCounts[date] = 0;
    }
    
    // 計算每天的許可單數量
    this.permits.forEach(permit => {
      if (permit.applyDate) {
        const permitDate = dayjs(permit.applyDate).format('YYYY-MM-DD');
        // 只計算範圍內的許可單
        if (dailyCounts.hasOwnProperty(permitDate)) {
          dailyCounts[permitDate]++;
        }
      }
    });
    
    // 轉換為數組並按日期排序（從舊到新）
    this.dailyPermitCounts = Object.entries(dailyCounts)
      .map(([date, count]) => ({ date, count }))
      .sort((a, b) => dayjs(a.date).diff(dayjs(b.date)));
  }

  // 繪製圖表
  renderChart(): void {
    // 如果圖表實例已存在，先銷毀它
    if (this.chartInstance) {
      this.chartInstance.destroy();
    }
    
    // 如果沒有許可單數據，不繪製圖表
    if (this.dailyPermitCounts.length === 0) {
      return;
    }

    const ctx = this.permitChart.nativeElement.getContext('2d');
    
    // 準備圖表數據
    const labels = this.dailyPermitCounts.map(item => dayjs(item.date).format('MM/DD'));
    const data = this.dailyPermitCounts.map(item => item.count);
    
    // 取得日期範圍描述
    let rangeText = '';
    if (this.selectedRange === 'custom') {
      rangeText = `${dayjs(this.customStartDate).format('YYYY/MM/DD')} - ${dayjs(this.customEndDate).format('YYYY/MM/DD')}`;
    } else {
      rangeText = `最近 ${this.selectedRange} 天`;
    }
    
    // 圖表配置
    const chartOptions = {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [{
          label: '許可單數量',
          data: data,
          backgroundColor: '#1890ff',
          borderColor: '#1890ff',
          borderWidth: 1
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          y: {
            beginAtZero: true,
            ticks: {
              color: '#ffffff',
              stepSize: 1
            },
            grid: {
              color: 'rgba(255, 255, 255, 0.1)'
            }
          },
          x: {
            ticks: {
              color: '#ffffff'
            },
            grid: {
              color: 'rgba(255, 255, 255, 0.1)'
            }
          }
        },
        plugins: {
          legend: {
            labels: {
              color: '#ffffff'
            }
          },
          title: {
            display: true,
            text: `許可單統計 (${rangeText})`,
            color: '#ffffff',
            font: {
              size: 16
            }
          }
        }
      }
    };
    
    // 創建圖表
    this.chartInstance = new Chart(ctx, chartOptions as ChartConfiguration<keyof ChartTypeRegistry, number[], string>);
  }

  // 格式化日期（保留此方法供需要時使用）
  formatDate(dateString: string): string {
    if (!dateString) return '-';
    return dayjs(dateString).format('YYYY-MM-DD');
  }
} 