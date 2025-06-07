import { Component, Output, EventEmitter } from '@angular/core';

@Component({
    selector: 'app-blank-form-list',
    imports: [],
    templateUrl: './blank-form-list.component.html',
    styleUrl: './blank-form-list.component.scss'
})
export class BlankFormListComponent {

  @Output() onSendBlankForm = new EventEmitter<any>();

  SendBlankForm(event: any) {
    this.onSendBlankForm.emit(event);
  }
}
