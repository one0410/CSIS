import {
  Component,
  OnInit,
  ViewChild,
  AfterViewInit,
  computed,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { MongodbService } from '../../../../services/mongodb.service';
import { SignatureDialogService } from '../../../../shared/signature-dialog.service';
import dayjs from 'dayjs';
import { Site } from '../../../site-list.component';
import { QRCodeComponent } from 'angularx-qrcode';
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

export interface HazardNoticeForm extends SiteForm {
  company: string;
  area: string;
  division: string;
  projectNo: string;
  contractor: string;
  workLocation: string;
  workName: string;
  workItems: WorkItem[];
  siteSupervisor: string;
  safetyOfficer: string;
  status: 'draft' | 'published' | 'revoked';
  createdAt: Date;
  workerSignatures: SignatureData[];
}

interface WorkItem {
  id: string;
  name: string;
  selected: boolean;
}

interface ProjectWorker extends Worker {
  hasSigned?: boolean;
}

@Component({
  selector: 'app-hazard-notice-form',
  standalone: true,
  imports: [CommonModule, FormsModule, QRCodeComponent],
  templateUrl: './hazard-notice-form.component.html',
  styleUrls: ['./hazard-notice-form.component.scss'],
})
export class HazardNoticeFormComponent implements OnInit, AfterViewInit {
  siteId: string = '';
  site = computed(() => this.currentSiteService.currentSite());
  formId: string | null = null;
  isViewMode: boolean = false;
  isLoggedIn: boolean = false;
  isWorkerSigningMode: boolean = false;

  // 表單資料模型
  formData: HazardNoticeForm = {
    siteId: '',
    formType: 'hazardNotice',
    company: '帆宣系統科技股份有限公司',
    area: '',
    division: '',
    projectNo: '',
    contractor: '',
    workLocation: '',
    workName: '',
    siteSupervisor: '',
    safetyOfficer: '',
    applyDate: dayjs().format('YYYY-MM-DD'),
    workItems: [
      { id: '1', name: '局限空間作業', selected: false },
      { id: '2', name: '動火作業', selected: false },
      {
        id: '3',
        name: '高架作業（2公尺以上作業）包含高空作業車',
        selected: false,
      },
      { id: '4', name: '吊裝作業', selected: false },
      { id: '5', name: '電氣作業', selected: false },
      { id: '6', name: '管線拆離作業', selected: false },
      { id: '7', name: '化學作業', selected: false },
      { id: '8', name: '切割作業', selected: false },
      { id: '9', name: '拆除作業', selected: false },
      { id: '10', name: '裝修作業', selected: false },
      { id: '11', name: '油漆作業', selected: false },
      { id: '12', name: '垃圾清運作業 ', selected: false },
      { id: '13', name: '地面清潔作業', selected: false },
      { id: '14', name: '搬運作業', selected: false },
      { id: '15', name: '環境消毒作業', selected: false },
      { id: '16', name: '外牆修繕作業', selected: false },
    ],
    status: 'draft',
    createdAt: new Date(),    
    createdBy: '',
    workerSignatures: [],
  };

  workerName: string = '';

  verificationIdOrPhone: string = '';
  verificationError: string = '';
  currentWorker: ProjectWorker | null = null;

  // 專案工人列表 (實際上應該從資料庫獲取)
  projectWorkers: ProjectWorker[] = [];
  workerVerificationModal: any;
  workerSignatureModal: any;
  showSignaturePad: boolean = false;

  // QR Code 相關
  formQrCodeUrl: string = '';
  qrCodeModal: any;

  constructor(
    private mongodbService: MongodbService,
    private route: ActivatedRoute,
    private router: Router,
    private signatureDialog: SignatureDialogService,
    private currentSiteService: CurrentSiteService,
    private authService: AuthService
  ) {}

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
        this.formData.projectNo = this.site()?.projectNo || '';
        
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
        } else {
          // 只在新建表單時自動帶入 currentSite 的 projectName 到施工地點
          this.formData.workLocation = this.site()?.projectName || '';
        }

        // 只有在登入狀態下才載入專案工人列表
        if (this.isLoggedIn) {
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
      'workerVerificationModal'
    );
    const signatureModalEl = document.getElementById('workerSignatureModal');
    const qrCodeModalEl = document.getElementById('qrCodeModal');

    if (verificationModalEl) {
      this.workerVerificationModal = new bootstrap.Modal(verificationModalEl);
    }

    if (signatureModalEl) {
      this.workerSignatureModal = new bootstrap.Modal(signatureModalEl);
    }

    if (qrCodeModalEl) {
      this.qrCodeModal = new bootstrap.Modal(qrCodeModalEl);
    }
  }

  async loadFormDetails(formId: string): Promise<void> {
    try {
      this.formData = await this.mongodbService.getById('siteForm', formId);

      // 重新載入專案工人以標記已簽名狀態
      await this.loadProjectWorkers(this.siteId);

      // 生成表單 QR Code URL
      this.generateFormQrCodeUrl();
    } catch (error) {
      console.error('載入表單詳情失敗', error);
    }
  }

  toggleWorkItem(workItem: WorkItem): void {
    workItem.selected = !workItem.selected;
  }

  async addSignature(index: number): Promise<void> {
    try {
      const signature = await this.signatureDialog.open();
      if (signature) {
        this.formData.workerSignatures[index].signature = signature;
      }
    } catch (error) {
      console.error('簽名對話框操作失敗', error);
    }
  }

  async loadProjectWorkers(siteId: string): Promise<void> {
    try {
      // 從資料庫獲取該專案的工人列表
      this.projectWorkers = await this.mongodbService.get('worker', {
        belongSites: { $elemMatch: { siteId: siteId } },
      });

      // 查詢該工地所有未作廢的危害告知單
      const allActiveForms = await this.mongodbService.get('siteForm', {
        siteId: siteId,
        formType: 'hazardNotice',
        status: { $ne: 'revoked' }
      });

      // 收集所有未作廢表單的工人簽名記錄
      const allWorkerSignatures: SignatureData[] = [];
      allActiveForms.forEach((form: HazardNoticeForm) => {
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

  showWorkerVerificationModal() {
    this.verificationIdOrPhone = '';
    this.verificationError = '';
    this.workerVerificationModal.show();
  }

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

    // 檢查工人是否已簽名
    if (worker.hasSigned) {
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

  // 新增使用SignatureDialogService開啟簽名對話框的方法
  async openWorkerSignatureDialog(): Promise<void> {
    try {
      const signature = await this.signatureDialog.open();
      if (signature && this.currentWorker) {
        // 添加簽名
        const workerSignature: SignatureData = {
          name: this.currentWorker.name,
          company: this.currentWorker.contractingCompanyName,
          signature: signature,
          signedAt: new Date(),
          idno: this.currentWorker.idno,
          tel: this.currentWorker.tel,
        };

        this.formData.workerSignatures.push(workerSignature);

        // 標記此工人已簽名
        const workerIndex = this.projectWorkers.findIndex(
          (w) => w._id === this.currentWorker!._id
        );
        if (workerIndex !== -1) {
          this.projectWorkers[workerIndex].hasSigned = true;
        }

        // 不再需要更新工人記錄，狀態直接從表單簽名記錄查詢

        // 保存表單
        this.saveForm();
      }
    } catch (error) {
      console.error('簽名對話框操作失敗', error);
    }
  }

  // 移除不必要的更新工人記錄邏輯，改為直接從表單簽名記錄查詢狀態
  async handleSignatureSaved(signatureData: string) {
    // 此方法保留但不再使用，改為使用 openWorkerSignatureDialog
    if (!this.currentWorker) {
      return;
    }

    // 添加簽名
    const workerSignature: SignatureData = {
      name: this.currentWorker.name,
      company: this.currentWorker.contractingCompanyName,
      signature: signatureData,
      signedAt: new Date(),
      idno: this.currentWorker.idno,
      tel: this.currentWorker.tel,
    };

    this.formData.workerSignatures.push(workerSignature);

    // 標記此工人已簽名
    const workerIndex = this.projectWorkers.findIndex(
      (w) => w._id === this.currentWorker!._id
    );
    if (workerIndex !== -1) {
      this.projectWorkers[workerIndex].hasSigned = true;
    }

    // 不再需要更新工人記錄，狀態直接從表單簽名記錄查詢        // 關閉模態框    this.workerSignatureModal.hide();    this.showSignaturePad = false;        // 保存表單    this.saveForm();
  }

  handleSignatureClosed() {
    this.workerSignatureModal.hide();
    this.showSignaturePad = false;
  }

  async saveForm(): Promise<void> {
    const requiredFields = {
      工地區域: this.formData.area,
      施工廠商: this.formData.contractor,
      施工地點: this.formData.workLocation,
      工程名稱: this.formData.workName,
      工地監工: this.formData.siteSupervisor,
      安衛人員: this.formData.safetyOfficer,
    };

    const emptyFields = Object.entries(requiredFields)
      .filter(([_, value]) => !value || value.trim() === '')
      .map(([key, _]) => key);

    if (emptyFields.length > 0) {
      alert(`請填寫以下必填欄位：\n${emptyFields.join('\n')}`);
      return;
    }

    try {
      if (this.formId) {
        this.formData.updatedAt = new Date();
        this.formData.updatedBy = this.authService.user()?.name || '';
        await this.mongodbService.patch('siteForm', this.formId, this.formData);
      } else {
        this.formData.createdAt = new Date();
        this.formData.createdBy = this.authService.user()?.name || '';
        const response = await this.mongodbService.post(
          'siteForm',
          this.formData
        );
        this.formId = response.insertedId;
        // 新增表單成功後，生成 QR Code URL
        this.generateFormQrCodeUrl();
      }

      alert('表單儲存成功！');
    } catch (error) {
      console.error('儲存表單失敗', error);
      alert('儲存表單時發生錯誤');
    }
  }

  // 生成表單 QR Code URL
  private generateFormQrCodeUrl(): void {
    if (this.formId) {
      // 使用絕對 URL，指向不需要登入的路由
      const baseUrl = window.location.origin;
      this.formQrCodeUrl = `${baseUrl}/site/${this.siteId}/hazardNotice/${this.formId}`;
    }
  }

  // 顯示 QR Code Modal
  showQrCodeModal(): void {
    if (this.qrCodeModal) {
      this.qrCodeModal.show();
    }
  }

  cancel(): void {
    if (this.isLoggedIn) {
      this.router.navigate(['/site', this.siteId, 'hazardNotice']);
    } else {
      // 工人簽名模式下，顯示提示或關閉視窗
      alert('簽名完成，請關閉此頁面');
    }
  }
}
