import { ComponentFixture, TestBed } from '@angular/core/testing';

import { SiteFormContainerComponent } from './site-form-container.component';

describe('SiteFormContainerComponent', () => {
  let component: SiteFormContainerComponent;
  let fixture: ComponentFixture<SiteFormContainerComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SiteFormContainerComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(SiteFormContainerComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
