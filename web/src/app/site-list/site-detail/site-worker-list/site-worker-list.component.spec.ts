import { ComponentFixture, TestBed } from '@angular/core/testing';

import { SiteWorkerListComponent } from './site-worker-list.component';

describe('SiteWorkerListComponent', () => {
  let component: SiteWorkerListComponent;
  let fixture: ComponentFixture<SiteWorkerListComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SiteWorkerListComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(SiteWorkerListComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
