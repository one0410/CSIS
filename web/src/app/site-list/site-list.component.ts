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
    this.sites = await this.mongodbService.get('site', {});

    if (this.sites.length === 0) {
      // insert 3 demo sites
      for (let i = 0; i < 3; i++) {
        let s = this.generateRandomSite(i);
        if (i == 2) {
          s.endDate = '2024-07-01'; // 第2個工地設定為過期
        }
        let result = await this.mongodbService.post('site', s);
        if (result.insertedId) {
          s._id = result.insertedId;
          this.sites.push(s);
        }
      }
    }
  }

  generateRandomSite(index: number): Site {
    return {
      projectNo: `P-${index + 1}`,
      projectName: `Project ${index + 1}`,
      // base64 圖片
      image:
        'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=',
      formLogo: '',
      startDate: '2024-01-01',
      endDate: index > 8 ? '2024-07-01' : '2025-07-01',
      county: '台北市',
      town: '中正區',
      factories: [
        { name: '廠區1', areas: ['A區', 'B區'] },
        { name: '廠區2', areas: ['C區', 'D區'] },
      ],
      constructionTypes: ['施工', '拆除', '裝修'],
      // 隨機生成照片數量和容量
      photoCount: Math.floor(Math.random() * 300) + 50, // 50-350 張照片
      photoSize: Math.floor(Math.random() * 800) + 100, // 100-900 MB
    };
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
