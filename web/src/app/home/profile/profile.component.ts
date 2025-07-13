import { Component, ViewChild, ElementRef } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MongodbService } from '../../services/mongodb.service';
import { ToastService } from '../../services/toast.service';
import { AuthService } from '../../services/auth.service';

@Component({
    selector: 'app-profile',
    imports: [FormsModule],
    templateUrl: './profile.component.html',
    styleUrl: './profile.component.scss'
})
export class ProfileComponent {
  user: any;
  originalUser: any;
  password2: string = '';
  isLoading: boolean = true;
  
  // 相機相關屬性
  isCameraOpen: boolean = false;
  photoTaken: boolean = false;
  currentStream: MediaStream | null = null;
  currentCamera: 'user' | 'environment' = 'user'; // 前鏡頭 or 後鏡頭
  
  @ViewChild('videoElement') videoElement!: ElementRef<HTMLVideoElement>;
  @ViewChild('canvasElement') canvasElement!: ElementRef<HTMLCanvasElement>;

  constructor(
    private mongodbService: MongodbService,
    private toastService: ToastService,
    private authService: AuthService
  ) {}

  ngOnInit() {
    this.getUserProfile();
  }

  async getUserProfile() {
    try {
      this.isLoading = true;
      // 從 sessionStorage 獲取當前使用者 ID
      const currentUser = JSON.parse(sessionStorage.getItem('user')!);
      if (currentUser && currentUser._id) {
        // 使用 mongodbService 獲取用戶完整資料
        const userData = await this.mongodbService.getById('user', currentUser._id);
        if (userData) {
          this.user = userData;
          // 保存原始資料用於重置
          this.originalUser = JSON.parse(JSON.stringify(userData));
          this.password2 = this.user.password || '';
        } else {
          this.user = {
            account: '',
            name: '',
            email: '',
            password: '',
          };
          this.originalUser = JSON.parse(JSON.stringify(this.user));
          this.toastService.show('無法獲取個人資料');
        }
      } else {
        this.toastService.show('請先登入');
      }
    } catch (error) {
      console.error('獲取個人資料時發生錯誤', error);
      this.toastService.show('獲取個人資料時發生錯誤');
    } finally {
      this.isLoading = false;
    }
  }

  async save() {
    try {
      // 檢查密碼是否一致
      if (this.user.password !== this.password2) {
        this.toastService.show('兩次輸入的密碼不一致');
        return;
      }

      this.isLoading = true;
      // 更新用戶資料
      await this.mongodbService.put('user', this.user._id, this.user);
      
      // 更新 sessionStorage 中的用戶資料
      sessionStorage.setItem('user', JSON.stringify(this.user));
      
      // 更新 AuthService 的用戶 signal
      this.authService.updateUserSignal(this.user);
      
      // 更新原始資料
      this.originalUser = JSON.parse(JSON.stringify(this.user));
      
      this.toastService.show('個人資料存檔成功');
    } catch (error) {
      console.error('儲存個人資料時發生錯誤', error);
      this.toastService.show('儲存個人資料時發生錯誤');
    } finally {
      this.isLoading = false;
    }
  }

  cancel() {
    // 還原為原始資料
    this.user = JSON.parse(JSON.stringify(this.originalUser));
    this.password2 = this.user.password || '';
    this.toastService.show('已取消變更');
  }

  // 大頭貼相關方法
  selectAvatar() {
    const input = document.getElementById('avatarInput') as HTMLInputElement;
    input?.click();
  }

  onAvatarChange(event: Event) {
    const target = event.target as HTMLInputElement;
    const file = target.files?.[0];
    
    if (file) {
      // 檢查檔案類型
      if (!file.type.startsWith('image/')) {
        this.toastService.show('請選擇圖片檔案');
        return;
      }
      
      // 檢查檔案大小 (限制 5MB)
      if (file.size > 5 * 1024 * 1024) {
        this.toastService.show('圖片檔案大小不能超過 5MB');
        return;
      }
      
      // 讀取並 resize 圖片
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          // 計算新的尺寸，保持比例
          const maxSize = 100;
          let { width, height } = img;
          
          if (width > height) {
            if (width > maxSize) {
              height = (height * maxSize) / width;
              width = maxSize;
            }
          } else {
            if (height > maxSize) {
              width = (width * maxSize) / height;
              height = maxSize;
            }
          }
          
          // 創建 canvas 並繪製縮放後的圖片
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d');
          
          canvas.width = width;
          canvas.height = height;
          
          if (ctx) {
            // 設定高品質縮放
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = 'high';
            
            // 繪製圖片
            ctx.drawImage(img, 0, 0, width, height);
            
            // 轉換為 base64，使用較高的品質
            const resizedBase64 = canvas.toDataURL('image/jpeg', 0.8);
            this.user.avatar = resizedBase64;
            
            // 顯示處理完成訊息
            this.toastService.show(`請記得按下儲存鈕，才會更新頭像 (${Math.round(width)}x${Math.round(height)})`);
          }
        };
        
        img.src = e.target?.result as string;
      };
      
      reader.readAsDataURL(file);
    }
  }

  removeAvatar() {
    this.user.avatar = null;
    // 清除 file input 的值
    const input = document.getElementById('avatarInput') as HTMLInputElement;
    if (input) {
      input.value = '';
    }
  }

  // 相機相關方法
  async openCamera() {
    try {
      this.isCameraOpen = true;
      this.photoTaken = false;
      
      // 等待 DOM 更新
      setTimeout(async () => {
        await this.startCamera();
      }, 100);
    } catch (error) {
      console.error('無法開啟相機:', error);
      this.toastService.show('無法開啟相機，請檢查權限設定');
      this.isCameraOpen = false;
    }
  }

  async startCamera() {
    try {
      // 檢查是否支援 getUserMedia
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('您的瀏覽器不支援相機功能');
      }

      // 停止之前的串流
      if (this.currentStream) {
        this.currentStream.getTracks().forEach(track => track.stop());
      }

      // 設定相機約束
      const constraints: MediaStreamConstraints = {
        video: {
          facingMode: this.currentCamera,
          width: { ideal: 640 },
          height: { ideal: 480 }
        },
        audio: false
      };

      // 取得相機串流
      this.currentStream = await navigator.mediaDevices.getUserMedia(constraints);
      
      // 將串流設定到 video 元素
      if (this.videoElement?.nativeElement) {
        this.videoElement.nativeElement.srcObject = this.currentStream;
      }
    } catch (error) {
      console.error('啟動相機失敗:', error);
      this.toastService.show('啟動相機失敗，請檢查相機權限');
      this.closeCamera();
    }
  }

  takePhoto() {
    try {
      const video = this.videoElement?.nativeElement;
      const canvas = this.canvasElement?.nativeElement;
      
      if (!video || !canvas) {
        this.toastService.show('相機元件未準備好');
        return;
      }

      // 設定 canvas 尺寸與 video 相同
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      
      // 將 video 畫面繪製到 canvas
      const ctx = canvas.getContext('2d');
      if (ctx) {
        // 水平翻轉（鏡像效果）
        if (this.currentCamera === 'user') {
          ctx.scale(-1, 1);
          ctx.drawImage(video, -canvas.width, 0, canvas.width, canvas.height);
        } else {
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        }
        
        this.photoTaken = true;
        this.toastService.show('照片拍攝成功！');
      }
    } catch (error) {
      console.error('拍照失敗:', error);
      this.toastService.show('拍照失敗，請重試');
    }
  }

  retakePhoto() {
    this.photoTaken = false;
  }

  async switchCamera() {
    // 切換前後鏡頭
    this.currentCamera = this.currentCamera === 'user' ? 'environment' : 'user';
    await this.startCamera();
  }

  confirmPhoto() {
    try {
      const canvas = this.canvasElement?.nativeElement;
      if (!canvas) {
        this.toastService.show('無法取得照片');
        return;
      }

      // 調整圖片大小
      const maxSize = 100;
      const originalWidth = canvas.width;
      const originalHeight = canvas.height;
      
      let newWidth = originalWidth;
      let newHeight = originalHeight;
      
      // 計算新尺寸，保持比例
      if (originalWidth > originalHeight) {
        if (originalWidth > maxSize) {
          newHeight = (originalHeight * maxSize) / originalWidth;
          newWidth = maxSize;
        }
      } else {
        if (originalHeight > maxSize) {
          newWidth = (originalWidth * maxSize) / originalHeight;
          newHeight = maxSize;
        }
      }
      
      // 建立新的 canvas 用於縮放
      const resizeCanvas = document.createElement('canvas');
      const resizeCtx = resizeCanvas.getContext('2d');
      
      resizeCanvas.width = newWidth;
      resizeCanvas.height = newHeight;
      
      if (resizeCtx) {
        // 設定高品質縮放
        resizeCtx.imageSmoothingEnabled = true;
        resizeCtx.imageSmoothingQuality = 'high';
        
        // 繪製縮放後的圖片
        resizeCtx.drawImage(canvas, 0, 0, newWidth, newHeight);
        
        // 轉換為 base64
        const base64 = resizeCanvas.toDataURL('image/jpeg', 0.8);
        this.user.avatar = base64;
        
        this.closeCamera();
        this.toastService.show(`頭像已更新 (${Math.round(newWidth)}x${Math.round(newHeight)})，請記得儲存變更`);
      }
    } catch (error) {
      console.error('處理照片失敗:', error);
      this.toastService.show('處理照片失敗，請重試');
    }
  }

  closeCamera() {
    // 停止相機串流
    if (this.currentStream) {
      this.currentStream.getTracks().forEach(track => track.stop());
      this.currentStream = null;
    }
    
    this.isCameraOpen = false;
    this.photoTaken = false;
  }

  ngOnDestroy() {
    // 元件銷毀時關閉相機
    this.closeCamera();
  }
}
