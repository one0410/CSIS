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
  participants: ParticipantSignature[];
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
    participants: [],
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
    this.formData.participants = [];
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
        // 如果沒有參與者資料或少於40個，初始化為40個
        if (!this.formData.participants || this.formData.participants.length < 40) {
          this.initializeParticipants();
          // 如果有現有資料，保留它們
          if (form.participants && form.participants.length > 0) {
            form.participants.forEach((participant: ParticipantSignature, index: number) => {
              if (index < 40) {
                this.formData.participants[index] = { ...participant };
              }
            });
          }
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
          worker.hasSigned = allWorkerSignatures.some(
            (sig) => sig.idno === worker.idno || sig.tel === worker.tel
          );
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

    // 查找工人
    const worker = this.projectWorkers.find(
      (w) =>
        this.verificationIdOrPhone &&
        (w.idno === this.verificationIdOrPhone ||
          w.tel === this.verificationIdOrPhone)
    );

    // 檢查工人是否存在
    if (!worker) {
      this.verificationError = '找不到此工人，請確認輸入資訊是否正確';
      return;
    }

    // 檢查工人是否已簽名（在表格中查找）
    const alreadySigned = this.formData.participants.some(
      (participant) => 
        participant.name === worker.name && 
        participant.signatureData && 
        participant.signatureData.length > 0
    );

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
        // 找到第一個空的位置填入工人資料
        const emptyIndex = this.formData.participants.findIndex(
          (participant) => !participant.name || participant.name.trim() === ''
        );

        if (emptyIndex !== -1) {
          // 填入工人資料到表格中
          this.formData.participants[emptyIndex] = {
            ...this.formData.participants[emptyIndex],
            contractorName: this.currentWorker.contractingCompanyName,
            name: this.currentWorker.name,
            signatureData: signature,
            arrivalTime: dayjs().format('HH:mm'),
            score: 100 // 預設分數
          };

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
          
          console.log('工人簽名已加入表格');
        } else {
          alert('簽到表已滿，無法再新增簽名');
        }
      }
    } catch (error) {
      console.error('簽名對話框操作失敗', error);
    }
  }

  // 更新實際簽到人數
  private updateAttendanceCount(): void {
    this.formData.attendanceCount = this.formData.participants.filter(
      (participant) => participant.name && participant.name.trim() !== ''
    ).length;
  }

  // 動態取得或創建指定索引的參與者資料
  getParticipant(index: number): ParticipantSignature {
    // 確保陣列有足夠的元素
    while (this.formData.participants.length <= index) {
      this.formData.participants.push({
        no: this.formData.participants.length + 1,
        contractorName: '',
        name: '',
        signatureData: '',
        arrivalTime: '',
        score: 0
      });
    }
    return this.formData.participants[index];
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
    if (this.currentParticipantIndex >= 0) {
      // 更新簽名資料
      this.formData.participants[this.currentParticipantIndex].signatureData = signatureData;
      this.formData.participants[this.currentParticipantIndex].arrivalTime = dayjs().format('HH:mm');
      
      // 更新實際簽到人數
      this.updateAttendanceCount();
      
      // 如果表單已存在，立即儲存到資料庫
      if (this.formId) {
        try {
          await this.mongodbService.patch('siteForm', this.formId, {
            participants: this.formData.participants,
            attendanceCount: this.formData.attendanceCount
          });
          console.log('簽名已儲存');
        } catch (error) {
          console.error('儲存簽名失敗', error);
        }
      }
    }
  }

  addParticipant() {
    // 移除此方法，因為現在是固定40格
  }

  removeParticipant(index: number) {
    // 移除此方法，因為現在是固定40格
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
