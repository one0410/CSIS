import { Component, OnInit } from '@angular/core';
import { CommonModule, Location } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { Site } from '../../site-list.component';
import { MongodbService } from '../../../services/mongodb.service';
import { WeatherService, WeatherData } from '../../../services/weather.service';

@Component({
  selector: 'app-site-dashboard-weather',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './site-dashboard-weather.component.html',
  styleUrl: './site-dashboard-weather.component.scss'
})
export class SiteDashboardWeatherComponent implements OnInit {
  siteId: string = '';
  site: Site | null = null;
  weatherData: WeatherData | null = null;
  loading: boolean = true;
  error: string = '';

  constructor(
    private route: ActivatedRoute,
    private mongodbService: MongodbService,
    private weatherService: WeatherService,
    public location: Location
  ) {}

  ngOnInit(): void {
    // 獲取父路由的siteId參數
    const parent = this.route.parent;
    if (parent) {
      parent.paramMap.subscribe(async (params) => {
        this.siteId = params.get('id') || '';
        if (this.siteId) {
          await this.loadSiteData();
          await this.loadWeatherData();
        }
      });
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

  // 加載天氣資料
  async loadWeatherData(): Promise<void> {
    if (!this.site || !this.site.county) {
      this.error = '專案資料不完整，無法獲取天氣';
      this.loading = false;
      return;
    }

    this.loading = true;

    try {
      // 使用天氣服務獲取3天預報
      this.weatherData = await this.weatherService.getWeather(this.site.county, 3);
      this.loading = false;
    } catch (error) {
      console.error('獲取天氣資訊時出錯:', error);
      this.error = '無法獲取天氣資訊';
      this.loading = false;
    }
  }

  // 根據英文天氣狀況獲取中文描述
  getConditionText(condition: string): string {
    return this.weatherService.getConditionText(condition);
  }
}
