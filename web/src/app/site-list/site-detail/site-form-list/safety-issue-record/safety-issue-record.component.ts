import { Component, computed, OnInit } from '@angular/core';

import { FormsModule } from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';
import { MongodbService } from '../../../../services/mongodb.service';
import { SignatureDialogService } from '../../../../shared/signature-dialog.service';
import { CurrentSiteService } from '../../../../services/current-site.service';
import { SiteForm } from '../../../../model/siteForm.model';
import { AuthService } from '../../../../services/auth.service';

interface IssueRecord extends SiteForm {
  formType: 'safetyIssueRecord';
  recordNo: string; // 編號(單位-工號-年/月/流水號)
  establishUnit: string; // 開立單位
  establishPerson: string; // 開立人員
  establishDate: string; // 開立日期
  issueDate: string; // 缺失日期
  factoryArea: string; // 發生廠區/地點
  responsibleUnit: string; // 缺失責任單位（選項：MIC或供應商）
  issueDescription: string; // 缺失說明及照片黏貼處
  remedyMeasures: string[]; // 缺失處置
  improvementDeadline: string; // 改善完成時間
  deductionCode: string; // 缺失代碼
  recordPoints: string; // 記點點數
  reviewDate: string; // 複查日期
  reviewer: string; // 複查者
  reviewResult: string; // 追蹤複查結果（選項：已完成改正、未完成改正(要求改善，再次開立工安缺失紀錄表)）
  supervisorSignature: string; // 監工簽名
  workerSignature: string; // 作業人員簽名
  status: string; // 狀態
}

enum SignatureType {
  Supervisor = 'supervisor',
  Worker = 'worker'
}

enum ResponsibleUnit {
  MIC = 'MIC',
  Supplier = 'supplier'
}

enum ReviewResult {
  Completed = 'completed',
  Incomplete = 'incomplete'
}

enum RemedyMeasure {
  ImmediateCorrection = 'immediateCorrection',
  ImprovementWithDeadline = 'improvementWithDeadline',
  CorrectivePreventionReport = 'correctivePreventionReport'
}

@Component({
  selector: 'app-safety-issue-record',
  templateUrl: './safety-issue-record.component.html',
  styleUrls: ['./safety-issue-record.component.scss'],
  imports: [FormsModule],
  standalone: true
})
export class SafetyIssueRecordComponent implements OnInit {
  siteId: string = '';
  formId: string = '';
  site = computed(() => this.currentSiteService.currentSite());
  
  supervisorSignature: string = '';
  workerSignature: string = '';
  
  SignatureType = SignatureType;
  ResponsibleUnit = ResponsibleUnit;
  ReviewResult = ReviewResult;
  RemedyMeasure = RemedyMeasure;
  
  // 處置措施選項
  remedyMeasureOptions = [
    { value: RemedyMeasure.ImmediateCorrection, label: '1. □立即完成改正' },
    { value: RemedyMeasure.ImprovementWithDeadline, label: '1. □限期改善完成時間   年   月   日' },
    { value: RemedyMeasure.CorrectivePreventionReport, label: '2. □須提出矯正預防措施報告' }
  ];

  // 追蹤複查結果選項
  reviewResultOptions = [
    { value: ReviewResult.Completed, label: '□已完成改正' },
    { value: ReviewResult.Incomplete, label: '□未完成改正(要求改善，再次開立工安缺失紀錄表)' }
  ];
  
  // 缺失責任單位選項
  responsibleUnitOptions = [
    { value: ResponsibleUnit.MIC, label: '□MIC' },
    { value: ResponsibleUnit.Supplier, label: '□供應商' }
  ];
  
  issueRecord: IssueRecord = {
    siteId: '',
    formType: 'safetyIssueRecord',
    applyDate: new Date().toISOString().slice(0, 10),
    recordNo: '', 
    establishUnit: '',
    establishPerson: '',
    establishDate: new Date().toISOString().slice(0, 10),
    issueDate: new Date().toISOString().slice(0, 10),
    factoryArea: '',
    responsibleUnit: '',
    issueDescription: '',
    remedyMeasures: [], 
    improvementDeadline: '',
    deductionCode: '',
    recordPoints: '',
    reviewDate: '',
    reviewer: '',
    reviewResult: '',
    supervisorSignature: '',
    workerSignature: '',
    status: 'draft',
    createdAt: new Date(),
    createdBy: '',
  };

  constructor(
    private router: Router,
    private route: ActivatedRoute,
    private mongodbService: MongodbService,
    private signatureDialog: SignatureDialogService,
    private currentSiteService: CurrentSiteService,
    private authService: AuthService
  ) { }

  ngOnInit(): void {
    // 從路由獲取工地ID
    this.route.paramMap.subscribe(params => {
      const id = params.get('id');
      if (id) {
        this.siteId = id;
        this.issueRecord.siteId = id;
        
        // 檢查是否有表單ID（編輯模式）
        const formId = params.get('formId');
        if (formId) {
          this.formId = formId;
          this.loadIssueRecordData(formId);
        } else {
          // 生成編號
          this.generateRecordNumber();
        }
      }
    });
  }

  // 生成記錄編號
  async generateRecordNumber(): Promise<void> {
    // 編號格式：單位-工號-年/月/流水號
    const now = new Date();
    const year = now.getFullYear();
    const month = (now.getMonth() + 1).toString().padStart(2, '0');
            
    // 生成流水號（可以根據實際情況調整）
    // 這裡假設每個月從01開始遞增
    try {
      // 獲取本月所有缺失記錄單
      const records = await this.mongodbService.get('siteForm', {
        formType: 'safetyIssueRecord',
        siteId: this.siteId
      });
      
      // 找出本月最大的流水號
      let maxSerial = 0;
      const thisMonthRecords = records.filter((record: any) => {
        if (record.recordNo) {
          const parts = record.recordNo.split('/');
          if (parts.length >= 3) {
            const recordYear = parts[parts.length - 3];
            const recordMonth = parts[parts.length - 2];
            return recordYear === year.toString() && recordMonth === month;
          }
        }
        return false;
      });
      
      thisMonthRecords.forEach((record: any) => {
        const parts = record.recordNo.split('/');
        if (parts.length >= 3) {
          const serial = parseInt(parts[parts.length - 1]);
          if (!isNaN(serial) && serial > maxSerial) {
            maxSerial = serial;
          }
        }
      });
      
      // 流水號遞增
      const serialNo = (maxSerial + 1).toString().padStart(2, '0');
      
      // 組合成完整編號
      this.issueRecord.recordNo = `${this.issueRecord.establishUnit || 'MIC'}-${this.site()?.projectNo || 'XXXX'}-${year}/${month}/${serialNo}`;
    } catch (error) {
      console.error('生成編號失敗', error);
      // 如果出錯，使用一個臨時編號
      this.issueRecord.recordNo = `${this.issueRecord.establishUnit || 'MIC'}-${this.site()?.projectNo || 'XXXX'}-${year}/${month}/01`;
    }
  }

 

  // 加載缺失記錄數據（編輯模式）
  async loadIssueRecordData(formId: string): Promise<void> {
    try {
      const data = await this.mongodbService.getById('siteForm', formId);
      if (data && data.formType === 'safetyIssueRecord') {
        this.issueRecord = data;
        
        // 更新簽名顯示
        this.supervisorSignature = data.supervisorSignature || '';
        this.workerSignature = data.workerSignature || '';
      }
    } catch (error) {
      console.error('加載缺失記錄數據失敗', error);
    }
  }

  // 打開簽名對話框
  async openSignatureDialog(type: SignatureType): Promise<void> {
    try {
      const signature = await this.signatureDialog.open();
      if (signature) {
        // 更新相應的簽名
        switch (type) {
          case SignatureType.Supervisor:
            this.supervisorSignature = signature;
            this.issueRecord.supervisorSignature = signature;
            break;
          case SignatureType.Worker:
            this.workerSignature = signature;
            this.issueRecord.workerSignature = signature;
            break;
        }
      }
    } catch (error) {
      console.error('簽名對話框操作失敗', error);
    }
  }

  // 保存缺失記錄
  async saveIssueRecord(): Promise<void> {
    try {
      const formData = {
        ...this.issueRecord,
      };

      let result;
      if (this.formId) {
        formData.updatedAt = new Date();
        formData.updatedBy = this.authService.user()?.name || '';
        // 更新模式
        result = await this.mongodbService.put('siteForm', this.formId, formData);
      } else {
        // 新建模式
        const newFormData = {
          ...formData,
          createdAt: new Date(),
          createdBy: this.authService.user()?.name || '',
        };
        result = await this.mongodbService.post('siteForm', newFormData);
      }

      if (result) {
        alert('工安缺失紀錄表保存成功');
        this.router.navigate(['/site', this.siteId, 'forms']);
      }
    } catch (error) {
      console.error('保存缺失記錄失敗', error);
      alert('保存失敗，請稍後重試');
    }
  }

  // 處理複選框變更事件
  toggleRemedyMeasure(value: string): void {
    if (!this.issueRecord.remedyMeasures) {
      this.issueRecord.remedyMeasures = [];
    }

    const index = this.issueRecord.remedyMeasures.indexOf(value);
    if (index === -1) {
      // 如果不存在，添加到數組
      this.issueRecord.remedyMeasures.push(value);
    } else {
      // 如果已存在，從數組中移除
      this.issueRecord.remedyMeasures.splice(index, 1);
    }
  }

  cancel(): void {
    this.router.navigate(['/site', this.siteId, 'forms']);
  }
} 