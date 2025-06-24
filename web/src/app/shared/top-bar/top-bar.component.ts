import { Component, Output, EventEmitter, OnInit, inject, computed, OnDestroy, signal, effect } from '@angular/core';
import { AuthService } from '../../services/auth.service';
import { RouterModule, Router, NavigationEnd } from '@angular/router';

import { CurrentSiteService } from '../../services/current-site.service';
import { filter, Subscription } from 'rxjs';
import { FeedbackService } from '../../services/feedback.service';

@Component({
  selector: 'app-top-bar',
  standalone: true,
  imports: [RouterModule],
  templateUrl: './top-bar.component.html',
  styleUrl: './top-bar.component.scss'
})
export class TopBarComponent implements OnInit, OnDestroy {
  @Output() menuToggle = new EventEmitter<void>();
  currentUser = computed(() => this.authService.user());
  currentSite = computed(() => this.currentSiteService.currentSite());
  greeting: string = '';
  private routerSubscription: Subscription | undefined;
  
  // 注入路由器和相關服務
  private router = inject(Router);
  private currentSiteService = inject(CurrentSiteService);
  private feedbackService = inject(FeedbackService);
  
  // 使用 FeedbackService 的 pendingFeedbackCount
  pendingFeedbackCount = computed(() => this.feedbackService.pendingFeedbackCount());
  
  constructor(private authService: AuthService) {
    this.setGreeting();
    // FeedbackService 現在會自動根據使用者狀態連接/斷開 WebSocket
    // 不需要在這裡手動處理
  }
  
  ngOnInit() {
    // 如果頁面路徑包含工地ID，嘗試載入工地
    const currentUrl = this.router.url;
    if (currentUrl.includes('/site/') && !currentUrl.includes('/site/new')) {
      const siteIdMatch = currentUrl.match(/\/site\/([^\/]+)/);
      if (siteIdMatch && siteIdMatch[1]) {
        this.currentSiteService.setCurrentSiteById(siteIdMatch[1]);
      }
    }

    // 監聽路由變化，當導航完成時關閉所有下拉選單
    this.routerSubscription = this.router.events
      .pipe(filter(event => event instanceof NavigationEnd))
      .subscribe(() => {
        this.closeAllDropdowns();
      });

    // 監聽點擊事件，點擊外部時關閉下拉選單
    this.setupOutsideClickListener();
  }

  private setupOutsideClickListener() {
    document.addEventListener('click', (event) => {
      const target = event.target as HTMLElement;
      
      // 檢查是否點擊在下拉選單或按鈕內部
      const systemDropdown = document.getElementById('systemDropdown');
      const systemMenu = document.getElementById('systemMenu');
      const profileMenu = document.getElementById('profileMenu');
      
      const isSystemDropdownClick = systemDropdown?.contains(target);
      const isSystemMenuClick = systemMenu?.contains(target);
      const isProfileClick = target?.closest('[data-profile-menu]') || profileMenu?.contains(target);
      
      // 如果點擊不在任何下拉選單區域內，則關閉所有下拉選單
      if (!isSystemDropdownClick && !isSystemMenuClick && !isProfileClick) {
        this.closeAllDropdowns();
      }
    });
  }

  ngOnDestroy() {
    // 清理訂閱
    if (this.routerSubscription) {
      this.routerSubscription.unsubscribe();
    }
    // FeedbackService 會自動清理 WebSocket 連接
  }

  setGreeting() {
    const hour = new Date().getHours();
    if (hour >= 5 && hour < 12) {
      this.greeting = '早安';
    } else if (hour >= 12 && hour < 18) {
      this.greeting = '午安';
    } else {
      this.greeting = '晚安';
    }
  }

  getRoleDisplay(role: string): string {
    const roleMap: { [key: string]: string } = {
      'admin': '管理員',
      'manager': '專案經理',
      'staff': '使用者',
      'secretary': '秘書'
    };
    return roleMap[role] || '使用者';
  }

  // 獲取用戶頭像，如果沒有則返回預設頭像
  getUserAvatar(): string {
    const user = this.currentUser();
    if (user?.avatar) {
      return user.avatar;
    }
    return '/male-icon-32.png'; // 預設頭像
  }

  // 獲取用戶名稱首字母，用於頭像佔位符
  getUserInitial(): string {
    const user = this.currentUser();
    return user?.name?.charAt(0) || 'U';
  }

  // 切換到工地選擇頁面
  goToSiteSelector() {
    this.router.navigate(['/site-selector']);
  }

  toggleMenu() {
    this.menuToggle.emit();
  }

  toggleProfileMenu() {
    // 先關閉系統管理選單
    this.closeSystemMenu();
    // 切換個人資料選單
    const profileMenu = document.getElementById('profileMenu');
    if (profileMenu) {
      profileMenu.classList.toggle('show');
      // 更新 aria-expanded 屬性
      const isShown = profileMenu.classList.contains('show');
      profileMenu.setAttribute('aria-expanded', isShown.toString());
    }
  }

  toggleSystemMenu() {
    // 先關閉個人資料選單
    this.closeProfileMenu();
    // 切換系統管理選單
    const systemMenu = document.getElementById('systemMenu');
    const systemButton = document.getElementById('systemDropdown');
    
    if (systemMenu && systemButton) {
      systemMenu.classList.toggle('show');
      // 更新 aria-expanded 屬性
      const isShown = systemMenu.classList.contains('show');
      systemButton.setAttribute('aria-expanded', isShown.toString());
      
      console.log('系統管理選單狀態:', isShown ? '打開' : '關閉');
    }
  }

  private closeSystemMenu() {
    const systemMenu = document.getElementById('systemMenu');
    const systemButton = document.getElementById('systemDropdown');
    if (systemMenu && systemButton) {
      systemMenu.classList.remove('show');
      systemButton.setAttribute('aria-expanded', 'false');
    }
  }

  private closeProfileMenu() {
    const profileMenu = document.getElementById('profileMenu');
    if (profileMenu) {
      profileMenu.classList.remove('show');
      profileMenu.setAttribute('aria-expanded', 'false');
    }
  }

  closeAllDropdowns() {
    console.log('關閉所有下拉選單');
    this.closeSystemMenu();
    this.closeProfileMenu();
  }

  logout() {
    this.authService.logout();
  }


}
