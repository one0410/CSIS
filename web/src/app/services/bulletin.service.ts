import { Injectable, inject } from '@angular/core';
import { MongodbService } from './mongodb.service';
import { Bulletin } from '../model/bulletin.model';

@Injectable({
  providedIn: 'root'
})
export class BulletinService {
  private mongodbService = inject(MongodbService);

  async getBulletinsBySite(siteId: string): Promise<Bulletin[]> {
    const filter = { 
      siteId: siteId,
      isActive: true
    };
    const options = {
      sort: { isPinned: -1, publishDate: -1 } // 置頂優先，然後按發布日期降序
    };
    
    const bulletins = await this.mongodbService.get('bulletin', filter, options) as Bulletin[];
    
    // 過濾掉已過期的公告
    const now = new Date();
    return bulletins.filter(bulletin => 
      !bulletin.expiryDate || new Date(bulletin.expiryDate) > now
    );
  }

  async createBulletin(bulletin: Omit<Bulletin, '_id'>): Promise<any> {
    const bulletinData = {
      ...bulletin,
      publishDate: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
      isActive: true,
      viewCount: 0
    };
    return await this.mongodbService.post('bulletin', bulletinData);
  }

  async updateBulletin(bulletinId: string, updateData: Partial<Bulletin>): Promise<any> {
    const updateWithTimestamp = {
      ...updateData,
      updatedAt: new Date()
    };
    return await this.mongodbService.patch('bulletin', bulletinId, updateWithTimestamp);
  }

  async deleteBulletin(bulletinId: string): Promise<any> {
    // 軟刪除：設為不啟用而非實際刪除
    return await this.mongodbService.patch('bulletin', bulletinId, { 
      isActive: false,
      updatedAt: new Date()
    });
  }

  async getBulletinById(bulletinId: string): Promise<Bulletin | null> {
    try {
      return await this.mongodbService.getById('bulletin', bulletinId) as Bulletin;
    } catch (error) {
      console.error('取得公佈欄資料失敗:', error);
      return null;
    }
  }

  async incrementViewCount(bulletinId: string): Promise<void> {
    try {
      const bulletin = await this.getBulletinById(bulletinId);
      if (bulletin) {
        const newViewCount = (bulletin.viewCount || 0) + 1;
        await this.updateBulletin(bulletinId, { viewCount: newViewCount });
      }
    } catch (error) {
      console.error('更新查看次數失敗:', error);
    }
  }

  async togglePin(bulletinId: string): Promise<any> {
    try {
      const bulletin = await this.getBulletinById(bulletinId);
      if (bulletin) {
        return await this.updateBulletin(bulletinId, { 
          isPinned: !bulletin.isPinned 
        });
      }
    } catch (error) {
      console.error('切換置頂狀態失敗:', error);
      throw error;
    }
  }

  // 取得統計數據
  async getBulletinStats(siteId: string): Promise<{
    total: number;
    byCategory: { [key: string]: number };
    byPriority: { [key: string]: number };
  }> {
    try {
      const bulletins = await this.getBulletinsBySite(siteId);
      
      const stats = {
        total: bulletins.length,
        byCategory: {} as { [key: string]: number },
        byPriority: {} as { [key: string]: number }
      };

      bulletins.forEach(bulletin => {
        // 統計類別
        stats.byCategory[bulletin.category] = (stats.byCategory[bulletin.category] || 0) + 1;
        // 統計重要程度
        stats.byPriority[bulletin.priority] = (stats.byPriority[bulletin.priority] || 0) + 1;
      });

      return stats;
    } catch (error) {
      console.error('取得公佈欄統計失敗:', error);
      return { total: 0, byCategory: {}, byPriority: {} };
    }
  }
} 