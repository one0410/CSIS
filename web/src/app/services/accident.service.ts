import { Injectable, inject } from '@angular/core';
import { MongodbService } from './mongodb.service';
import { Accident, AccidentStats } from '../model/accident.model';
import dayjs from 'dayjs';

@Injectable({
  providedIn: 'root'
})
export class AccidentService {
  private mongodbService = inject(MongodbService);

  async getAccidentsBySite(siteId: string): Promise<Accident[]> {
    const filter = { siteId: siteId };
    return await this.mongodbService.getArray('accident', filter) as Accident[];
  }

  async createAccident(accident: Omit<Accident, '_id'>): Promise<any> {
    const accidentData = {
      ...accident,
      status: 'reported' as const,
      createdAt: new Date(),
      updatedAt: new Date()
    };
    return await this.mongodbService.post('accident', accidentData);
  }

  async updateAccident(accidentId: string, updateData: Partial<Accident>): Promise<any> {
    const updateWithTimestamp = {
      ...updateData,
      updatedAt: new Date()
    };
    return await this.mongodbService.patch('accident', accidentId, updateWithTimestamp);
  }

  async deleteAccident(accidentId: string): Promise<any> {
    return await this.mongodbService.delete('accident', accidentId);
  }

  async getAccidentById(accidentId: string): Promise<Accident | null> {
    try {
      return await this.mongodbService.getById('accident', accidentId) as Accident;
    } catch (error) {
      console.error('取得工安事故資料失敗:', error);
      return null;
    }
  }

  async getLatestAccidentBySite(siteId: string): Promise<Accident | null> {
    try {
      const accidents = await this.mongodbService.getArray('accident', 
        { siteId: siteId }, 
        { 
          sort: { incidentDate: -1, incidentTime: -1 }, 
          limit: 1 
        }
      );
      return accidents && accidents.length > 0 ? accidents[0] as Accident : null;
    } catch (error) {
      console.error('取得最新事故資料失敗:', error);
      return null;
    }
  }

  async getLatestRealAccidentBySite(siteId: string): Promise<Accident | null> {
    try {
      console.log('🔍 AccidentService: 查詢最新實際事故（排除虛驚事件）');
      
      // 排除虛驚事件，只查詢實際事故
      const accidents = await this.mongodbService.getArray('accident', 
        { 
          siteId: siteId,
          category: { $ne: 'near_miss' } // 排除虛驚事件
        }, 
        { 
          sort: { incidentDate: -1, incidentTime: -1 }, 
          limit: 1 
        }
      );
      
      const result = accidents && accidents.length > 0 ? accidents[0] as Accident : null;
      console.log('📋 AccidentService: 最新實際事故:', result ? 
        `${result.category} - ${result.incidentDate} ${result.incidentTime}` : '無實際事故記錄');
      
      return result;
    } catch (error) {
      console.error('取得最新實際事故資料失敗:', error);
      return null;
    }
  }



  // 優化：返回零事故時數和最後事故記錄的組合方法
  async getZeroAccidentHoursWithLastAccident(siteId: string): Promise<{
    zeroAccidentHours: number;
    lastAccidentDate: Date | null;
  }> {
    try {
      console.log('🛡️ 開始計算零事故時數和最後事故記錄 - siteId:', siteId);
      
      // 檢查輸入參數
      if (!siteId) {
        console.error('❌ siteId 為空');
        return { zeroAccidentHours: 0, lastAccidentDate: null };
      }
      
      // 只查詢一次最後事故記錄
      const latestAccident = await this.getLatestRealAccidentBySite(siteId);
      console.log('📋 最新實際事故記錄:', latestAccident ? `${latestAccident.incidentDate} ${latestAccident.incidentTime}` : '無實際事故記錄');
      
      let referenceDate: Date;
      let lastAccidentDate: Date | null = null;
      
      if (latestAccident) {
        // 處理日期格式 - 確保 incidentDate 是有效的日期字串
        let dateStr = dayjs(latestAccident.incidentDate).format('YYYY-MM-DD');
        
        if (dateStr) {
          // 處理時間格式 - 確保是 HH:MM 格式
          let timeStr = latestAccident.incidentTime || '00:00';
          if (!timeStr.match(/^\d{2}:\d{2}$/)) {
            console.warn('⚠️ 事故時間格式不正確，使用 00:00:', timeStr);
            timeStr = '00:00';
          }
          
          referenceDate = new Date(`${dateStr}T${timeStr}:00`);
          console.log('🎯 使用最後事故時間:', `${dateStr} ${timeStr}`);
          
          // 檢查建構的日期是否有效
          if (!isNaN(referenceDate.getTime())) {
            lastAccidentDate = referenceDate;
          } else {
            console.error('❌ 建構的參考日期無效，將查詢工地開始日期');
            referenceDate = await this.getProjectStartDate(siteId);
          }
        } else {
          console.log('⚠️ 無法解析事故日期，將查詢工地開始日期');
          referenceDate = await this.getProjectStartDate(siteId);
        }
      } else {
        console.log('✅ 沒有事故記錄，將查詢工地開始日期');
        referenceDate = await this.getProjectStartDate(siteId);
      }
      
      const now = new Date();
      const diffInMilliseconds = now.getTime() - referenceDate.getTime();
      
      if (isNaN(diffInMilliseconds)) {
        console.error('❌ 時間差計算結果為 NaN');
        return { zeroAccidentHours: 0, lastAccidentDate };
      }
      
      const hours = Math.floor(diffInMilliseconds / (1000 * 60 * 60));
      const zeroAccidentHours = Math.max(0, hours);
      
      console.log('⏰ 計算結果:', {
        參考時間: referenceDate.toLocaleString(),
        當前時間: now.toLocaleString(),
        時間差小時: zeroAccidentHours,
        最後事故時間: lastAccidentDate?.toLocaleString() || '無'
      });
      
      return { zeroAccidentHours, lastAccidentDate };
    } catch (error) {
      console.error('計算零事故時數和最後事故記錄失敗:', error);
      return { zeroAccidentHours: 0, lastAccidentDate: null };
    }
  }

  // 私有方法：獲取專案開始日期
  private async getProjectStartDate(siteId: string): Promise<Date> {
    try {
      console.log('📅 查詢專案基本資料以獲取專案開始日期...');
      
      // 使用 MongodbService 查詢專案資料
      const site = await this.mongodbService.getById('site', siteId);
      
      if (site && site.startDate) {
        const projectStartDate = new Date(site.startDate);
        if (!isNaN(projectStartDate.getTime())) {
          console.log('✅ 使用專案開始日期:', projectStartDate.toLocaleString());
          return projectStartDate;
        } else {
          console.warn('⚠️ 專案開始日期格式無效:', site.startDate);
        }
      } else {
        console.warn('⚠️ 專案資料中沒有設定開始日期');
      }
      
      // 如果沒有有效的專案開始日期，使用當前日期
      const fallbackDate = new Date();
      console.warn('⚠️ 使用當前日期作為備用:', fallbackDate.toLocaleString());
      return fallbackDate;
      
    } catch (error) {
      console.error('❌ 查詢專案基本資料失敗:', error);
      const fallbackDate = new Date();
      console.warn('⚠️ 使用當前日期作為備用:', fallbackDate.toLocaleString());
      return fallbackDate;
    }
  }

  async getAccidentStats(siteId: string): Promise<AccidentStats> {
    try {
      const accidents = await this.getAccidentsBySite(siteId);
      
      const accidentsByCategory: { [key: string]: number } = {};
      const accidentsBySeverity: { [key: string]: number } = {};
      
      accidents.forEach(accident => {
        accidentsByCategory[accident.category] = (accidentsByCategory[accident.category] || 0) + 1;
        accidentsBySeverity[accident.severity] = (accidentsBySeverity[accident.severity] || 0) + 1;
      });
      
      const latestAccident = accidents.sort((a, b) => 
        new Date(b.incidentDate).getTime() - new Date(a.incidentDate).getTime()
      )[0];
      
      return {
        totalAccidents: accidents.length,
        accidentsByCategory,
        accidentsBySeverity,
        zeroAccidentHours: 0, // 這個值需要在呼叫時另外計算
        lastAccidentDate: latestAccident?.incidentDate
      };
    } catch (error) {
      console.error('取得事故統計失敗:', error);
      return {
        totalAccidents: 0,
        accidentsByCategory: {},
        accidentsBySeverity: {},
        zeroAccidentHours: 0
      };
    }
  }
} 