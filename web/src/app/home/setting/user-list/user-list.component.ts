import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { AgGridModule } from 'ag-grid-angular';
import { ColDef, GridApi, GridOptions, GridReadyEvent } from 'ag-grid-community';
import { MongodbService } from '../../../services/mongodb.service';
import { User } from '../../../model/user.model';

@Component({
    selector: 'app-user-list',
    imports: [AgGridModule],
    templateUrl: './user-list.component.html',
    styleUrl: './user-list.component.scss'
})
export class UserListComponent {
  users: User[] = [];
  
  defaultColDef: ColDef = {
    resizable: true,
    sortable: true,
    width: 120,
    autoHeight: true,
  };
  columnDefs = [
    { headerName: '部門', field: 'department', flex: 1, minWidth: 100 },
    { headerName: '工號', field: 'employeeId', flex: 1, minWidth: 100 },
    { headerName: '帳號', field: 'account', flex: 1, minWidth: 100 },
    { headerName: '姓名', field: 'name', flex: 1, minWidth: 100 },
    { headerName: '性別', field: 'gender', flex: 1, minWidth: 100 },
    { headerName: '角色', field: 'role', flex: 1, minWidth: 100 },
    { headerName: '電子郵件', field: 'email', flex: 1, minWidth: 100 },
    { headerName: '電話', field: 'cell', flex: 1, minWidth: 100 },
  ];

  gridOptions: GridOptions = {
    pagination: true,
    defaultColDef: this.defaultColDef,
    columnDefs: this.columnDefs,
    rowHeight: 40,
    rowData: this.users,
    onCellClicked: (params) => {
      console.log(params);
      // navigate to user detail page
      this.router.navigate(['/setting/user', params.data._id]);
    },
    // getRowStyle: (params) => {
    //   return {
    //     backgroundColor: params.data.gender === '男' ? 'lightblue' : 'lightpink',
    //   };
    // },
  };

  api: GridApi | undefined;

  constructor(
    private router: Router,
    private mongodbService: MongodbService
  ) {}

  async ngOnInit() {
    // 從 MongoDB 取得使用者資料
    try {
              const result = await this.mongodbService.get('user', {}, { limit: 0 });
        this.users = result.data;
      console.log(`載入了 ${this.users.length} 筆使用者資料`);
      this.gridOptions.rowData = this.users;
      if (this.api) {
        this.api.setGridOption('rowData', this.users);
      }
    } catch (error) {
      console.error('無法讀取使用者資料', error);
    }
  } 

  onGridReady(params: GridReadyEvent) {
    this.api = params.api;
    if (this.users && this.users.length > 0) {
      this.api.setGridOption('rowData', this.users);
    }
  }

  navigateToAddUser() {
    // 導航到用戶新增頁面
    this.router.navigate(['/setting/user/new']);
  }
}




