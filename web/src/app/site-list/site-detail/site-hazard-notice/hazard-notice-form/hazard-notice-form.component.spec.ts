import { ComponentFixture, TestBed } from '@angular/core/testing';

import { HazardNoticeFormComponent } from './hazard-notice-form.component';

describe('HazardNoticeFormComponent', () => {
  let component: HazardNoticeFormComponent;
  let fixture: ComponentFixture<HazardNoticeFormComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [HazardNoticeFormComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(HazardNoticeFormComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
