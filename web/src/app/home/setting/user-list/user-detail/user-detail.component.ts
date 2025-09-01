import { Component, OnInit } from '@angular/core';
import { User } from '../../../../model/user.model';
import { ActivatedRoute, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { MongodbService } from '../../../../services/mongodb.service';
import { ToastService } from '../../../../services/toast.service';

@Component({
    selector: 'app-user-detail',
    imports: [FormsModule],
    templateUrl: './user-detail.component.html',
    styleUrl: './user-detail.component.scss'
})
export class UserDetailComponent implements OnInit {
  user: User = {
    name: '',
    email: '',
    cell: '',
    department: '',
    account: '',
    password: '',
    role: 'user',
    enabled: true,
    isFromSSO: false,
    gender: '',
    birthday: '',
    bloodType: ''
  };
  saving = false;
  loading = false;
  userId: string | null = null;
  errorMessage: string | null = null;

  constructor(
    private route: ActivatedRoute, 
    private mongodbService: MongodbService,
    private router: Router,
    private toastService: ToastService
  ) {
    console.log('UserDetailComponent'); 
  }

  ngOnInit() {
    this.route.params.subscribe(params => {
      if (params['id'] && params['id'] !== 'new') {
        this.userId = params['id'];
        this.loadUserData();
      } else if (params['idno']) {
        // 如果以身分證號碼尋找使用者
        this.findUserByIdno(params['idno']);
      }
    });
  }

  async loadUserData() {
    try {
      this.loading = true;
      this.errorMessage = null;
      
      if (this.userId) {
        const userData = await this.mongodbService.getById('user', this.userId);
        if (userData) {
          this.user = userData;
        } else {
          this.errorMessage = '找不到此使用者資料';
        }
      }
    } catch (error) {
      console.error('讀取使用者資料時發生錯誤', error);
      this.errorMessage = '讀取使用者資料時發生錯誤';
    } finally {
      this.loading = false;
    }
  }

  async findUserByIdno(idno: string) {
    try {
      this.loading = true;
      this.errorMessage = null;
      
      // 使用身分證號碼查詢使用者
      const users = await this.mongodbService.getArray('user', { idno: idno });
      if (users && users.length > 0) {
        this.user = users[0];
        if (this.user._id) {
          this.userId = this.user._id.toString();
        }
      } else {
        this.errorMessage = '找不到此身分證號碼的使用者';
      }
    } catch (error) {
      console.error('查詢使用者資料時發生錯誤', error);
      this.errorMessage = '查詢使用者資料時發生錯誤';
    } finally {
      this.loading = false;
    }
  }

  async saveUser() {
    if (!this.validateUserData()) {
      return;
    }

    this.saving = true;
    this.errorMessage = null;

    try {
      let result;
      
      if (this.userId) {
        // 更新現有使用者
        result = await this.mongodbService.put('user', this.userId, this.user);
      } else {
        // 新增使用者
        result = await this.mongodbService.post('user', this.user);
        if (result && result._id) {
          this.userId = result._id.toString();
        }
      }
      
      console.log('儲存結果:', result);
      
      // 導回使用者列表或顯示成功訊息
      setTimeout(() => {
        this.saving = false;
        // 可以在此加入成功訊息或導回列表頁面
        this.toastService.success('儲存使用者 ' + this.user.name + ' 成功');

        // this.router.navigate(['/home/setting/user-list']);
      }, 500);
    } catch (error) {
      console.error('儲存使用者資料時發生錯誤', error);
      this.errorMessage = '儲存使用者資料時發生錯誤';
      this.saving = false;
    }
  }

  // 簡單的使用者資料驗證
  validateUserData(): boolean {
    if (!this.user.name) {
      this.errorMessage = '請輸入姓名';
      return false;
    }
    if (!this.user.account) {
      this.errorMessage = '請輸入帳號';
      return false;
    }
    return true;
  }

  navigateToList() {
    this.router.navigate(['/user']);
  }
}
