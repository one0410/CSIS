import { Component, computed, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { MongodbService } from '../../../services/mongodb.service';
import { User } from '../../../model/user.model';
import { CurrentSiteService } from '../../../services/current-site.service';
import { AuthService } from '../../../services/auth.service';

// 擴展使用者介面，添加工地角色屬性
interface UserWithSiteRole extends User {
  siteRole?: string;
  selected?: boolean;
}

@Component({
  selector: 'app-site-user-list',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './site-user-list.component.html',
  styleUrls: ['./site-user-list.component.scss']
})
export class SiteUserListComponent implements OnInit {
  siteId: string | null = null;
  site = computed(() => this.currentSiteService.currentSite());
  currentUser = computed(() => this.authService.user());
  
  // 使用者資料
  isLoading = false;
  siteUsers: UserWithSiteRole[] = [];
  filteredSiteUsers: UserWithSiteRole[] = [];
  allUsers: UserWithSiteRole[] = [];
  
  // 搜尋相關
  searchQuery = '';
  searchResults: UserWithSiteRole[] = [];
  searchPerformed = false;
  
  // 模態框相關
  modalSearchQuery = '';
  filteredModalUsers: UserWithSiteRole[] = [];
  allUsersSelected = false;
  
  // 分頁相關
  currentPage = 1;
  pageSize = 10;
  totalPages = 1;
  
  // 過濾設定
  showOnlyActive = true;

  constructor(
    private route: ActivatedRoute,
    private mongodbService: MongodbService,
    private currentSiteService: CurrentSiteService,
    private authService: AuthService
  ) {}

  async ngOnInit() {
    this.route.parent?.paramMap.subscribe(params => {
      this.siteId = params.get('id');
      this.loadSiteData();
    });
    
    await this.loadAllUsers();
  }

  async loadSiteData() {
    if (!this.siteId) return;
    
    try {
      this.isLoading = true;
      
      
        await this.loadSiteUsers();
    } catch (error) {
      console.error('載入工地資料時發生錯誤', error);
    } finally {
      this.isLoading = false;
    }
  }

  async loadSiteUsers() {
    if (!this.siteId) return;
    
    try {
      this.isLoading = true;
      
      // 獲取工地授權使用者
      const siteUsers = await this.mongodbService.get('user', { belongSites: { $elemMatch: { siteId: this.siteId } } });
      
      if (siteUsers && siteUsers.length > 0) {
        this.siteUsers = siteUsers.map((user: User) => {
          // 取得該使用者在此工地的角色
          const siteRole = user.belongSites?.find((site: { siteId: string; role: string }) => site.siteId === this.siteId)?.role || 'projectEngineer';
          return {
            ...user,
            siteRole
          };
        });
        this.filterActiveUsers();
      } else {
        this.siteUsers = [];
        this.filteredSiteUsers = [];
      }
      
      this.calculatePagination();
    } catch (error) {
      console.error('載入工地使用者時發生錯誤', error);
    } finally {
      this.isLoading = false;
    }
  }

  async loadAllUsers() {
    try {
      this.allUsers = await this.mongodbService.get('user', {});
    } catch (error) {
      console.error('載入所有使用者時發生錯誤', error);
    }
  }

  searchUsers() {
    this.searchPerformed = true;
    
    if (!this.searchQuery.trim()) {
      this.searchResults = [];
      return;
    }
    
    const query = this.searchQuery.toLowerCase();
    
    // 過濾已經在工地授權清單中的使用者
    const siteUserIds = this.siteUsers.map(user => user._id);
    
    this.searchResults = this.allUsers.filter(user => 
      (user.name?.toLowerCase().includes(query) || 
       user.account?.toLowerCase().includes(query) || 
       user.department?.toLowerCase().includes(query)) && 
      !siteUserIds.includes(user._id)
    );
  }

  async addUserToSite(user: UserWithSiteRole) {
    if (!this.siteId || !user._id) return;
    
    try {
      this.isLoading = true;
      
      // 使用選擇的工地角色或預設角色
      const role = user.siteRole || 'projectEngineer'; 
      
      // 創建工地使用者關聯
      user.belongSites = [...(user.belongSites || []), { siteId: this.siteId, role }];
      await this.mongodbService.patch('user', user._id, { belongSites: user.belongSites });
      
      // 重新載入使用者清單
      await this.loadSiteUsers();
      
      // 更新搜尋結果
      this.searchUsers();
    } catch (error) {
      console.error('添加使用者到工地時發生錯誤', error);
    } finally {
      this.isLoading = false;
    }
  }

  async removeUserFromSite(user: UserWithSiteRole) {
    if (!this.siteId || !user._id) return;
    
    if (!confirm(`確定要移除 ${user.name} 的工地存取權限嗎？`)) {
      return;
    }
    
    try {
      this.isLoading = true;
      
      user.belongSites = user.belongSites?.filter(site => site.siteId !== this.siteId);
      await this.mongodbService.patch('user', user._id, { belongSites: user.belongSites });
            
      // 重新載入使用者清單
      await this.loadSiteUsers();
    } catch (error) {
      console.error('從工地移除使用者時發生錯誤', error);
    } finally {
      this.isLoading = false;
    }
  }

  filterActiveUsers() {
    if (this.showOnlyActive) {
      this.filteredSiteUsers = this.siteUsers.filter(user => user.enabled);
    } else {
      this.filteredSiteUsers = [...this.siteUsers];
    }
    
    this.calculatePagination();
    this.goToPage(1);
  }

  calculatePagination() {
    this.totalPages = Math.ceil(this.filteredSiteUsers.length / this.pageSize);
    if (this.totalPages === 0) this.totalPages = 1;
  }

  getPageNumbers(): number[] {
    const pages: number[] = [];
    for (let i = 1; i <= this.totalPages; i++) {
      pages.push(i);
    }
    return pages;
  }

  goToPage(page: number) {
    if (page < 1 || page > this.totalPages) return;
    this.currentPage = page;
  }

  showAddUserModal() {
    this.modalSearchQuery = '';
    this.prepareModalUsers();
    
    // 使用Bootstrap模態框API開啟模態框
    // 注意：需要在實際環境中引入Bootstrap的JS
    const modal = document.getElementById('addUserModal');
    if (modal) {
      // @ts-ignore
      const bsModal = new bootstrap.Modal(modal);
      bsModal.show();
    }
  }

  prepareModalUsers() {
    // 過濾已經在工地授權清單中的使用者
    const siteUserIds = this.siteUsers.map(user => user._id);
    
    this.filteredModalUsers = this.allUsers
      .filter(user => !siteUserIds.includes(user._id))
      .map(user => ({
        ...user,
        selected: false,
        siteRole: 'projectEngineer' // 預設角色
      }));
  }

  searchModalUsers() {
    if (!this.modalSearchQuery.trim()) {
      this.prepareModalUsers();
      return;
    }
    
    const query = this.modalSearchQuery.toLowerCase();
    const siteUserIds = this.siteUsers.map(user => user._id);
    
    this.filteredModalUsers = this.allUsers
      .filter(user => 
        (user.name?.toLowerCase().includes(query) || 
         user.account?.toLowerCase().includes(query) || 
         user.department?.toLowerCase().includes(query)) && 
        !siteUserIds.includes(user._id)
      )
      .map(user => ({
        ...user,
        selected: this.filteredModalUsers.find(u => u._id === user._id)?.selected || false
      }));
  }

  toggleAllUsers() {
    this.allUsersSelected = !this.allUsersSelected;
    this.filteredModalUsers.forEach(user => {
      user.selected = this.allUsersSelected;
    });
  }

  updateSelectAllStatus() {
    this.allUsersSelected = this.filteredModalUsers.length > 0 && 
      this.filteredModalUsers.every(user => user.selected);
  }

  getSelectedUsersCount(): number {
    return this.filteredModalUsers.filter(user => user.selected).length;
  }

  async addSelectedUsers() {
    const selectedUsers = this.filteredModalUsers.filter(user => user.selected);
    
    if (selectedUsers.length === 0) return;
    
    try {
      this.isLoading = true;
      
      for (const user of selectedUsers) {
        if (!user._id) continue;
        
        // 使用選擇的工地角色或預設角色
        const role = user.siteRole || 'projectEngineer';
        
        // 創建工地使用者關聯
        user.belongSites = [...(user.belongSites || []), { siteId: this.siteId!, role }];
        await this.mongodbService.patch('user', user._id, { belongSites: user.belongSites });
      }
      
      // 關閉模態框
      const modal = document.getElementById('addUserModal');
      if (modal) {
        // @ts-ignore
        const bsModal = bootstrap.Modal.getInstance(modal);
        if (bsModal) {
          bsModal.hide();
        }
      }
      
      // 重新載入使用者清單
      await this.loadSiteUsers();
    } catch (error) {
      console.error('添加使用者到工地時發生錯誤', error);
    } finally {
      this.isLoading = false;
    }
  }

  // 更新使用者在工地的角色
  async updateUserSiteRole(user: UserWithSiteRole) {
    if (!this.siteId || !user._id || !user.siteRole) return;
    
    try {
      this.isLoading = true;
      
      // 更新工地角色
      if (user.belongSites) {
        const updatedBelongSites = user.belongSites.map(site => {
          if (site.siteId === this.siteId) {
            return { ...site, role: user.siteRole! };
          }
          return site;
        });
        
        await this.mongodbService.patch('user', user._id, { belongSites: updatedBelongSites });
        
        // 如果被更新的使用者是當前登入的使用者，立即更新 AuthService 中的使用者資訊
        const currentUser = this.currentUser();
        if (currentUser && currentUser._id === user._id) {
          console.log('當前使用者的工地權限已更新，正在同步使用者資訊...');
          await this.authService.refreshCurrentUser();
        }
      }
    } catch (error) {
      console.error('更新使用者工地角色時發生錯誤', error);
    } finally {
      this.isLoading = false;
    }
  }

  // 工具函數
  getRandomColor(name: string): string {
    // 基於使用者名稱生成唯一顏色
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
      hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    
    const colors = [
      '#4285F4', '#EA4335', '#FBBC05', '#34A853', // Google colors
      '#3B5998', '#8B9DC3', // Facebook colors
      '#1DA1F2', '#14171A', // Twitter colors
      '#0077B5', '#000000', // LinkedIn colors
      '#FF5700', '#FF4500', // Reddit colors
      '#55C500', '#F5F5F5'  // LINE colors
    ];
    
    return colors[Math.abs(hash) % colors.length];
  }

  getRoleDisplay(role: string): string {
    const roleMap: {[key: string]: string} = {
      'admin': '管理員',
      'manager': '專案經理',
      'secretary': '秘書',
      'staff': '一般使用者'
    };
    
    return roleMap[role] || role;
  }

  // 檢查當前使用者是否有權限編輯工地權限
  canEditSiteRole(): boolean {
    const user = this.currentUser();
    if (!user || !this.siteId) return false;
    
    // 取得當前使用者在此工地的角色
    const userSiteRole = user.belongSites?.find(site => site.siteId === this.siteId)?.role;
    
    // 只有專案經理(projectManager)和專案秘書(secretary)和 currentUser 是 admin 可以編輯
    return userSiteRole === 'projectManager' || userSiteRole === 'secretary' || user.role === 'admin';
  }

  // 取得工地權限顯示文字
  getSiteRoleDisplay(siteRole: string): string {
    const roleMap: {[key: string]: string} = {
      'admin': '系統管理員',
      'safetyManager': '環安主管',
      'safetyEngineer': '環安工程師',
      'projectManager': '專案經理',
      'siteManager': '工地經理',
      'secretary': '專案秘書',
      'projectEngineer': '專案工程師',
      'vendor': '協力廠商'
    };
    
    return roleMap[siteRole] || siteRole;
  }
}
