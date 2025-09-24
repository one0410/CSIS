import { Component, OnInit, inject, computed } from '@angular/core';

import { FormsModule } from '@angular/forms';
import dayjs from 'dayjs';
import { MongodbService } from '../../../services/mongodb.service';
import { GridFSService } from '../../../services/gridfs.service';
import { ActivatedRoute, Router } from '@angular/router';
import { Location } from '@angular/common';
import { Worker, CertificationType, CertificationTypeManager } from '../../../model/worker.model';
import { CurrentSiteService } from '../../../services/current-site.service';
import { AuthService } from '../../../services/auth.service';


@Component({
  selector: 'app-worker-detail',
  imports: [FormsModule],
  templateUrl: './worker-detail.component.html',
  styleUrl: './worker-detail.component.scss'
})
export class WorkerDetailComponent implements OnInit {
  // 提供 enum 給模板使用
  certificationTypes = CertificationType;
  
  worker: Worker = {
    name: '',
    gender: '',
    birthday: '',
    bloodType: '',
    tel: '',
    liaison: '',
    emergencyTel: '',
    address: '',
    profilePicture: '',
    idCardFrontPicture: '',
    idCardBackPicture: '',
    // hazardNotifyDate: '',
    supplierIndustrialSafetyNumber: '',
    // laborInsuranceApplyDate: '',
    // laborInsurancePicture: '',
    // laborAssociationDate: '',
    laberInsurance: [],
    accidentInsurances: [],
    contractingCompanyName: '',
    viceContractingCompanyName: '',
    certifications: [],
    reviewStaff: '',
    idno: '',
    // sixHourTrainingDate: '',
    sixHourTrainingFrontPicture: '',
    sixHourTrainingBackPicture: '',
    generalSafetyTrainingDate: '',
    generalSafetyTrainingDueDate: '',
    no: null,
    medicalExamPictures: [],
  };

  age: string = '';
  workerId: string | null = null;
  isSaving = false;
  showSaveSuccess = false;
  isDeleting = false;

  private currentSiteService = inject(CurrentSiteService);
  private authService = inject(AuthService);

  // 檢查當前使用者是否為管理員
  isAdmin = computed(() => {
    const user = this.authService.user();
    return user?.role === 'admin';
  });

  constructor(
    private mongodbService: MongodbService,
    private gridFSService: GridFSService,
    private route: ActivatedRoute,
    private router: Router,
    private location: Location
  ) {}

  async ngOnInit() {
    this.workerId = this.route.snapshot.paramMap.get('id');

    if (this.workerId === 'new') {
      this.workerId = '';
    }
    
    if (this.workerId) {
      try {
        const workerData = await this.mongodbService.getById('worker', this.workerId);
        if (workerData) {
          this.worker = workerData;
          
          // 處理舊資料遷移：將 picture 欄位移到 pictures 陣列
          this.migrateAccidentInsuranceData();
          
          if (this.worker.birthday) {
            this.calculateAge();
          }

          if (this.worker.gender === '男') {
            this.worker.gender = 'male';
          } else if (this.worker.gender === '女') {
            this.worker.gender = 'female';
          }
        } else {
          console.error('找不到此工作人員資料');
        }
      } catch (error) {
        console.error('讀取工作人員資料時發生錯誤', error);
      }
    }
  }

  // 遷移意外險資料：將舊的 picture 欄位移到 pictures 陣列，並修正錯誤的資料分配
  private migrateAccidentInsuranceData() {
    if (this.worker.accidentInsurances && this.worker.accidentInsurances.length > 0) {
      // 先處理基本的 picture 到 pictures 遷移
      for (const accidentInsurance of this.worker.accidentInsurances) {
        // 檢查是否有舊的 picture 欄位且沒有 pictures 陣列
        if ((accidentInsurance as any).picture && !accidentInsurance.pictures) {
          // 將 picture 內容移到 pictures 陣列
          accidentInsurance.pictures = [(accidentInsurance as any).picture];
          // 保留 picture 欄位以確保向後相容，但標記為已遷移
          (accidentInsurance as any)._migrated = true;
          console.log(`遷移工人 ${this.worker.name} 的意外險圖片資料`);
        }
      }
      
      // 修正錯誤的資料分配：如果第二筆或之後的保險沒有開始/結束日期但有圖片，應該移到第一筆
      if (this.worker.accidentInsurances.length > 1) {
        const firstInsurance = this.worker.accidentInsurances[0];
        
        for (let i = 1; i < this.worker.accidentInsurances.length; i++) {
          const currentInsurance = this.worker.accidentInsurances[i];
          
          // 檢查是否沒有開始/結束日期但有圖片（表示是錯誤分配的資料）
          const hasNoDates = (!currentInsurance.start || currentInsurance.start.trim() === '') && 
                            (!currentInsurance.end || currentInsurance.end.trim() === '');
          const hasPictures = (currentInsurance.pictures && currentInsurance.pictures.length > 0) || 
                             (currentInsurance as any).picture;
          
          if (hasNoDates && hasPictures) {
            // 將圖片移到第一筆保險
            if (!firstInsurance.pictures) {
              firstInsurance.pictures = [];
            }
            
            // 移動 pictures 陣列中的圖片
            if (currentInsurance.pictures && currentInsurance.pictures.length > 0) {
              firstInsurance.pictures.push(...currentInsurance.pictures);
              currentInsurance.pictures = [];
            }
            
            // 移動單一 picture 欄位的圖片
            if ((currentInsurance as any).picture) {
              if (!firstInsurance.pictures.includes((currentInsurance as any).picture)) {
                firstInsurance.pictures.push((currentInsurance as any).picture);
              }
              (currentInsurance as any).picture = '';
            }
            
            // 如果第一筆保險沒有 picture 欄位，設定為第一張圖片
            if (!(firstInsurance as any).picture && firstInsurance.pictures.length > 0) {
              (firstInsurance as any).picture = firstInsurance.pictures[0];
            }
            
            console.log(`修正工人 ${this.worker.name} 的意外險資料分配：將第 ${i + 1} 筆的圖片移到第 1 筆`);
          }
        }
      }
    }
  }

  // addAccidentInsurance() {
  //   if (!this.worker.accidentInsurances) {
  //     this.worker.accidentInsurances = [];
  //   }
  //   this.worker.accidentInsurances.push({
  //     start: '',
  //     end: '',
  //     amount: '',
  //     signDate: '',
  //     companyName: '',
  //     pictures: [] // 初始化圖片陣列
  //   });
  // }

  addCertification() {
    if (!this.worker.certifications) {
      this.worker.certifications = [];
    }
    this.worker.certifications.push({
      type: CertificationType.A, // 預設為一般安全衛生教育訓練
      name: '',
      issue: '',
      withdraw: '',
      frontPicture: '',
      backPicture: ''
    });
  }

  removeAccidentInsurance(index: number) {
    if (this.worker.accidentInsurances) {
      this.worker.accidentInsurances.splice(index, 1);
    }
  }

  removeCertification(index: number) {
    if (this.worker.certifications) {
      this.worker.certifications.splice(index, 1);
    }
  }

  calculateAge() {
    if (!this.worker.birthday) {
      this.age = '';
      return;
    }
    
    const totalMonths = dayjs().diff(this.worker.birthday, 'months');
    const years = Math.floor(totalMonths / 12);
    const months = totalMonths % 12;
    
    this.age = `滿${years}歲${months}個月`;
  }

  // 處理證照照片上傳
  async handleCertificateImageUpload(event: Event, certIndex: number, imageType: 'front' | 'back') {
    const input = event.target as HTMLInputElement;
    if (!input.files || input.files.length === 0) return;

    const file = input.files[0];
    if (!file.type.startsWith('image/')) {
      alert('請上傳圖片檔案');
      return;
    }

    try {
      // 確保 certifications 陣列存在
      if (!this.worker.certifications) {
        this.worker.certifications = [];
      }

      // 準備元數據
      const metadata = {
        workerId: this.workerId,
        workerName: this.worker.name,
        imageType: imageType === 'front' ? 'certificationFront' : 'certificationBack',
        certificationIndex: certIndex,
        certificationName: this.worker.certifications[certIndex]?.name || ''
      };
      
      // 直接上傳原始檔案到 GridFS
      const result = await this.gridFSService.uploadFile(file, metadata);
      const imageUrl = `/api/gridfs/${result.filename}`;
      
      if (this.worker.certifications[certIndex]) {
        if (imageType === 'front') {
          this.worker.certifications[certIndex].frontPicture = imageUrl;
        } else {
          this.worker.certifications[certIndex].backPicture = imageUrl;
        }
      }
    } catch (error) {
      console.error('處理圖片時發生錯誤:', error);
      alert('處理圖片時發生錯誤');
    }
  }

  // 處理勞保證明上傳
  // async handleLaborInsuranceProofUpload(event: Event) {
  //   const input = event.target as HTMLInputElement;
  //   if (!input.files || input.files.length === 0) return;

  //   const file = input.files[0];
  //   if (!file.type.startsWith('image/')) {
  //     alert('請上傳圖片檔案');
  //     return;
  //   }

  //   try {
  //     // 準備元數據
  //     const metadata = {
  //       workerId: this.workerId,
  //       workerName: this.worker.name,
  //       imageType: 'laborInsurance'
  //     };
      
  //     // 直接上傳原始檔案到 GridFS
  //     const result = await this.gridFSService.uploadFile(file, metadata);
  //     this.worker.laborInsurancePicture = `/api/gridfs/${result.filename}`;
  //   } catch (error) {
  //     console.error('處理勞保證明圖片時發生錯誤:', error);
  //     alert('處理勞保證明圖片時發生錯誤');
  //   }
  // }

  // 處理大頭貼上傳
  async handleProfilePictureUpload(event: Event) {
    const input = event.target as HTMLInputElement;
    if (!input.files || input.files.length === 0) return;

    const file = input.files[0];
    if (!file.type.startsWith('image/')) {
      alert('請上傳圖片檔案');
      return;
    }

    try {
      // 大頭貼仍然需要 resize 並轉為 base64，因為存在 MongoDB 文檔中
      const base64String = await this.resizeAndConvertToBase64(file, 100);
      this.worker.profilePicture = base64String;
    } catch (error) {
      console.error('處理大頭貼圖片時發生錯誤:', error);
      alert('處理大頭貼圖片時發生錯誤');
    }
  }

  // 處理身份證正面上傳
  async handleIdCardFrontUpload(event: Event) {
    const input = event.target as HTMLInputElement;
    if (!input.files || input.files.length === 0) return;

    const file = input.files[0];
    if (!file.type.startsWith('image/')) {
      alert('請上傳圖片檔案');
      return;
    }

    try {
      // 準備元數據
      const metadata = {
        workerId: this.workerId,
        workerName: this.worker.name,
        imageType: 'idCardFront'
      };
      
      // 直接上傳原始檔案到 GridFS
      const result = await this.gridFSService.uploadFile(file, metadata);
      this.worker.idCardFrontPicture = `/api/gridfs/${result.filename}`;
    } catch (error) {
      console.error('處理身份證正面圖片時發生錯誤:', error);
      alert('處理身份證正面圖片時發生錯誤');
    }
  }

  // 處理身份證反面上傳
  async handleIdCardBackUpload(event: Event) {
    const input = event.target as HTMLInputElement;
    if (!input.files || input.files.length === 0) return;

    const file = input.files[0];
    if (!file.type.startsWith('image/')) {
      alert('請上傳圖片檔案');
      return;
    }

    try {
      // 準備元數據
      const metadata = {
        workerId: this.workerId,
        workerName: this.worker.name,
        imageType: 'idCardBack'
      };
      
      // 直接上傳原始檔案到 GridFS
      const result = await this.gridFSService.uploadFile(file, metadata);
      this.worker.idCardBackPicture = `/api/gridfs/${result.filename}`;
    } catch (error) {
      console.error('處理身份證反面圖片時發生錯誤:', error);
      alert('處理身份證反面圖片時發生錯誤');
    }
  }

  // 處理六小時證明正面上傳
  async handleSixHourTrainingFrontUpload(event: Event) {
    const input = event.target as HTMLInputElement;
    if (!input.files || input.files.length === 0) return;

    const file = input.files[0];
    if (!file.type.startsWith('image/')) {
      alert('請上傳圖片檔案');
      return;
    }

    try {
      // 準備元數據
      const metadata = {
        workerId: this.workerId,
        workerName: this.worker.name,
        imageType: 'sixHourTrainingFront'
      };
      
      // 直接上傳原始檔案到 GridFS
      const result = await this.gridFSService.uploadFile(file, metadata);
      this.worker.sixHourTrainingFrontPicture = `/api/gridfs/${result.filename}`;
    } catch (error) {
      console.error('處理六小時證明正面圖片時發生錯誤:', error);
      alert('處理六小時證明正面圖片時發生錯誤');
    }
  }

  // 處理六小時證明反面上傳
  async handleSixHourTrainingBackUpload(event: Event) {
    const input = event.target as HTMLInputElement;
    if (!input.files || input.files.length === 0) return;

    const file = input.files[0];
    if (!file.type.startsWith('image/')) {
      alert('請上傳圖片檔案');
      return;
    }

    try {
      // 準備元數據
      const metadata = {
        workerId: this.workerId,
        workerName: this.worker.name,
        imageType: 'sixHourTrainingBack'
      };
      
      // 直接上傳原始檔案到 GridFS
      const result = await this.gridFSService.uploadFile(file, metadata);
      this.worker.sixHourTrainingBackPicture = `/api/gridfs/${result.filename}`;
    } catch (error) {
      console.error('處理六小時證明反面圖片時發生錯誤:', error);
      alert('處理六小時證明反面圖片時發生錯誤');
    }
  }

  // 處理體檢報告上傳
  async handleMedicalExamUpload(event: Event) {
    const input = event.target as HTMLInputElement;
    if (!input.files || input.files.length === 0) return;

    const file = input.files[0];
    if (!file.type.startsWith('image/')) {
      alert('請上傳圖片檔案');
      return;
    }

    try {
      // 初始化陣列（如果還沒有的話）
      if (!this.worker.medicalExamPictures) {
        this.worker.medicalExamPictures = [];
      }

      // 準備元數據
      const metadata = {
        workerId: this.workerId,
        workerName: this.worker.name,
        imageType: 'medicalExam',
        medicalExamIndex: this.worker.medicalExamPictures.length
      };
      
      // 直接上傳原始檔案到 GridFS
      const result = await this.gridFSService.uploadFile(file, metadata);
      this.worker.medicalExamPictures.push(`/api/gridfs/${result.filename}`);
    } catch (error) {
      console.error('處理體檢報告圖片時發生錯誤:', error);
      alert('處理體檢報告圖片時發生錯誤');
    }
  }

  // 處理意外險證明上傳
  async handleAccidentInsuranceUpload(event: Event, insuranceIndex: number) {
    const input = event.target as HTMLInputElement;
    if (!input.files || input.files.length === 0) return;

    const file = input.files[0];
    if (!file.type.startsWith('image/')) {
      alert('請上傳圖片檔案');
      return;
    }

    try {
      // 準備元數據
      const metadata = {
        workerId: this.workerId,
        workerName: this.worker.name,
        imageType: 'accidentInsurance',
        accidentInsuranceIndex: insuranceIndex
      };
      
      // 確保 accidentInsurances 陣列存在
      if (!this.worker.accidentInsurances) {
        this.worker.accidentInsurances = [];
      }

      // 直接上傳原始檔案到 GridFS
      const result = await this.gridFSService.uploadFile(file, metadata);
      const imageUrl = `/api/gridfs/${result.filename}`;
      
      if (this.worker.accidentInsurances[insuranceIndex]) {
        const insurance = this.worker.accidentInsurances[insuranceIndex];
        
        // 初始化 pictures 陣列（如果不存在）
        if (!insurance.pictures) {
          insurance.pictures = [];
        }
        
        // 將新圖片加入 pictures 陣列
        insurance.pictures.push(imageUrl);
        
        // 向後相容：如果沒有 picture 欄位，將第一張圖片設為 picture
        if (!(insurance as any).picture) {
          (insurance as any).picture = imageUrl;
        }
      }
    } catch (error) {
      console.error('處理意外險證明圖片時發生錯誤:', error);
      alert('處理意外險證明圖片時發生錯誤');
    }
  }

  // 調整圖片大小並轉換為base64（僅用於大頭貼）
  private resizeAndConvertToBase64(file: File, maxDimension: number): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (readerEvent) => {
        const img = new Image();
        img.onload = () => {
          // 計算新的尺寸，保持比例
          let width = img.width;
          let height = img.height;
          
          if (width > height) {
            if (width > maxDimension) {
              height = Math.round(height * (maxDimension / width));
              width = maxDimension;
            }
          } else {
            if (height > maxDimension) {
              width = Math.round(width * (maxDimension / height));
              height = maxDimension;
            }
          }
          
          // 創建 canvas 並繪製調整大小後的圖片
          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            reject(new Error('無法取得 canvas 上下文'));
            return;
          }
          
          ctx.drawImage(img, 0, 0, width, height);
          
          // 將 canvas 轉換為 base64 字串
          const base64String = canvas.toDataURL('image/jpeg', 0.9);
          resolve(base64String);
        };
        
        img.onerror = () => {
          reject(new Error('圖片加載失敗'));
        };
        
        img.src = readerEvent.target?.result as string;
      };
      
      reader.onerror = () => {
        reject(new Error('檔案讀取失敗'));
      };
      
      reader.readAsDataURL(file);
    });
  }

  async onSubmit() {
    if (this.validateForm()) {
      if (confirm('確定要儲存資料嗎？')) {
        this.isSaving = true;
        
        try {
          let result;
          if (this.workerId) {
            result = await this.mongodbService.put('worker', this.workerId, this.worker);
            console.log('更新結果:', result);
            
            // 發送工人更新事件
            this.currentSiteService.onWorkerUpdated(this.workerId, '');
          } else {
            result = await this.mongodbService.post('worker', this.worker);
            console.log('新增結果:', result);
            
            // 發送工人創建事件
            if (result.insertedId) {
              this.currentSiteService.onWorkerCreated(result.insertedId, '');
            }
          }
          
          this.showSaveSuccess = true;
          
          setTimeout(() => {
            this.location.back();
          }, 2000);
          
        } catch (error) {
          console.error('儲存工作人員資料時發生錯誤', error);
          alert(`儲存失敗: ${error instanceof Error ? error.message : '未知錯誤'}`);
        } finally {
          this.isSaving = false;
        }
      }
    } else {
      alert('表單資料不完整，請檢查必填欄位');
    }
  }

  validateForm(): boolean {
    // 基本驗證邏輯
    if (!this.worker.name || !this.worker.tel || !this.worker.idno) {
      return false;
    }
    
    // 身分證字號格式驗證
    const idnoPattern = /^[A-Z][12]\d{8}$/;
    if (!idnoPattern.test(this.worker.idno)) {
      return false;
    }

    return true;
  }

  navigateToList() {
    // 使用瀏覽器歷史記錄返回，這樣可以保持之前的篩選條件
    this.location.back();
  }

  // 取得證照類型選項
  getCertificationTypes() {
    return CertificationTypeManager.getAllCertificationOptions();
  }

  // 移除圖片（處理 GridFS 檔案刪除）
  async removeImage(fieldName: string, certIndex?: number, medicalExamIndex?: number, accidentInsuranceIndex?: number) {
    try {
      let imageUrl = '';
      
      if (certIndex !== undefined && this.worker.certifications && this.worker.certifications[certIndex]) {
        // 證照圖片
        if (fieldName === 'frontPicture') {
          imageUrl = this.worker.certifications[certIndex].frontPicture;
          this.worker.certifications[certIndex].frontPicture = '';
        } else if (fieldName === 'backPicture') {
          imageUrl = this.worker.certifications[certIndex].backPicture;
          this.worker.certifications[certIndex].backPicture = '';
        }
      } else if (medicalExamIndex !== undefined && fieldName === 'medicalExamPictures') {
        // 體檢報告圖片
        imageUrl = this.worker.medicalExamPictures[medicalExamIndex];
        this.worker.medicalExamPictures.splice(medicalExamIndex, 1);
      } else if (accidentInsuranceIndex !== undefined && fieldName === 'accidentInsurancePicture' && this.worker.accidentInsurances && this.worker.accidentInsurances[accidentInsuranceIndex]) {
        // 意外險圖片
        imageUrl = this.worker.accidentInsurances[accidentInsuranceIndex].picture || '';
        this.worker.accidentInsurances[accidentInsuranceIndex].picture = '';
      } else {
        // 工人圖片
        imageUrl = (this.worker as any)[fieldName];
        (this.worker as any)[fieldName] = '';
      }
      
      // 如果是 GridFS URL，從伺服器刪除檔案
      if (imageUrl && imageUrl.startsWith('/api/gridfs/')) {
        const filename = imageUrl.split('/').pop();
        if (filename) {
          await this.gridFSService.deleteFile(filename);
          console.log(`已從 GridFS 刪除檔案: ${filename}`);
        }
      }
    } catch (error) {
      console.error('刪除圖片時發生錯誤:', error);
      // 即使刪除失敗，也要清空欄位
    }
  }

  // 根據證照類型代碼獲取中文名稱
  getCertificationTypeName(typeCode: CertificationType): string {
    return CertificationTypeManager.getFullLabel(typeCode);
  }

  // 取得意外險的所有圖片（支援新舊格式）
  getAccidentInsurancePictures(insurance: any): string[] {
    if (insurance.pictures && insurance.pictures.length > 0) {
      return insurance.pictures;
    } else if (insurance.picture) {
      return [insurance.picture];
    }
    return [];
  }

  // 移除意外險的特定圖片
  removeAccidentInsurancePicture(insuranceIndex: number, pictureIndex: number) {
    const insurance = this.worker.accidentInsurances![insuranceIndex];
    
    if (insurance.pictures && insurance.pictures.length > pictureIndex) {
      // 從 pictures 陣列中移除
      insurance.pictures.splice(pictureIndex, 1);
      
      // 如果移除後沒有圖片了，清空 picture 欄位
      if (insurance.pictures.length === 0) {
        (insurance as any).picture = '';
      } else if (pictureIndex === 0) {
        // 如果移除的是第一張圖片，更新 picture 欄位為新的第一張
        (insurance as any).picture = insurance.pictures[0];
      }
    } else if (insurance.picture && pictureIndex === 0) {
      // 移除舊格式的單一圖片
      (insurance as any).picture = '';
    }
  }

  // 刪除工作人員
  async deleteWorker() {
    if (!this.workerId) {
      alert('無法刪除：找不到工作人員 ID');
      return;
    }

    // 確認刪除
    const confirmMessage = `確定要刪除工作人員「${this.worker.name}」的資料嗎？\n\n此操作無法復原！`;
    if (!confirm(confirmMessage)) {
      return;
    }

    this.isDeleting = true;

    try {
      // 刪除資料庫中的記錄
      await this.mongodbService.delete('worker', this.workerId);
      
      alert('工作人員資料已成功刪除！');
      
      // 返回列表頁面
      this.location.back();
    } catch (error) {
      console.error('刪除工作人員時發生錯誤:', error);
      alert('刪除失敗，請稍後再試或聯繫系統管理員。');
    } finally {
      this.isDeleting = false;
    }
  }
}
