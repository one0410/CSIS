import { ComponentFixture, TestBed } from '@angular/core/testing';

import { DailyFormStatsComponent } from './daily-form-stats.component';

describe('DailyFormStatsComponent', () => {
  let component: DailyFormStatsComponent;
  let fixture: ComponentFixture<DailyFormStatsComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DailyFormStatsComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(DailyFormStatsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
