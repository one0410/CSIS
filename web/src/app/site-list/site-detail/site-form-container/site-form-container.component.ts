import { Component } from '@angular/core';
import { ActivatedRoute, RouterModule } from '@angular/router';
import { CurrentSiteService } from '../../../services/current-site.service';

@Component({
  selector: 'app-site-form-container',
  imports: [RouterModule],
  templateUrl: './site-form-container.component.html',
  styleUrl: './site-form-container.component.scss',
})
export class SiteFormContainerComponent {

  constructor(private route: ActivatedRoute, private currentSiteService: CurrentSiteService) {
   
  }

  async ngOnInit() {
    this.route.paramMap.subscribe(async (params) => {
      const id = params.get('id');
      if (id) {
        await this.currentSiteService.setCurrentSiteById(id);
      }
    });
  }
  
}
