import { Injectable, inject } from '@angular/core';
import { MongodbService } from './mongodb.service';
import { Visitor } from '../model/visitor.model';

@Injectable({
  providedIn: 'root'
})
export class VisitorService {
  private mongodbService = inject(MongodbService);

  async getVisitorsBySite(siteId: string): Promise<Visitor[]> {
    const filter = { siteId: siteId };
    return await this.mongodbService.getArray('visitor', filter) as Visitor[];
  }

  async createVisitor(visitor: Omit<Visitor, '_id'>): Promise<any> {
    return await this.mongodbService.post('visitor', visitor);
  }

  async updateVisitor(visitorId: string, updateData: Partial<Visitor>): Promise<any> {
    return await this.mongodbService.patch('visitor', visitorId, updateData);
  }

  async deleteVisitor(visitorId: string): Promise<any> {
    return await this.mongodbService.delete('visitor', visitorId);
  }

  async getVisitorById(visitorId: string): Promise<Visitor | null> {
    try {
      return await this.mongodbService.getById('visitor', visitorId) as Visitor;
    } catch (error) {
      console.error('取得訪客資料失敗:', error);
      return null;
    }
  }

  async checkVisitorExists(name: string, siteId: string): Promise<boolean> {
    const existingVisitors = await this.mongodbService.getArray('visitor', {
      name: name.trim(),
      siteId: siteId
    });
    return existingVisitors && existingVisitors.length > 0;
  }
} 