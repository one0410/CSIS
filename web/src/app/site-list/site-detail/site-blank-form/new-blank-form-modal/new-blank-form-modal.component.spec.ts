import { ComponentFixture, TestBed } from '@angular/core/testing';

import { NewBlankFormModalComponent } from './new-blank-form-modal.component';

describe('NewBlankFormModalComponent', () => {
  let component: NewBlankFormModalComponent;
  let fixture: ComponentFixture<NewBlankFormModalComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [NewBlankFormModalComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(NewBlankFormModalComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
