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
    return await this.mongodbService.get('accident', filter) as Accident[];
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
      const accidents = await this.mongodbService.get('accident', 
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

  async getZeroAccidentHours(siteId: string, projectStartDate: Date): Promise<number> {
    try {
      console.log('🛡️ 開始計算零事故時數 - siteId:', siteId);
      
      // 檢查輸入參數
      if (!siteId) {
        console.error('❌ siteId 為空');
        return 0;
      }
      
      if (!projectStartDate || isNaN(projectStartDate.getTime())) {
        console.error('❌ projectStartDate 無效:', projectStartDate);
        return 0;
      }
      
      const latestAccident = await this.getLatestAccidentBySite(siteId);
      console.log('📋 最新事故記錄:', latestAccident ? `${latestAccident.incidentDate} ${latestAccident.incidentTime}` : '無事故記錄');
      
      let referenceDate: Date;
      
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
           if (isNaN(referenceDate.getTime())) {
             console.error('❌ 建構的參考日期無效，使用專案開始日期');
             referenceDate = projectStartDate;
           }
         } else {
           console.log('⚠️ 無法解析事故日期，使用專案開始日期');
           referenceDate = projectStartDate;
         }
       } else {
        console.log('✅ 沒有事故記錄，使用專案開始日期:', projectStartDate.toLocaleString());
        referenceDate = projectStartDate;
      }
      
      const now = new Date();
      const diffInMilliseconds = now.getTime() - referenceDate.getTime();
      
      if (isNaN(diffInMilliseconds)) {
        console.error('❌ 時間差計算結果為 NaN');
        return 0;
      }
      
      const hours = Math.floor(diffInMilliseconds / (1000 * 60 * 60));
      const result = Math.max(0, hours);
      
      console.log('⏰ 計算結果:', {
        參考時間: referenceDate.toLocaleString(),
        當前時間: now.toLocaleString(),
        時間差小時: result
      });
      
      return result;
    } catch (error) {
      console.error('計算零事故時數失敗:', error);
      return 0;
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