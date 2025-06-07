import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { AllCommunityModule, ModuleRegistry } from 'ag-grid-community'; 

@Component({
    selector: 'app-root',
    imports: [RouterOutlet],
    templateUrl: './app.component.html',
    styleUrl: './app.component.scss'
})
export class AppComponent {
  title = 'CSIS';

  constructor() {
    ModuleRegistry.registerModules([AllCommunityModule]);
  }
}
