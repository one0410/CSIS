import { Injectable } from '@angular/core';
import dayjs from 'dayjs';

export interface WeatherData {
  location: {
    name: string;
    region: string;
    country: string;
    lat: number;
    lon: number;
    localtime: string;
  };
  current: {
    temp_c: number;
    temp_f: number;
    condition: {
      text: string;
      icon: string;
      code: number;
    };
    wind_kph: number;
    wind_dir: string;
    humidity: number;
    cloud: number;
    feelslike_c: number;
    vis_km: number;
    uv: number;
    precip_mm: number;
    air_quality?: {
      co: number;
      no2: number;
      o3: number;
      so2: number;
      pm2_5: number;
      pm10: number;
      'us-epa-index': number;
    };
  };
  forecast?: {
    forecastday: Array<{
      date: string;
      day: {
        air_quality?: {
          co: number;
          no2: number;
          o3: number;
          so2: number;
          pm2_5: number;
          pm10: number;
          'us-epa-index': number;
        };
        maxtemp_c: number;
        mintemp_c: number;
        avgtemp_c: number;
        condition: {
          text: string;
          icon: string;
        };
        daily_chance_of_rain: number;
      };
      astro: {
        sunrise: string;
        sunset: string;
      };
      hour: Array<{
        time: string;
        temp_c: number;
        condition: {
          text: string;
          icon: string;
        };
        chance_of_rain: number;
      }>;
    }>;
  };
}

@Injectable({
  providedIn: 'root'
})
export class WeatherService {
  private readonly API_KEY = 'f60ed37e061d456194f100016251005';
  private readonly CACHE_KEY = 'weatherData';
  private readonly CACHE_DURATION_MS = 30 * 60 * 1000; // 30分鐘
  
  // 縣市名稱對應的英文名稱或查詢字符串
  private readonly countyToQuery: Record<string, string> = {
    臺北市: 'Taipei',
    台北市: 'Taipei',
    新北市: 'New Taipei City',
    桃園市: 'Taoyuan',
    臺中市: 'Taichung',
    台中市: 'Taichung',
    臺南市: 'Tainan',
    台南市: 'Tainan',
    高雄市: 'Kaohsiung',
    基隆市: 'Keelung',
    新竹市: 'Hsinchu',
    嘉義市: 'Chiayi',
    新竹縣: 'Hsinchu County',
    苗栗縣: 'Miaoli',
    彰化縣: 'Changhua',
    南投縣: 'Nantou',
    雲林縣: 'Yunlin',
    嘉義縣: 'Chiayi County',
    屏東縣: 'Pingtung',
    宜蘭縣: 'Yilan',
    花蓮縣: 'Hualien',
    臺東縣: 'Taitung',
    台東縣: 'Taitung',
    澎湖縣: 'Penghu',
    金門縣: 'Kinmen',
    連江縣: 'Lienchiang',
  };
  
  // 天氣狀況中英文對照表
  private readonly conditionMap: Record<string, string> = {
    Sunny: '晴天',
    Clear: '晴朗',
    'Partly cloudy': '晴時多雲',
    Cloudy: '多雲',
    Overcast: '陰天',
    Mist: '霧',
    Fog: '霧',
    'Patchy rain possible': '可能有零星雨',
    'Patchy snow possible': '可能有零星雪',
    'Light rain': '小雨',
    'Moderate rain': '中雨',
    'Heavy rain': '大雨',
    'Light snow': '小雪',
    'Moderate snow': '中雪',
    'Heavy snow': '大雪',
    Thunderstorm: '雷雨',
    'Moderate or heavy snow with thunder': '雷雨夾雪',
    'Moderate or heavy rain with thunder': '雷雨',
    // 可以根據需要添加更多映射
  };

  constructor() { }

  /**
   * 獲取指定縣市的天氣數據
   * @param county 縣市名稱
   * @param forecastDays 預報天數（默認為1）
   * @returns 天氣數據
   */
  async getWeather(county: string, forecastDays: number = 3): Promise<WeatherData> {
    try {
      // 檢查緩存
      const cachedData = this.getFromCache(county);
      if (cachedData) {
        console.log(`使用快取的天氣資料，地區: ${county}`);
        return cachedData;
      }
      
      // 需要重新獲取天氣數據
      console.log(`重新獲取天氣資料，地區: ${county}`);
      
      // 將縣市名稱轉換為API查詢參數
      const query = this.getQueryForCounty(county);
      
      // 構建API URL
      const apiUrl = `https://api.weatherapi.com/v1/forecast.json?key=${this.API_KEY}&q=${query}&days=${forecastDays}&aqi=yes&alerts=no`;
      
      // 發送請求
      const response = await fetch(apiUrl);
      if (!response.ok) {
        throw new Error(`Weather API returned status: ${response.status}`);
      }
      
      // 解析響應
      const data: WeatherData = await response.json();
      
      // 緩存結果
      this.saveToCache(county, data);
      
      return data;
    } catch (error) {
      console.error('獲取天氣資訊時出錯:', error);
      throw error;
    }
  }
  
  /**
   * 獲取簡單的天氣描述文字
   * @param county 縣市名稱
   * @returns 天氣描述文字（例如：25°C 晴天）
   */
  async getWeatherText(county: string): Promise<string> {
    try {
      const data = await this.getWeather(county);
      const temp = data.current.temp_c;
      const condition = data.current.condition.text;
      const conditionChinese = this.getConditionText(condition);
      
      return `${temp}°C ${conditionChinese}`;
    } catch (error) {
      console.error('獲取天氣文字描述時出錯:', error);
      return '無法獲取天氣資訊';
    }
  }
  
  /**
   * 根據英文天氣狀況獲取中文描述
   * @param condition 英文天氣狀況
   * @returns 中文天氣狀況
   */
  getConditionText(condition: string): string {
    return this.conditionMap[condition] || condition;
  }
  
  /**
   * 根據縣市名稱獲取API查詢參數
   * @param county 縣市名稱
   * @returns API查詢參數
   */
  private getQueryForCounty(county: string): string {
    return this.countyToQuery[county] || 'Taipei'; // 默認為台北
  }
  
  /**
   * 從緩存中獲取天氣數據
   * @param county 縣市名稱
   * @returns 緩存的天氣數據，如果不存在或已過期則返回null
   */
  private getFromCache(county: string): WeatherData | null {
    try {
      const savedWeatherData = localStorage.getItem(this.CACHE_KEY);
      if (!savedWeatherData) return null;
      
      const weatherData = JSON.parse(savedWeatherData);
      const now = new Date().getTime();
      
      // 檢查是否有該縣市的數據且在有效期內
      if (
        weatherData[county] &&
        weatherData[county].timestamp &&
        now - weatherData[county].timestamp < this.CACHE_DURATION_MS
      ) {
        return weatherData[county].data;
      }
      
      return null;
    } catch (error) {
      console.error('讀取緩存天氣數據時出錯:', error);
      return null;
    }
  }
  
  /**
   * 將天氣數據保存到緩存
   * @param county 縣市名稱
   * @param data 天氣數據
   */
  private saveToCache(county: string, data: WeatherData): void {
    try {
      // 讀取已有的緩存
      let weatherData: Record<string, any> = {};
      const savedWeatherData = localStorage.getItem(this.CACHE_KEY);
      
      if (savedWeatherData) {
        weatherData = JSON.parse(savedWeatherData);
      }
      
      // 保存新數據
      if (!weatherData[county]) {
        weatherData[county] = {};
      }
      
      weatherData[county] = {
        data: data,
        timestamp: new Date().getTime(),
      };
      
      // 儲存回localStorage
      localStorage.setItem(this.CACHE_KEY, JSON.stringify(weatherData));
    } catch (error) {
      console.error('保存天氣數據到緩存時出錯:', error);
    }
  }
} 