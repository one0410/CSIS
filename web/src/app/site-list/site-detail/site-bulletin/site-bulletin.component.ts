import { Component, computed, signal, inject, OnInit, effect } from '@angular/core';
import { Dropdown } from 'bootstrap';
import { CommonModule, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { BulletinService } from '../../../services/bulletin.service';
import { AuthService } from '../../../services/auth.service';
import { Bulletin } from '../../../model/bulletin.model';
import { CurrentSiteService } from '../../../services/current-site.service';

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
  private currentSiteService = inject(CurrentSiteService);

  // 狀態管理
  loading = signal(false);
  showModal = signal(false);
  site = computed(() => this.currentSiteService.currentSite());
  bulletins = signal<Bulletin[]>([]);
  editingBulletin = signal<Bulletin>({} as Bulletin);
  selectedBulletin = signal<Bulletin | null>(null);
  showDetailModal = signal(false);
  
  // 追蹤開啟的dropdown (已改用Bootstrap原生功能，保留以防其他地方使用)
  // openDropdowns = signal<Set<string>>(new Set());

  // 計算屬性
  isEditing = computed(() => !!this.editingBulletin()._id);
  currentUser = computed(() => this.authService.user());
  
  // 檢查當前使用者是否有管理權限 (專案經理/工地經理/專案秘書/環安主管/環安工程師/專案工程師)
  hasManagePermission = computed(() => {
    const user = this.currentUser();
    const currentSite = this.site();
    if (!user || !user.belongSites || !currentSite?._id) {
      return false;
    }

    // 檢查使用者在此工地的角色
    const siteRole = user.belongSites.find(site => site.siteId === currentSite._id);
    return siteRole?.role === 'manager' ||
           siteRole?.role === 'projectManager' ||
           siteRole?.role === 'secretary' ||
           siteRole?.role === 'safetyManager' ||
           siteRole?.role === 'safetyEngineer' ||
           siteRole?.role === 'projectEngineer';
  });

  constructor() {
    // 監聽工地變化，當有工地資料時載入公佈欄
    effect(() => {
      const currentSite = this.site();
      if (currentSite?._id) {
        this.loadBulletins();
      }
    });
  }

  ngOnInit() {
    // Bootstrap 原生 dropdown 功能已經處理所有事件，不需要手動管理
    // 已移除自定義 dropdown 事件監聽器
  }

  toggleDropdown(event: Event): void {
    event.preventDefault();
    event.stopPropagation();
    const button = event.currentTarget as HTMLElement;
    const instance = Dropdown.getOrCreateInstance(button);
    instance.toggle();
  }

  async loadBulletins() {
    const currentSite = this.site();
    if (!currentSite?._id) {
      console.warn('無法載入公佈欄：缺少工地ID');
      return;
    }

    try {
      this.loading.set(true);
      const bulletins = await this.bulletinService.getBulletinsBySite(currentSite._id);
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
    const currentSite = this.site();
    
    if (!currentSite?._id) {
      alert('無法新增公告：缺少工地資訊');
      return;
    }

    this.editingBulletin.set({
      title: '',
      content: '',
      category: 'general',
      priority: 'normal',
      authorId: user?._id || '',
      authorName: user?.name || '',
      siteId: currentSite._id,
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