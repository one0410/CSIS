import { Component, OnInit, OnDestroy } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { CommonModule, DatePipe } from '@angular/common';

import { Site } from '../site-list.component';
import { MongodbService } from '../../services/mongodb.service';
import { WeatherService } from '../../services/weather.service';

import { WorkerCountService } from '../../services/worker-count.service';
import { ProgressTrendChartComponent } from '../../shared/progress-trend-chart/progress-trend-chart.component';
import { ZeroAccidentHoursComponent } from './zero-accident-hours/zero-accident-hours.component';
import { MonthlyWorkerChartComponent } from './monthly-worker-chart/monthly-worker-chart.component';
import { ContractorWorkerChartComponent } from './contractor-worker-chart/contractor-worker-chart.component';
import { ContractorViolationChartComponent } from './contractor-violation-chart/contractor-violation-chart.component';
import { ViolationTypeChartComponent } from './violation-type-chart/violation-type-chart.component';
import { TodayContractorViolationChartComponent } from './today-contractor-violation-chart/today-contractor-violation-chart.component';
import { TodayViolationTypeChartComponent } from './today-violation-type-chart/today-violation-type-chart.component';
import { HeatIndexGaugeComponent } from './heat-index-gauge/heat-index-gauge.component';
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

// 環境監測數據介面
interface EnvironmentData {
  temperature: number;
  humidity: number;
  windSpeed: number;
  windDirection: string;
  pm25: number;
  pm10: number;
}

@Component({
  selector: 'app-site-dashboard',
  imports: [
    ProgressTrendChartComponent,
    ZeroAccidentHoursComponent,
    MonthlyWorkerChartComponent,
    ContractorWorkerChartComponent,
    ContractorViolationChartComponent,
    ViolationTypeChartComponent,
    TodayContractorViolationChartComponent,
    TodayViolationTypeChartComponent,
    HeatIndexGaugeComponent,
    CommonModule,
    DatePipe
  ],
  templateUrl: './site-dashboard.component.html',
  styleUrl: './site-dashboard.component.scss',
})
export class SiteDashboardComponent implements OnInit, OnDestroy {
  siteId: string = '';
  site: Site | null = null;

  // 日期時間顯示
  currentDateTime: string = '';
  todayDateShort: string = '';
  tomorrowDateShort: string = '';
  private timeInterval: ReturnType<typeof setInterval> | null = null;

  // 舊有屬性（保持相容）
  todayDate: string = '';
  todayWeekday: string = '';
  allProjectDays: number = 0;
  todayProjectDays: number = 0;
  todayWorkerCount: number = 0;
  todayPermitCount: number = 0;
  todayFlawCount: number = 0;
  currentProjectProgress: number = 0;
  todayWeather: string = '';

  // 環境監測數據
  environmentData: EnvironmentData = {
    temperature: 0,
    humidity: 0,
    windSpeed: 0,
    windDirection: '-',
    pm25: 0,
    pm10: 0
  };

  // 許可單作業類別統計
  permitCategoryStats: PermitCategoryStat[] = [];
  generalWorkCount: number = 0;  // 一般作業數量
  specialWorkStats: PermitCategoryStat[] = [];  // 特殊作業子項目統計

  // 計算特殊作業許可單數量（總許可單數 - 一般作業數）
  get specialWorkTotalCount(): number {
    return this.todayPermitCount - this.generalWorkCount;
  }

  // 廠商工人統計
  contractorWorkerStats: ContractorWorkerStat[] = [];

  // 供應商與帆宣員工分離統計
  supplierWorkerCount: number = 0;        // 供應商在案人數
  mainContractorWorkerCount: number = 0;  // 帆宣員工在案人數
  supplierContractorStats: ContractorWorkerStat[] = [];  // 供應商詳細統計（不含帆宣）

  // 明日預計出工統計（來源：工地許可單）
  tomorrowWorkerStats: ContractorWorkerStat[] = [];
  tomorrowTotalWorkers: number = 0;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private mongodbService: MongodbService,
    private weatherService: WeatherService,
    private workerCountService: WorkerCountService
  ) {
    this.updateDateTime();
  }

  ngOnInit() {
    // 每秒更新時間
    this.timeInterval = setInterval(() => this.updateDateTime(), 1000);

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

            // 天氣與環境數據
            this.getWeatherAndEnvironment();

            // 計算許可單數
            this.calculatePermitCount();

            // 計算缺失單數
            this.calculateFlawCount();

            // 計算當前工程進度
            this.calculateCurrentProgress();

            // 計算廠商工人統計
            this.calculateWorkerStats();

            // 計算明日預計出工
            this.calculateTomorrowWorkerStats();
          }
        }
      });
    }
  }

  ngOnDestroy() {
    if (this.timeInterval) {
      clearInterval(this.timeInterval);
    }
  }

  // 更新日期時間顯示
  private updateDateTime(): void {
    const now = dayjs();
    const weekdays = ['日', '一', '二', '三', '四', '五', '六'];
    const weekday = weekdays[now.day()];

    // 格式: 2025/09/23(二) 下午05:20
    const hour = now.hour();
    const period = hour < 12 ? '上午' : '下午';
    const hour12 = hour % 12 || 12;

    this.currentDateTime = `${now.format('YYYY/MM/DD')}(${weekday}) ${period}${hour12.toString().padStart(2, '0')}:${now.format('mm')}`;

    // 短日期格式: 9/23
    this.todayDateShort = now.format('M/D');
    this.tomorrowDateShort = now.add(1, 'day').format('M/D');

    // 設定舊有的日期格式（保持相容）
    this.todayDate = now.format('YYYY/MM/DD');
    this.todayWeekday = `星期${weekday}`;
  }

  async getWeatherAndEnvironment() {
    if (!this.site || !this.site.county) {
      this.todayWeather = '無天氣資訊';
      return;
    }

    try {
      // 使用天氣服務獲取天氣數據
      const weatherData = await this.weatherService.getWeather(this.site.county);
      this.todayWeather = await this.weatherService.getWeatherText(this.site.county);

      // 更新環境監測數據
      this.environmentData = {
        temperature: weatherData.current.temp_c || 0,
        humidity: weatherData.current.humidity || 0,
        windSpeed: weatherData.current.wind_kph || 0,
        windDirection: weatherData.current.wind_dir || '-',
        pm25: weatherData.current.air_quality?.pm2_5 || 0,
        pm10: weatherData.current.air_quality?.pm10 || 0
      };

    } catch (error) {
      console.error('獲取天氣資訊時出錯:', error);
      this.todayWeather = '無法獲取天氣資訊';
      // 設定預設值
      this.environmentData = {
        temperature: 0,
        humidity: 0,
        windSpeed: 0,
        windDirection: '-',
        pm25: 0,
        pm10: 0
      };
    }
  }

  async calculatePermitCount() {
    if (!this.site) return;

    try {
      // 使用今天的日期作為基準
      // workStartTime 和 workEndTime 格式為 "YYYY-MM-DDTHH:mm"
      // 為了正確比較，使用今天的開始和結束時間
      const todayStart = dayjs().format('YYYY-MM-DD') + 'T00:00';
      const todayEnd = dayjs().format('YYYY-MM-DD') + 'T23:59';

      // 獲取許可單，條件為：工作時間包含今天
      const permits = await this.mongodbService.getArray('siteForm', {
        formType: 'sitePermit',
        siteId: this.siteId,
        $and: [
          { workStartTime: { $lte: todayEnd } },   // 開始時間在今天結束之前
          { workEndTime: { $gte: todayStart } }    // 結束時間在今天開始之後
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

      // 統計作業類別 - 分成一般作業和特殊作業
      let generalWorkCount = 0;
      const specialCategoryCountMap = new Map<string, number>();

      permits.forEach((permit: any) => {
        // 處理一般作業
        if (permit.isGeneralWork) {
          generalWorkCount++;
        }

        // 處理特殊作業子項目 (selectedCategories 陣列)
        if (permit.isSpecialWork && permit.selectedCategories && Array.isArray(permit.selectedCategories)) {
          permit.selectedCategories.forEach((category: string) => {
            if (category && category.trim()) {
              specialCategoryCountMap.set(category, (specialCategoryCountMap.get(category) || 0) + 1);
            }
          });
        }

        // 向後兼容：處理舊版許可單（沒有 isGeneralWork/isSpecialWork 欄位）
        // 舊版許可單視為特殊作業
        if (!permit.isGeneralWork && !permit.isSpecialWork && permit.selectedCategories && Array.isArray(permit.selectedCategories)) {
          permit.selectedCategories.forEach((category: string) => {
            if (category && category.trim()) {
              specialCategoryCountMap.set(category, (specialCategoryCountMap.get(category) || 0) + 1);
            }
          });
        }

        // 處理其他作業類別（屬於特殊作業）
        if (permit.otherWork && permit.otherWorkContent && permit.otherWorkContent.trim()) {
          const otherCategory = `其他: ${permit.otherWorkContent}`;
          specialCategoryCountMap.set(otherCategory, (specialCategoryCountMap.get(otherCategory) || 0) + 1);
        }
      });

      // 設定一般作業數量
      this.generalWorkCount = generalWorkCount;

      // 獲取作業類別配置
      const categoryConfigs = this.getPermitCategoryConfigs();

      // 轉換特殊作業子項目為統計數據
      const specialStats: PermitCategoryStat[] = [];
      specialCategoryCountMap.forEach((count, category) => {
        const config = categoryConfigs[category] || categoryConfigs['default'];
        specialStats.push({
          category,
          displayName: config.displayName || category,
          count,
          color: config.color,
          icon: config.icon
        });
      });

      // 按數量降序排列
      specialStats.sort((a, b) => b.count - a.count);
      this.specialWorkStats = specialStats;

      // 保留 permitCategoryStats 以便其他地方使用（合併一般作業和特殊作業）
      const allStats: PermitCategoryStat[] = [];
      if (generalWorkCount > 0) {
        const generalConfig = categoryConfigs['一般作業'];
        allStats.push({
          category: '一般作業',
          displayName: generalConfig.displayName || '一般作業',
          count: generalWorkCount,
          color: generalConfig.color,
          icon: generalConfig.icon
        });
      }
      allStats.push(...specialStats);
      this.permitCategoryStats = allStats;

      console.log('📊 許可單統計:', {
        總數: this.todayPermitCount,
        一般作業數: this.generalWorkCount,
        特殊作業統計: this.specialWorkStats,
        全部統計: this.permitCategoryStats
      });

    } catch (error) {
      console.error('計算許可單數時出錯:', error);
      this.permitCategoryStats = [];
      this.generalWorkCount = 0;
      this.specialWorkStats = [];
    }
  }

  // 獲取作業類別配置
  private getPermitCategoryConfigs(): Record<string, {displayName?: string, color: string, icon: string}> {
    return {
      '一般作業': {
        displayName: '一般作業',
        color: '#0d6efd',
        icon: 'fas fa-clipboard-check'
      },
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

      // 獲取今日分離的工人統計（區分主承攬商與供應商）
      const separatedData = await this.workerCountService.getDailySeparatedWorkerCount(this.siteId, today);

      // 設定主承攬商人數（來自工具箱會議的主承攬商簽名區域）
      this.mainContractorWorkerCount = separatedData.mainContractorCount;

      // 設定供應商人數
      this.supplierWorkerCount = separatedData.supplierTotalCount;

      // 計算總人數
      this.todayWorkerCount = this.mainContractorWorkerCount + this.supplierWorkerCount;

      // 獲取廠商顏色配置
      const contractorConfigs = this.getContractorConfigs();

      // 建立供應商詳細統計
      const supplierStats: ContractorWorkerStat[] = [];
      const allStats: ContractorWorkerStat[] = [];

      separatedData.supplierCounts.forEach((workerSet, companyName) => {
        if (workerSet.size > 0 && companyName && companyName.trim() !== '') {
          const percentage = this.todayWorkerCount > 0 ? (workerSet.size / this.todayWorkerCount) * 100 : 0;
          const config = contractorConfigs[companyName] || contractorConfigs['default'];

          const stat: ContractorWorkerStat = {
            contractorName: companyName,
            workerCount: workerSet.size,
            color: config.color,
            icon: config.icon,
            percentage: Math.round(percentage * 10) / 10
          };

          supplierStats.push(stat);
          allStats.push(stat);
        }
      });

      // 按工人數量降序排列
      allStats.sort((a, b) => b.workerCount - a.workerCount);
      supplierStats.sort((a, b) => b.workerCount - a.workerCount);

      this.contractorWorkerStats = allStats;
      this.supplierContractorStats = supplierStats;

      console.log('📊 廠商工人統計:', {
        總工人數: this.todayWorkerCount,
        主承攬商員工: this.mainContractorWorkerCount,
        供應商: this.supplierWorkerCount,
        供應商詳細: supplierStats
      });

    } catch (error) {
      console.error('計算廠商工人統計時出錯:', error);
      this.contractorWorkerStats = [];
      this.supplierContractorStats = [];
      this.todayWorkerCount = 0;
      this.mainContractorWorkerCount = 0;
      this.supplierWorkerCount = 0;
    }
  }

  // 計算明日預計出工統計（來源：工地許可單）
  async calculateTomorrowWorkerStats(): Promise<void> {
    if (!this.siteId || !this.site) return;

    try {
      const tomorrowStart = dayjs().add(1, 'day').format('YYYY-MM-DD') + 'T00:00';
      const tomorrowEnd = dayjs().add(1, 'day').format('YYYY-MM-DD') + 'T23:59';

      // 從工地許可單查詢明日有效的許可單
      const permits = await this.mongodbService.getArray('siteForm', {
        formType: 'sitePermit',
        siteId: this.siteId,
        $and: [
          { workStartTime: { $lte: tomorrowEnd } },
          { workEndTime: { $gte: tomorrowStart } }
        ]
      });

      // 依承攬商分組，累加施作人數
      const contractorMap = new Map<string, number>();
      let totalWorkers = 0;

      permits.forEach((permit: any) => {
        const contractor = (permit.contractor || '').trim();
        const count = permit.workPersonCount || 0;
        if (contractor && count > 0) {
          contractorMap.set(contractor, (contractorMap.get(contractor) || 0) + count);
          totalWorkers += count;
        }
      });

      this.tomorrowTotalWorkers = totalWorkers;

      // 轉換為統計陣列
      const contractorConfigs = this.getContractorConfigs();
      const stats: ContractorWorkerStat[] = [];

      contractorMap.forEach((count, name) => {
        const config = contractorConfigs[name] || contractorConfigs['default'];
        stats.push({
          contractorName: name,
          workerCount: count,
          color: config.color,
          icon: config.icon,
          percentage: totalWorkers > 0 ? Math.round((count / totalWorkers) * 1000) / 10 : 0
        });
      });

      stats.sort((a, b) => b.workerCount - a.workerCount);
      this.tomorrowWorkerStats = stats;

    } catch (error) {
      console.error('計算明日預計出工統計時出錯:', error);
      this.tomorrowWorkerStats = [];
      this.tomorrowTotalWorkers = 0;
    }
  }

  // 獲取廠商配置
  private getContractorConfigs(): Record<string, {color: string, icon: string}> {
    // 使用一組預設顏色，會根據順序分配
    const defaultColors = [
      '#007bff', '#dc3545', '#28a745', '#ffc107', '#17a2b8',
      '#6f42c1', '#fd7e14', '#e83e8c', '#20c997', '#6c757d'
    ];

    return {
      '帆宣系統科技股份有限公司': {
        color: '#007bff',
        icon: 'fas fa-building'
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
