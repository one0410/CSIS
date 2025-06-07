import { Component, ViewChild } from '@angular/core';
import { ColDef, GridApi, GridOptions, GridReadyEvent } from 'ag-grid-community';
import { AgGridAngular } from 'ag-grid-angular';
import { NewBlankFormModalComponent } from './new-blank-form-modal/new-blank-form-modal.component';

@Component({
    selector: 'app-site-blank-form',
    imports: [AgGridAngular, NewBlankFormModalComponent],
    templateUrl: './site-blank-form.component.html',
    styleUrl: './site-blank-form.component.scss'
})

export class SiteBlankFormComponent {
  @ViewChild('newBlankFormModal') newBlankFormModal!: NewBlankFormModalComponent;

  imageForms: ImageForm[] = [];

  defaultColDef: ColDef = {
    resizable: true,
    sortable: true,
    width: 120,
    autoHeight: true,
  };
  columnDefs = [
    { headerName: '發送日期', field: 'sendDate', flex: 1, minWidth: 100 },
    { headerName: '名稱', field: 'name', flex: 1, minWidth: 100 },
    { headerName: '回填份數', field: 'count', flex: 1, minWidth: 100 },
  ];

  gridOptions: GridOptions = {
    pagination: true,
    defaultColDef: this.defaultColDef,
    columnDefs: this.columnDefs,
    rowHeight: 40,
    rowData: this.imageForms,
    onCellClicked: (params) => {
      console.log(params);
      // navigate to user detail page
      // this.router.navigate(['/user', params.data.idno]);
    },
    onRowClicked: (params) => {
      console.log(params);

      // show qrcode modal
      //this.qrcodeModal.show();
    }
  };

  api: GridApi | undefined; 
  
  constructor() {}

  ngOnInit() {
    // test data
    this.imageForms = [
      { _id: 1, name: '表單一', sendDate: new Date('2024-11-08'), image: 'form1', count: 10 },
    ];

    this.gridOptions.rowData = this.imageForms;
  }

  onGridReady(params: GridReadyEvent) {
    console.log('onGridReady', params);
    this.api = params.api;
  }

  showBlankFormDialog() {
    console.log('showBlankFormDialog');
    this.newBlankFormModal.show();
  }

  onSendBlankForm(event: any) {
    console.log('onSendBlankForm', event);

    // add new row to grid
    this.imageForms.push({
      _id: this.imageForms.length + 1,
      name: '聲明書',
      sendDate: new Date(),
      image: 'form2',
      count: 0
    });

    this.api?.setGridOption('rowData', this.imageForms);
  }
}

export interface ImageForm {
  _id: number;
  name: string;
  sendDate: Date;
  image: string; // gridfs id
  count: number;
}
