import { Component, ElementRef, ViewChild, OnInit } from '@angular/core';
import { Chart } from 'chart.js/auto';
import { ActivatedRoute, Router } from '@angular/router';
import { DatePipe, CommonModule } from '@angular/common';

import { Site } from '../site-list.component';
import { MongodbService } from '../../services/mongodb.service';
import { WeatherService } from '../../services/weather.service';

import { WorkerCountService, ContractorWorkerCount } from '../../services/worker-count.service';
import { ProgressTrendChartComponent } from '../../shared/progress-trend-chart/progress-trend-chart.component';
import { ZeroAccidentHoursComponent } from './zero-accident-hours/zero-accident-hours.component';
import dayjs from 'dayjs';

// 作業類別統計介面
interface PermitCategoryStat {
  category: string;
  displayName: string;
  count: number;
  color: string;
  icon: string;
}

// 廠商工人統計介面
interface ContractorWorkerStat {
  contractorName: string;
  workerCount: number;
  color: string;
  icon: string;
  percentage: number;
}

@Component({
  selector: 'app-site-dashboard',
  imports: [ProgressTrendChartComponent, ZeroAccidentHoursComponent, CommonModule],
  templateUrl: './site-dashboard.component.html',
  styleUrl: './site-dashboard.component.scss',
})
export class SiteDashboardComponent implements OnInit {
  siteId: string = '';
  site: Site | null = null;

  @ViewChild('chartFlaw') canvas2?: ElementRef;
  chartFlaw: any;

  todayDate: string = '';
  allProjectDays: number = 0;
  todayProjectDays: number = 0;
  todayWorkerCount: number = 0;
  todayPermitCount: number = 0;
  todayFlawCount: number = 0;
  currentProjectProgress: number = 0;
  todayWeather: string = '';
  
  // 許可單作業類別統計
  permitCategoryStats: PermitCategoryStat[] = [];
  
  // 廠商工人統計
  contractorWorkerStats: ContractorWorkerStat[] = [];

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private mongodbService: MongodbService,
    private weatherService: WeatherService,
    private workerCountService: WorkerCountService
  ) {
    this.todayDate = new Date().toLocaleDateString('zh-TW', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
  }

  ngOnInit() {
    // 從父路由獲取工地ID
    const parent = this.route.parent;
    if (parent) {
      parent.paramMap.subscribe(async (params) => {
        this.siteId = params.get('id') || '';
        if (this.siteId) {
          this.site = await this.mongodbService.getById('site', this.siteId);
          // 新增：計算全部工程日數與已過日數
          if (this.site && this.site.startDate && this.site.endDate) {
            const start = new Date(this.site.startDate);
            const end = new Date(this.site.endDate);
            const today = new Date();
            // 全部工程日數
            this.allProjectDays =
              Math.floor(
                (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)
              ) + 1;
            // 已過日數
            const todayClamped = today > end ? end : today;
            this.todayProjectDays =
              Math.floor(
                (todayClamped.getTime() - start.getTime()) /
                  (1000 * 60 * 60 * 24)
              ) + 1;
            if (this.todayProjectDays < 0) this.todayProjectDays = 0;

            // 天氣
            this.getWeather();

            // 計算許可單數
            this.calculatePermitCount();

            // 計算缺失單數
            this.calculateFlawCount();

            // 計算當前工程進度
            this.calculateCurrentProgress();

            // 移除零事故時數計算，改用獨立元件

            // 計算廠商工人統計
            this.calculateWorkerStats();

            // 在這裡初始化圖表，確保 allProjectDays 已經計算完成
            setTimeout(() => {
              this.initCharts();
            }, 0);
          }
        }
      });
    }
  }

  // 將圖表初始化邏輯移到單獨的方法
  async initCharts(): Promise<void> {
    if (
      !this.canvas2 ||
      !this.site ||
      !this.site.startDate ||
      !this.site.endDate
    )
      return;

    const startDate = new Date(this.site.startDate);
    const endDate = new Date(this.site.endDate);
    const today = new Date();

    // 獲取所有任務資料來計算規劃進度
    const tasks = await this.mongodbService.getArray('task', {
      siteId: this.siteId,
    });

    // 計算任務的實際開始和結束日期範圍（規劃進度用）
    let taskStartDate = null;
    let taskEndDate = null;
    
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

    // 處理日期標籤 - 從開始日到結束日
    let dateLabels: string[] = [];
    let actualProgressData: (number | null)[] = [];
    let plannedProgressData: number[] = [];
    let scheduledProgressData: number[] = []; // 新增：規劃進度

    // 產生所有日期標籤和對應的預設資料點
    const getDatesInRange = (start: Date, end: Date): Date[] => {
      const dates: Date[] = [];
      const currentDate = new Date(start);
      while (currentDate <= end) {
        dates.push(new Date(currentDate));
        currentDate.setDate(currentDate.getDate() + 1);
      }
      return dates;
    };

    const allDates = getDatesInRange(startDate, endDate);

    // 格式化日期為MM/DD格式用於顯示
    dateLabels = allDates.map((date) => {
      return `${date.getMonth() + 1}/${date.getDate()}`;
    });

    // 獲取實際進度數據
    interface ProgressRecord {
      date: string;
      progress: number;
    }

    // 收集所有任務的進度歷史記錄
    const allProgressRecords: ProgressRecord[] = [];
    if (tasks && tasks.length > 0) {
      tasks.forEach((task: any) => {
        if (task.progressHistory && Array.isArray(task.progressHistory)) {
          task.progressHistory.forEach((record: any) => {
            allProgressRecords.push({
              date: record.date,
              progress: record.progress
            });
          });
        }
      });
    }

    // 計算每日的實際總進度（所有任務的平均）
    const getActualProgressForDate = (date: Date): number | null => {
      if (!tasks || tasks.length === 0) return null;
      
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
      
      return taskCount > 0 ? totalProgress / taskCount : null;
    };

    // 計算各種進度線的資料
    allDates.forEach((date, index) => {
      // 1. 預定進度：基於專案總時程的線性進度
      const plannedProgress = (index / (allDates.length - 1)) * 100;
      plannedProgressData.push(plannedProgress);

      // 2. 規劃進度：基於任務實際開始和結束日期的線性進度
      if (taskStartDate && taskEndDate) {
        let scheduledProgress = 0;
        if (date < taskStartDate) {
          scheduledProgress = 0;
        } else if (date > taskEndDate) {
          scheduledProgress = 100;
        } else {
          const totalTaskDays = Math.max(1, Math.floor(
            (taskEndDate.getTime() - taskStartDate.getTime()) / (1000 * 60 * 60 * 24)
          ));
          const daysFromTaskStart = Math.floor(
            (date.getTime() - taskStartDate.getTime()) / (1000 * 60 * 60 * 24)
          );
          scheduledProgress = Math.min(100, (daysFromTaskStart / totalTaskDays) * 100);
        }
        scheduledProgressData.push(Math.max(0, scheduledProgress));
      } else {
        // 如果沒有任務日期，使用與預定進度相同的邏輯
        scheduledProgressData.push(plannedProgress);
      }

      // 3. 實際進度：從進度歷史計算
      if (date <= today) {
        const actualProgress = getActualProgressForDate(date);
        actualProgressData.push(actualProgress);
      } else {
        // 未來日期沒有實際進度
        actualProgressData.push(null);
      }
    });

    // 缺失數據圖表 - 使用過去30天的數據
    let last30Days: Date[] = [];
    for (let i = 30; i > 0; i--) {
      last30Days.push(dayjs().subtract(i, 'day').toDate());
    }
    const last30DayLabels = last30Days.map(
      (date) => `${date.getMonth() + 1}/${date.getDate()}`
    );

    // 獲取缺失數據
    // 假設我們要從資料庫獲取實際的缺失數據
    interface FlawForm {
      applyDate: string | Date;
    }

    // 獲取過去30天的缺失數據 - 優化為單次查詢
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

    // 如果沒有真實資料，生成一些模擬資料以便測試圖表顯示
    // if (flawData30Days.every(count => count === 0)) {
    //   console.log('沒有真實缺失資料，使用模擬資料');
    //   flawData30Days = last30Days.map(() => Math.floor(Math.random() * 5));
    // }

    // 創建缺失圖表
    this.chartFlaw = new Chart(this.canvas2?.nativeElement.getContext('2d'), {
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
  

  async getWeather() {
    if (!this.site || !this.site.county) {
      this.todayWeather = '無天氣資訊';
      return;
    }

    try {
      // 使用新的天氣服務獲取天氣文字
      this.todayWeather = await this.weatherService.getWeatherText(this.site.county);
      
      // 獲取完整天氣數據用於更新天氣圖標
      const weatherData = await this.weatherService.getWeather(this.site.county);
      this.updateWeatherIcon(weatherData.current.condition.icon);
    } catch (error) {
      console.error('獲取天氣資訊時出錯:', error);
      this.todayWeather = '無法獲取天氣資訊';
    }
  }

  // 更新天氣圖標
  private updateWeatherIcon(weatherIconUrl: string): void {
    setTimeout(() => {
      // 先查找新的版面結構
      let weatherIconElement = document.querySelector('.weather-icon i');

      if (weatherIconElement) {
        // 找到父元素
        const parentElement = weatherIconElement.parentElement;
        if (parentElement) {
          // 移除Bootstrap圖標元素
          parentElement.innerHTML = '';

          // 創建並添加圖片元素
          const imgElement = document.createElement('img');
          // 使用API提供的天氣圖標URL
          imgElement.src = weatherIconUrl;
          imgElement.alt = this.todayWeather;
          imgElement.style.width = '64px';
          imgElement.style.height = '64px';

          // 將圖片添加到父元素
          parentElement.appendChild(imgElement);
        }
      } else {
        // 嘗試查找舊版面結構
        weatherIconElement = document.querySelector(
          '.col-12.col-md-4 .card .value .bi'
        );
        if (weatherIconElement && weatherIconElement.parentElement) {
          const parentElement = weatherIconElement.parentElement;

          // 移除Bootstrap圖標元素
          weatherIconElement.remove();

          // 創建並添加圖片元素
          const imgElement = document.createElement('img');
          imgElement.src = 'https:' + weatherIconUrl;
          imgElement.alt = this.todayWeather;
          imgElement.style.width = '48px';
          imgElement.style.height = '48px';
          imgElement.style.marginRight = '8px';

          // 將圖片插入到原位置
          if (parentElement.firstChild) {
            parentElement.insertBefore(imgElement, parentElement.firstChild);
          } else {
            parentElement.appendChild(imgElement);
          }
        }
      }
    }, 0);
  }

  async calculatePermitCount() {
    if (!this.site) return;

    try {
      // 使用今天的日期作為基準
      const today = dayjs().format('YYYY-MM-DD');
      
      // 獲取許可單，條件為：工作時間包含今天
      const permits = await this.mongodbService.getArray('siteForm', {
        formType: 'sitePermit',
        siteId: this.siteId,
        $and: [
          { workStartTime: { $lte: today } },  // 開始時間在今天或之前
          { workEndTime: { $gte: today } }     // 結束時間在今天或之後
        ]
      });
      
      this.todayPermitCount = permits.length;
      
      console.log('📋 許可單查詢結果:', {
        數量: permits.length,
        許可單資料: permits.map((p: any) => ({
          id: p._id,
          selectedCategories: p.selectedCategories,
          workStartTime: p.workStartTime,
          workEndTime: p.workEndTime
        }))
      });
      
      // 統計作業類別 - 使用 selectedCategories 陣列
      const categoryCountMap = new Map<string, number>();
      permits.forEach((permit: any) => {
        // 處理 selectedCategories 陣列
        if (permit.selectedCategories && Array.isArray(permit.selectedCategories)) {
          permit.selectedCategories.forEach((category: string) => {
            if (category && category.trim()) {
              categoryCountMap.set(category, (categoryCountMap.get(category) || 0) + 1);
            }
          });
        }
        
        // 處理其他作業類別
        if (permit.otherWork && permit.otherWorkContent && permit.otherWorkContent.trim()) {
          const otherCategory = `其他: ${permit.otherWorkContent}`;
          categoryCountMap.set(otherCategory, (categoryCountMap.get(otherCategory) || 0) + 1);
        }
      });
      
      // 獲取作業類別配置
      const categoryConfigs = this.getPermitCategoryConfigs();
      
      // 轉換為統計數據
      const stats: PermitCategoryStat[] = [];
      categoryCountMap.forEach((count, category) => {
        const config = categoryConfigs[category] || categoryConfigs['default'];
        stats.push({
          category,
          displayName: config.displayName || category,
          count,
          color: config.color,
          icon: config.icon
        });
      });
      
      // 按數量降序排列
      stats.sort((a, b) => b.count - a.count);
      this.permitCategoryStats = stats;
      
      console.log('📊 許可單統計:', {
        總數: this.todayPermitCount,
        作業類別統計: stats,
        類別計數Map: Array.from(categoryCountMap.entries())
      });
      
    } catch (error) {
      console.error('計算許可單數時出錯:', error);
      this.permitCategoryStats = [];
    }
  }

  // 獲取作業類別配置
  private getPermitCategoryConfigs(): Record<string, {displayName?: string, color: string, icon: string}> {
    return {
      '動火作業': {
        displayName: '動火作業',
        color: '#dc3545',
        icon: 'fas fa-fire'
      },
      '高架作業': {
        displayName: '高架作業',
        color: '#fd7e14',
        icon: 'fas fa-arrow-up'
      },
      '局限空間作業': {
        displayName: '局限空間',
        color: '#6f42c1',
        icon: 'fas fa-box'
      },
      '電力作業': {
        displayName: '電力作業',
        color: '#ffc107',
        icon: 'fas fa-bolt'
      },
      '吊籠作業': {
        displayName: '吊籠作業',
        color: '#20c997',
        icon: 'fas fa-building'
      },
      '起重吊掛作業': {
        displayName: '起重吊掛',
        color: '#17a2b8',
        icon: 'fas fa-anchor'
      },
      '施工架組裝作業': {
        displayName: '施工架組裝',
        color: '#28a745',
        icon: 'fas fa-layer-group'
      },
      '管線拆離作業': {
        displayName: '管線拆離',
        color: '#e83e8c',
        icon: 'fas fa-cut'
      },
      '開口作業': {
        displayName: '開口作業',
        color: '#6610f2',
        icon: 'fas fa-circle-notch'
      },
      '化學作業': {
        displayName: '化學作業',
        color: '#fd7e14',
        icon: 'fas fa-flask'
      },
      'default': {
        displayName: '其他作業',
        color: '#6c757d',
        icon: 'fas fa-tools'
      }
    };
  }

  async calculateFlawCount() {
    if (!this.site) return;

    try {
      const flawCount = await this.mongodbService.getArray('siteForm', {
        formType: 'siteFlaw',
        siteId: this.siteId,
        applyDate: dayjs().format('YYYY-MM-DD'),
      });
      this.todayFlawCount = flawCount.length;
    } catch (error) {
      console.error('計算缺失單數時出錯:', error);
    }
  }

  async calculateCurrentProgress() {
    if (!this.site) return;

    try {
      // 獲取所有任務資料
      const tasks = await this.mongodbService.getArray('task', {
        siteId: this.siteId,
      });

      if (!tasks || tasks.length === 0) {
        this.currentProjectProgress = 0;
        return;
      }

      // 計算今天的實際總進度（所有任務的平均）
      const today = new Date();
      let totalProgress = 0;
      let taskCount = 0;

      tasks.forEach((task: any) => {
        if (task.progressHistory && task.progressHistory.length > 0) {
          // 尋找今天或最近的歷史記錄
          const sortedHistory = [...task.progressHistory].sort((a: any, b: any) => 
            new Date(a.date).getTime() - new Date(b.date).getTime()
          );
          
          let taskProgress = 0;
          for (const record of sortedHistory) {
            if (new Date(record.date) <= today) {
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

      // 計算平均進度並四捨五入到一位小數
      this.currentProjectProgress = taskCount > 0 ? 
        Math.round((totalProgress / taskCount) * 10) / 10 : 0;

    } catch (error) {
      console.error('計算當前工程進度時出錯:', error);
      this.currentProjectProgress = 0;
    }
  }



  // 計算廠商工人統計
  async calculateWorkerStats(): Promise<void> {
    if (!this.siteId || !this.site) return;

    try {
      console.log('👷 Dashboard: 計算廠商工人統計...');

      // 使用今天的日期作為基準
      const today = dayjs().format('YYYY-MM-DD');
      
      // 獲取今日廠商工人計數資料
      const workerCounts = await this.workerCountService.getDailyContractorWorkerCount(this.siteId, today);

      // 計算總工人數
      const totalWorkerCount = workerCounts.reduce((sum: number, wc: ContractorWorkerCount) => sum + wc.workerCount, 0);
      this.todayWorkerCount = totalWorkerCount;

      // 獲取廠商顏色配置
      const contractorConfigs = this.getContractorConfigs();

      // 計算每個廠商的統計數據
      const stats: ContractorWorkerStat[] = workerCounts.map((wc: ContractorWorkerCount) => {
        const percentage = totalWorkerCount > 0 ? (wc.workerCount / totalWorkerCount) * 100 : 0;
        const config = contractorConfigs[wc.contractorName] || contractorConfigs['default'];
        
        return {
          contractorName: wc.contractorName,
          workerCount: wc.workerCount,
          color: config.color,
          icon: config.icon,
          percentage: Math.round(percentage * 10) / 10
        };
      });

      // 按工人數量降序排列
      stats.sort((a, b) => b.workerCount - a.workerCount);
      this.contractorWorkerStats = stats;

      console.log('📊 廠商工人統計:', {
        總工人數: totalWorkerCount,
        廠商統計: stats
      });

    } catch (error) {
      console.error('計算廠商工人統計時出錯:', error);
      this.contractorWorkerStats = [];
      this.todayWorkerCount = 0;
    }
  }

  // 獲取廠商配置
  private getContractorConfigs(): Record<string, {color: string, icon: string}> {
    return {
      '帆宣系統科技股份有限公司': {
        color: '#007bff',
        icon: 'fas fa-building'
      },
      '廠商A': {
        color: '#dc3545',
        icon: 'fas fa-users'
      },
      '廠商B': {
        color: '#28a745',
        icon: 'fas fa-hard-hat'
      },
      '廠商C': {
        color: '#ffc107',
        icon: 'fas fa-tools'
      },
      '廠商D': {
        color: '#17a2b8',
        icon: 'fas fa-industry'
      },
      '廠商E': {
        color: '#6f42c1',
        icon: 'fas fa-wrench'
      },
      '廠商F': {
        color: '#fd7e14',
        icon: 'fas fa-hammer'
      },
      '廠商G': {
        color: '#e83e8c',
        icon: 'fas fa-cogs'
      },
      'default': {
        color: '#6c757d',
        icon: 'fas fa-users'
      }
    };
  }

  // 導航到子元件
  navigateTo(type: 'weather' | 'permit' | 'flaw'): void {
    if (!this.siteId) return;

    // 根據類型導航到不同的子元件
    switch (type) {
      case 'weather':
        this.router.navigate([`/site/${this.siteId}/dashboard/weather`]);
        break;
      case 'permit':
        this.router.navigate([`/site/${this.siteId}/dashboard/permit`]);
        break;
      case 'flaw':
        this.router.navigate([`/site/${this.siteId}/dashboard/flaw`]);
        break;
    }
  }


}
