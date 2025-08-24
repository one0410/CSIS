import { Component, AfterViewInit, Input, Output, EventEmitter, computed } from '@angular/core';
import { RouterModule } from '@angular/router';
import { CurrentSiteService } from '../../services/current-site.service';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-side-menu',
  standalone: true,
  imports: [RouterModule],
  templateUrl: './side-menu.component.html',
  styleUrl: './side-menu.component.scss'
})
export class SideMenuComponent implements AfterViewInit {
  @Input() isMenuOpen: boolean = false;
  @Input() siteId: string | null = null;
  @Output() menuClose = new EventEmitter<void>();
  
  currentSite = computed(() => this.currentSiteService.currentSite());
  disqualifiedEquipmentCount = computed(() => this.currentSiteService.disqualifiedEquipmentCount());
  equipmentWarningCount = computed(() => this.currentSiteService.equipmentWarningCount());
  pendingFormsCount = computed(() => this.currentSiteService.pendingFormsCount());
  workersWithoutHazardNoticeCount = computed(() => this.currentSiteService.workersWithoutHazardNoticeCount());
  
  // 檢查當前使用者是否為本工地的專案經理
  isProjectManager = computed(() => {
    const user = this.authService.user();
    if (!user || !user.belongSites || !this.siteId) {
      return false;
    }
    
    // 檢查使用者在此工地的角色是否為專案經理
    const siteRole = user.belongSites.find(site => site.siteId === this.siteId);
    return siteRole?.role === 'manager' || siteRole?.role === 'projectManager';
  });

  constructor(
    private currentSiteService: CurrentSiteService,
    private authService: AuthService
  ) {}

  ngAfterViewInit() {
    let menuButtons = document.querySelectorAll('.accordion-button');
    menuButtons.forEach((button) => {
      button.addEventListener('click', () => {
        // 切换按钮状态
        button.classList.toggle('collapsed');
        
        // 获取目标元素的ID
        const target = button.getAttribute('data-bs-target');
        if (target) {
          // 移除#获取纯ID
          const targetId = target.replace('#', '');
          const collapseElement = document.getElementById(targetId);
          if (collapseElement) {
            collapseElement.classList.toggle('show');
          }
        } else if (button.nextElementSibling) {
          // 如果没有data-bs-target属性，尝试直接切换下一个兄弟元素
          button.nextElementSibling.classList.toggle('show');
        }
      });
    });
  }
  
  closeMenu() {
    document.getElementById('container')?.classList.remove('menu-open');
    this.menuClose.emit();
  }

  // 處理導航連結點擊，在小螢幕時自動關閉選單
  onNavLinkClick() {
    // 檢查是否為小螢幕 (lg breakpoint 以下)
    if (window.innerWidth < 992) {
      this.closeMenu();
    }
  }
}
