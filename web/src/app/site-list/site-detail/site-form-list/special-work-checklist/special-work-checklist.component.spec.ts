import { ComponentFixture, TestBed } from '@angular/core/testing';

import { SpecialWorkChecklistComponent } from './special-work-checklist.component';

describe('SpecialWorkChecklistComponent', () => {
  let component: SpecialWorkChecklistComponent;
  let fixture: ComponentFixture<SpecialWorkChecklistComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SpecialWorkChecklistComponent]
    })
    .compileComponents();
    
    fixture = TestBed.createComponent(SpecialWorkChecklistComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
}); 