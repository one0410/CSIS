import { ComponentFixture, TestBed } from '@angular/core/testing';

import { SiteAccidentListComponent } from './site-accident-list.component';

describe('SiteAccidentListComponent', () => {
  let component: SiteAccidentListComponent;
  let fixture: ComponentFixture<SiteAccidentListComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SiteAccidentListComponent]
    })
    .compileComponents();
    
    fixture = TestBed.createComponent(SiteAccidentListComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
}); 