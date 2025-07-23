import { Component, Input, computed } from '@angular/core';
import { CurrentSiteService } from '../../../../services/current-site.service';

@Component({
  selector: 'app-site-form-header',
  standalone: true,
  imports: [],
  templateUrl: './site-form-header.component.html',
  styleUrl: './site-form-header.component.scss'
})
export class SiteFormHeaderComponent {
  @Input() title: string = '表單標題';
  
  site = computed(() => this.currentSiteService.currentSite());

  constructor(private currentSiteService: CurrentSiteService) {}
}
