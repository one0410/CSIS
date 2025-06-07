
import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { QRCodeComponent } from 'angularx-qrcode';
import { environment } from '../../environments/environment';
import { AuthService } from '../services/auth.service';
import { ToastService } from '../services/toast.service';
import { HistoryService } from '../services/history.service';
import { MongodbService } from '../services/mongodb.service';

@Component({
    selector: 'app-login',
    imports: [FormsModule, QRCodeComponent],
    templateUrl: './login.component.html',
    styleUrl: './login.component.scss'
})
export class LoginComponent {
  username = '';
  password = '';

  isLoading = false;
  buildVersion = environment.buildVersion;

  googleSso = false;
  googleSsoUrl = '';
  adSso = false;
  logourl = '';
  currentSiteUrl = '';

  constructor(
    private authService: AuthService,
    private router: Router,
    private toastService: ToastService,
    private historyService: HistoryService,
    private mongodbService: MongodbService,
  ) {
    console.log('login component');

    // 產生1到5的亂數。
    let random = Math.floor(Math.random() * 8) + 1;
    this.logourl = 'assets/logo' + random + '.jpg';
    this.logourl = 'header.logo.svg';

    // 獲取當前網站 URL
    this.currentSiteUrl = window.location.origin + window.location.pathname;

    // check if already login
    if (this.authService.isLoggedIn()) {
      this.router.navigate(['/room']);
    }

    // 看看是否傳入 provider=google,account=xxx
    const urlParams = new URLSearchParams(window.location.search);
    const provider = urlParams.get('provider');
    const account = urlParams.get('account') || urlParams.get('token');
    if (provider && account) {
      console.log('provider', provider);
      console.log('account', account);
      
      this.authService.login(account, null).then((result) => {
        if (result.success && result.user) {
          console.log('login success');
          this.historyService.add('login', '使用者登入');
          this.router.navigate(['/calendar']);
        } else {
          console.log('login failed');
          let msg = 'message' in result ? result.message : '登入失敗，請檢查帳號密碼。';
          this.toastService.show(msg);
        }
      });
    }

    this.checkSsoSetting();
  }

  async checkSsoSetting() {
    this.googleSso = await this.mongodbService.getSetting('googleSso');
    if (this.googleSso) {
      this.googleSsoUrl = window.location.port === '4200' ? 'http://localhost:3000/auth/google' : '/auth/google';
    }
    this.adSso = await this.mongodbService.getSetting('adSso') || (await this.mongodbService.getSetting('sso')).type;
  }

  async submit() {
    this.isLoading = true;

    // test
    // if (this.username === 'admin' && this.password === '1234') {
    //   this.router.navigate(['/user']);
    //   sessionStorage.setItem('username', 'admin');
    //   sessionStorage.setItem('account', 'admin');
    //   sessionStorage.setItem('isLogin', 'true');
    //   sessionStorage.setItem('user', JSON.stringify({ name: 'admin', account: 'admin' }));
  
    //   return;
    // }

    try {
      let result = await this.authService.login(this.username, this.password);

      if ('success' in result && result.success === true) {
        console.log('login success');

        this.historyService.add('login', '使用者登入');

        // if (result.internal === true || result.internal === 'true') {
        //   this.router.navigate(['/upload']);
        // } else {
        //   this.router.navigate(['/download']);
        // }
        this.router.navigate(['/site-selector']);
      } else {
        console.log('login failed');
        let msg = 'message' in result ? result.message : '登入失敗，請檢查帳號密碼。';
        this.toastService.show(msg);
      }
    } catch (error) {
      console.log('login error', error);
      this.toastService.show('登入失敗，請檢查網路。或聯絡系統管理員。');
    }

    this.isLoading = false;
  }

  async sso() {
    let sso = await this.mongodbService.getSetting('sso');
    // redirect to sso page
    window.location.href = sso.loginUrl;
  }
}
