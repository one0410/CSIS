import { Component } from '@angular/core';
import { Site } from '../site-list.component';
import { FormsModule } from '@angular/forms';

@Component({
    selector: 'app-new-site',
    imports: [FormsModule],
    templateUrl: './new-site.component.html',
    styleUrl: './new-site.component.scss'
})
export class NewSiteComponent {

  site: Site = {
    projectNo: '',
    projectName: '',
    image: '',
    startDate: '',
    endDate: '',
    county: '',
    town: '',
    factories: [],
    constructionTypes: [],
  }
  newArea: string = '';

  addFactory() {
    this.site.factories.push({ name: '', areas: [] });
  }

  addArea(event: Event, factory: { name: string; areas: string[] }) {
    event.preventDefault();
    console.log('addArea', event);
    const target = event.target as HTMLInputElement;
    factory.areas.push(target.value);
    target.value = '';
  }

  removeFactory(index: number) {
    this.site.factories.splice(index, 1);
  }

  removeArea(factory: { name: string; areas: string[] }, index: number) {
    factory.areas.splice(index, 1);
  }

  onSubmit() {
    console.log(this.site);
  }
}
