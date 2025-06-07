import { ComponentFixture, TestBed } from '@angular/core/testing';

import { SiteBlankFormComponent } from './site-blank-form.component';

describe('SiteBlankFormComponent', () => {
  let component: SiteBlankFormComponent;
  let fixture: ComponentFixture<SiteBlankFormComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SiteBlankFormComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(SiteBlankFormComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
