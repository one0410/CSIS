import { ComponentFixture, TestBed } from '@angular/core/testing';

import { BlankFormListComponent } from './blank-form-list.component';

describe('BlankFormListComponent', () => {
  let component: BlankFormListComponent;
  let fixture: ComponentFixture<BlankFormListComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [BlankFormListComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(BlankFormListComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
