import { Component, OnInit } from '@angular/core';

import { FormsModule } from '@angular/forms';
import dayjs from 'dayjs';
import { MongodbService } from '../../../services/mongodb.service';
import { GridFSService } from '../../../services/gridfs.service';
import { ActivatedRoute, Router } from '@angular/router';
import { Worker, CertificationType } from '../../../model/worker.model';


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
    laborInsuranceApplyDate: '',
    laborInsurancePicture: '',
    laborAssociationDate: '',
    accidentInsurances: [],
    contractingCompanyName: '',
    viceContractingCompanyName: '',
    certifications: [],
    reviewStaff: '',
    idno: '',
    sixHourTrainingDate: '',
    sixHourTrainingFrontPicture: '',
    sixHourTrainingBackPicture: '',
    generalSafetyTrainingDate: '',
    generalSafetyTrainingDueDate: '',
    no: null,
    medicalExamPicture: '',
  };

  age: string = '';
  workerId: string | null = null;
  isSaving = false;
  showSaveSuccess = false;

  constructor(
    private mongodbService: MongodbService,
    private gridFSService: GridFSService,
    private route: ActivatedRoute,
    private router: Router
  ) {}

  async ngOnInit() {
    this.workerId = this.route.snapshot.paramMap.get('id');
    
    if (this.workerId) {
      try {
        const workerData = await this.mongodbService.getById('worker', this.workerId);
        if (workerData) {
          this.worker = workerData;
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

  addAccidentInsurance() {
    this.worker.accidentInsurances.push({
      start: '',
      end: '',
      amount: '',
      signDate: '',
      companyName: ''
    });
  }

  addCertification() {
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
    this.worker.accidentInsurances.splice(index, 1);
  }

  removeCertification(index: number) {
    this.worker.certifications.splice(index, 1);
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
      // 準備元數據
      const metadata = {
        workerId: this.workerId,
        workerName: this.worker.name,
        imageType: imageType === 'front' ? 'certificationFront' : 'certificationBack',
        certificationIndex: certIndex,
        certificationName: this.worker.certifications[certIndex].name
      };
      
      // 直接上傳原始檔案到 GridFS
      const result = await this.gridFSService.uploadFile(file, metadata);
      const imageUrl = `/api/gridfs/${result.filename}`;
      
      if (imageType === 'front') {
        this.worker.certifications[certIndex].frontPicture = imageUrl;
      } else {
        this.worker.certifications[certIndex].backPicture = imageUrl;
      }
    } catch (error) {
      console.error('處理圖片時發生錯誤:', error);
      alert('處理圖片時發生錯誤');
    }
  }

  // 處理勞保證明上傳
  async handleLaborInsuranceProofUpload(event: Event) {
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
        imageType: 'laborInsurance'
      };
      
      // 直接上傳原始檔案到 GridFS
      const result = await this.gridFSService.uploadFile(file, metadata);
      this.worker.laborInsurancePicture = `/api/gridfs/${result.filename}`;
    } catch (error) {
      console.error('處理勞保證明圖片時發生錯誤:', error);
      alert('處理勞保證明圖片時發生錯誤');
    }
  }

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
      // 準備元數據
      const metadata = {
        workerId: this.workerId,
        workerName: this.worker.name,
        imageType: 'medicalExam'
      };
      
      // 直接上傳原始檔案到 GridFS
      const result = await this.gridFSService.uploadFile(file, metadata);
      this.worker.medicalExamPicture = `/api/gridfs/${result.filename}`;
    } catch (error) {
      console.error('處理體檢報告圖片時發生錯誤:', error);
      alert('處理體檢報告圖片時發生錯誤');
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
          } else {
            result = await this.mongodbService.post('worker', this.worker);
            console.log('新增結果:', result);
          }
          
          this.showSaveSuccess = true;
          
          setTimeout(() => {
            this.router.navigate(['/worker']);
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
    this.router.navigate(['/worker']);
  }

  // 取得證照類型選項
  getCertificationTypes() {
    return [
      { value: CertificationType.A, label: '一般安全衛生教育訓練(a)' },
      { value: CertificationType.BOSH, label: '營造業職業安全衛生業務主管(bosh)' },
      { value: CertificationType.AOS, label: '有機溶劑作業主管(aos)' },
      { value: CertificationType.AOH, label: '缺氧作業主管(aoh)' },
      { value: CertificationType.FR, label: '施工架組配作業主管(fr)' },
      { value: CertificationType.O2, label: '高壓氣體操作人員(o2)' },
      { value: CertificationType.OS, label: '有機溶劑作業人員(os)' },
      { value: CertificationType.SA, label: '施工架作業人員(sa)' },
      { value: CertificationType.S, label: '特定化學物質作業人員(s)' },
      { value: CertificationType.MA, label: '屋頂作業主管(ma)' },
      { value: CertificationType.SC, label: '密閉空間作業主管(sc)' },
      { value: CertificationType.DW, label: '吊掛作業人員(dw)' },
      { value: CertificationType.OW, label: '高空工作車作業人員(ow)' },
      { value: CertificationType.R, label: '起重機操作人員(r)' },
      { value: CertificationType.SSA, label: '安全衛生管理人員(ssa)' },
      { value: CertificationType.FS, label: '防火管理人員(fs)' },
      { value: CertificationType.PE, label: '露天開挖作業主管(pe)' },
      { value: CertificationType.RS, label: '擋土支撐作業主管(rs)' }
    ];
  }

  // 移除圖片（處理 GridFS 檔案刪除）
  async removeImage(fieldName: string, certIndex?: number) {
    try {
      let imageUrl = '';
      
      if (certIndex !== undefined) {
        // 證照圖片
        if (fieldName === 'frontPicture') {
          imageUrl = this.worker.certifications[certIndex].frontPicture;
          this.worker.certifications[certIndex].frontPicture = '';
        } else if (fieldName === 'backPicture') {
          imageUrl = this.worker.certifications[certIndex].backPicture;
          this.worker.certifications[certIndex].backPicture = '';
        }
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
    const type = this.getCertificationTypes().find(t => t.value === typeCode);
    return type ? type.label : '未知證照類型';
  }
}
