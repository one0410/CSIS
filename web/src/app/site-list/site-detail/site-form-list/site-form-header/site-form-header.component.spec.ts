import { ComponentFixture, TestBed } from '@angular/core/testing';

import { SiteFormHeaderComponent } from './site-form-header.component';

describe('SiteFormHeaderComponent', () => {
  let component: SiteFormHeaderComponent;
  let fixture: ComponentFixture<SiteFormHeaderComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SiteFormHeaderComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(SiteFormHeaderComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
