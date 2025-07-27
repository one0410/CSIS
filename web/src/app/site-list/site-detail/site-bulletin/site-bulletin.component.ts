import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { BulletinService } from '../../../services/bulletin.service';
import { AuthService } from '../../../services/auth.service';
import { Bulletin } from '../../../model/bulletin.model';

@Component({
  selector: 'app-site-bulletin',
  standalone: true,
  imports: [CommonModule, FormsModule, DatePipe],
  templateUrl: './site-bulletin.component.html',
  styleUrls: ['./site-bulletin.component.scss']
})
export class SiteBulletinComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private bulletinService = inject(BulletinService);
  private authService = inject(AuthService);

  // 狀態管理
  loading = signal(false);
  showModal = signal(false);
  siteId = signal('');
  bulletins = signal<Bulletin[]>([]);
  editingBulletin = signal<Bulletin>({} as Bulletin);
  selectedBulletin = signal<Bulletin | null>(null);
  showDetailModal = signal(false);

  // 計算屬性
  isEditing = computed(() => !!this.editingBulletin()._id);
  currentUser = computed(() => this.authService.user());
  
  // 檢查當前使用者是否有管理權限 (專案經理/工地經理/專案秘書)
  hasManagePermission = computed(() => {
    const user = this.currentUser();
    if (!user || !user.belongSites || !this.siteId()) {
      return false;
    }
    
    // 檢查使用者在此工地的角色
    const siteRole = user.belongSites.find(site => site.siteId === this.siteId());
    return siteRole?.role === 'manager' || 
           siteRole?.role === 'projectManager' || 
           siteRole?.role === 'secretary';
  });

  ngOnInit() {
    // 從父路由獲取工地ID
    this.route.parent?.paramMap.subscribe(params => {
      const id = params.get('id');
      if (id) {
        this.siteId.set(id);
        this.loadBulletins();
      }
    });
  }

  async loadBulletins() {
    try {
      this.loading.set(true);
      const bulletins = await this.bulletinService.getBulletinsBySite(this.siteId());
      this.bulletins.set(bulletins);
    } catch (error) {
      console.error('載入公佈欄資料失敗:', error);
      alert('載入公佈欄資料失敗，請稍後再試');
    } finally {
      this.loading.set(false);
    }
  }

  showAddBulletinModal() {
    if (!this.hasManagePermission()) {
      alert('您沒有權限新增公告');
      return;
    }

    const user = this.currentUser();
    this.editingBulletin.set({
      title: '',
      content: '',
      category: 'general',
      priority: 'normal',
      authorId: user?._id || '',
      authorName: user?.name || '',
      siteId: this.siteId(),
      isActive: true,
      isPinned: false,
      publishDate: new Date()
    } as Bulletin);
    
    this.showModal.set(true);
  }

  editBulletin(bulletin: Bulletin) {
    if (!this.hasManagePermission()) {
      alert('您沒有權限編輯公告');
      return;
    }

    this.editingBulletin.set({ ...bulletin });
    this.showModal.set(true);
  }

  hideModal() {
    this.showModal.set(false);
    this.editingBulletin.set({} as Bulletin);
  }

  isFormValid(): boolean {
    const bulletin = this.editingBulletin();
    return !!(
      bulletin.title?.trim() &&
      bulletin.content?.trim() &&
      bulletin.category &&
      bulletin.priority
    );
  }

  async saveBulletin() {
    if (!this.isFormValid()) {
      alert('請填寫所有必填欄位');
      return;
    }

    if (!this.hasManagePermission()) {
      alert('您沒有權限執行此操作');
      return;
    }

    try {
      this.loading.set(true);
      
      const bulletin = this.editingBulletin();
      
      if (bulletin._id) {
        await this.bulletinService.updateBulletin(bulletin._id, bulletin);
        alert('公告更新成功');
      } else {
        await this.bulletinService.createBulletin(bulletin);
        alert('公告新增成功');
      }

      this.hideModal();
      await this.loadBulletins();
    } catch (error) {
      console.error('儲存公告失敗:', error);
      alert('儲存公告失敗，請稍後再試');
    } finally {
      this.loading.set(false);
    }
  }

  async deleteBulletin(bulletin: Bulletin) {
    if (!this.hasManagePermission()) {
      alert('您沒有權限刪除公告');
      return;
    }

    if (!confirm(`確定要刪除「${bulletin.title}」這則公告嗎？`)) {
      return;
    }

    try {
      this.loading.set(true);
      await this.bulletinService.deleteBulletin(bulletin._id!);
      alert('公告刪除成功');
      await this.loadBulletins();
    } catch (error) {
      console.error('刪除公告失敗:', error);
      alert('刪除公告失敗，請稍後再試');
    } finally {
      this.loading.set(false);
    }
  }

  async togglePin(bulletin: Bulletin) {
    if (!this.hasManagePermission()) {
      alert('您沒有權限執行此操作');
      return;
    }

    try {
      this.loading.set(true);
      await this.bulletinService.togglePin(bulletin._id!);
      await this.loadBulletins();
    } catch (error) {
      console.error('切換置頂狀態失敗:', error);
      alert('操作失敗，請稍後再試');
    } finally {
      this.loading.set(false);
    }
  }

  viewBulletinDetail(bulletin: Bulletin) {
    this.selectedBulletin.set(bulletin);
    this.showDetailModal.set(true);
    
    // 增加查看次數
    if (bulletin._id) {
      this.bulletinService.incrementViewCount(bulletin._id);
    }
  }

  hideDetailModal() {
    this.showDetailModal.set(false);
    this.selectedBulletin.set(null);
  }

  onExpiryDateChange(event: Event) {
    const target = event.target as HTMLInputElement;
    const bulletin = this.editingBulletin();
    
    if (target.value) {
      bulletin.expiryDate = new Date(target.value);
    } else {
      bulletin.expiryDate = undefined;
    }
    
    this.editingBulletin.set({ ...bulletin });
  }

  getCategoryText(category: string): string {
    const categoryMap: { [key: string]: string } = {
      'general': '一般公告',
      'safety': '安全須知',
      'schedule': '進度通知',
      'urgent': '緊急通知'
    };
    return categoryMap[category] || category;
  }

  getPriorityText(priority: string): string {
    const priorityMap: { [key: string]: string } = {
      'low': '低',
      'normal': '一般',
      'high': '高',
      'urgent': '緊急'
    };
    return priorityMap[priority] || priority;
  }

  getCategoryBadgeClass(category: string): string {
    const classMap: { [key: string]: string } = {
      'general': 'bg-secondary',
      'safety': 'bg-warning',
      'schedule': 'bg-info',
      'urgent': 'bg-danger'
    };
    return classMap[category] || 'bg-secondary';
  }

  getPriorityBadgeClass(priority: string): string {
    const classMap: { [key: string]: string } = {
      'low': 'bg-light text-dark',
      'normal': 'bg-secondary',
      'high': 'bg-warning',
      'urgent': 'bg-danger'
    };
    return classMap[priority] || 'bg-secondary';
  }
} 