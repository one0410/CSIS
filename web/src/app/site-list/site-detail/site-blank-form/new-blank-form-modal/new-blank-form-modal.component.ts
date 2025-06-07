import { Component, EventEmitter, Output } from '@angular/core';
import { BlankFormListComponent } from '../blank-form-list/blank-form-list.component';
import * as bootstrap from 'bootstrap';

@Component({
    selector: 'app-new-blank-form-modal',
    imports: [BlankFormListComponent],
    templateUrl: './new-blank-form-modal.component.html',
    styleUrl: './new-blank-form-modal.component.scss'
})
export class NewBlankFormModalComponent {

  @Output() onSendBlankForm = new EventEmitter<any>();

  show() {
    const modal = bootstrap.Modal.getOrCreateInstance('#newBlankFormModal');
    if (modal) {
      modal.show();
    }
  }

  SendBlankForm(event: any) {
    this.onSendBlankForm.emit(event);

    const modal = bootstrap.Modal.getOrCreateInstance('#newBlankFormModal');
    if (modal) {
      modal.hide();
    }
  }
}
