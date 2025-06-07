import { ComponentFixture, TestBed } from '@angular/core/testing';

import { SiteUserListComponent } from './site-user-list.component';

describe('SiteUserListComponent', () => {
  let component: SiteUserListComponent;
  let fixture: ComponentFixture<SiteUserListComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SiteUserListComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(SiteUserListComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
