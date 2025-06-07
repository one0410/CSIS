import { ComponentFixture, TestBed } from '@angular/core/testing';

import { SiteFormListComponent } from './site-form-list.component';

describe('SiteFormListComponent', () => {
  let component: SiteFormListComponent;
  let fixture: ComponentFixture<SiteFormListComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SiteFormListComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(SiteFormListComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
