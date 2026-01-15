import { Component, computed, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SiteFormHeaderComponent } from '../site-form-header/site-form-header.component';
import { ActivatedRoute, Router } from '@angular/router';
import { MongodbService } from '../../../../services/mongodb.service';
import { SignatureDialogService } from '../../../../shared/signature-dialog.service';
import { Worker, CertificationTypeManager } from '../../../../model/worker.model';

import { DocxTemplateService } from '../../../../services/docx-template.service';
import dayjs from 'dayjs';
import { SiteForm } from '../../../../model/siteForm.model';
import { CurrentSiteService } from '../../../../services/current-site.service';
import { SignatureData } from '../../../../model/signatureData.model';
import { AuthService } from '../../../../services/auth.service';

export interface SitePermitForm extends SiteForm {
  applicant: string;
  applyType: string;
  workContent: string;
  workLocation: string;
  workArea: string;
  workStartTime: string;
  workEndTime: string;
  supervisor: string; // 監工單位
  supervisorContact: string; // 監工姓名
  supervisorPhone: string; // 監工電話
  projectNo: string;
  projectName: string;
  selectedCategories: string[];
  otherWork: boolean;
  otherWorkContent: string;
  status: string;
  approvalSignature: SignatureData; // 核准簽名
  reviewSignature: SignatureData; // 審核簽名
  departmentManagerSignature: SignatureData; // 申請主管簽名
  applicantSignature: SignatureData; // 申請人簽名
  remarks?: string;
  createdAt: Date;
  // JSA 表單新增欄位
  workName?: string; // 作業名稱
  contractor?: string; // 承攬商
  maker?: string; // 製表人
  makerDate?: string; // 製表日期
  step?: string; // 步驟/節點
  highRiskProject?: string; // 高風險項目
  possibleHazardFactor?: string; // 可能危害因素(危害類型)
  protectiveEquipment?: string; // 防護具
  safetyProtectionMeasures?: string; // 安全防護措施
  emergencyMeasures?: string; // 緊急/搶救措施
  workDate?: string; // 施作日期
  workPersonCount?: number; // 施作人數
  // 人才選擇欄位
  selectedWorkers?: string[]; // 已選擇的人才ID列表
}

// 簽名類型
export enum SignatureType {
  Approval = 'approval',
  Review = 'review',
  DepartmentManager = 'departmentManager',
  Applicant = 'applicant',
}

@Component({
  selector: 'app-site-permit-form',
  templateUrl: './site-permit-form.component.html',
  styleUrls: ['./site-permit-form.component.scss'],
  standalone: true,
  imports: [CommonModule, FormsModule, SiteFormHeaderComponent],
})
export class SitePermitFormComponent implements OnInit {
  siteId: string = '';
  site = computed(() => this.currentSiteService.currentSite());
  today = new Date();
  isViewMode: boolean = false; // 是否處於查看模式
  isGeneratingPdf: boolean = false; // PDF生成狀態
  isDeleting: boolean = false; // 刪除狀態

  // 檢查使用者是否有刪除權限（管理員/管理人員/環安主管/環安工程師/建立者）
  canDelete = computed(() => {
    const user = this.authService.user();
    if (!user) return false;

    // 全域管理員或管理人員
    if (user.role === 'admin' || user.role === 'manager') {
      return true;
    }

    // 檢查是否為建立者
    if (this.permitData.createdBy && user.name === this.permitData.createdBy) {
      return true;
    }

    // 檢查工地特定角色（環安主管、環安工程師）
    const currentSite = this.currentSiteService.currentSite();
    if (!currentSite || !user.belongSites) return false;

    const userSiteRole = user.belongSites.find(site => site.siteId === currentSite._id)?.role;
    return userSiteRole === 'safetyManager' || userSiteRole === 'safetyEngineer';
  });

  // 臨時屬性用於分離日期和時間輸入
  workStartDate: string = '';
  workStartTimeOnly: string = '';
  workEndDate: string = '';
  workEndTimeOnly: string = '';

  // 時間選項和下拉選單控制
  showTimeDropdown: string | false = false;
  timeOptions: string[] = [];
  filteredTimeOptions: string[] = [];

  // 定義表單模型
  permitData: SitePermitForm = {
    siteId: '',
    formType: 'sitePermit',
    applyDate: dayjs().format('YYYY-MM-DD'),
    applicant: '',
    applyType: '初次申請',
    workContent: '',
    workLocation: '',
    workArea: '',
    workStartTime: '',
    workEndTime: '',
    supervisor: '',
    supervisorContact: '',
    supervisorPhone: '',
    projectNo: '',
    projectName: '',
    selectedCategories: [] as string[],
    otherWorkContent: '',
    otherWork: false,
    status: 'draft',
    approvalSignature: {
      name: '',
      signature: '',
      signedAt: new Date()
    },  
    reviewSignature: {
      name: '',
      signature: '',
      signedAt: new Date()
    },
    departmentManagerSignature: {
      name: '',
      signature: '',
      signedAt: new Date()
    },
    applicantSignature: {
      name: '',
      signature: '',
      signedAt: new Date()
    },
    createdAt: new Date(),
    createdBy: '',
    // JSA 表單新增欄位預設值
    workName: '',
    contractor: '',
    maker: '',
    makerDate: dayjs().format('YYYY-MM-DD'),
    step: '',
    highRiskProject: '',
    possibleHazardFactor: '',
    protectiveEquipment: '',
    safetyProtectionMeasures: '',
    emergencyMeasures: '',
    workDate: dayjs().format('YYYY-MM-DD'),
    workPersonCount: 0,
    selectedWorkers: [], // 初始化人才選擇列表
  };

  // 簽名存儲
  approvalSignature: string | null = null;
  reviewSignature: string | null = null;
  departmentManagerSignature: string | null = null;
  applicantSignature: string | null = null;

  // 公開 SignatureType 枚舉給模板
  SignatureType = SignatureType;

  // 在類別定義中新增一個屬性
  workCategories: string[] = [];

  // 人才選擇相關變數
  siteWorkers: Worker[] = []; // 所有工地人才
  searchQuery: string = ''; // 搜尋關鍵字
  selectedCertificationType: string = ''; // 選擇的認證類型
  filteredWorkers: Worker[] = []; // 過濾後的人才列表
  selectedWorkerObjects: Worker[] = []; // 已選擇的人才物件（用於顯示）

  // 取得所有認證類型選項
  certificationTypes = CertificationTypeManager.getAllCertificationInfo();

  // 分頁相關變數
  currentTab: number = 1; // 當前分頁（1: 基本資料, 2: 參與人員, 3: JSA表單）

  constructor(
    private mongodbService: MongodbService,
    private route: ActivatedRoute,
    private router: Router,
    private signatureDialog: SignatureDialogService,
    private currentSiteService: CurrentSiteService,
    private authService: AuthService,

    private docxTemplateService: DocxTemplateService
  ) {}

  // 將 datetime-local 格式分離為日期和時間
  private splitDateTime(dateTimeString: string): { date: string; time: string } {
    if (!dateTimeString) return { date: '', time: '' };

    const dateTime = new Date(dateTimeString);
    if (isNaN(dateTime.getTime())) return { date: '', time: '' };
    
    const date = dayjs(dateTime).format('YYYY-MM-DD'); // YYYY-MM-DD
    const time = dayjs(dateTime).format('HH:mm'); // HH:MM
    
    return { date, time };
  }

  // 將日期和時間組合為 datetime-local 格式
  private combineDateTime(date: string, time: string): string {
    if (!date || !time) return '';
    return `${date}T${time}`;
  }

  // 載入資料時分離日期和時間
  private loadDateTimeFields(): void {
    if (this.permitData.workStartTime) {
      const startDateTime = this.splitDateTime(this.permitData.workStartTime);
      this.workStartDate = startDateTime.date;
      this.workStartTimeOnly = startDateTime.time;
    }
    
    if (this.permitData.workEndTime) {
      const endDateTime = this.splitDateTime(this.permitData.workEndTime);
      this.workEndDate = endDateTime.date;
      this.workEndTimeOnly = endDateTime.time;
    }
  }

  // 儲存時組合日期和時間
  private saveDateTimeFields(): void {
    this.permitData.workStartTime = this.combineDateTime(this.workStartDate, this.workStartTimeOnly);
    this.permitData.workEndTime = this.combineDateTime(this.workEndDate, this.workEndTimeOnly);
  }

  async ngOnInit(): Promise<void> {
    // 生成時間選項 (06:00 到 20:00，每30分鐘)
    this.generateTimeOptions();

    // 在這裡更新依賴 currentSiteService 的屬性
    this.permitData.siteId = this.site()?._id || '';
    this.permitData.projectNo = this.site()?.projectNo || '';
    this.permitData.projectName = this.site()?.projectName || '';

    // 從路由參數獲取工地ID和表單ID
    this.route.paramMap.subscribe(async (params) => {
      const id = params.get('id');
      const formId = params.get('formId');

      if (id) {
        this.siteId = id;
        await this.currentSiteService.setCurrentSiteById(id);
        this.permitData.siteId = id;

        // 標準作業類別
        const standardCategories = [
          '動火作業',
          '高架作業',
          '局限空間作業',
          '電力作業',
          '吊籠作業',
          '起重吊掛作業',
          '施工架組裝作業',
          '管線拆離作業',
          '開口作業',
          '化學作業',
        ];

        // 結合標準類別和工地特定類別
        this.workCategories = [
          ...standardCategories,
          ...(this.site()?.constructionTypes || []),
        ];

        // 去除重複項目
        this.workCategories = [...new Set(this.workCategories)];

        // 載入工地人才列表
        await this.loadSiteWorkers(id);

        // 處理表單
        if (formId) {
          await this.loadFormDetails(formId);
        }
      }
    });
  }

  // 載入工地人才列表
  async loadSiteWorkers(siteId: string): Promise<void> {
    try {
      this.siteWorkers = await this.mongodbService.getArray('worker', {
        belongSites: { $elemMatch: { siteId: siteId } },
      });
      this.filteredWorkers = [...this.siteWorkers]; // 初始顯示所有人才
    } catch (error) {
      console.error('載入工地人才失敗:', error);
    }
  }

  // 搜尋人才
  onSearchWorkers(): void {
    const query = this.searchQuery.toLowerCase().trim();
    const certType = this.selectedCertificationType;

    // 如果沒有任何過濾條件，顯示所有人才
    if (!query && !certType) {
      this.filteredWorkers = [...this.siteWorkers];
      return;
    }

    this.filteredWorkers = this.siteWorkers.filter(worker => {
      // 搜尋基本資料
      const basicMatch = !query || (
        worker.name.toLowerCase().includes(query) ||
        (worker.idno && worker.idno.toLowerCase().includes(query)) ||
        (worker.tel && worker.tel.includes(query)) ||
        (worker.contractingCompanyName && worker.contractingCompanyName.toLowerCase().includes(query))
      );

      // 認證類型過濾
      const certificationMatch = !certType || (
        worker.certifications?.some(cert => {
          const certCode = CertificationTypeManager.getCode(cert.type);
          return certCode === certType;
        }) || false
      );

      return basicMatch && certificationMatch;
    });
  }

  // 清除所有過濾條件
  clearFilters(): void {
    this.searchQuery = '';
    this.selectedCertificationType = '';
    this.onSearchWorkers();
  }

  // 取得人才的認證資訊字串（用於顯示）
  getWorkerCertifications(worker: Worker): string {
    if (!worker.certifications || worker.certifications.length === 0) {
      return '-';
    }

    return worker.certifications
      .map(cert => CertificationTypeManager.getName(cert.type))
      .join('、');
  }

  // 計算擁有特定認證類型的人才數量
  getCertificationCount(certCode: string): number {
    return this.siteWorkers.filter(worker =>
      worker.certifications?.some(cert =>
        CertificationTypeManager.getCode(cert.type) === certCode
      )
    ).length;
  }

  // 檢查人才是否已被選擇
  isWorkerSelected(workerId: string): boolean {
    return this.permitData.selectedWorkers?.includes(workerId) || false;
  }

  // 切換人才選擇狀態
  toggleWorkerSelection(worker: Worker): void {
    if (!this.permitData.selectedWorkers) {
      this.permitData.selectedWorkers = [];
    }

    const index = this.permitData.selectedWorkers.indexOf(worker._id!);
    if (index > -1) {
      // 已選擇，移除
      this.permitData.selectedWorkers.splice(index, 1);
      const objIndex = this.selectedWorkerObjects.findIndex(w => w._id === worker._id);
      if (objIndex > -1) {
        this.selectedWorkerObjects.splice(objIndex, 1);
      }
    } else {
      // 未選擇，添加
      this.permitData.selectedWorkers.push(worker._id!);
      this.selectedWorkerObjects.push(worker);
    }
  }

  // 切換分頁
  switchTab(tabNumber: number): void {
    this.currentTab = tabNumber;
  }

  // 移除已選擇的人才
  removeSelectedWorker(workerId: string): void {
    if (!this.permitData.selectedWorkers) return;

    const index = this.permitData.selectedWorkers.indexOf(workerId);
    if (index > -1) {
      this.permitData.selectedWorkers.splice(index, 1);
    }

    const objIndex = this.selectedWorkerObjects.findIndex(w => w._id === workerId);
    if (objIndex > -1) {
      this.selectedWorkerObjects.splice(objIndex, 1);
    }
  }

  // 載入表單詳情
  async loadFormDetails(formId: string): Promise<void> {
    try {
      const formData = await this.mongodbService.getById('siteForm', formId);
      if (formData) {
        // 將表單數據填充到permitData中
        this.permitData = {
          ...this.permitData,
          ...formData,
          // 確保特定屬性的正確匹配
          applyDate: formData.applyDate || this.permitData.applyDate,
          workContent: formData.workContent || '',
          workLocation: formData.workLocation || '',
          workArea: formData.workArea || '',
          workStartTime: formData.workStartTime || '',
          workEndTime: formData.workEndTime || '',
          supervisor: formData.supervisor || '',
          supervisorPhone: formData.supervisorPhone || '',
          selectedCategories: formData.selectedCategories || [],
          otherWork: formData.otherWork || false,
          otherWorkContent: formData.otherWorkContent || '',
          approvalSignature: formData.approvalSignature || '',
          reviewSignature: formData.reviewSignature || '',
          departmentManagerSignature: formData.departmentManagerSignature || '',
          applicantSignature: formData.applicantSignature || '',
          // JSA 表單新增欄位
          workName: formData.workName || '',
          contractor: formData.contractor || '',
          maker: formData.maker || '',
          makerDate: formData.makerDate || this.permitData.makerDate,
          step: formData.step || '',
          highRiskProject: formData.highRiskProject || '',
          possibleHazardFactor: formData.possibleHazardFactor || '',
          protectiveEquipment: formData.protectiveEquipment || '',
          safetyProtectionMeasures: formData.safetyProtectionMeasures || '',
          emergencyMeasures: formData.emergencyMeasures || '',
          workDate: formData.workDate || this.permitData.workDate,
          workPersonCount: formData.workPersonCount || 0,
          selectedWorkers: formData.selectedWorkers || [],
        };

        // 載入已選擇的人才物件
        if (formData.selectedWorkers && formData.selectedWorkers.length > 0) {
          this.selectedWorkerObjects = this.siteWorkers.filter(worker =>
            formData.selectedWorkers.includes(worker._id)
          );
        }

        // 如果有簽名數據，顯示簽名
        if (formData.approvalSignature)
          this.approvalSignature = formData.approvalSignature.signature;
        if (formData.reviewSignature)
          this.reviewSignature = formData.reviewSignature.signature;
        if (formData.departmentManagerSignature)
          this.departmentManagerSignature = formData.departmentManagerSignature.signature;
        if (formData.applicantSignature)
          this.applicantSignature = formData.applicantSignature.signature;

        this.isViewMode = true; // 設置為查看模式
        
        // 載入資料後分離日期和時間
        this.loadDateTimeFields();
      }
    } catch (error) {
      console.error('載入表單數據失敗', error);
    }
  }

  onCategoryChange(category: string, event: Event): void {
    const isChecked = (event.target as HTMLInputElement).checked;

    if (isChecked) {
      // 添加類別
      if (!this.permitData.selectedCategories.includes(category)) {
        this.permitData.selectedCategories.push(category);
      }
    } else {
      // 移除類別
      this.permitData.selectedCategories =
        this.permitData.selectedCategories.filter(
          (c: string) => c !== category
        );
    }
  }

  // 打開簽名對話框
  async openSignatureDialog(type: SignatureType): Promise<void> {
    try {
      const signature = await this.signatureDialog.open();
      const signData: SignatureData = {
        name: this.authService.user()?.name || '',
        signature: signature || '', // 確保 signature 是字串
        signedAt: new Date()
      };
      if (signature) {
        // 更新相應的簽名
        switch (type) {
          case SignatureType.Approval:
            this.approvalSignature = signature;
            this.permitData.approvalSignature = signData;
            break;
          case SignatureType.Review:
            this.reviewSignature = signature;
            this.permitData.reviewSignature = signData;
            break;
          case SignatureType.DepartmentManager:
            this.departmentManagerSignature = signature;
            this.permitData.departmentManagerSignature = signData;
            break;
          case SignatureType.Applicant:
            this.applicantSignature = signature;
            this.permitData.applicantSignature = signData;
            break;
        }
      }
    } catch (error) {
      console.error('簽名對話框操作失敗', error);
    }
  }

  async savePermit(): Promise<void> {
    // 儲存前組合日期和時間
    this.saveDateTimeFields();
    
    // 檢查必填欄位
    const requiredFields = {
      日期: this.permitData.applyDate,
      工作內容: this.permitData.workContent,
      施工廠區: this.permitData.workLocation,
      施工區域: this.permitData.workArea,
      開始時間: this.permitData.workStartTime,
      結束時間: this.permitData.workEndTime,
    };

    const emptyFields = Object.entries(requiredFields)
      .filter(([_, value]) => !value || (typeof value === 'string' && value.trim() === ''))
      .map(([key, _]) => key);

    if (emptyFields.length > 0) {
      alert(`請填寫以下必填欄位：\n${emptyFields.join('\n')}`);
      return;
    }

    const permitFormData = {
      ...this.permitData,
      status: 'draft', // 草稿狀態
      createdAt: new Date(),
      createdBy: this.authService.user()?.name || '',
    };

    try {
      if (this.permitData._id) {
        const response = await this.mongodbService.put(
          'siteForm',
          this.permitData._id,
          permitFormData
        );
      } else {
        const response = await this.mongodbService.post(
          'siteForm',
          permitFormData
        );
      }
      // 儲存成功，導航回工地表單列表
      this.router.navigate(['/site', this.siteId, 'forms']);
    } catch (error) {
      console.error('儲存工地許可單失敗', error);
    }
  }

  cancel(): void {
    // 返回工地詳情頁面
    this.router.navigate(['/site', this.siteId, 'forms']);
  }

  // 刪除工地許可單
  async deletePermit(): Promise<void> {
    if (!this.permitData._id) {
      alert('無法刪除：表單ID不存在');
      return;
    }

    // 確認對話框
    const confirmed = confirm(
      `確定要刪除此工地許可單嗎？\n\n` +
      `工作內容：${this.permitData.workContent || '無'}\n` +
      `申請日期：${this.permitData.applyDate || '無'}\n\n` +
      `此操作無法復原！`
    );

    if (!confirmed) {
      return;
    }

    this.isDeleting = true;
    try {
      await this.mongodbService.delete('siteForm', this.permitData._id);
      alert('工地許可單已成功刪除');
      // 刪除成功後返回表單列表
      this.router.navigate(['/site', this.siteId, 'forms']);
    } catch (error) {
      console.error('刪除工地許可單失敗', error);
      alert('刪除失敗，請稍後再試');
    } finally {
      this.isDeleting = false;
    }
  }

  // 生成時間選項 (06:00 到 20:00，每30分鐘)
  private generateTimeOptions(): void {
    this.timeOptions = [];
    for (let hour = 6; hour <= 20; hour++) {
      // 整點
      this.timeOptions.push(`${hour.toString().padStart(2, '0')}:00`);
      // 半點 (除了最後一個小時)
      if (hour < 20) {
        this.timeOptions.push(`${hour.toString().padStart(2, '0')}:30`);
      }
    }
  }

  // 當輸入框獲得焦點時
  onTimeInputFocus(type: 'start' | 'end'): void {
    this.showTimeDropdown = type;
    // 顯示所有時間選項
    this.filteredTimeOptions = [...this.timeOptions];
  }

  // 當輸入框失去焦點時
  onTimeInputBlur(type: 'start' | 'end'): void {
    // 延遲關閉下拉選單，以便點擊事件可以觸發
    setTimeout(() => {
      this.showTimeDropdown = false;
      this.formatTimeInput(type);
    }, 200);
  }

  // 當輸入框內容改變時
  onTimeInputChange(type: 'start' | 'end', event: Event): void {
    const inputValue = (event.target as HTMLInputElement).value;

    if (!inputValue) {
      // 如果輸入為空，顯示所有選項
      this.filteredTimeOptions = [...this.timeOptions];
    } else {
      // 過濾時間選項（支持部分匹配）
      this.filteredTimeOptions = this.timeOptions.filter(time =>
        time.includes(inputValue.replace(/\D/g, '').substring(0, 4))
      );

      // 如果沒有匹配項，顯示所有選項
      if (this.filteredTimeOptions.length === 0) {
        this.filteredTimeOptions = [...this.timeOptions];
      }
    }
  }

  // 選擇時間選項
  selectTime(type: 'start' | 'end', time: string): void {
    if (type === 'start') {
      this.workStartTimeOnly = time;
    } else {
      this.workEndTimeOnly = time;
    }
    this.showTimeDropdown = false;
  }

  // 格式化時間輸入 (支持直接輸入數字，如 2115 -> 21:15)
  formatTimeInput(type: 'start' | 'end'): void {
    const timeValue = type === 'start' ? this.workStartTimeOnly : this.workEndTimeOnly;

    if (!timeValue) return;

    // 移除所有非數字字符
    const digitsOnly = timeValue.replace(/\D/g, '');

    if (digitsOnly.length === 0) return;

    let formattedTime = '';

    if (digitsOnly.length <= 2) {
      // 只有小時 (例如: 8 -> 08:00, 21 -> 21:00)
      const hour = parseInt(digitsOnly, 10);
      if (hour >= 0 && hour <= 23) {
        formattedTime = `${hour.toString().padStart(2, '0')}:00`;
      }
    } else if (digitsOnly.length === 3) {
      // 3位數字 (例如: 830 -> 08:30)
      const hour = parseInt(digitsOnly.substring(0, 1), 10);
      const minute = parseInt(digitsOnly.substring(1, 3), 10);
      if (hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59) {
        formattedTime = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
      }
    } else if (digitsOnly.length >= 4) {
      // 4位數字或更多 (例如: 2115 -> 21:15, 08301 -> 08:30)
      const hour = parseInt(digitsOnly.substring(0, 2), 10);
      const minute = parseInt(digitsOnly.substring(2, 4), 10);
      if (hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59) {
        formattedTime = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
      }
    }

    // 如果格式化成功，更新值
    if (formattedTime) {
      if (type === 'start') {
        this.workStartTimeOnly = formattedTime;
      } else {
        this.workEndTimeOnly = formattedTime;
      }
    } else {
      // 格式不正確，清空輸入或保持原值
      // 這裡選擇保持原值，讓用戶自己修正
    }
  }


  // DocX模板生成方法
  async generateDocx(): Promise<void> {
    if (!this.permitData._id) {
      alert('無法生成DOCX：表單ID不存在');
      return;
    }

    this.isGeneratingPdf = true; // 重用PDF生成狀態
    try {
      await this.docxTemplateService.generateWorkPermitDocx(this.permitData._id);
      
    } catch (error) {
      console.error('生成DOCX失敗:', error);
      const errorMessage = error instanceof Error ? error.message : '未知錯誤';
      alert(`DOCX生成失敗: ${errorMessage}`);
    } finally {
      this.isGeneratingPdf = false;
    }
  }
}
