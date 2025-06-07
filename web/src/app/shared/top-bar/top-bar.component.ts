import { Component, Output, EventEmitter, OnInit, inject, computed, OnDestroy, signal, effect } from '@angular/core';
import { AuthService } from '../../services/auth.service';
import { RouterModule, Router, NavigationEnd } from '@angular/router';

import { CurrentSiteService } from '../../services/current-site.service';
import { filter, Subscription } from 'rxjs';
import { MongodbService } from '../../services/mongodb.service';

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
  pendingFeedbackCount = signal(0);
  
  // 注入路由器和當前工地服務
  private router = inject(Router);
  private currentSiteService = inject(CurrentSiteService);
  private mongodbService = inject(MongodbService);
  
  constructor(private authService: AuthService) {
    this.setGreeting();
    effect(() => {
      const user = this.currentUser();
      console.log('TopBar effect 觸發, 使用者:', user);
      if (user && (user.role === 'admin' || user.role === 'manager')) {
        console.log('使用者是管理員或經理，開始載入意見數量');
        this.loadPendingFeedbackCount();
      } else {
        console.log('使用者不是管理員或經理，或尚未登入，將數量設為 0');
        this.pendingFeedbackCount.set(0);
      }
    });
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
  }

  ngOnDestroy() {
    // 清理訂閱
    if (this.routerSubscription) {
      this.routerSubscription.unsubscribe();
    }
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
    document.getElementById('profileMenu')?.classList.toggle('show');
  }

  toggleSystemMenu() {
    document.getElementById('systemMenu')?.classList.toggle('show');
  }

  closeAllDropdowns() {
    // 關閉系統管理下拉選單
    document.getElementById('systemMenu')?.classList.remove('show');
    // 關閉個人資料下拉選單
    document.getElementById('profileMenu')?.classList.remove('show');
  }

  logout() {
    this.authService.logout();
  }

  async loadPendingFeedbackCount() {
    try {
      console.log('開始載入待處理意見數量...');
      const query = { status: { $in: ['open', 'in-progress'] } };
      console.log('查詢條件:', query);
      const count = await this.mongodbService.count('feedback', query);
      console.log('取得的數量:', count);
      this.pendingFeedbackCount.set(count);
      console.log('pendingFeedbackCount 已設為:', count);
    } catch (error) {
      console.error('讀取待處理意見數量時發生錯誤:', error);
      this.pendingFeedbackCount.set(0);
    }
  }
}
