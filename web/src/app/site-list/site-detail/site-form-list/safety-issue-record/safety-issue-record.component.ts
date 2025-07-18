import { Component, computed, OnInit, AfterViewInit } from '@angular/core';

import { FormsModule } from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';
import { MongodbService } from '../../../../services/mongodb.service';
import { SignatureDialogService } from '../../../../shared/signature-dialog.service';
import { CurrentSiteService } from '../../../../services/current-site.service';
import { SiteForm } from '../../../../model/siteForm.model';
import { AuthService } from '../../../../services/auth.service';
import { GridFSService } from '../../../../services/gridfs.service';
import { PhotoService } from '../../../../services/photo.service';
import { DocxTemplateService } from '../../../../services/docx-template.service';
import { signal } from '@angular/core';

// 導入 Bootstrap Modal 相關類型
declare const bootstrap: {
  Modal: new (element: HTMLElement, options?: any) => {
    show: () => void;
    hide: () => void;
    dispose: () => void;
  };
};

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
  issuePhotos?: IssuePhoto[]; // 修改：工安缺失照片列表，包含檔名和改善狀態
}

// 新增：缺失照片介面
interface IssuePhoto {
  filename: string;
  improvementStatus: 'before' | 'after'; // 改善前或改善後
  title: string;
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
export class SafetyIssueRecordComponent implements OnInit, AfterViewInit {
  siteId: string = '';
  formId: string = '';
  site = computed(() => this.currentSiteService.currentSite());
  currentUser = computed(() => this.authService.user());
  
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
    issuePhotos: [], // 初始化為空的IssuePhoto數組
  };

  // 新增：照片相關屬性
  uploadedPhotos = signal<{filename: string, url: string, title: string, improvementStatus: 'before' | 'after'}[]>([]);
  isUploadingPhoto = signal<boolean>(false);
  uploadProgress = signal<number>(0);

  // 改善狀態選項
  improvementStatusOptions = [
    { value: 'before', label: '改善前' },
    { value: 'after', label: '改善後' }
  ];

  // 照片查看 Modal 相關
  showPhotoModal = signal<boolean>(false);
  currentPhotoIndex = signal<number>(-1);
  editingPhotoTitle = signal<string>('');
  photoModal: any;

  // Word 文件生成狀態
  isGeneratingDocument = signal<boolean>(false);

  constructor(
    private router: Router,
    private route: ActivatedRoute,
    private mongodbService: MongodbService,
    private signatureDialog: SignatureDialogService,
    private currentSiteService: CurrentSiteService,
    private authService: AuthService,
    private gridFSService: GridFSService,
    public photoService: PhotoService,
    private docxTemplateService: DocxTemplateService
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
        
        // 載入相關照片
        await this.loadIssuePhotos();
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

  // 新增：照片上傳相關方法
  onPhotoSelected(event: any): void {
    const files = event.target.files;
    if (files && files.length > 0) {
      this.handlePhotoFiles(files);
    }
    // 清空input以允許重複選擇同一檔案
    event.target.value = '';
  }

  async handlePhotoFiles(files: FileList): Promise<void> {
    this.isUploadingPhoto.set(true);
    this.uploadProgress.set(0);
    
    const totalFiles = files.length;
    let uploadedCount = 0;
    
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (file.type.startsWith('image/')) {
        try {
          await this.uploadPhoto(file);
          uploadedCount++;
          this.uploadProgress.set(Math.round((uploadedCount / totalFiles) * 100));
        } catch (error) {
          console.error('上傳照片時發生錯誤:', error);
        }
      }
    }
    
    this.isUploadingPhoto.set(false);
    this.uploadProgress.set(0);
  }

  async uploadPhoto(file: File): Promise<void> {
    const currentSite = this.site();
    if (!currentSite) return;
    
    try {
      // 使用 PhotoService 的新方法上傳帶有系統標籤的照片
      const result = await new Promise<any>((resolve, reject) => {
        this.photoService.uploadPhotoWithSystemTag(
          file, 
          '工地缺失', 
          currentSite._id!, 
          currentSite.projectNo
        ).subscribe({
          next: (result) => resolve(result),
          error: (error) => reject(error)
        });
      });
      
      if (result && result.filename) {
        // 更新本地照片列表
        const photoData: {filename: string, url: string, title: string, improvementStatus: 'before' | 'after'} = {
          filename: result.filename,
          url: `/api/gridfs/${result.filename}`,
          title: `工安缺失照片 - ${file.name}`,
          improvementStatus: 'before' // 上傳時默認為改善前
        };
        
        const currentPhotos = this.uploadedPhotos();
        this.uploadedPhotos.set([...currentPhotos, photoData]);
        
        // 更新 issueRecord 的照片列表
        if (!this.issueRecord.issuePhotos) {
          this.issueRecord.issuePhotos = [];
        }
        this.issueRecord.issuePhotos.push({ filename: result.filename, improvementStatus: 'before', title: `工安缺失照片 - ${file.name}` });
        
        // 通知照片服務統計更新
        this.photoService.notifyPhotoStatsUpdated(currentSite._id!);
      }
    } catch (error) {
      console.error('照片上傳失敗:', error);
      alert('照片上傳失敗，請稍後重試');
    }
  }

  deletePhoto(index: number): void {
    const photos = this.uploadedPhotos();
    const photoToDelete = photos[index];
    
    if (confirm('確定要刪除這張照片嗎？')) {
      this.deletePhotoByFilename(photoToDelete.filename, index);
      // 如果在 modal 中刪除照片，關閉 modal
      if (this.showPhotoModal()) {
        this.closePhotoModal();
      }
    }
  }

  async deletePhotoByFilename(filename: string, index: number): Promise<void> {
    try {
      // 使用 GridFSService 刪除檔案
      await this.gridFSService.deleteFile(filename);
      
      // 更新本地照片列表
      const currentPhotos = this.uploadedPhotos();
      currentPhotos.splice(index, 1);
      this.uploadedPhotos.set([...currentPhotos]);
      
      // 更新 issueRecord 的照片列表
      if (this.issueRecord.issuePhotos) {
        const photoIndex = this.issueRecord.issuePhotos.findIndex(photo => photo.filename === filename);
        if (photoIndex > -1) {
          this.issueRecord.issuePhotos.splice(photoIndex, 1);
        }
      }
      
      // 通知照片服務統計更新
      const currentSite = this.site();
      if (currentSite && currentSite._id) {
        this.photoService.notifyPhotoStatsUpdated(currentSite._id);
      }
    } catch (error) {
      console.error('刪除照片失敗:', error);
      alert('刪除照片失敗，請稍後重試');
    }
  }

  // 當載入已存在的記錄時，載入相關照片
  async loadIssuePhotos(): Promise<void> {
    if (this.issueRecord.issuePhotos && this.issueRecord.issuePhotos.length > 0) {
      const photoData: {filename: string, url: string, title: string, improvementStatus: 'before' | 'after'}[] = 
        this.issueRecord.issuePhotos.map(photo => ({
          filename: photo.filename,
          url: `/api/gridfs/${photo.filename}`,
          title: photo.title,
          improvementStatus: photo.improvementStatus as 'before' | 'after'
        }));
      this.uploadedPhotos.set(photoData);
    }
  }

  // 更新照片改善狀態
  updatePhotoImprovementStatus(index: number, status: 'before' | 'after'): void {
    const photos = this.uploadedPhotos();
    if (photos[index]) {
      photos[index].improvementStatus = status;
      this.uploadedPhotos.set([...photos]);
      
      // 同步更新 issueRecord 中的照片狀態
      if (this.issueRecord.issuePhotos && this.issueRecord.issuePhotos[index]) {
        this.issueRecord.issuePhotos[index].improvementStatus = status;
      }
    }
  }

  // 處理改善狀態選擇變更
  onImprovementStatusChange(event: Event, index: number): void {
    const target = event.target as HTMLSelectElement;
    const status = target.value as 'before' | 'after';
    this.updatePhotoImprovementStatus(index, status);
  }

  cancel(): void {
    this.router.navigate(['/site', this.siteId, 'forms']);
  }

  // 刪除缺失記錄
  async deleteIssueRecord(): Promise<void> {
    if (!this.formId) {
      alert('無法刪除：缺少表單ID');
      return;
    }
    
    if (confirm('確定要刪除這筆安全缺失記錄嗎？此操作無法復原。')) {
      try {
        await this.mongodbService.delete('siteForm', this.formId);
        
        // 如果有相關照片，也要刪除
        if (this.issueRecord.issuePhotos && this.issueRecord.issuePhotos.length > 0) {
          for (const photo of this.issueRecord.issuePhotos) {
            try {
              await this.gridFSService.deleteFile(photo.filename);
            } catch (error) {
              console.error('刪除照片時發生錯誤:', error);
            }
          }
          
          // 通知照片服務統計更新
          const currentSite = this.site();
          if (currentSite && currentSite._id) {
            this.photoService.notifyPhotoStatsUpdated(currentSite._id);
          }
        }
        
        alert('安全缺失記錄已刪除');
        this.router.navigate(['/site', this.siteId, 'forms']);
      } catch (error) {
        console.error('刪除缺失記錄時發生錯誤:', error);
        alert('刪除失敗，請稍後重試');
      }
    }
  }

  ngAfterViewInit(): void {
    // 初始化照片 Modal
    const photoModalEl = document.getElementById('photoModal');
    if (photoModalEl) {
      this.photoModal = new bootstrap.Modal(photoModalEl);
    }
  }

  // 查看照片
  viewPhoto(index: number): void {
    const photos = this.uploadedPhotos();
    if (photos[index]) {
      this.currentPhotoIndex.set(index);
      this.editingPhotoTitle.set(photos[index].title);
      this.showPhotoModal.set(true);
      if (this.photoModal) {
        this.photoModal.show();
      }
    }
  }

  // 關閉照片 Modal
  closePhotoModal(): void {
    this.showPhotoModal.set(false);
    this.currentPhotoIndex.set(-1);
    this.editingPhotoTitle.set('');
    if (this.photoModal) {
      this.photoModal.hide();
    }
  }

  // 儲存照片標題
  savePhotoTitle(): void {
    const index = this.currentPhotoIndex();
    const newTitle = this.editingPhotoTitle();
    
    if (index >= 0 && newTitle.trim()) {
      const photos = this.uploadedPhotos();
      if (photos[index]) {
        photos[index].title = newTitle.trim();
        this.uploadedPhotos.set([...photos]);
        
        // 同步更新 issueRecord 中的照片標題
        if (this.issueRecord.issuePhotos && this.issueRecord.issuePhotos[index]) {
          this.issueRecord.issuePhotos[index].title = newTitle.trim();
        }
        
        alert('照片備註已儲存');
        this.closePhotoModal();
      }
    } else if (!newTitle.trim()) {
      alert('請輸入照片標題或備註');
    }
  }

  // 取得當前查看的照片
  getCurrentPhoto(): any {
    const index = this.currentPhotoIndex();
    const photos = this.uploadedPhotos();
    return index >= 0 && photos[index] ? photos[index] : null;
  }

  // 生成 Word 文件
  async generateDocx(): Promise<void> {
    if (!this.issueRecord._id) {
      alert('請先儲存表單後再下載Word文件');
      return;
    }

    this.isGeneratingDocument.set(true);
    
    try {
      const currentSite = this.site();
      if (!currentSite) {
        throw new Error('無法取得工地資訊');
      }

      // 準備模板資料
      const templateData = {
        // 基本資訊
        recordNo: this.issueRecord.recordNo || '',
        establishPerson: this.issueRecord.establishPerson || '',
        establishUnit: this.issueRecord.establishUnit || '',
        projectNo: currentSite.projectNo || '',
        establishDate: this.issueRecord.establishDate || '',
        responsibleUnit: this.issueRecord.responsibleUnit === 'MIC' ? 'MIC' : '供應商',
        issueDate: this.issueRecord.issueDate || '',
        factoryArea: this.issueRecord.factoryArea || '',
        
        // 缺失說明
        issueDescription: this.issueRecord.issueDescription || '',
        
        // 缺失處置
        remedyMeasures: this.issueRecord.remedyMeasures || [],
        improvementDeadline: this.issueRecord.improvementDeadline || '',
        
        // 缺失評核
        deductionCode: this.issueRecord.deductionCode || '',
        recordPoints: this.issueRecord.recordPoints || '',
        
        // 複查資訊
        reviewDate: this.issueRecord.reviewDate || '',
        reviewer: this.issueRecord.reviewer || '',
        reviewResult: this.issueRecord.reviewResult === 'completed' ? '已完成改正' : 
                     this.issueRecord.reviewResult === 'incomplete' ? '未完成改正(要求改善，再次開立工安缺失紀錄表)' : '',
        
        // 簽名（這裡可以根據需要處理簽名圖片）
        supervisorSignature: this.supervisorSignature ? '已簽名' : '',
        workerSignature: this.workerSignature ? '已簽名' : '',
        
        // 工地資訊
        siteName: currentSite.projectName || '',
        siteLocation: `${currentSite.county || ''} ${currentSite.town || ''}`.trim(),
        
        // 當前日期
        currentDate: new Date().toLocaleDateString('zh-TW')
      };

      // 使用 DocxTemplateService 生成文件
      await this.docxTemplateService.generateFormDocx(this.issueRecord._id!, 'safetyIssueRecord');
      
    } catch (error) {
      console.error('生成Word文件時發生錯誤:', error);
      alert('生成Word文件失敗，請稍後重試');
    } finally {
      this.isGeneratingDocument.set(false);
    }
  }
} 