import { Component, HostListener, OnInit } from '@angular/core';
import { RouterModule } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { TopBarComponent } from '../shared/top-bar/top-bar.component';
import { SideMenuComponent } from '../shared/side-menu/side-menu.component';
import { CurrentSiteService } from '../services/current-site.service';
import { computed } from '@angular/core';

@Component({
    selector: 'app-home',
    imports: [RouterModule, TopBarComponent, SideMenuComponent],
    templateUrl: './home.component.html',
    styleUrls: ['./home.component.scss']
})
export class HomeComponent implements OnInit {
  isMenuOpen: boolean = false;
  isLargeScreen: boolean = false;
  currentSite = computed(() => this.currentSiteService.currentSite());
  
  get siteId(): string | null {
    return this.currentSite()?.['_id'] || null;
  }

  constructor(
    private authService: AuthService,
    private currentSiteService: CurrentSiteService
  ) {
    // 點擊遮罩關閉選單
    document.addEventListener('click', (e: MouseEvent) => {
      if (
        document.getElementById('container')?.classList.contains('menu-open') &&
        e.target instanceof Element &&
        !e.target.closest('#menuDiv') &&
        !e.target.closest('.navbar-toggler')
      ) {
        this.closeMenu();
      }
    });
  }

  ngOnInit() {
    this.checkScreenSize();
  }

  @HostListener('window:resize', ['$event'])
  onResize() {
    this.checkScreenSize();
  }

  checkScreenSize() {
    this.isLargeScreen = window.innerWidth >= 992;
  }

  toggleMenu() {
    this.isMenuOpen = !this.isMenuOpen;
    
    if (this.isLargeScreen) {
      // 大屏幕下，打开菜单实际上是隐藏它，关闭菜单是显示它
      const menuDiv = document.getElementById('menuDiv');
      if (menuDiv) {
        if (this.isMenuOpen) {
          menuDiv.style.width = '0';
          menuDiv.style.minWidth = '0';
          menuDiv.style.overflow = 'hidden';
        } else {
          menuDiv.style.width = '250px';
          menuDiv.style.minWidth = '250px';
          menuDiv.style.overflow = '';
        }
      }
    } else {
      // 小屏幕下的正常行为
      document.getElementById('container')?.classList.toggle('menu-open');
    }
  }

  closeMenu() {
    this.isMenuOpen = false;
    
    if (this.isLargeScreen) {
      const menuDiv = document.getElementById('menuDiv');
      if (menuDiv) {
        menuDiv.style.width = '250px';
        menuDiv.style.minWidth = '250px';
        menuDiv.style.overflow = '';
      }
    } else {
      document.getElementById('container')?.classList.remove('menu-open');
    }
  }

  toggleProfileMenu() {
    document.getElementById('profileMenu')?.classList.toggle('show');
  }

  logout() {
    this.authService.logout();
  }
}
