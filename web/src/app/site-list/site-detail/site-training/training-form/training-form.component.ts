import {
  Component,
  OnInit,
  ViewChild,
  AfterViewInit,
  computed,
  ChangeDetectorRef,
} from '@angular/core';

import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { MongodbService } from '../../../../services/mongodb.service';
import { SignatureDialogService } from '../../../../shared/signature-dialog.service';
import dayjs from 'dayjs';
import { Site } from '../../../site-list.component';
import { QRCodeComponent  } from 'angularx-qrcode';
import { Worker } from '../../../../model/worker.model';
import { CurrentSiteService } from '../../../../services/current-site.service';
import { SignatureData } from '../../../../model/signatureData.model';
import { SiteForm } from '../../../../model/siteForm.model';
import { AuthService } from '../../../../services/auth.service';

// 導入 Bootstrap Modal 相關類型
declare const bootstrap: {
  Modal: new (element: HTMLElement, options?: any) => {
    show: () => void;
    hide: () => void;
    dispose: () => void;
  };
};

export interface TrainingForm extends SiteForm {
  trainingDate: string;
  trainingTime: string;
  contractorName: string; // 主承商
  contactPerson: string; // 聯絡人
  contactPhone: string; // 聯絡人電話
  courseName: string; // 課程名稱
  instructor: string; // 講師
  attendanceCount: number;
  workerSignatures: SignatureData[];
  remarks: string;
  status: 'draft' | 'published' | 'revoked';
}

interface ParticipantSignature {
  no: number; // 編號
  contractorName: string; // 主承商
  name: string; // 姓名
  signatureData?: string; // 簽名
  arrivalTime?: string; // 簽到時間
  score?: number; // 分數
}

// 專案工人介面
interface ProjectWorker {
  _id: string;
  name: string;
  idno: string;
  tel: string;
  contractingCompanyName: string;
  belongSites: any[];
  hasSigned?: boolean;
}

@Component({
  selector: 'app-training-form',
  standalone: true,
  imports: [FormsModule, QRCodeComponent],
  templateUrl: './training-form.component.html',
  styleUrls: ['./training-form.component.scss'],
})
export class TrainingFormComponent implements OnInit, AfterViewInit {
  siteId: string = '';
  site = computed(() => this.currentSiteService.currentSite());
  formId: string | null = null;
  isViewMode: boolean = false;
  isLoggedIn: boolean = false;
  isWorkerSigningMode: boolean = false;

  // 表單資料模型
  formData: TrainingForm = {
    siteId: '',
    formType: 'training',
    trainingDate: dayjs().format('YYYY-MM-DD'),
    trainingTime: '08:30',
    contractorName: '',
    contactPerson: '',
    contactPhone: '',
    courseName: '',
    instructor: '',
    attendanceCount: 0,
    applyDate: dayjs().format('YYYY-MM-DD'),
    workerSignatures: [],
    remarks: '',
    status: 'draft',
    createdAt: new Date(),
    createdBy: '',
    updatedAt: new Date(),
    updatedBy: '',
  };

  currentParticipantIndex: number = -1;
  participantVerificationModal: any;
  participantSignatureModal: any;
  showSignaturePad: boolean = false;

  // 工人簽名相關
  verificationIdOrPhone: string = '';
  verificationError: string = '';
  currentWorker: ProjectWorker | null = null;
  projectWorkers: ProjectWorker[] = [];
  workerVerificationModal: any;

  // QR Code 相關
  formQrCodeUrl: string = '';
  qrCodeModal: any;

  constructor(
    private mongodbService: MongodbService,
    private route: ActivatedRoute,
    private router: Router,
    private signatureDialog: SignatureDialogService,
    private currentSiteService: CurrentSiteService,
    private authService: AuthService,
    private cdr: ChangeDetectorRef
  ) {
    // 初始化40個空的參與者格子
    this.initializeParticipants();
  }

  private initializeParticipants(): void {
    // 初始化工人簽名陣列
    this.formData.workerSignatures = [];
    this.formData.attendanceCount = 0; // 實際簽到人數
  }

  async ngOnInit(): Promise<void> {
    // 檢查用戶是否已登入
    this.isLoggedIn = !!this.authService.user();
    
    this.route.paramMap.subscribe(async (params) => {
      const id = params.get('id');
      const formId = params.get('formId');

      if (id) {
        this.siteId = id;
        
        // 如果已登入，設定當前工地；如果未登入，直接載入表單資料
        if (this.isLoggedIn) {
          await this.currentSiteService.setCurrentSiteById(id);
        }
        
        this.formData.siteId = id;
        
        if (formId) {
          this.formId = formId;
          await this.loadFormDetails(formId);
          
          // 檢查 URL 是否包含 '/edit' 來判斷是否為編輯模式
          const currentUrl = this.router.url;
          const isEditMode = currentUrl.includes('/edit');
          
          // 如果未登入且有表單ID，則為工人簽名模式
          if (!this.isLoggedIn) {
            this.isWorkerSigningMode = true;
            this.isViewMode = false; // 工人需要能夠簽名
          } else {
            // 已登入用戶：如果是編輯模式則可編輯，否則為查看模式
            this.isViewMode = !isEditMode;
          }
        }

        // 只有在登入狀態下才載入專案工人列表
        if (this.isLoggedIn || this.isWorkerSigningMode) {
          await this.loadProjectWorkers(id);
        }
      }
    });
  }

  ngAfterViewInit() {
    // 延遲執行以確保 DOM 已渲染
    setTimeout(() => {
      this.initModals();
    }, 100);
  }

  private initModals() {
    // 使用 bootstrap 的 Modal
    const verificationModalEl = document.getElementById(
      'participantVerificationModal'
    );
    const signatureModalEl = document.getElementById('participantSignatureModal');
    const qrCodeModalEl = document.getElementById('qrCodeModal');
    const workerVerificationModalEl = document.getElementById('workerVerificationModal');

    if (verificationModalEl) {
      this.participantVerificationModal = new bootstrap.Modal(verificationModalEl);
    }

    if (signatureModalEl) {
      this.participantSignatureModal = new bootstrap.Modal(signatureModalEl);
    }

    if (qrCodeModalEl) {
      this.qrCodeModal = new bootstrap.Modal(qrCodeModalEl);
    }

    if (workerVerificationModalEl) {
      this.workerVerificationModal = new bootstrap.Modal(workerVerificationModalEl);
    }
  }

  async loadFormDetails(formId: string): Promise<void> {
    try {
      const form = await this.mongodbService.getById('siteForm', formId);
      if (form) {
        this.formData = { ...form };
        // 確保 workerSignatures 存在
        if (!this.formData.workerSignatures) {
          this.formData.workerSignatures = [];
        }
        // 確保 remarks 存在
        if (!this.formData.remarks) {
          this.formData.remarks = '';
        }
        // 確保 workerSignatures 存在
        if (!this.formData.workerSignatures) {
          this.formData.workerSignatures = [];
        }
      }

      // 重新載入專案工人以標記已簽名狀態 (此邏輯已移至 ngOnInit)

      // 生成表單 QR Code URL
      this.generateFormQrCodeUrl();
    } catch (error) {
      console.error('載入教育訓練表單失敗', error);
    }
  }

  async loadProjectWorkers(siteId: string): Promise<void> {
    try {
      // 從資料庫獲取該專案的工人列表
      this.projectWorkers = await this.mongodbService.get('worker', {
        belongSites: { $elemMatch: { siteId: siteId } },
      });

      // 查詢該工地所有未作廢的教育訓練表單
      const allActiveForms = await this.mongodbService.get('siteForm', {
        siteId: siteId,
        formType: 'training',
        status: { $ne: 'revoked' }
      });

      // 收集所有未作廢表單的工人簽名記錄
      const allWorkerSignatures: SignatureData[] = [];
      allActiveForms.forEach((form: TrainingForm) => {
        if (form.workerSignatures && form.workerSignatures.length > 0) {
          allWorkerSignatures.push(...form.workerSignatures);
        }
      });

      // 標記已簽名的工人（檢查所有未作廢表單的簽名記錄）
      if (allWorkerSignatures.length > 0) {
        this.projectWorkers.forEach((worker) => {
          // 清理工人的身分證號碼和電話號碼用於比對
          const workerIdno = worker.idno ? worker.idno.toString().trim().toUpperCase() : '';
          const workerTel = worker.tel ? worker.tel.toString().trim().replace(/\D/g, '') : '';
          
          worker.hasSigned = allWorkerSignatures.some((sig) => {
            // 清理簽名中的身分證號碼和電話號碼
            const sigIdno = sig.idno ? sig.idno.toString().trim().toUpperCase() : '';
            const sigTel = sig.tel ? sig.tel.toString().trim().replace(/\D/g, '') : '';
            
            return (workerIdno && sigIdno && workerIdno === sigIdno) ||
                   (workerTel && sigTel && workerTel === sigTel);
          });
        });
      }
    } catch (error) {
      console.error('載入專案工人資料失敗', error);
    }
  }

  // 工人身份驗證
  verifyWorker() {
    // 重設錯誤訊息
    this.verificationError = '';

    // 檢查是否有輸入身份證號碼或手機號碼
    if (!this.verificationIdOrPhone) {
      this.verificationError = '請輸入身份證號碼或手機號碼';
      return;
    }

    // 清理輸入的身分證號碼或電話號碼
    const cleanInput = this.verificationIdOrPhone.toString().trim();
    const cleanInputIdno = cleanInput.toUpperCase(); // 身分證號碼轉大寫
    const cleanInputTel = cleanInput.replace(/\D/g, ''); // 電話號碼只保留數字
    
    // 查找工人
    const worker = this.projectWorkers.find((w) => {
      const workerIdno = w.idno ? w.idno.toString().trim().toUpperCase() : '';
      const workerTel = w.tel ? w.tel.toString().trim().replace(/\D/g, '') : '';
      
      return (workerIdno && workerIdno === cleanInputIdno) ||
             (workerTel && workerTel === cleanInputTel);
    });

    // 檢查工人是否存在
    if (!worker) {
      this.verificationError = '找不到此工人，請確認輸入資訊是否正確';
      return;
    }

    // 檢查工人是否已簽名（在 workerSignatures 中查找）
    const workerIdno = worker.idno ? worker.idno.toString().trim().toUpperCase() : '';
    const workerTel = worker.tel ? worker.tel.toString().trim().replace(/\D/g, '') : '';
    
    const alreadySigned = this.formData.workerSignatures.some((signature) => {
      const sigIdno = signature.idno ? signature.idno.toString().trim().toUpperCase() : '';
      const sigTel = signature.tel ? signature.tel.toString().trim().replace(/\D/g, '') : '';
      
      return (workerIdno && sigIdno && workerIdno === sigIdno) ||
             (workerTel && sigTel && workerTel === sigTel);
    });

    if (alreadySigned) {
      this.verificationError = `此工人 (${worker.name}) 已經簽名過`;
      return;
    }

    // 將當前工人設為已驗證的工人
    this.currentWorker = worker;

    // 關閉驗證 Modal
    this.workerVerificationModal.hide();

    // 使用SignatureDialogService開啟簽名對話框
    this.openWorkerSignatureDialog();
  }

  // 開啟工人簽名對話框
  async openWorkerSignatureDialog(): Promise<void> {
    try {
      const signature = await this.signatureDialog.open();
      if (signature && this.currentWorker) {
        // 檢查 workerSignatures 陣列是否已經滿了（40個）
        if (this.formData.workerSignatures.length >= 40) {
          alert('簽到表已滿，無法再新增簽名');
          return;
        }

        // 將工人簽名資料加入 workerSignatures 陣列
        const workerSignature: SignatureData = {
          name: this.currentWorker.name,
          idno: this.currentWorker.idno,
          tel: this.currentWorker.tel,
          signature: signature,
          signedAt: new Date(),
          company: this.currentWorker.contractingCompanyName
        };

        this.formData.workerSignatures.push(workerSignature);

        // 更新實際簽到人數
        this.updateAttendanceCount();

        // 標記此工人已簽名
        const workerIndex = this.projectWorkers.findIndex(
          (w) => w._id === this.currentWorker!._id
        );
        if (workerIndex !== -1) {
          this.projectWorkers[workerIndex].hasSigned = true;
        }

        // 保存表單
        await this.saveForm();
        
        console.log('工人簽名已加入 workerSignatures 陣列');
      }
    } catch (error) {
      console.error('簽名對話框操作失敗', error);
    }
  }

  // 更新實際簽到人數
  private updateAttendanceCount(): void {
    this.formData.attendanceCount = this.formData.workerSignatures.length;
  }

  // 動態取得或創建指定索引的參與者資料（基於 workerSignatures）
  getParticipant(index: number): ParticipantSignature {
    // 如果 workerSignatures 陣列中有對應的資料，轉換為 ParticipantSignature 格式
    if (index < this.formData.workerSignatures.length) {
      const signature = this.formData.workerSignatures[index];
      return {
        no: index + 1,
        contractorName: signature.company || '',
        name: signature.name,
        signatureData: signature.signature,
        arrivalTime: signature.signedAt ? dayjs(signature.signedAt).format('HH:mm') : '',
        score: 100 // 預設分數
      };
    }
    
    // 如果沒有對應的簽名資料，返回空的參與者資料
    return {
      no: index + 1,
      contractorName: '',
      name: '',
      signatureData: '',
      arrivalTime: '',
      score: 0
    };
  }

  showWorkerVerificationModal(): void {
    this.verificationIdOrPhone = '';
    this.verificationError = '';
    this.currentWorker = null;
    if (this.workerVerificationModal) {
      this.workerVerificationModal.show();
    }
  }

  async addSignature(index: number): Promise<void> {
    this.currentParticipantIndex = index;
    await this.openParticipantSignatureDialog();
  }

  async openParticipantSignatureDialog(): Promise<void> {
    try {
      const signatureData = await this.signatureDialog.open();
      if (signatureData) {
        await this.handleSignatureSaved(signatureData);
      }
    } catch (error) {
      console.error('簽名對話框錯誤:', error);
    }
  }

  async handleSignatureSaved(signatureData: string) {
    // 這個函數現在主要用於手動簽名（非工人驗證的簽名）
    // 因為工人簽名現在直接通過 openWorkerSignatureDialog 處理
    if (this.currentParticipantIndex >= 0) {
      // 檢查是否已經達到簽名上限
      if (this.formData.workerSignatures.length >= 40) {
        alert('簽到表已滿，無法再新增簽名');
        return;
      }

      // 創建一個手動簽名記錄（沒有身分證號碼和電話的簽名）
      const manualSignature: SignatureData = {
        name: `手動簽名 ${this.formData.workerSignatures.length + 1}`,
        signature: signatureData,
        signedAt: new Date(),
        company: ''
      };

      this.formData.workerSignatures.push(manualSignature);
      
      // 更新實際簽到人數
      this.updateAttendanceCount();
      
      // 如果表單已存在，立即儲存到資料庫
      if (this.formId) {
        try {
          await this.mongodbService.patch('siteForm', this.formId, {
            workerSignatures: this.formData.workerSignatures,
            attendanceCount: this.formData.attendanceCount
          });
          console.log('手動簽名已儲存');
        } catch (error) {
          console.error('儲存簽名失敗', error);
        }
      }
    }
  }



  async saveForm(): Promise<void> {
    // 當非工人簽名模式時，才進行欄位驗證
    if (!this.isWorkerSigningMode) {
      if (!this.formData.trainingDate || 
          !this.formData.trainingTime || 
          !this.formData.contractorName?.trim() || 
          !this.formData.courseName?.trim()) {
        alert('請填寫所有必填欄位：訓練日期、時間、主承商、講師、課程名稱');
        return;
      }
    }
    
    try {
      // 更新實際簽到人數
      this.updateAttendanceCount();
      
      if (this.formId) {
        this.formData.updatedAt = new Date();
        this.formData.updatedBy = this.authService.user()?.name || '';
        // 更新現有表單
        await this.mongodbService.patch('siteForm', this.formId, this.formData);
        if (!this.isWorkerSigningMode) {
          alert('教育訓練表單已更新');
        }
      } else {
        this.formData.createdAt = new Date();
        this.formData.createdBy = this.authService.user()?.name || '';
        // 新增表單
        const result = await this.mongodbService.post('siteForm', this.formData);
        this.formId = result.insertedId;
        if (!this.isWorkerSigningMode) {
          alert('教育訓練表單已建立');
        }
      }
      
      // 產生 QR Code URL
      this.generateFormQrCodeUrl();
      
    } catch (error) {
      console.error('儲存教育訓練表單失敗', error);
      if (!this.isWorkerSigningMode) {
        alert('儲存教育訓練表單失敗');
      }
    }
  }

  private generateFormQrCodeUrl(): void {
    if (this.formId && this.siteId) {
      // 產生可供工人掃描的 QR Code URL
      const baseUrl = window.location.origin;
      this.formQrCodeUrl = `${baseUrl}/site/${this.siteId}/training/${this.formId}`;
      console.log('Generated QR Code URL:', this.formQrCodeUrl);
    } else {
      console.log('Cannot generate QR Code URL - formId:', this.formId, 'siteId:', this.siteId);
      this.formQrCodeUrl = '';
    }
  }

  showQrCodeModal(): void {
    this.generateFormQrCodeUrl();
    if (this.qrCodeModal && this.formQrCodeUrl) {
      this.qrCodeModal.show();
    } else if (!this.formQrCodeUrl) {
      alert('QR Code URL 尚未生成，請先儲存表單');
    }
  }

  cancel(): void {
    if (this.isLoggedIn) {
      this.router.navigate(['/site', this.siteId, 'training']);
    } else {
      // 工人簽名模式下，顯示提示或關閉視窗
      alert('簽名完成，請關閉此頁面');
    }
  }
}
