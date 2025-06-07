import { ComponentFixture, TestBed } from '@angular/core/testing';

import { NewSiteComponent } from './new-site.component';

describe('NewSiteComponent', () => {
  let component: NewSiteComponent;
  let fixture: ComponentFixture<NewSiteComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [NewSiteComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(NewSiteComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
