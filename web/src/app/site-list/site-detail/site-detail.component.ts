import { Component, computed, OnInit } from '@angular/core';

import { ActivatedRoute, RouterModule } from '@angular/router';
import { CurrentSiteService } from '../../services/current-site.service';
import { SideMenuComponent } from '../../shared/side-menu/side-menu.component';

@Component({
  selector: 'app-site-detail',
  standalone: true,
  imports: [RouterModule],
  templateUrl: './site-detail.component.html',
  styleUrl: './site-detail.component.scss',
})
export class SiteDetailComponent {
  site = computed(() => this.currentSiteService.currentSite());
  isLoading: boolean = true;
  siteId: string | null = null;

  constructor(
    private route: ActivatedRoute,
    private currentSiteService: CurrentSiteService
  ) {
    this.route.paramMap.subscribe((params) => {
      const id = params.get('id');
      this.siteId = id;
      if (id) {
        this.currentSiteService.setCurrentSiteById(id);
      }
    });
  }
}
