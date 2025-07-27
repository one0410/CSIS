import { Component, OnInit, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Router, ActivatedRoute } from '@angular/router';
import { MongodbService } from '../../../services/mongodb.service';
import { AuthService } from '../../../services/auth.service';
import { HazardNoticeForm } from './hazard-notice-form/hazard-notice-form.component';


@Component({
  selector: 'app-site-hazard-notice',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './site-hazard-notice.component.html',
  styleUrls: ['./site-hazard-notice.component.scss']
})
export class SiteHazardNoticeComponent implements OnInit {
  private allHazardNotices = signal<HazardNoticeForm[]>([]);
  showRevokedForms = signal<boolean>(false);
  
  // 使用 computed 來過濾表單資料
  hazardNotices = computed(() => {
    const allForms = this.allHazardNotices();
    if (this.showRevokedForms()) {
      return allForms;
    } else {
      return allForms.filter(form => form.status !== 'revoked');
    }
  });
  
  siteId: string = '';

  constructor(
    private mongodbService: MongodbService,
    private router: Router,
    private route: ActivatedRoute,
    private authService: AuthService
  ) {}

  ngOnInit() {
    // 獲取工地 ID
    this.route.parent?.paramMap.subscribe(params => {
      const id = params.get('id');
      if (id) {
        this.siteId = id;
        
        this.loadForms();
      }
    });
  }

  async loadForms(): Promise<void> {
    // 讀取各種表單
    const allForms = await this.mongodbService.get('siteForm', {
      siteId: this.siteId,
      formType: 'hazardNotice',
    });

    this.allHazardNotices.set(allForms);
  }

  createNewNotice() {
    this.router.navigate(['/site', this.siteId, 'hazardNotice', 'create']);
  }

  // 查看詳細資料
  viewNotice(noticeId: string) {
    this.router.navigate(['/site', this.siteId, 'hazardNotice', noticeId]);
  }

  // 編輯危害告知單
  editNotice(noticeId: string) {
    this.router.navigate(['/site', this.siteId, 'hazardNotice', noticeId, 'edit']);
  }

  // 作廢危害告知單
  async revokeNotice(noticeId: string) {
    if (confirm('確定要作廢此危害告知單嗎？此操作無法恢復。')) {
      try {
        await this.mongodbService.patch('siteForm', noticeId, {
          status: 'revoked'
        });
        // 重新載入表單列表
        await this.loadForms();
      } catch (error) {
        console.error('作廢危害告知單失敗', error);
        alert('作廢危害告知單失敗');
      }
    }
  }
  
  getStatusName(status: string) {
    switch (status) {
      case 'draft':
        return '草稿';
      case 'published':
        return '已發布';
      case 'revoked':
        return '已作廢';
    }
    return status;
  }

  // 檢查當前使用者是否有權限顯示作廢表單開關
  canShowRevokedFormsSwitch(): boolean {
    const user = this.authService.user();
    if (!user || !this.siteId) return false;
    
    // 取得當前使用者在此工地的角色
    const userSiteRole = user.belongSites?.find(site => site.siteId === this.siteId)?.role;
    
    // 只有專案經理(projectManager)和專案秘書(secretary)可以顯示開關
    return userSiteRole === 'projectManager' || userSiteRole === 'secretary';
  }

  // 切換顯示作廢表單
  toggleShowRevokedForms() {
    this.showRevokedForms.set(!this.showRevokedForms());
  }

  // 回復作廢的危害告知單
  async restoreNotice(noticeId: string) {
    if (confirm('確定要回復此危害告知單的狀態嗎？')) {
      try {
        await this.mongodbService.patch('siteForm', noticeId, {
          status: 'draft'
        });
        // 重新載入表單列表
        await this.loadForms();
      } catch (error) {
        console.error('回復危害告知單失敗', error);
        alert('回復危害告知單失敗');
      }
    }
  }

  // 永久刪除危害告知單
  async deleteNotice(noticeId: string) {
    if (confirm('確定要永久刪除此危害告知單嗎？此操作無法恢復，請謹慎操作！')) {
      if (confirm('再次確認：您真的要永久刪除此表單嗎？')) {
        try {
          await this.mongodbService.delete('siteForm', noticeId);
          // 重新載入表單列表
          await this.loadForms();
        } catch (error) {
          console.error('刪除危害告知單失敗', error);
          alert('刪除危害告知單失敗');
        }
      }
    }
  }
} 