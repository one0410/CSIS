import { Component, computed, OnInit, AfterViewInit } from '@angular/core';

import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { MongodbService } from '../../../../services/mongodb.service';
import { SignatureDialogService } from '../../../../shared/signature-dialog.service';
import { DocxTemplateService } from '../../../../services/docx-template.service';
import { Site } from '../../../site-list.component';
import { CurrentSiteService } from '../../../../services/current-site.service';
import { SiteForm } from '../../../../model/siteForm.model';
import dayjs from 'dayjs';
import { AuthService } from '../../../../services/auth.service';
import { Worker } from '../../../../model/worker.model';
import { SignatureData } from '../../../../model/signatureData.model';

// 導入 Bootstrap Modal 相關類型
declare const bootstrap: {
  Modal: new (element: HTMLElement, options?: any) => {
    show: () => void;
    hide: () => void;
    dispose: () => void;
  };
};

// 專案工人介面，擴展自 Worker 添加簽名狀態
interface ProjectWorker extends Worker {
  hasSigned?: boolean;
}

interface ToolboxMeetingForm extends SiteForm {
  formType: 'toolboxMeeting';
  projectNo: string;
  projectName: string;
  meetingLocation: string;
  meetingTime: string; // 會議時間
  hostCompany: string; // 主持人單位
  hostPerson: string; // 主持人
  contractors: Contractor[];
  workItems: WorkItem[];
  hazards: Hazards; // 危害
  safetyPrecautions: SafetyPrecautions; // 安全防護措施
  healthWarnings: HealthWarnings; // 健康危害告知
  fieldCheckItems: FieldCheckItem[]; // 現場檢查項目
  leaderSignature: string;
  siteManagerSignature: string;
  worker1Signature: string;
  worker2Signature: string;
  worker3Signature: string;
  status: string;
  remarks?: string;
  createdAt: Date;
}

// 簽名類型
export enum SignatureType {
  Leader = 'leader', // 主承攬商
  SiteManager = 'siteManager', // 主承攬商
  Worker1 = 'worker1', // 再承攬商 1
  Worker2 = 'worker2', // 再承攬商 2
  Worker3 = 'worker3', // 再承攬商 3
}

interface Contractor {
  type: string; // '主承攬商' | '再承攬商' | '與會人員'
  name: string;
  company: string;
  title: string;
}

interface WorkItem {
  title: string;
  description: string;
}

interface Hazards {
  // 物理性危害
  physical: {
    noise: boolean;
    vibration: boolean;
    highTemp: boolean;
    lowTemp: boolean;
    fallObject: boolean;
    electric: boolean;
    radiation: boolean;
  };
  // 化學性危害
  chemical: {
    burn: boolean;
    inhalation: boolean;
  };
  // 火災危害
  fire: {
    fire: boolean;
  };
  // 其他危害
  other: {
    biological: boolean;
    outdoorHighTemp: boolean;
    other: boolean;
    otherContent: string;
  };
  // 作業區域包含以下化學品及其附屬設備管線
  chemicalArea: {
    hasChemicals: boolean;
    chemicalNames: string;
  };
  // 作業區域或包含以下氣體及其附屬設備管線
  gasArea: {
    hasGas: boolean;
    gasNames: string;
  };
}

interface SafetyPrecautions {
  // 依作業性質穿戴之安全防護具
  personalProtection: {
    head: boolean; // 頭部防護：工地用 | 電工用 | 實驗室
    eyes: boolean; // 眼部防護：防火花飛濺 | 防雷射射針能傷害的安全眼鏡
    breath: boolean; // 呼吸防護：防塵 | 濾毒 | SCBA | PAPR | 輸氣管面罩
    hand: boolean; // 手部防護：耐切割 | 耐熱 | 耐寒 | 電工用 | 防化學
    foot: boolean; // 足部防護：一般安全鞋 | 防化學安全鞋
    body: boolean; // 身體防護：穿著式安全帶 | 背負式安全帶 | 全身式安全防護衣 | 化學防護衣 | 反光背心
    hearing: boolean; // 聽覺防護：耳塞 | 耳罩
    fall: boolean; // 墜落防護：安全網 | 移動梯 | 施工架 | 高空工作車 | 安全母索 | 自動防墜器 | 安全繩 | 鷹架 | 固定梯
    electric: boolean; // 電氣預防：漏電斷路器 | 交流電源機自動電擊防止裝置 | 接地器
    fire: boolean; // 火災預防：滅火器 | 防火毯 | 滅火栓防火裝置
    gas: boolean; // 氣體預防：通風設備 | 生命偵測裝置 | 氣體偵測器 | 吊掛設備 | 搶災設備
    other: boolean; // 其他預防：
    otherContent: string;
  };
}

interface HealthWarnings {
  // 健康危害告知
  heartDisease: boolean; // 心血管疾病、聽力異常
  vibration: boolean; // 周邊神經系統疾病、周邊循環系統疾病
  radiation: boolean; // 血液疾病、內分泌系統疾病、神經系統異常、眼睛疾病
  internal: boolean; // 內分泌系統疾病、神經系統異常
  highAltitude: boolean; // 癲癇、精神或神經系統疾病、高血壓、心血管疾病
  diving: boolean; // 心血管疾病、慢性閉塞性肺疾病、慢性氣喘、無意識
  correctiveWork: boolean; // 周邊神經系統疾病、接觸性皮膚疾病等
  heavyWork: boolean; // 呼吸系統疾病、高血壓、心血管疾病、貧血、肝病、腎臟疾病、精神或神經系統疾病、無意識狀態糖尿病、接觸性皮膚疾病、骨骼肌肉

  // 出席人員簽名
  attendeeMainContractorSignatures: SignatureData[]; // 主承攬商
  attendeeSubcontractor1Signatures: SignatureData[]; // 再承攬商1
  attendeeSubcontractor2Signatures: SignatureData[]; // 再承攬商2
  attendeeSubcontractor3Signatures: SignatureData[]; // 再承攬商3
}

interface FieldCheckItem {
  id: number;
  content: string;
  checkBeforeStart: boolean;
  checkDuring: boolean;
  checkBeforeEnd: boolean;
  checkAfter: boolean;
}

@Component({
  selector: 'app-toolbox-meeting-form',
  templateUrl: './toolbox-meeting-form.component.html',
  styleUrls: ['./toolbox-meeting-form.component.scss'],
  standalone: true,
  imports: [FormsModule],
})
export class ToolboxMeetingFormComponent implements OnInit, AfterViewInit {
  siteId: string = '';
  site = computed(() => this.currentSiteService.currentSite());
  today = new Date();
  isGeneratingPdf: boolean = false; // 文檔生成狀態

  // 模板驅動表單的數據模型
  meetingData: ToolboxMeetingForm = {
    siteId: '',
    formType: 'toolboxMeeting',
    applyDate: dayjs().format('YYYY-MM-DD'),
    meetingTime: '08:30',
    projectNo: '',
    projectName: '',
    meetingLocation: '',
    hostCompany: '',
    hostPerson: '',
    contractors: [
      { type: '主承攬商', name: '', company: '', title: '' },
      { type: '主承攬商', name: '', company: '', title: '' },
      { type: '再承攬商', name: '', company: '', title: '' },
      { type: '與會人員', name: '', company: '', title: '' },
    ],
    workItems: [
      { title: '本日工作項目', description: '' },
      { title: '本日工作地點', description: '' },
    ],
    hazards: {
      physical: {
        noise: false,
        vibration: false,
        highTemp: false,
        lowTemp: false,
        fallObject: false,
        electric: false,
        radiation: false,
      },
      chemical: {
        burn: false,
        inhalation: false,
      },
      fire: {
        fire: false,
      },
      other: {
        biological: false,
        outdoorHighTemp: false,
        other: false,
        otherContent: '',
      },
      chemicalArea: {
        hasChemicals: false,
        chemicalNames: '',
      },
      gasArea: {
        hasGas: false,
        gasNames: '',
      },
    },
    safetyPrecautions: {
      personalProtection: {
        head: false,
        eyes: false,
        breath: false,
        hand: false,
        foot: false,
        body: false,
        hearing: false,
        fall: false,
        electric: false,
        fire: false,
        gas: false,
        other: false,
        otherContent: '',
      },
    },
    healthWarnings: {
      heartDisease: false,
      vibration: false,
      radiation: false,
      internal: false,
      highAltitude: false,
      diving: false,
      correctiveWork: false,
      heavyWork: false,
      attendeeMainContractorSignatures: Array(10)
        .fill(0)
        .map((_, i) => ({
          name: '',
          company: '',
          signature: '',
          signedAt: undefined,
          idno: '',
          tel: ''
        })),
      attendeeSubcontractor1Signatures: Array(10)
        .fill(0)
        .map((_, i) => ({
          name: '',
          company: '',
          signature: '',
          signedAt: undefined,
          idno: '',
          tel: ''
        })),
      attendeeSubcontractor2Signatures: Array(10)
        .fill(0)
        .map((_, i) => ({
          name: '',
          company: '',
          signature: '',
          signedAt: undefined,
          idno: '',
          tel: ''
        })),
      attendeeSubcontractor3Signatures: Array(10)
        .fill(0)
        .map((_, i) => ({
          name: '',
          company: '',
          signature: '',
          signedAt: undefined,
          idno: '',
          tel: ''
        })),
    },
    fieldCheckItems: [
      {
        id: 1,
        content: '作業內容符合申請種類。',
        checkBeforeStart: false,
        checkDuring: false,
        checkBeforeEnd: false,
        checkAfter: false,
      },
      {
        id: 2,
        content: '確實執行相關作業施工及安全防護措施。',
        checkBeforeStart: false,
        checkDuring: false,
        checkBeforeEnd: false,
        checkAfter: false,
      },
      {
        id: 3,
        content: '作業人員確實配戴/使用安全防護具、精神狀況/身體狀況正常。',
        checkBeforeStart: false,
        checkDuring: false,
        checkBeforeEnd: false,
        checkAfter: false,
      },
      {
        id: 4,
        content: '作業主管確實管理現場監督。',
        checkBeforeStart: false,
        checkDuring: false,
        checkBeforeEnd: false,
        checkAfter: false,
      },
      {
        id: 5,
        content: '收工前/施工地點恢復安全、時水電氣設施及防護設備/排洩便房。',
        checkBeforeStart: false,
        checkDuring: false,
        checkBeforeEnd: false,
        checkAfter: false,
      },
    ],
    leaderSignature: '',
    siteManagerSignature: '',
    worker1Signature: '',
    worker2Signature: '',
    worker3Signature: '',
    status: 'draft',
    createdAt: new Date(),
    createdBy: '',
  };

  // 簽名存儲
  leaderSignature: string | null = null;
  siteManagerSignature: string | null = null;
  worker1Signature: string | null = null;
  worker2Signature: string | null = null;
  worker3Signature: string | null = null;

  // 專案工人和驗證相關屬性
  projectWorkers: ProjectWorker[] = [];
  verificationIdOrPhone: string = '';
  verificationError: string = '';
  currentWorker: ProjectWorker | null = null;
  workerVerificationModal: any;

  // 當前選擇的承攬商類型 (0:主承攬商, 1:再承攬商1, 2:再承攬商2, 3:再承攬商3)
  currentSignatureColumn: number = -1;

  // 公開 SignatureType 枚舉給模板
  SignatureType = SignatureType;

  constructor(
    private mongodbService: MongodbService,
    private route: ActivatedRoute,
    private router: Router,
    private signatureDialog: SignatureDialogService,
    private currentSiteService: CurrentSiteService,
    private authService: AuthService,
    private docxTemplateService: DocxTemplateService
  ) {}

  async ngOnInit(): Promise<void> {
    // 從路由參數獲取工地ID和表單ID
    this.route.paramMap.subscribe(async (params) => {
      const id = params.get('id');
      const formId = params.get('formId');

      if (id) {
        this.siteId = id;
        this.meetingData.siteId = id;
        await this.currentSiteService.setCurrentSiteById(id);
        this.meetingData.projectNo = this.site()?.projectNo || '';
        this.meetingData.projectName = this.site()?.projectName || '';

        // 載入專案工人列表
        await this.loadProjectWorkers(id);

        // 如果有表單ID，載入現有表單
        if (formId) {
          await this.loadFormData(formId);
        } else {
          // 新表單：檢查 URL 查詢參數中是否有日期
          this.route.queryParams.subscribe((queryParams) => {
            if (queryParams['date']) {
              // 從 URL 查詢參數獲取日期並設置為 applyDate
              const dateFromUrl = queryParams['date'];
              if (dateFromUrl && dateFromUrl.match(/^\d{4}-\d{2}-\d{2}$/)) {
                // 如果日期格式正確 (YYYY-MM-DD)，則設置為 applyDate
                this.meetingData.applyDate = dateFromUrl;
              } else {
                try {
                  // 嘗試使用 dayjs 解析日期
                  const parsedDate = dayjs(dateFromUrl).format('YYYY-MM-DD');
                  if (parsedDate !== 'Invalid Date') {
                    this.meetingData.applyDate = parsedDate;
                  }
                } catch (error) {
                  console.error('無法解析日期參數:', dateFromUrl, error);
                }
              }
            }
          });
        }
      }
    });
  }

  ngAfterViewInit(): void {
    // 初始化 Bootstrap Modal
    const workerVerificationModalElement = document.getElementById(
      'workerVerificationModal'
    );
    if (workerVerificationModalElement) {
      this.workerVerificationModal = new bootstrap.Modal(
        workerVerificationModalElement
      );
    }
  }

  // 參與廠商管理
  addContractor(): void {
    this.meetingData.contractors.push({
      type: '再承攬商',
      name: '',
      company: '',
      title: '',
    });
  }

  removeContractor(index: number): void {
    if (this.meetingData.contractors.length > 1) {
      this.meetingData.contractors.splice(index, 1);
    }
  }

  // 工作項目管理
  addWorkItem(): void {
    this.meetingData.workItems.push({ title: '', description: '' });
  }

  removeWorkItem(index: number): void {
    if (this.meetingData.workItems.length > 1) {
      this.meetingData.workItems.splice(index, 1);
    }
  }

  // 打開簽名對話框
  async openSignatureDialog(type: SignatureType): Promise<void> {
    try {
      const signature = await this.signatureDialog.open();
      if (signature) {
        // 更新相應的簽名
        switch (type) {
          case SignatureType.Leader:
            this.leaderSignature = signature;
            this.meetingData.leaderSignature = signature;
            break;
          case SignatureType.SiteManager:
            this.siteManagerSignature = signature;
            this.meetingData.siteManagerSignature = signature;
            break;
          case SignatureType.Worker1:
            this.worker1Signature = signature;
            this.meetingData.worker1Signature = signature;
            break;
          case SignatureType.Worker2:
            this.worker2Signature = signature;
            this.meetingData.worker2Signature = signature;
            break;
          case SignatureType.Worker3:
            this.worker3Signature = signature;
            this.meetingData.worker3Signature = signature;
            break;
        }
      }
    } catch (error) {
      console.error('簽名對話框操作失敗', error);
    }
  }

  // 載入現有表單資料
  async loadFormData(formId: string): Promise<void> {
    try {
      const form = await this.mongodbService.getById('siteForm', formId);
      if (form) {
        this.meetingData = { ...form };

        // 資料格式遷移：如果載入的是舊格式，轉換為新格式
        if (this.meetingData.healthWarnings && (this.meetingData.healthWarnings as any).attendeeSignatures) {
          const oldSignatures = (this.meetingData.healthWarnings as any).attendeeSignatures;
          
          // 初始化新的四個陣列
          this.meetingData.healthWarnings.attendeeMainContractorSignatures = Array(10)
            .fill(0)
            .map((_, i) => ({
              name: '',
              company: '',
              signature: '',
              signedAt: undefined,
              idno: '',
              tel: ''
            }));
          this.meetingData.healthWarnings.attendeeSubcontractor1Signatures = Array(10)
            .fill(0)
            .map((_, i) => ({
              name: '',
              company: '',
              signature: '',
              signedAt: undefined,
              idno: '',
              tel: ''
            }));
          this.meetingData.healthWarnings.attendeeSubcontractor2Signatures = Array(10)
            .fill(0)
            .map((_, i) => ({
              name: '',
              company: '',
              signature: '',
              signedAt: undefined,
              idno: '',
              tel: ''
            }));
          this.meetingData.healthWarnings.attendeeSubcontractor3Signatures = Array(10)
            .fill(0)
            .map((_, i) => ({
              name: '',
              company: '',
              signature: '',
              signedAt: undefined,
              idno: '',
              tel: ''
            }));
          
          // 轉換舊格式的簽名資料
          if (Array.isArray(oldSignatures)) {
            oldSignatures.forEach((oldSig: any, index: number) => {
              if (index < 10) {
                // 處理各種舊格式的可能性
                if (oldSig.contractorSignatures && Array.isArray(oldSig.contractorSignatures)) {
                  // 舊的陣列格式
                  oldSig.contractorSignatures.forEach((sig: any, sigIndex: number) => {
                    if (sigIndex < 10 && sig.signature) {
                      this.meetingData.healthWarnings.attendeeMainContractorSignatures[sigIndex] = {
                        name: sig.workerName || '',
                        company: sig.workerInfo?.company || '',
                        signature: sig.signature,
                        signedAt: sig.signedAt || new Date(),
                        idno: sig.idno || '',
                        tel: sig.tel || ''
                      };
                    }
                  });
                } else if (oldSig.contractorSignature) {
                  // 舊的單一簽名格式
                  this.meetingData.healthWarnings.attendeeMainContractorSignatures[index] = {
                    name: oldSig.workerInfo?.name || '',
                    company: oldSig.workerInfo?.company || '',
                    signature: oldSig.contractorSignature,
                    signedAt: oldSig.signedAt || new Date(),
                    idno: oldSig.idno || '',
                    tel: oldSig.tel || ''
                  };
                }
                
                // 類似地處理其他承攬商的簽名...
                if (oldSig.subcontractor1Signatures && Array.isArray(oldSig.subcontractor1Signatures)) {
                  oldSig.subcontractor1Signatures.forEach((sig: any, sigIndex: number) => {
                    if (sigIndex < 10 && sig.signature) {
                      this.meetingData.healthWarnings.attendeeSubcontractor1Signatures[sigIndex] = {
                        name: sig.workerName || '',
                        company: sig.workerInfo?.company || '',
                        signature: sig.signature,
                        signedAt: sig.signedAt || new Date(),
                        idno: sig.idno || '',
                        tel: sig.tel || ''
                      };
                    }
                  });
                } else if (oldSig.signature1) {
                  this.meetingData.healthWarnings.attendeeSubcontractor1Signatures[index] = {
                    name: oldSig.workerInfo?.name || '',
                    company: oldSig.workerInfo?.company || '',
                    signature: oldSig.signature1,
                    signedAt: oldSig.signedAt || new Date(),
                    idno: oldSig.idno || '',
                    tel: oldSig.tel || ''
                  };
                }
                
                if (oldSig.subcontractor2Signatures && Array.isArray(oldSig.subcontractor2Signatures)) {
                  oldSig.subcontractor2Signatures.forEach((sig: any, sigIndex: number) => {
                    if (sigIndex < 10 && sig.signature) {
                      this.meetingData.healthWarnings.attendeeSubcontractor2Signatures[sigIndex] = {
                        name: sig.workerName || '',
                        company: sig.workerInfo?.company || '',
                        signature: sig.signature,
                        signedAt: sig.signedAt || new Date(),
                        idno: sig.idno || '',
                        tel: sig.tel || ''
                      };
                    }
                  });
                } else if (oldSig.signature2) {
                  this.meetingData.healthWarnings.attendeeSubcontractor2Signatures[index] = {
                    name: oldSig.workerInfo?.name || '',
                    company: oldSig.workerInfo?.company || '',
                    signature: oldSig.signature2,
                    signedAt: oldSig.signedAt || new Date(),
                    idno: oldSig.idno || '',
                    tel: oldSig.tel || ''
                  };
                }
                
                if (oldSig.subcontractor3Signatures && Array.isArray(oldSig.subcontractor3Signatures)) {
                  oldSig.subcontractor3Signatures.forEach((sig: any, sigIndex: number) => {
                    if (sigIndex < 10 && sig.signature) {
                      this.meetingData.healthWarnings.attendeeSubcontractor3Signatures[sigIndex] = {
                        name: sig.workerName || '',
                        company: sig.workerInfo?.company || '',
                        signature: sig.signature,
                        signedAt: sig.signedAt || new Date(),
                        idno: sig.idno || '',
                        tel: sig.tel || ''
                      };
                    }
                  });
                } else if (oldSig.signature3) {
                  this.meetingData.healthWarnings.attendeeSubcontractor3Signatures[index] = {
                    name: oldSig.workerInfo?.name || '',
                    company: oldSig.workerInfo?.company || '',
                    signature: oldSig.signature3,
                    signedAt: oldSig.signedAt || new Date(),
                    idno: oldSig.idno || '',
                    tel: oldSig.tel || ''
                  };
                }
              }
            });
          }
          
          // 刪除舊的 attendeeSignatures 屬性
          delete (this.meetingData.healthWarnings as any).attendeeSignatures;
        }

        // 確保新格式的陣列存在
        if (!this.meetingData.healthWarnings.attendeeMainContractorSignatures) {
          this.meetingData.healthWarnings.attendeeMainContractorSignatures = Array(10)
            .fill(0)
            .map((_, i) => ({
              name: '',
              company: '',
              signature: '',
              signedAt: new Date(),
              idno: '',
              tel: ''
            }));
        }
        if (!this.meetingData.healthWarnings.attendeeSubcontractor1Signatures) {
          this.meetingData.healthWarnings.attendeeSubcontractor1Signatures = Array(10)
            .fill(0)
            .map((_, i) => ({
              name: '',
              company: '',
              signature: '',
              signedAt: new Date(),
              idno: '',
              tel: ''
            }));
        }
        if (!this.meetingData.healthWarnings.attendeeSubcontractor2Signatures) {
          this.meetingData.healthWarnings.attendeeSubcontractor2Signatures = Array(10)
            .fill(0)
            .map((_, i) => ({
              name: '',
              company: '',
              signature: '',
              signedAt: new Date(),
              idno: '',
              tel: ''
            }));
        }
        if (!this.meetingData.healthWarnings.attendeeSubcontractor3Signatures) {
          this.meetingData.healthWarnings.attendeeSubcontractor3Signatures = Array(10)
            .fill(0)
            .map((_, i) => ({
              name: '',
              company: '',
              signature: '',
              signedAt: new Date(),
              idno: '',
              tel: ''
            }));
        }

        // 更新簽名變數
        this.leaderSignature = form.leaderSignature || null;
        this.siteManagerSignature = form.siteManagerSignature || null;
        this.worker1Signature = form.worker1Signature || null;
        this.worker2Signature = form.worker2Signature || null;
        this.worker3Signature = form.worker3Signature || null;

        // 重新檢查工人簽名狀態
        this.updateWorkerSignedStatus();

        console.log('工具箱會議表單已載入:', formId);
      }
    } catch (error) {
      console.error('載入工具箱會議表單失敗', error);
      alert('載入表單失敗');
    }
  }

  // 更新工人簽名狀態
  private updateWorkerSignedStatus(): void {
    this.projectWorkers.forEach((worker) => {
      // 檢查當前表單中是否已有該工人的簽名
      const hasSignedInCurrentForm = this.checkWorkerHasSigned(worker);
      worker.hasSigned = hasSignedInCurrentForm;
    });
  }

  // 檢查工人是否已簽名
  private checkWorkerHasSigned(worker: ProjectWorker): boolean {
    const allSignatureArrays = [
      this.meetingData.healthWarnings?.attendeeMainContractorSignatures || [],
      this.meetingData.healthWarnings?.attendeeSubcontractor1Signatures || [],
      this.meetingData.healthWarnings?.attendeeSubcontractor2Signatures || [],
      this.meetingData.healthWarnings?.attendeeSubcontractor3Signatures || []
    ];

    return allSignatureArrays.some(signatures => 
      signatures.some(sig => {
        return (sig.idno && sig.idno === worker.idno) || 
               (sig.tel && worker.tel && sig.tel === worker.tel);
      })
    );
  }

  // 載入專案工人
  async loadProjectWorkers(siteId: string): Promise<void> {
    try {
      // 從資料庫獲取該專案的工人列表
      this.projectWorkers = await this.mongodbService.get('worker', {
        belongSites: { $elemMatch: { siteId: siteId } },
      });

      // 查詢該工地所有未作廢的工具箱會議表單
      const allActiveForms = await this.mongodbService.get('siteForm', {
        siteId: siteId,
        formType: 'toolboxMeeting',
        status: { $ne: 'revoked' },
      });

      // 標記已簽名的工人
      this.updateWorkerSignedStatus();
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

    // 檢查工人是否已簽名
    const alreadySigned = this.checkWorkerHasSigned(worker);

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
        const targetColumn = this.currentSignatureColumn;
        
        // 找到第一個空的簽名位置
        const emptySignature = this.findEmptySignatureSlot(targetColumn);
        
        if (!emptySignature) {
          alert('此承攬商的簽名表已滿，無法再新增簽名');
          return;
        }

        // 建立簽名記錄
        emptySignature.signature = signature;
        emptySignature.name = this.currentWorker.name;
        emptySignature.company = this.currentWorker.contractingCompanyName || '';
        emptySignature.signedAt = new Date();
        emptySignature.idno = this.currentWorker.idno;
        emptySignature.tel = this.currentWorker.tel;
        
        // 標記此工人已簽名
        const workerIndex = this.projectWorkers.findIndex(
          (w) => w._id === this.currentWorker!._id
        );
        if (workerIndex !== -1) {
          this.projectWorkers[workerIndex].hasSigned = true;
        }

        try {
          // 自動保存表單（不跳轉頁面）
          await this.saveFormData();
          console.log('工人簽名已加入表格');
          alert(`${this.currentWorker.name} 簽名成功`);
        } catch (error) {
          console.error('保存工人簽名失敗', error);
          alert('保存簽名時發生錯誤，請稍後再試');
          // 如果保存失敗，回復簽名狀態
          emptySignature.signature = '';
          emptySignature.name = '';
          emptySignature.company = '';
          emptySignature.signedAt = new Date();
          emptySignature.idno = '';
          emptySignature.tel = '';
          if (workerIndex !== -1) {
            this.projectWorkers[workerIndex].hasSigned = false;
          }
        }
      }
    } catch (error) {
      console.error('簽名對話框操作失敗', error);
    }
  }

  // 找到空的簽名位置
  private findEmptySignatureSlot(contractorType: number): SignatureData | null {
    let targetSignatures: SignatureData[] = [];
    
    switch (contractorType) {
      case 0:
        targetSignatures = this.meetingData.healthWarnings.attendeeMainContractorSignatures;
        break;
      case 1:
        targetSignatures = this.meetingData.healthWarnings.attendeeSubcontractor1Signatures;
        break;
      case 2:
        targetSignatures = this.meetingData.healthWarnings.attendeeSubcontractor2Signatures;
        break;
      case 3:
        targetSignatures = this.meetingData.healthWarnings.attendeeSubcontractor3Signatures;
        break;
      default:
        return null;
    }
    
    return targetSignatures.find(sig => !sig.signature || sig.signature.trim() === '') || null;
  }

  // 移除不再需要的方法，直接簡化邏輯
  showWorkerVerificationModal(contractorType: number): void {
    this.currentSignatureColumn = contractorType;
    this.verificationIdOrPhone = '';
    this.verificationError = '';
    this.currentWorker = null;
    this.workerVerificationModal.show();
  }

  // 取得簽名提示文字（顯示簽名者資訊）
  getSignatureTooltip(signature: SignatureData): string {
    if (signature.name && signature.signedAt) {
      return `簽名者：${signature.name}\n簽名時間：${dayjs(signature.signedAt).format('YYYY-MM-DD HH:mm:ss')}`;
    }
    return '';
  }

  // 檢查簽名位置是否已有簽名
  isSignatureSlotSigned(signature: SignatureData): boolean {
    return !!(signature.signature && signature.signature.trim() !== '');
  }

  // 取得要顯示的簽名圖片
  getSignatureImage(signature: SignatureData): string {
    return signature.signature || '';
  }

  // 格式化編號
  formatNo(index: number): string {
    return (index + 1).toString().padStart(2, '0');
  }

  // 僅保存表單資料，不跳轉頁面
  async saveFormData(): Promise<void> {
    try {
      if (this.meetingData._id) {
        this.meetingData.updatedAt = new Date();
        this.meetingData.updatedBy = this.authService.user()?.name || '';
        await this.mongodbService.put(
          'siteForm',
          this.meetingData._id,
          this.meetingData
        );
      } else {
        this.meetingData.createdAt = new Date();
        this.meetingData.createdBy = this.authService.user()?.name || '';
        const response = await this.mongodbService.post(
          'siteForm',
          this.meetingData
        );
        // 更新表單 ID 以便後續的更新操作
        this.meetingData._id = response.insertedId;
      }
    } catch (error) {
      console.error('儲存工具箱會議失敗', error);
      throw error; // 重新拋出錯誤讓調用方處理
    }
  }

  async saveMeeting(): Promise<void> {
    try {
      await this.saveFormData();
      alert('工具箱會議表單已儲存');
      // 儲存成功，導航回工地表單列表
      this.router.navigate(['/site', this.siteId, 'forms']);
    } catch (error) {
      console.error('儲存工具箱會議失敗', error);
      alert('儲存工具箱會議失敗');
    }
  }

  cancel(): void {
    // 返回工地詳情頁面
    this.router.navigate(['/site', this.siteId, 'forms']);
  }

      // Word生成方法
  async generateDocx(): Promise<void> {
    if (!this.meetingData._id) {
      alert('無法生成Word：表單ID不存在');
      return;
    }

    this.isGeneratingPdf = true;
    try {
      await this.docxTemplateService.generateToolboxMeetingDocx(this.meetingData._id);
      
    } catch (error) {
      console.error('生成Word失敗:', error);
      const errorMessage = error instanceof Error ? error.message : '未知錯誤';
      alert(`Word生成失敗: ${errorMessage}`);
    } finally {
      this.isGeneratingPdf = false;
    }
  }
}
