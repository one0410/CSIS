import { Component, computed, signal, inject, OnInit, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { Worker } from '../../../model/worker.model';
import { MongodbService } from '../../../services/mongodb.service';
import { CurrentSiteService } from '../../../services/current-site.service';

@Component({
  selector: 'app-site-visitor-list',
  imports: [CommonModule, FormsModule],
  templateUrl: './site-visitor-list.component.html',
  styleUrl: './site-visitor-list.component.scss'
})
export class SiteVisitorListComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private mongodbService = inject(MongodbService);
  private currentSiteService = inject(CurrentSiteService);

  //siteId = signal<string>('');
  site = computed(() => this.currentSiteService.currentSite());
  visitors = signal<Worker[]>([]);
  loading = signal<boolean>(false);
  showAddForm = signal<boolean>(false);
  editingVisitorId = signal<string | null>(null);
  editingVisitor = signal<{ idno: string; tel: string }>({ idno: '', tel: '' });
  
  // 危害告知狀態
  visitorHazardNoticeStatus = signal<Map<string, boolean>>(new Map());

  // 新增訪客表單
  newVisitor: Partial<Worker> = {
    name: '',
    idno: '',
    tel: '',
    gender: '',
    birthday: '',
    bloodType: '',
    liaison: '',
    emergencyTel: '',
    address: '',
    profilePicture: '',
    idCardFrontPicture: '',
    idCardBackPicture: '',
    supplierIndustrialSafetyNumber: '',
    generalSafetyTrainingDate: '',
    generalSafetyTrainingDueDate: '',
    laborInsuranceApplyDate: '',
    laborInsurancePicture: '',
    laborAssociationDate: '',
    sixHourTrainingDate: '',
    sixHourTrainingFrontPicture: '',
    sixHourTrainingBackPicture: '',
    accidentInsurances: [],
    contractingCompanyName: '',
    viceContractingCompanyName: '',
    certifications: [],
    reviewStaff: '',
    no: null,
    medicalExamPictures: [],
    belongSites: []
  };

  constructor() {
    // 監聽 site() 變化，當有值時載入訪客列表
    effect(() => {
      const currentSite = this.site();
      if (currentSite?._id) {
        this.loadVisitors();
      }
    });
  }

  ngOnInit() {
    // 可以移除這裡的 loadVisitors() 呼叫，因為 effect 會處理
  }

  async loadVisitors() {
    this.loading.set(true);
    try {
      const currentSite = this.site();
      if (!currentSite?._id) {
        console.warn('工地資訊尚未載入');
        return;
      }

      // 查詢該工地的訪客 (belongSites 中包含該 siteId 且 isVisitor 為 true)
      const filter = {
        'belongSites': {
          $elemMatch: {
            'siteId': currentSite._id,
            'isVisitor': true
          }
        }
      };
      
      const visitors = await this.mongodbService.get('worker', filter) as Worker[];
      this.visitors.set(visitors);
      
      // 載入危害告知狀態
      await this.loadVisitorHazardNoticeStatus();
      
    } catch (error) {
      console.error('載入訪客列表失敗:', error);
    } finally {
      this.loading.set(false);
    }
  }

  // 從危害告知表單中查詢訪客簽名狀態
  async loadVisitorHazardNoticeStatus() {
    const currentSite = this.site();
    if (!currentSite?._id) return;
    
    try {
      // 清空之前的狀態
      const statusMap = new Map<string, boolean>();
      
      // 獲取該工地的所有危害告知表單
      const hazardNoticeForms = await this.mongodbService.get('siteForm', {
        siteId: currentSite._id,
        formType: 'hazardNotice'
      });
      
      // 收集所有已簽名的訪客身份證號碼或電話號碼
      const signedVisitorIds = new Set<string>();
      
      hazardNoticeForms.forEach((form: any) => {
        if (form.workerSignatures && form.workerSignatures.length > 0) {
          form.workerSignatures.forEach((signature: any) => {
            if (signature.idno) {
              signedVisitorIds.add(signature.idno);
            }
            if (signature.tel) {
              signedVisitorIds.add(signature.tel);
            }
          });
        }
      });
      
      // 為每個訪客設定危害告知狀態
      this.visitors().forEach(visitor => {
        const hasHazardNotice = Boolean(
          (visitor.idno && signedVisitorIds.has(visitor.idno)) ||
          (visitor.tel && signedVisitorIds.has(visitor.tel))
        );
        statusMap.set(visitor._id!, hasHazardNotice);
      });
      
      this.visitorHazardNoticeStatus.set(statusMap);
      
    } catch (error) {
      console.error('載入訪客危害告知狀態時發生錯誤', error);
    }
  }

  // 檢查訪客是否有危害告知
  hasHazardNotice(visitor: Worker): boolean {
    return this.visitorHazardNoticeStatus().get(visitor._id!) || false;
  }

  showAddVisitorForm() {
    this.showAddForm.set(true);
    this.resetNewVisitor();
  }

  hideAddVisitorForm() {
    this.showAddForm.set(false);
    this.resetNewVisitor();
  }

  resetNewVisitor() {
    this.newVisitor = {
      name: '',
      idno: '',
      tel: '',
      gender: '',
      birthday: '',
      bloodType: '',
      liaison: '',
      emergencyTel: '',
      address: '',
      profilePicture: '',
      idCardFrontPicture: '',
      idCardBackPicture: '',
      supplierIndustrialSafetyNumber: '',
      generalSafetyTrainingDate: '',
      generalSafetyTrainingDueDate: '',
      laborInsuranceApplyDate: '',
      laborInsurancePicture: '',
      laborAssociationDate: '',
      sixHourTrainingDate: '',
      sixHourTrainingFrontPicture: '',
      sixHourTrainingBackPicture: '',
      accidentInsurances: [],
      contractingCompanyName: '',
      viceContractingCompanyName: '',
      certifications: [],
      reviewStaff: '',
      no: null,
      medicalExamPictures: [],
      belongSites: []
    };
  }

  async saveVisitor() {
    const visitor = this.newVisitor;
    
    // 驗證必填欄位
    if (!visitor.name?.trim()) {
      alert('請輸入姓名');
      return;
    }

    // 檢查是否已存在同名訪客
    const currentSite = this.site();
    if (!currentSite?._id) {
      alert('工地資訊尚未載入');
      return;
    }

    const existingVisitor = await this.mongodbService.get('worker', {
      name: visitor.name.trim(),
      'belongSites': {
        $elemMatch: {
          'siteId': currentSite._id,
          'isVisitor': true
        }
      }
    });

    if (existingVisitor && existingVisitor.length > 0) {
      alert(`訪客 "${visitor.name.trim()}" 已存在，請勿重複新增`);
      return;
    }

    try {
      this.loading.set(true);
      
      // 設定 belongSites，標記為訪客
      visitor.belongSites = [{
        siteId: currentSite._id,
        assignDate: new Date(),
        isVisitor: true
      }];

      const result = await this.mongodbService.post('worker', visitor);

      if (result.insertedId) {
        this.hideAddVisitorForm();
        await this.loadVisitors();
      } else {
        alert('新增訪客失敗');
      }
    } catch (error) {
      console.error('新增訪客失敗:', error);
      alert('新增訪客失敗');
    } finally {
      this.loading.set(false);
    }
  }

  async deleteVisitor(visitor: Worker) {
    if (!confirm(`確定要刪除訪客 ${visitor.name} 嗎？`)) {
      return;
    }

    try {
      this.loading.set(true);
      
      const result = await this.mongodbService.delete('worker', visitor._id!);

      if (result) {
        await this.loadVisitors();
      } else {
        alert('刪除訪客失敗');
      }
    } catch (error) {
      console.error('刪除訪客失敗:', error);
      alert('刪除訪客失敗');
    } finally {
      this.loading.set(false);
    }
  }

  startEditVisitor(visitor: Worker) {
    this.editingVisitorId.set(visitor._id!);
    this.editingVisitor.set({
      idno: visitor.idno,
      tel: visitor.tel
    });
  }

  cancelEditVisitor() {
    this.editingVisitorId.set(null);
    this.editingVisitor.set({ idno: '', tel: '' });
  }

  async saveEditVisitor(visitor: Worker) {
    const editData = this.editingVisitor();
    if (!editData) return;

    try {
      this.loading.set(true);
      
      const updateData = {
        idno: editData.idno,
        tel: editData.tel
      };

      const result = await this.mongodbService.patch('worker', visitor._id!, updateData);

      if (result) {
        this.cancelEditVisitor();
        await this.loadVisitors();
      } else {
        alert('更新訪客資料失敗');
      }
    } catch (error) {
      console.error('更新訪客資料失敗:', error);
      alert('更新訪客資料失敗');
    } finally {
      this.loading.set(false);
    }
  }



}
