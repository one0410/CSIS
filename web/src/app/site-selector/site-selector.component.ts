import { Component } from '@angular/core';

import { Router, RouterModule } from '@angular/router';
import { MongodbService } from '../services/mongodb.service';
import { AuthService } from '../services/auth.service';
import { Site } from '../site-list/site-list.component';
import { FormsModule } from '@angular/forms';
import { ToastService } from '../services/toast.service';
import { CurrentSiteService } from '../services/current-site.service';
import { User } from '../model/user.model';

@Component({
  selector: 'app-site-selector',
  standalone: true,
  imports: [RouterModule, FormsModule],
  templateUrl: './site-selector.component.html',
  styleUrl: './site-selector.component.scss'
})
export class SiteSelectorComponent {
  sites: Site[] = [];
  userSites: Site[] = [];
  isLoading = true;
  searchTerm = '';
  viewMode: 'card' | 'list' = 'card';

  constructor(
    private mongodbService: MongodbService,
    private authService: AuthService,
    private router: Router,
    private toastService: ToastService,
    private currentSiteService: CurrentSiteService
  ) {}

  async ngOnInit() {
    this.isLoading = true;
    try {
      // 獲取所有工地
      this.sites = await this.mongodbService.get('site', {});

      if (this.sites.length === 0) {
        // insert 3 demo sites
        for (let i = 0; i < 3; i++) {
          let s = this.generateRandomSite(i);
          if (i == 2) {
            s.endDate = '2025-07-01'; // 第2個工地設定為過期
          }
          let result = await this.mongodbService.post('site', s);
          if (result.insertedId) {
            s._id = result.insertedId;
            this.sites.push(s);
          }
        }
      }
      
      // 獲取使用者有權限的工地
      const user: User = await this.mongodbService.getById('user', this.authService.user()?._id!);
      
      if (user && user._id) {
        // 檢查是否有管理員角色，如果是，則可以訪問所有工地
        if (user.role === 'admin') {
          this.userSites = this.sites;
        } else {                   
          if (user.belongSites && user.belongSites.length > 0) {
            // 過濾使用者有權限的工地
            const siteIds = user.belongSites;
            this.userSites = this.sites.filter(site => 
              site._id && siteIds.some(siteId => siteId.siteId === site._id)
            );
          } else {
            // 如果沒有工地權限，顯示空列表
            this.userSites = [];
            this.toastService.show('您目前沒有任何工地的訪問權限');
          }
        }
      } else {
        // 如果沒有使用者資訊，顯示空列表
        this.userSites = [];
        this.toastService.show('無法獲取使用者資訊');
      }
    } catch (error) {
      console.error('載入工地資訊時發生錯誤', error);
      this.toastService.show('載入工地資訊時發生錯誤');
    } finally {
      this.isLoading = false;
    }
  }

  get filteredSites(): Site[] {
    if (!this.searchTerm) {
      return this.userSites;
    }
    
    const term = this.searchTerm.toLowerCase();
    return this.userSites.filter(site => 
      site.projectName.toLowerCase().includes(term) || 
      site.projectNo.toLowerCase().includes(term) ||
      site.county.toLowerCase().includes(term) ||
      site.town.toLowerCase().includes(term)
    );
  }

  async selectSite(site: Site) {
    if (site._id) {
      // 設置當前選中的工地
      await this.currentSiteService.setCurrentSite(site);
      
      // 導航到工地詳情頁面
      this.router.navigate(['/site', site._id]);
    } else {
      this.toastService.show('無效的工地ID');
    }
  }

  isExpired(endDate: string): boolean {
    const today = new Date();
    const endDateObj = new Date(endDate);
    return endDateObj < today;
  }

  setViewMode(mode: 'card' | 'list') {
    this.viewMode = mode;
  }

  async logout() {
    try {
      const result = await this.authService.logout();
      if (result.success) {
        this.toastService.show('已成功登出');
        this.router.navigate(['/login']);
      } else {
        this.toastService.show('登出時發生錯誤');
      }
    } catch (error) {
      console.error('登出時發生錯誤', error);
      this.toastService.show('登出時發生錯誤');
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
}
