import { Component, computed, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SiteFormHeaderComponent } from '../site-form-header/site-form-header.component';
import { ActivatedRoute, Router } from '@angular/router';
import { MongodbService } from '../../../../services/mongodb.service';
import { SignatureDialogService } from '../../../../shared/signature-dialog.service';

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

        // 處理表單
        if (formId) {
          await this.loadFormDetails(formId);
        }
      }
    });
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
        };

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
