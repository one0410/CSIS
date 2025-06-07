import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Router, ActivatedRoute } from '@angular/router';
import { MongodbService } from '../../../services/mongodb.service';
import { HazardNoticeForm } from './hazard-notice-form/hazard-notice-form.component';


@Component({
  selector: 'app-site-hazard-notice',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './site-hazard-notice.component.html',
  styleUrls: ['./site-hazard-notice.component.scss']
})
export class SiteHazardNoticeComponent implements OnInit {
  hazardNotices = signal<HazardNoticeForm[]>([]);
  siteId: string = '';

  constructor(
    private mongodbService: MongodbService,
    private router: Router,
    private route: ActivatedRoute
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

    this.hazardNotices.set(allForms);
  }

  createNewNotice() {
    this.router.navigate(['/site', this.siteId, 'forms', 'create-hazard-notice']);
  }

  // 查看詳細資料
  viewNotice(noticeId: string) {
    this.router.navigate(['/site', this.siteId, 'forms', 'hazard-notice', noticeId]);
  }

  // 編輯危害告知單
  editNotice(noticeId: string) {
    this.router.navigate(['/site', this.siteId, 'forms', 'hazard-notice', noticeId, 'edit']);
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
} 