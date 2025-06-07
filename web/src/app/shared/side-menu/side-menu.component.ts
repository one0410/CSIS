import { Component, AfterViewInit, Input, computed } from '@angular/core';
import { RouterModule } from '@angular/router';
import { CurrentSiteService } from '../../services/current-site.service';

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
  
  currentSite = computed(() => this.currentSiteService.currentSite());
  disqualifiedEquipmentCount = computed(() => this.currentSiteService.disqualifiedEquipmentCount());
  pendingFormsCount = computed(() => this.currentSiteService.pendingFormsCount());
  workersWithoutHazardNoticeCount = computed(() => this.currentSiteService.workersWithoutHazardNoticeCount());

  constructor(private currentSiteService: CurrentSiteService) {}

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
  }
}
