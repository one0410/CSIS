import { computed, Injectable, signal } from '@angular/core';
import { User } from '../model/user.model';
import { MongodbService } from './mongodb.service';

@Injectable({
  providedIn: 'root',
})
export class AuthService {
  urlPrefix = '';
  private userSignal = signal<User | null>(null);
  user = computed(() => this.userSignal());

  constructor(private mongodbService: MongodbService) {
    // if port is 4200, set api url to localhost:3000
    if (window.location.port === '4200') {
      this.urlPrefix = 'http://localhost:3000';
    }

    if (sessionStorage.getItem('user')) {
      this.userSignal.set(JSON.parse(sessionStorage.getItem('user')!));
    }
  }

  async login(
    account: string,
    password: string | null
  ): Promise<{
    success: boolean;
    token?: string;
    message: string;
    enabled?: boolean;
    locked?: boolean;
    user?: User;
  }> {
    // if (environment.production === false) {
    //   return new Promise((resolve, reject) => {
    //     setTimeout(() => {
    //       resolve(true);
    //     }, 1000);
    //   });
    // }

    console.log('authservice login', account, password);
    const response = await fetch(this.urlPrefix + '/api/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ account, password }),
    });

    if (response.status === 401) {
      return { success: false, message: '帳號密碼錯誤' };
    }
    if (response.status === 403) {
      return { success: false, message: '帳號已停用' };
    }
    if (response.status === 404) {
      return { success: false, message: '帳號不存在' };
    }
    if (response.status === 500) {
      return { success: false, message: '伺服器錯誤' };
    }

    let result = await response.json();

    console.log('authservice login response', response, result);

    // check if user has name property
    if (result.user) {
      // 登入成功後，重新從資料庫載入完整的用戶資料（包含 avatar 等所有欄位）
      try {
        const fullUserData = await this.mongodbService.getById('user', result.user._id);
        if (fullUserData) {
          this.userSignal.set(fullUserData);
          sessionStorage.setItem('username', fullUserData.name || '');
          sessionStorage.setItem('account', fullUserData.account || '');
          sessionStorage.setItem('isLogin', 'true');
          sessionStorage.setItem('user', JSON.stringify(fullUserData));
          
          // 更新 result 中的 user 資料
          result.user = fullUserData;
        } else {
          // 如果無法載入完整資料，使用原本的資料
          this.userSignal.set(result.user);
          sessionStorage.setItem('username', this.user()?.name || '');
          sessionStorage.setItem('account', this.user()?.account || '');
          sessionStorage.setItem('isLogin', 'true');
          sessionStorage.setItem('user', JSON.stringify(this.user()));
        }
      } catch (error) {
        console.error('載入完整用戶資料時發生錯誤，使用登入回傳的基本資料:', error);
        // 如果載入失敗，使用原本的資料
        this.userSignal.set(result.user);
        sessionStorage.setItem('username', this.user()?.name || '');
        sessionStorage.setItem('account', this.user()?.account || '');
        sessionStorage.setItem('isLogin', 'true');
        sessionStorage.setItem('user', JSON.stringify(this.user()));
      }
    }
    return result;
  }

  async logout() {
    // get /api/logout
    try {
      // clear session storage
      // sessionStorage.removeItem('username');
      // sessionStorage.removeItem('account');
      // sessionStorage.removeItem('isLogin');
      // sessionStorage.removeItem('user');
      sessionStorage.clear();

      await fetch(this.urlPrefix + '/api/logout', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      return { success: true, message: 'logout success' };
    } catch (error) {
      console.log('logout error', error);

      return { success: false, message: 'logout error' };
    }
  }

  isLoggedIn() {
    return sessionStorage.getItem('isLogin') === 'true';
  }

  updateUserSignal(user: User) {
    this.userSignal.set(user);
  }

  getConfig() {
    return fetch(this.urlPrefix + '/api/serverconfig', {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });
  }

  saveConfig(config: any) {
    return fetch(this.urlPrefix + '/api/serverconfig', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(config),
    });
  }

  // 重新載入當前使用者的完整資訊（用於權限更新後同步最新資料）
  async refreshCurrentUser(): Promise<void> {
    const currentUser = this.user();
    if (!currentUser || !currentUser._id) {
      console.warn('無法重新載入使用者資訊：目前沒有登入的使用者');
      return;
    }

    try {
      console.log('重新載入使用者資訊:', currentUser._id);
      const updatedUser = await this.mongodbService.getById('user', currentUser._id);
      
      if (updatedUser) {
        this.userSignal.set(updatedUser);
        sessionStorage.setItem('user', JSON.stringify(updatedUser));
        console.log('使用者資訊已更新:', updatedUser);
      } else {
        console.warn('無法從資料庫重新載入使用者資訊');
      }
    } catch (error) {
      console.error('重新載入使用者資訊時發生錯誤:', error);
    }
  }
}
