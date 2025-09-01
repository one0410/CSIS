import { Component } from '@angular/core';

import { RouterModule } from '@angular/router';
import { MongodbService } from '../services/mongodb.service';

@Component({
  selector: 'app-site-list',
  imports: [RouterModule],
  templateUrl: './site-list.component.html',
  styleUrl: './site-list.component.scss',
})
export class SiteListComponent {
  sites: Site[] = [];
  viewMode: 'card' | 'list' = 'card';

  constructor(private mongodbService: MongodbService) {}

  async ngOnInit() {
    const sitesData = await this.mongodbService.getArray<Site>('site', {});
    this.sites = sitesData;

  }

  isExpired(endDate: string): boolean {
    const today = new Date();
    const endDateObj = new Date(endDate);
    return endDateObj < today;
  }

  setViewMode(mode: 'card' | 'list') {
    this.viewMode = mode;
  }
}

export interface Site {
  _id?: string;
  projectNo: string; // 專案編號
  projectName: string; // 專案名稱
  image: string; // 圖片 (url or base64)
  formLogo?: string; // 表單Logo
  startDate: string; // 工期開始 yyyy-mm-dd
  endDate: string; // 工期結束 yyyy-mm-dd
  county: string; // 縣市
  town: string; // 鄉鎮市區
  factories: { name: string; areas: string[] }[]; // 廠區
  constructionTypes: string[]; // 作業名稱
  remark?: string; // 備註
  photoCount?: number; // 照片張數
  photoSize?: number; // 照片容量 (MB)
}
