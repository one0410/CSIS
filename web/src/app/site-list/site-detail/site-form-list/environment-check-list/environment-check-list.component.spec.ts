import { ComponentFixture, TestBed } from '@angular/core/testing';

import { EnvironmentCheckListComponent } from './environment-check-list.component';

describe('EnvironmentCheckListComponent', () => {
  let component: EnvironmentCheckListComponent;
  let fixture: ComponentFixture<EnvironmentCheckListComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [EnvironmentCheckListComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(EnvironmentCheckListComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
