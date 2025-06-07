import { ComponentFixture, TestBed } from '@angular/core/testing';

import { SiteDashboardWeatherComponent } from './site-dashboard-weather.component';

describe('SiteDashboardWeatherComponent', () => {
  let component: SiteDashboardWeatherComponent;
  let fixture: ComponentFixture<SiteDashboardWeatherComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SiteDashboardWeatherComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(SiteDashboardWeatherComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
