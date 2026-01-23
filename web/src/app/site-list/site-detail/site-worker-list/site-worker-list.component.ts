import { Component, computed, signal, OnInit, OnDestroy } from '@angular/core';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { Subject } from 'rxjs';
import { debounceTime, distinctUntilChanged, takeUntil } from 'rxjs/operators';

import { MongodbService } from '../../../services/mongodb.service';
import { Worker, CertificationTypeManager } from '../../../model/worker.model';
import { CurrentSiteService } from '../../../services/current-site.service';
import { AuthService } from '../../../services/auth.service';
import { GridFSService } from '../../../services/gridfs.service';
import dayjs from 'dayjs';
import * as XLSX from 'xlsx';

// 供應商認證匯入預覽資料介面
interface ImportPreviewRow {
  companyName: string;
  workerName: string;
  certNumber: string;
  matched: boolean;
  matchedWorker?: Worker;
}

@Component({
  selector: 'app-site-worker-list',
  standalone: true,
  imports: [FormsModule, RouterModule],
  templateUrl: './site-worker-list.component.html',
  styleUrls: ['./site-worker-list.component.scss']
})
export class SiteWorkerListComponent implements OnInit, OnDestroy {
  siteId: string | null = null;
  site = computed(() => this.currentSiteService.currentSite());
  currentUser = computed(() => this.authService.user());
  
  // 工作人員資料
  isLoading = false;
  siteWorkers: Worker[] = [];
  filteredSiteWorkers: Worker[] = [];
  allWorkers: Worker[] = [];
  
  // 工作人員選取狀態
  selectedWorkers: Set<string> = new Set();
  
  // 危害告知狀態
  workerHazardNoticeStatus: Map<string, boolean> = new Map();
  hazardNoticeForms: any[] = [];
  
  // 教育訓練狀態（存儲數量）
  workerTrainingStatus: Map<string, number> = new Map();
  trainingForms: any[] = [];
  
  // 搜尋相關
  searchQuery = '';
  searchResults: Worker[] = [];
  searchPerformed = false;
  private searchSubject = new Subject<string>();
  private destroy$ = new Subject<void>();
  
  // 模態框相關
  modalSearchQuery = '';
  filteredModalWorkers: (Worker & { selected?: boolean })[] = [];
  allWorkersSelected = false;
  
  // 分頁相關
  currentPage = 1;
  pageSize = 10;
  totalPages = 1;
  
  // 過濾設定
  showOnlyActive = true;
  filterCompany = '';
  companies: string[] = [];

  // 勞保 modal 相關
  showLaborInsuranceModal = signal(false);
  selectedWorker = signal<Worker | null>(null);
  newLaborInsurance = {
    belongSite: '',
    applyDate: '',
    picture: '',
    associationDate: ''
  };

  // 意外險 modal 相關
  showAccidentInsuranceModal = signal(false);
  newAccidentInsurance = {
    belongSite: '',
    start: '',
    end: '',
    amount: '',
    signDate: '',
    companyName: '',
    pictures: [] as string[]
  };

  // 供應商認證匯入 modal 相關
  showImportSupplierCertModal = signal(false);
  importPreviewData = signal<ImportPreviewRow[]>([]);

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private mongodbService: MongodbService,
    private currentSiteService: CurrentSiteService,
    private authService: AuthService,
    private gridFSService: GridFSService
  ) {}

  async ngOnInit() {
    this.route.parent?.paramMap.subscribe(params => {
      this.siteId = params.get('id');
      this.loadSiteData();
    });

    // 設定搜尋防抖動
    this.searchSubject.pipe(
      debounceTime(200), // 200ms 延遲
      distinctUntilChanged(), // 只在值改變時觸發
      takeUntil(this.destroy$)
    ).subscribe(searchQuery => {
      this.performSearch(searchQuery);
    });

    await this.loadAllWorkers();
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  async loadSiteData() {
    if (!this.siteId) return;
    
    try {
      this.isLoading = true;
      
      await this.loadSiteWorkers();
      await this.loadWorkerHazardNoticeStatus();
      await this.loadWorkerTrainingStatus();
      // 刷新 CurrentSiteService 的工人列表
      await this.currentSiteService.refreshWorkersList();
    } catch (error) {
      console.error('載入專案資料時發生錯誤', error);
    } finally {
      this.isLoading = false;
    }
  }

  async loadSiteWorkers() {
    if (!this.siteId) return;
    
    try {
      // 獲取工地工作人員, 找出belongSites包含this.siteId的工人
      const siteWorkers = await this.mongodbService.getArray('worker', { belongSites: { $elemMatch: { siteId: this.siteId } } });
      
      if (siteWorkers && siteWorkers.length > 0) {
        // 過濾掉訪客，只保留工作人員
        this.siteWorkers = siteWorkers.filter((worker: Worker) => {
          const siteInfo = worker.belongSites?.find(site => site.siteId === this.siteId);
          return siteInfo && !siteInfo.isVisitor; // 排除訪客
        });
        this.filterWorkers();
        this.extractCompanies();
      } else {
        this.siteWorkers = [];
        this.filteredSiteWorkers = [];
        this.companies = [];
      }
      
      this.calculatePagination();
    } catch (error) {
      console.error('載入工地工作人員時發生錯誤', error);
    }
  }

  // 從危害告知表單中查詢工人簽名狀態
  async loadWorkerHazardNoticeStatus() {
    if (!this.siteId) return;
    
    try {
      // 清空之前的狀態
      this.workerHazardNoticeStatus.clear();
      
      // 獲取該工地的所有危害告知表單
      this.hazardNoticeForms = await this.mongodbService.getArray('siteForm', {
        siteId: this.siteId,
        formType: 'hazardNotice'
      });
      
      // 收集所有已簽名的工人身份證號碼或電話號碼
      const signedWorkerIds = new Set<string>();
      
      this.hazardNoticeForms.forEach((form: any) => {
        if (form.workerSignatures && form.workerSignatures.length > 0) {
          form.workerSignatures.forEach((signature: any) => {
            if (signature.idno) {
              // 清除可能的空格並轉換為大寫統一比對
              const cleanIdno = signature.idno.toString().trim().toUpperCase();
              signedWorkerIds.add(cleanIdno);
            }
            if (signature.tel) {
              // 清除可能的空格和特殊字符
              const cleanTel = signature.tel.toString().trim().replace(/\D/g, '');
              if (cleanTel) {
                signedWorkerIds.add(cleanTel);
              }
            }
          });
        }
      });
      
      // 為每個工人設定危害告知狀態
      this.siteWorkers.forEach(worker => {
        if (!worker._id) return; // 跳過沒有 ID 的工人
        
        // 清理工人的身分證號碼和電話號碼用於比對
        const workerIdno = worker.idno ? worker.idno.toString().trim().toUpperCase() : '';
        const workerTel = worker.tel ? worker.tel.toString().trim().replace(/\D/g, '') : '';
        
        const hasHazardNotice = Boolean((workerIdno && signedWorkerIds.has(workerIdno)) ||
                                       (workerTel && signedWorkerIds.has(workerTel)));
        this.workerHazardNoticeStatus.set(worker._id, hasHazardNotice);
      });
      
    } catch (error) {
      console.error('載入工人危害告知狀態時發生錯誤', error);
    }
  }

  // 檢查工人是否有危害告知
  hasHazardNotice(worker: Worker): boolean {
    if (!worker._id) return false;
    return this.workerHazardNoticeStatus.get(worker._id) || false;
  }

  // 從教育訓練表單中查詢工人簽名狀態
  async loadWorkerTrainingStatus() {
    if (!this.siteId) return;
    
    try {
      // 清空之前的狀態
      this.workerTrainingStatus.clear();
      
      // 獲取該工地的所有教育訓練表單（排除已作廢的表單）
      this.trainingForms = await this.mongodbService.getArray('siteForm', {
        siteId: this.siteId,
        formType: 'training',
        status: { $ne: 'revoked' }
      });
      
      console.log('載入的教育訓練表單:', this.trainingForms);

      // 為每個工人計算教育訓練數量
      this.siteWorkers.forEach(worker => {
        if (!worker._id) return; // 跳過沒有 ID 的工人

        // 清理工人的身分證號碼和電話號碼用於比對
        const workerIdno = worker.idno ? worker.idno.toString().trim().toUpperCase() : '';
        const workerTel = worker.tel ? worker.tel.toString().trim().replace(/\D/g, '') : '';

        // 計算該工人參加的教育訓練數量
        let trainingCount = 0;

        this.trainingForms.forEach((form: any) => {
          if (form.workerSignatures && form.workerSignatures.length > 0) {
            const hasWorkerSignature = form.workerSignatures.some((signature: any) => {
              if (signature.idno) {
                const cleanIdno = signature.idno.toString().trim().toUpperCase();
                if (cleanIdno === workerIdno) return true;
              }
              if (signature.tel && workerTel) {
                const cleanTel = signature.tel.toString().trim().replace(/\D/g, '');
                if (cleanTel === workerTel) return true;
              }
              return false;
            });

            if (hasWorkerSignature) {
              trainingCount++;
            }
          }
        });

        console.log(`工人 ${worker.name} (${workerIdno}) 教育訓練數量:`, trainingCount);
        this.workerTrainingStatus.set(worker._id, trainingCount);
      });
      
    } catch (error) {
      console.error('載入工人教育訓練狀態時發生錯誤', error);
    }
  }

  // 獲取工人的教育訓練數量
  getTrainingCount(worker: Worker): number {
    if (!worker._id) return 0;
    return this.workerTrainingStatus.get(worker._id) || 0;
  }

  // 檢查工人是否有教育訓練（向後兼容）
  hasTraining(worker: Worker): boolean {
    return this.getTrainingCount(worker) > 0;
  }

  // 檢查工人是否有此工地的勞保資料
  hasLaborInsurance(worker: Worker): boolean {
    if (!worker.laborInsurance || !worker.laborInsurance.length || !this.siteId) {
      return false;
    }

    // 檢查是否有與當前工地匹配的勞保資料
    // 使用 toString() 確保類型一致性 (處理 ObjectId vs string 的情況)
    return worker.laborInsurance.some(insurance =>
      insurance.belongSite?.toString() === this.siteId?.toString() &&
      (
        (insurance.applyDate && insurance.applyDate.trim() !== '') ||
        (insurance.picture && insurance.picture.trim() !== '') ||
        (insurance.associationDate && insurance.associationDate.trim() !== '')
      )
    );
  }

  // 檢查工人是否有此工地的意外險資料
  hasAccidentInsurance(worker: Worker): boolean {
    if (!worker.accidentInsurances || !worker.accidentInsurances.length || !this.siteId) {
      return false;
    }

    // 檢查是否有與當前工地匹配的意外險資料
    return worker.accidentInsurances.some(insurance =>
      insurance.belongSite === this.siteId &&
      insurance.start &&
      insurance.start.trim() !== ''
    );
  }

  // === 勞保 Modal 相關方法 ===

  openLaborInsuranceModal(worker: Worker) {
    this.selectedWorker.set(worker);
    this.resetLaborInsuranceForm();
    this.showLaborInsuranceModal.set(true);
  }

  closeLaborInsuranceModal() {
    this.showLaborInsuranceModal.set(false);
    this.selectedWorker.set(null);
    this.resetLaborInsuranceForm();
  }

  resetLaborInsuranceForm() {
    this.newLaborInsurance = {
      belongSite: this.siteId || '',
      applyDate: '',
      picture: '',
      associationDate: ''
    };
  }

  getWorkerLaborInsurance(worker: Worker) {
    if (!worker.laborInsurance || !this.siteId) return [];
    return worker.laborInsurance.filter(insurance => insurance.belongSite?.toString() === this.siteId?.toString());
  }

  async handleLaborInsuranceFileUpload(event: Event) {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files[0]) {
      const file = input.files[0];
      try {
        this.isLoading = true;

        // 壓縮圖片
        const compressedDataUrl = await this.compressImage(file, 1200, 0.8);

        // 將 base64 轉換為 File 物件
        const compressedFile = await this.dataUrlToFile(compressedDataUrl, file.name);

        // 上傳到 GridFS
        const worker = this.selectedWorker();
        const uploadResult = await this.gridFSService.uploadFile(compressedFile, {
          type: 'laborInsurance',
          workerId: worker?._id || '',
          siteId: this.siteId || '',
          originalName: file.name
        });

        if (uploadResult && uploadResult.filename) {
          // 儲存 GridFS URL
          this.newLaborInsurance.picture = `/api/gridfs/${uploadResult.filename}`;
        } else {
          throw new Error('上傳失敗，未取得檔案名稱');
        }
      } catch (error) {
        console.error('圖片上傳失敗', error);
        alert('圖片上傳失敗，請重試');
      } finally {
        this.isLoading = false;
      }
    }
  }

  removeLaborInsuranceImage() {
    this.newLaborInsurance.picture = '';
  }

  async saveLaborInsurance() {
    const worker = this.selectedWorker();
    if (!worker || !this.siteId) return;

    // 驗證至少填寫了一個欄位
    if (!this.newLaborInsurance.applyDate &&
        !this.newLaborInsurance.picture &&
        !this.newLaborInsurance.associationDate) {
      alert('請至少填寫一個欄位（申請日期、工會日期或勞保證明圖片）');
      return;
    }

    try {
      this.isLoading = true;

      // 確保 laborInsurance 陣列存在
      if (!worker.laborInsurance) {
        worker.laborInsurance = [];
      }

      // 確保 belongSite 已設定
      const newInsurance = {
        ...this.newLaborInsurance,
        belongSite: this.siteId // 明確設定 belongSite
      };

      // 新增勞保資料到陣列
      worker.laborInsurance.push(newInsurance);

      // 更新到資料庫
      const result = await this.mongodbService.put('worker', worker._id!, worker);

      if (!result) {
        console.error('儲存勞保資料失敗');
        alert('儲存失敗，請重試');
        // 回復變更
        worker.laborInsurance.pop();
        return;
      }

      // 重新載入資料
      await this.loadSiteWorkers();

      // 更新 selectedWorker 為新載入的工人資料
      const updatedWorker = this.siteWorkers.find(w => w._id === worker._id);
      if (updatedWorker) {
        this.selectedWorker.set(updatedWorker);
      }

      // 關閉 modal
      this.closeLaborInsuranceModal();

    } catch (error) {
      console.error('儲存勞保資料時發生錯誤', error);
      alert('儲存時發生錯誤，請重試');
    } finally {
      this.isLoading = false;
    }
  }

  async deleteLaborInsurance(index: number) {
    const worker = this.selectedWorker();
    if (!worker || !this.siteId) return;

    if (confirm('確定要刪除這筆勞保資料嗎？')) {
      try {
        this.isLoading = true;

        // 獲取當前工地的勞保資料
        const siteInsurances = this.getWorkerLaborInsurance(worker);
        if (index >= 0 && index < siteInsurances.length && worker.laborInsurance) {
          // 從原始陣列中移除對應項目
          const insuranceToRemove = siteInsurances[index];
          const originalIndex = worker.laborInsurance.findIndex(ins =>
            ins.belongSite === insuranceToRemove.belongSite &&
            ins.applyDate === insuranceToRemove.applyDate
          );

          if (originalIndex >= 0) {
            worker.laborInsurance.splice(originalIndex, 1);

            // 更新到資料庫
            await this.mongodbService.put('worker', worker._id!, worker);

            // 重新載入資料
            await this.loadSiteWorkers();
          }
        }
      } catch (error) {
        console.error('刪除勞保資料時發生錯誤', error);
      } finally {
        this.isLoading = false;
      }
    }
  }

  viewImage(imageUrl: string) {
    window.open(imageUrl, '_blank');
  }

  // === 意外險 Modal 相關方法 ===

  openAccidentInsuranceModal(worker: Worker) {
    this.selectedWorker.set(worker);
    this.resetAccidentInsuranceForm();
    this.showAccidentInsuranceModal.set(true);
  }

  closeAccidentInsuranceModal() {
    this.showAccidentInsuranceModal.set(false);
    this.selectedWorker.set(null);
    this.resetAccidentInsuranceForm();
  }

  resetAccidentInsuranceForm() {
    this.newAccidentInsurance = {
      belongSite: this.siteId || '',
      start: '',
      end: '',
      amount: '',
      signDate: '',
      companyName: '',
      pictures: []
    };
  }

  getWorkerAccidentInsurance(worker: Worker) {
    if (!worker.accidentInsurances || !this.siteId) return [];
    return worker.accidentInsurances.filter(insurance => insurance.belongSite === this.siteId);
  }

  async handleAccidentInsuranceFileUpload(event: Event) {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      try {
        this.isLoading = true;
        const worker = this.selectedWorker();

        for (const file of Array.from(input.files)) {
          // 壓縮圖片
          const compressedDataUrl = await this.compressImage(file, 1200, 0.8);

          // 將 base64 轉換為 File 物件
          const compressedFile = await this.dataUrlToFile(compressedDataUrl, file.name);

          // 上傳到 GridFS
          const uploadResult = await this.gridFSService.uploadFile(compressedFile, {
            type: 'accidentInsurance',
            workerId: worker?._id || '',
            siteId: this.siteId || '',
            originalName: file.name
          });

          if (uploadResult && uploadResult.filename) {
            // 儲存 GridFS URL
            this.newAccidentInsurance.pictures.push(`/api/gridfs/${uploadResult.filename}`);
          } else {
            throw new Error('上傳失敗，未取得檔案名稱');
          }
        }
      } catch (error) {
        console.error('圖片上傳失敗', error);
        alert('圖片上傳失敗，請重試');
      } finally {
        this.isLoading = false;
      }
    }
  }

  removeAccidentInsuranceImage(index: number) {
    this.newAccidentInsurance.pictures.splice(index, 1);
  }

  viewAccidentImages(images: string[]) {
    // 可以實作一個圖片輪播器或者開新視窗
    if (images.length === 1) {
      window.open(images[0], '_blank');
    } else {
      // 多張圖片的話，可以依次開啟或實作輪播
      images.forEach(img => window.open(img, '_blank'));
    }
  }

  async saveAccidentInsurance() {
    const worker = this.selectedWorker();
    if (!worker || !this.siteId) return;

    try {
      this.isLoading = true;

      // 確保 accidentInsurances 陣列存在
      if (!worker.accidentInsurances) {
        worker.accidentInsurances = [];
      }

      // 新增意外險資料到陣列
      worker.accidentInsurances.push({ ...this.newAccidentInsurance });

      // 更新到資料庫
      await this.mongodbService.put('worker', worker._id!, worker);

      // 重新載入資料
      await this.loadSiteWorkers();

      // 關閉 modal
      this.closeAccidentInsuranceModal();

    } catch (error) {
      console.error('儲存意外險資料時發生錯誤', error);
    } finally {
      this.isLoading = false;
    }
  }

  async deleteAccidentInsurance(index: number) {
    const worker = this.selectedWorker();
    if (!worker || !this.siteId) return;

    if (confirm('確定要刪除這筆意外險資料嗎？')) {
      try {
        this.isLoading = true;

        // 獲取當前工地的意外險資料
        const siteInsurances = this.getWorkerAccidentInsurance(worker);
        if (index >= 0 && index < siteInsurances.length) {
          // 從原始陣列中移除對應項目
          const insuranceToRemove = siteInsurances[index];
          const originalIndex = worker.accidentInsurances!.findIndex(ins =>
            ins.belongSite === insuranceToRemove.belongSite &&
            ins.start === insuranceToRemove.start &&
            ins.signDate === insuranceToRemove.signDate
          );

          if (originalIndex >= 0) {
            worker.accidentInsurances!.splice(originalIndex, 1);

            // 更新到資料庫
            await this.mongodbService.put('worker', worker._id!, worker);

            // 重新載入資料
            await this.loadSiteWorkers();
          }
        }
      } catch (error) {
        console.error('刪除意外險資料時發生錯誤', error);
      } finally {
        this.isLoading = false;
      }
    }
  }

  async loadAllWorkers() {
    try {
      // 只載入搜尋和顯示所需的欄位
      const result = await this.mongodbService.get('worker', {}, {
        limit: 0,
        projection: {
          _id: 1,
          name: 1,
          idno: 1,
          contractingCompanyName: 1,
          phone: 1,
          belongSites: 1,
          certifications: 1  // 如果需要顯示證照資訊
        }
      });
      this.allWorkers = result.data;
    } catch (error) {
      console.error('載入所有工作人員時發生錯誤', error);
    }
  }

  extractCompanies() {
    // 從工作人員資料中提取不重複的公司名稱
    const companiesSet = new Set<string>();
    
    this.siteWorkers.forEach(worker => {
      if (worker.contractingCompanyName) {
        companiesSet.add(worker.contractingCompanyName);
      }
      if (worker.viceContractingCompanyName) {
        companiesSet.add(worker.viceContractingCompanyName);
      }
    });
    
    this.companies = Array.from(companiesSet).sort();
  }

  // 觸發搜尋（帶防抖動）
  searchWorkers() {
    this.searchSubject.next(this.searchQuery);
  }

  // 實際執行搜尋
  private performSearch(query: string) {
    this.searchPerformed = true;

    if (!query.trim()) {
      this.searchResults = [];
      return;
    }

    const searchQuery = query.toLowerCase();

    // 過濾已經在工地工作人員中的人員
    const siteWorkerIds = this.siteWorkers.map(worker => worker._id);

    this.searchResults = this.allWorkers.filter(worker =>
      (worker.name?.toLowerCase().includes(searchQuery) ||
       worker.idno?.toLowerCase().includes(searchQuery) ||
       worker.contractingCompanyName?.toLowerCase().includes(searchQuery)) &&
      !siteWorkerIds.includes(worker._id)
    );
  }

  async addWorkerToSite(worker: Worker) {
    if (!this.siteId || !worker._id) return;
    
    try {
      this.isLoading = true;
      
      // 創建工地工作人員關聯，明確設定為非訪客
      worker.belongSites = [...(worker.belongSites || []), { siteId: this.siteId, assignDate: new Date(), isVisitor: false }];
      await this.mongodbService.patch('worker', worker._id, { belongSites: worker.belongSites });
            
      // 重新載入工作人員清單
      await this.loadSiteWorkers();
      // 重新載入危害告知狀態
      await this.loadWorkerHazardNoticeStatus();
      // 重新載入教育訓練狀態
      await this.loadWorkerTrainingStatus();
      // 刷新 CurrentSiteService 的工人列表
      await this.currentSiteService.refreshWorkersList();
      
      // 更新搜尋結果
      this.searchWorkers();
    } catch (error) {
      console.error('添加工作人員到工地時發生錯誤', error);
    } finally {
      this.isLoading = false;
    }
  }

  async removeWorkerFromSite(worker: Worker) {
    if (!this.siteId || !worker._id) return;
    
    if (!confirm(`確定要移除工作人員 ${worker.name} 嗎？`)) {
      return;
    }
    
    try {
      this.isLoading = true;
      
      worker.belongSites = worker.belongSites?.filter(site => site.siteId !== this.siteId);
      await this.mongodbService.patch('worker', worker._id, { belongSites: worker.belongSites });
           
      // 重新載入工作人員清單
      await this.loadSiteWorkers();
      // 重新載入危害告知狀態
      await this.loadWorkerHazardNoticeStatus();
      // 重新載入教育訓練狀態
      await this.loadWorkerTrainingStatus();
      // 刷新 CurrentSiteService 的工人列表
      await this.currentSiteService.refreshWorkersList();
      
      // 更新搜尋結果
      this.searchWorkers();
    } catch (error) {
      console.error('從工地移除工作人員時發生錯誤', error);
    } finally {
      this.isLoading = false;
    }
  }

  filterWorkers() {
    // 使用公司過濾
    let filtered = [...this.siteWorkers];
    
    if (this.filterCompany) {
      filtered = filtered.filter(worker => 
        worker.contractingCompanyName === this.filterCompany || 
        worker.viceContractingCompanyName === this.filterCompany
      );
    }
    
    this.filteredSiteWorkers = filtered;
    this.calculatePagination();
    this.goToPage(1);
  }

  calculatePagination() {
    this.totalPages = Math.ceil(this.filteredSiteWorkers.length / this.pageSize);
    if (this.totalPages === 0) this.totalPages = 1;
  }

  getPageNumbers(): (number | string)[] {
    const pages: (number | string)[] = [];
    const maxVisiblePages = 7; // 最多顯示的頁碼數量

    if (this.totalPages <= maxVisiblePages) {
      // 如果總頁數少於最大顯示數，顯示所有頁碼
      for (let i = 1; i <= this.totalPages; i++) {
        pages.push(i);
      }
    } else {
      // 總是顯示第一頁
      pages.push(1);

      // 計算當前頁附近要顯示的範圍
      let startPage = Math.max(2, this.currentPage - 2);
      let endPage = Math.min(this.totalPages - 1, this.currentPage + 2);

      // 調整範圍以保持固定數量的頁碼
      if (this.currentPage <= 3) {
        endPage = Math.min(maxVisiblePages - 1, this.totalPages - 1);
      } else if (this.currentPage >= this.totalPages - 2) {
        startPage = Math.max(2, this.totalPages - maxVisiblePages + 2);
      }

      // 如果起始頁不是2，加入省略號
      if (startPage > 2) {
        pages.push('...');
      }

      // 加入中間的頁碼
      for (let i = startPage; i <= endPage; i++) {
        pages.push(i);
      }

      // 如果結束頁不是倒數第二頁，加入省略號
      if (endPage < this.totalPages - 1) {
        pages.push('...');
      }

      // 總是顯示最後一頁
      pages.push(this.totalPages);
    }

    return pages;
  }

  goToPage(page: number | string) {
    // 如果是省略號，不做任何事
    if (typeof page === 'string') return;

    if (page < 1 || page > this.totalPages) return;
    this.currentPage = page;
  }

  showAddWorkerModal() {
    this.modalSearchQuery = '';
    this.prepareModalWorkers();
    
    // 使用Bootstrap模態框API開啟模態框
    // 注意：需要在實際環境中引入Bootstrap的JS
    const modal = document.getElementById('addWorkerModal');
    if (modal) {
      // @ts-ignore
      const bsModal = new bootstrap.Modal(modal);
      bsModal.show();
    }
  }

  prepareModalWorkers() {
    // 過濾已經在工地中的工作人員
    const siteWorkerIds = this.siteWorkers.map(worker => worker._id);
    
    this.filteredModalWorkers = this.allWorkers
      .filter(worker => !siteWorkerIds.includes(worker._id))
      .map(worker => ({
        ...worker,
        selected: false
      }));
  }

  searchModalWorkers() {
    if (!this.modalSearchQuery.trim()) {
      this.prepareModalWorkers();
      return;
    }
    
    const query = this.modalSearchQuery.toLowerCase();
    const siteWorkerIds = this.siteWorkers.map(worker => worker._id);
    
    this.filteredModalWorkers = this.allWorkers
      .filter(worker => 
        (worker.name?.toLowerCase().includes(query) || 
         worker.idno?.toLowerCase().includes(query) || 
         worker.contractingCompanyName?.toLowerCase().includes(query)) && 
        !siteWorkerIds.includes(worker._id)
      )
      .map(worker => ({
        ...worker,
        selected: false
      }));
  }

  toggleAllWorkers() {
    this.allWorkersSelected = !this.allWorkersSelected;
    this.filteredModalWorkers.forEach(worker => {
      worker.selected = this.allWorkersSelected;
    });
  }

  updateSelectAllStatus() {
    this.allWorkersSelected = this.filteredModalWorkers.length > 0 && 
                             this.filteredModalWorkers.every(worker => worker.selected);
  }

  getSelectedModalWorkersCount(): number {
    return this.filteredModalWorkers.filter(worker => worker.selected).length;
  }

  async addSelectedWorkers() {
    const selectedWorkers = this.filteredModalWorkers.filter(worker => worker.selected);
    
    if (selectedWorkers.length === 0 || !this.siteId) return;
    
    try {
      this.isLoading = true;
      
      // 批次添加工作人員，明確設定為非訪客
      for (const worker of selectedWorkers) {
        if (worker._id) {
          worker.belongSites = [...(worker.belongSites || []), { siteId: this.siteId, assignDate: new Date(), isVisitor: false }];
          await this.mongodbService.patch('worker', worker._id, { belongSites: worker.belongSites });
        }
      }
      
      // 重新載入工作人員清單
      await this.loadSiteWorkers();
      // 重新載入危害告知狀態
      await this.loadWorkerHazardNoticeStatus();
      // 重新載入教育訓練狀態
      await this.loadWorkerTrainingStatus();
      // 刷新 CurrentSiteService 的工人列表
      await this.currentSiteService.refreshWorkersList();
      
      // 關閉模態框
      const modal = document.getElementById('addWorkerModal');
      if (modal) {
        // @ts-ignore
        const bsModal = bootstrap.Modal.getInstance(modal);
        bsModal?.hide();
      }
      
      // 重設選擇狀態
      this.allWorkersSelected = false;
      this.prepareModalWorkers();
      
    } catch (error) {
      console.error('批次添加工作人員時發生錯誤', error);
    } finally {
      this.isLoading = false;
    }
  }

  getRandomColor(name: string): string {
    const colors = [
      '#e74c3c', '#3498db', '#2ecc71', '#f39c12', '#9b59b6',
      '#1abc9c', '#34495e', '#e67e22', '#95a5a6', '#c0392b',
      '#2980b9', '#27ae60', '#8e44ad', '#16a085', '#2c3e50',
      '#d35400', '#7f8c8d', '#a93226', '#1f618d', '#138d75'
    ];
    
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
      hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    
    const index = Math.abs(hash) % colors.length;
    return colors[index];
  }

  hasCertification(worker: Worker, certificationType?: string): boolean {
    if (!worker.certifications || worker.certifications.length === 0) {
      return false;
    }

    if (certificationType) {
      return worker.certifications.some(cert => cert.type === certificationType);
    }

    return worker.certifications.length > 0;
  }

  // 計算有效證照數量（未過期）
  getValidCertificationCount(worker: Worker): number {
    if (!worker.certifications || worker.certifications.length === 0) {
      return 0;
    }

    const today = dayjs();
    return worker.certifications.filter(cert => {
      if (!cert.withdraw) {
        return false; // 沒有到期日視為無效
      }
      const withdrawDate = dayjs(cert.withdraw);
      return withdrawDate.isAfter(today) || withdrawDate.isSame(today, 'day');
    }).length;
  }

  // 計算過期證照數量
  getExpiredCertificationCount(worker: Worker): number {
    if (!worker.certifications || worker.certifications.length === 0) {
      return 0;
    }

    const today = dayjs();
    return worker.certifications.filter(cert => {
      if (!cert.withdraw) {
        return false; // 沒有到期日不計入過期
      }
      const withdrawDate = dayjs(cert.withdraw);
      return withdrawDate.isBefore(today, 'day');
    }).length;
  }

  // 取得工安缺失紀錄次數
  getSafetyIssueCount(worker: Worker): number {
    return worker.safetyIssues?.length || 0;
  }

  calculateAge(birthday: string): string {
    if (!birthday) return '未知';
    
    const birthDate = new Date(birthday);
    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }
    
    return age + '歲';
  }

  // 跳轉到危害告知頁面
  goToHazardNotice(worker: Worker) {
    if (!this.siteId) return;
    
    // 尋找包含此工人簽名的表單
    let targetFormId: string | null = null;
    
    for (const form of this.hazardNoticeForms) {
      if (form.workerSignatures && form.workerSignatures.length > 0) {
        const hasWorkerSignature = form.workerSignatures.some((signature: any) => 
          signature.idno === worker.idno || 
          (worker.tel && signature.tel === worker.tel)
        );
        
        if (hasWorkerSignature) {
          targetFormId = form._id;
          break;
        }
      }
    }
    
    // 如果找不到現有表單，使用最新的危害告知表單，或創建新的
    if (!targetFormId && this.hazardNoticeForms.length > 0) {
      // 使用最新的危害告知表單
      const latestForm = this.hazardNoticeForms[this.hazardNoticeForms.length - 1];
      targetFormId = latestForm._id;
    }
    
    if (targetFormId) {
      // 跳轉到危害告知表單
      this.router.navigate(['/site', this.siteId, 'hazardNotice', targetFormId], {
        queryParams: { workerId: worker._id }
      });
    } else {
      // 如果沒有任何危害告知表單，跳轉到創建新表單頁面
      this.router.navigate(['/site', this.siteId, 'hazardNotice', 'create'], {
        queryParams: { workerId: worker._id }
      });
    }
  }
  
  // 跳轉到教育訓練頁面
  goToTraining(worker: Worker) {
    if (!this.siteId) return;

    // 跳轉到教育訓練列表頁面，並帶上工人姓名作為搜尋參數
    this.router.navigate(['/site', this.siteId, 'training'], {
      queryParams: { search: worker.name }
    });
  }
  
  formatGender(gender: string): string {
    if (gender === 'male') {
      return '男';
    } else if (gender === 'female') {
      return '女';
    } else if (gender === 'other') {
      return '其他';
    } else {
      return gender;
    }
  }

  // 工作人員選取相關方法
  toggleWorkerSelection(worker: Worker) {
    if (!worker._id) return;
    
    if (this.selectedWorkers.has(worker._id)) {
      this.selectedWorkers.delete(worker._id);
    } else {
      this.selectedWorkers.add(worker._id);
    }
  }

  isWorkerSelected(worker: Worker): boolean {
    return worker._id ? this.selectedWorkers.has(worker._id) : false;
  }

  clearAllSelections() {
    this.selectedWorkers.clear();
  }

  get hasSelectedWorkers(): boolean {
    return this.selectedWorkers.size > 0;
  }

  getSelectedWorkersCount(): number {
    return this.selectedWorkers.size;
  }

  // 標纖印表功能
  printWorkerLabels() {
    if (this.selectedWorkers.size === 0) return;

    const selectedWorkersData = this.siteWorkers.filter(worker => 
      worker._id && this.selectedWorkers.has(worker._id)
    );

    this.openPrintWindow(selectedWorkersData);
  }

  private openPrintWindow(workers: Worker[]) {
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      alert('無法開啟印表視窗，請檢查瀏覽器設定');
      return;
    }

    const printContent = this.generatePrintContent(workers);
    
    printWindow.document.write(printContent);
    printWindow.document.close();
    
    // 等待內容載入完成後自動印表
    printWindow.onload = () => {
      setTimeout(() => {
        printWindow.print();
      }, 500);
    };
  }

  private generatePrintContent(workers: Worker[]): string {
    const siteName = this.site()?.projectName || '工地名稱';
    
    let html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>工作人員標纖 - ${siteName}</title>
        <style>
          @page {
            size: A4;
            margin: 20mm;
          }
          
          body {
            font-family: 'Microsoft JhengHei', sans-serif;
            font-size: 12px;
            line-height: 1.4;
            margin: 0;
            padding: 0;
          }
          
          .worker-label {
            width: 100%;
            /* border: 2px solid #000; */
            margin-bottom: 20px;
            page-break-after: always;
            page-break-inside: avoid;
          }
          
          .worker-label:last-child {
            page-break-after: auto;
          }
          
          .header {
            text-align: center;
            font-size: 18px;
            font-weight: bold;
            padding: 10px;
            background-color: #f0f0f0;
            /* border-bottom: 2px solid #000; */
          }
          
          .worker-info {
            padding: 15px;
          }
          
          .info-table {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 15px;
          }
          
          .info-table td {
            border: 1px solid #000;
            padding: 8px;
            vertical-align: top;
          }
          
          .info-table .label {
            background-color: #f8f8f8;
            font-weight: bold;
            width: 25%;
            text-align: center;
          }
          
          .info-table .value {
            width: 25%;
          }
          
          .mic-section {
            margin-top: 20px;
            border: 1px solid #000;
          }
          
          .mic-header {
            background-color: #f0f0f0;
            text-align: right;
            font-weight: bold;
            padding: 8px;
            /* border-bottom: 1px solid #000; */
          }
          
          .mic-content {
            padding: 10px;
          }
          
          .mic-table {
            width: 100%;
            border-collapse: collapse;
          }
          
          .mic-table td, .mic-table th {
            border: 1px solid #000;
            padding: 5px;
            text-align: center;
            vertical-align: middle;
          }
          
                     .mic-table .field-label {
             background-color: #f8f8f8;
             font-weight: bold;
             width: 120px;
           }

           .mic-table .value {
            font-size: 1.3rem;
           }
           
           .photo-cell {
             height: 60px;
             width: 80px;
           }
           
           .training-cell {
             height: 80px;
           }
           
           .certification-images {
             display: flex;
             flex-wrap: wrap;
             align-items: center;
             justify-content: center;
             padding: 5px;
             min-height: 40px;
           }
           
           .certification-images img {
             width: 72px !important;
             height: 72px !important;
             margin: 2px !important;
             border-radius: 3px !important;
             border: 1px solid #ccc;
           }
           
           .date-section {
             margin-top: 10px;
             text-align: right;
           }
          
          @media print {
            body {
              -webkit-print-color-adjust: exact;
              print-color-adjust: exact;
            }
          }
        </style>
      </head>
      <body>
    `;

    workers.forEach((worker, index) => {
      html += this.generateWorkerLabelHTML(worker, siteName);
    });

    html += `
      </body>
      </html>
    `;

    return html;
  }

  private generateWorkerLabelHTML(worker: Worker, siteName: string): string {
    const age = this.calculateAge(worker.birthday || '');
    const gender = this.formatGender(worker.gender);
    const fromMonth = (dayjs().year() - 1911) + '年' + (dayjs().month() + 1) + '月';
    const toMonth = (dayjs().year() + 1 - 1911) + '年' + (dayjs().month() + 1) + '月';

    return `
      <div class="worker-label">
        <!-- <div class="header">工作人員標纖 - ${siteName}</div> -->
        <div class="worker-info">
                    
          <div class="mic-section">
            <div class="mic-header">MIC核發人：${this.currentUser()?.name}</div>
            <div class="mic-content">
              <table class="mic-table">
                <tr>
                  <td class="field-label">廠商名稱</td>
                  <td class="value">${worker.contractingCompanyName || ''}</td>
                  <td class="field-label">姓名</td>
                  <td class="value">${worker.name || ''}</td>
                </tr>
                <tr>
                  <td class="field-label">血型</td>
                  <td class="value">${worker.bloodType || ''}</td>
                  <td class="field-label">背心編號</td>
                  <td class="value">${worker.supplierIndustrialSafetyNumber || ''}</td>
                </tr>
                <tr>
                  <td class="field-label">緊急聯絡人</td>
                  <td class="value">${worker.liaison || ''}</td>
                  <td class="field-label">電話</td>
                  <td class="value">${worker.emergencyTel || ''}</td>
                </tr>
                <tr style="height: 100px;">
                  <td class="field-label">證照</td>
                  <td colspan="3">${this.getWorkerCertificationImages(worker)}</td>
                </tr>
                <tr style="height: 100px;">
                  <td class="field-label">教育訓練<br/>及危害告知</td>
                  <td colspan="3">${this.getWorkerTrainingAndHazardImages(worker)}</td>
                </tr>
              </table>
              <div class="date-section" title="一年內有效">
                自民國 ${fromMonth} 至民國 ${toMonth} 有效
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  // 獲取證照對應的圖片檔案名稱
  private getCertificationImageFileName(certificationType: string): string {
    const certificationImageMap: { [key: string]: string } = {
      'a': '高空工作車操作人員.png',
      'fr': '急救人員.png',
      'o2': '缺氧作業主管.png',
      'os': '有機溶劑作業主管.png',
      'sa': '施工架組配作業主管.png',
      'sc': '特化.png',
      'dw': '粉塵.png',
      'ow': '氧乙炔.png',
      'r': '屋頂作業.png',
      'ssa': '鋼構組配作業主管.png',
      'fs': '模板支撐作業主管.png',
      'pe': '露天開挖.png',
      'rs': '擋土支撐作業主管.png',
      'bosh': '工安人員.png',
      'aos': '工安人員.png',
      'aoh': '工安人員.png',
      's': '工安人員.png',
      'ma': '工安人員.png',
      // 其他常見證照
      'forklift': '堆高機操作人員.png',
      'crane_commander': '吊掛指揮手.png',
      'crane_operator': '吊掛人員.png',
      'fire_watch': '監火人員.png',
      'hazard_notice': '已進行危害告知.png',
      'six_hour': '六小時.png'  // 六小時安全衛生教育訓練
    };
    
    return certificationImageMap[certificationType] || '';
  }

  // 獲取工作人員的證照圖片HTML
  private getWorkerCertificationImages(worker: Worker): string {
    if (!worker.certifications || worker.certifications.length === 0) {
      return '<div class="certification-images"><span class="text-muted">無證照</span></div>';
    }

    const imageElements = worker.certifications
      .map(cert => {
        const imageName = this.getCertificationImageFileName(cert.type);
        if (imageName) {
          const certificationName = CertificationTypeManager.getName(cert.type);
          return `<div style="display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 5px;">
          <img src="/certificate/${imageName}" alt="${certificationName}" title="${certificationName}">
          <span style="font-size: 10px; text-align: center;">${certificationName}</span>
          </div>`;
        }
        return '';
      })
      .filter(img => img !== '')
      .join('');

    if (imageElements) {
      return `<div class="certification-images">${imageElements}</div>`;
    } else {
      return '<div class="certification-images"><span class="text-muted">無對應圖示</span></div>';
    }
  }

  // 獲取工作人員的教育訓練及危害告知圖片HTML
  private getWorkerTrainingAndHazardImages(worker: Worker): string {
    const imageElements: string[] = [];

    // 檢查是否有教育訓練
    if (this.hasTraining(worker)) {
      imageElements.push(`<div style="display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 5px;">
        <img src="/certificate/六小時.png" alt="教育訓練" title="教育訓練">
        <span style="font-size: 10px; text-align: center;">教育訓練</span>
      </div>`);
    }

    // 檢查六小時安全衛生教育訓練是否未到期
    if (worker.generalSafetyTrainingDueDate && dayjs().isBefore(dayjs(worker.generalSafetyTrainingDueDate))) {
      imageElements.push(`<div style="display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 5px;">
        <img src="/certificate/六小時.png" alt="六小時安全訓練" title="六小時安全訓練">
        <span style="font-size: 10px; text-align: center;">六小時</span>
      </div>`);
    }

    // 檢查是否有危害告知
    if (this.hasHazardNotice(worker)) {
      imageElements.push(`<div style="display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 5px;">
        <img src="/certificate/已進行危害告知.png" alt="危害告知" title="危害告知">
        <span style="font-size: 10px; text-align: center;">危害告知</span>
      </div>`);
    }

    if (imageElements.length > 0) {
      return `<div class="certification-images">${imageElements.join('')}</div>`;
    } else {
      return '<div class="certification-images"><span class="text-muted">未完成</span></div>';
    }
  }

  // 壓縮圖片功能
  private compressImage(file: File, maxWidth: number = 1200, quality: number = 0.8): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (event) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          let width = img.width;
          let height = img.height;

          // 計算新尺寸，保持比例
          if (width > maxWidth) {
            height = Math.round((height * maxWidth) / width);
            width = maxWidth;
          }

          canvas.width = width;
          canvas.height = height;

          const ctx = canvas.getContext('2d');
          if (!ctx) {
            reject(new Error('無法創建 canvas context'));
            return;
          }

          ctx.drawImage(img, 0, 0, width, height);

          // 轉換為壓縮後的 base64
          const compressedDataUrl = canvas.toDataURL('image/jpeg', quality);
          resolve(compressedDataUrl);
        };
        img.onerror = () => reject(new Error('圖片載入失敗'));
        img.src = event.target?.result as string;
      };
      reader.onerror = () => reject(new Error('檔案讀取失敗'));
      reader.readAsDataURL(file);
    });
  }

  // 將 Data URL 轉換為 File 物件
  private async dataUrlToFile(dataUrl: string, filename: string): Promise<File> {
    const response = await fetch(dataUrl);
    const blob = await response.blob();
    // 產生新的檔案名稱（加上時間戳記避免重複）
    const timestamp = Date.now();
    const extension = filename.split('.').pop() || 'jpg';
    const newFilename = `${filename.replace(/\.[^/.]+$/, '')}_${timestamp}.${extension}`;
    return new File([blob], newFilename, { type: blob.type });
  }

  // === 供應商認證匯入相關方法 ===

  openImportSupplierCertModal() {
    this.importPreviewData.set([]);
    this.showImportSupplierCertModal.set(true);
  }

  closeImportSupplierCertModal() {
    this.showImportSupplierCertModal.set(false);
    this.importPreviewData.set([]);
  }

  clearImportData() {
    this.importPreviewData.set([]);
  }

  getMatchedCount(): number {
    return this.importPreviewData().filter(row => row.matched).length;
  }

  getUnmatchedCount(): number {
    return this.importPreviewData().filter(row => !row.matched).length;
  }

  async handleSupplierCertFileUpload(event: Event) {
    const input = event.target as HTMLInputElement;
    if (!input.files || !input.files[0]) return;

    const file = input.files[0];

    try {
      this.isLoading = true;

      const data = await this.readExcelFile(file);
      if (!data || data.length === 0) {
        alert('無法讀取Excel檔案或檔案為空');
        return;
      }

      // 尋找相關欄位
      const headers = Object.keys(data[0]);
      const companyCol = this.findColumn(headers, ['公司名稱', '公司', '廠商名稱', '廠商']);
      const nameCol = this.findColumn(headers, ['姓名', '名字', '人員姓名', '工人姓名']);
      const certCol = this.findColumn(headers, ['工作證號', '證號', '供應商認證', '認證號碼', '背心編號']);

      if (!companyCol) {
        alert('找不到「公司名稱」相關欄位');
        return;
      }
      if (!nameCol) {
        alert('找不到「姓名」相關欄位');
        return;
      }
      if (!certCol) {
        alert('找不到「工作證號」相關欄位');
        return;
      }

      // 處理資料並比對工人
      const previewData: ImportPreviewRow[] = [];

      for (const row of data) {
        const companyName = String(row[companyCol] || '').trim();
        const workerName = String(row[nameCol] || '').trim();
        const certNumber = String(row[certCol] || '').trim();

        if (!workerName || !certNumber) continue;

        // 比對工人 - 優先在工地工人中比對，再到全部工人中比對
        let matchedWorker = this.siteWorkers.find(w =>
          w.name === workerName &&
          (w.contractingCompanyName === companyName || w.viceContractingCompanyName === companyName)
        );

        // 如果工地工人中找不到，也嘗試只用姓名比對
        if (!matchedWorker) {
          matchedWorker = this.siteWorkers.find(w => w.name === workerName);
        }

        previewData.push({
          companyName,
          workerName,
          certNumber,
          matched: !!matchedWorker,
          matchedWorker
        });
      }

      this.importPreviewData.set(previewData);

    } catch (error) {
      console.error('處理Excel檔案時發生錯誤', error);
      alert('處理Excel檔案時發生錯誤');
    } finally {
      this.isLoading = false;
      // 清空 input 以便可以再次選擇相同檔案
      input.value = '';
    }
  }

  private async readExcelFile(file: File): Promise<any[]> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = e.target?.result;
          const workbook = XLSX.read(data, { type: 'array' });
          const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
          const jsonData = XLSX.utils.sheet_to_json(firstSheet);
          resolve(jsonData);
        } catch (error) {
          reject(error);
        }
      };
      reader.onerror = () => reject(new Error('讀取檔案失敗'));
      reader.readAsArrayBuffer(file);
    });
  }

  private findColumn(headers: string[], candidates: string[]): string | null {
    // 先嘗試完全匹配
    for (const candidate of candidates) {
      const found = headers.find(h => h === candidate);
      if (found) return found;
    }
    // 再嘗試包含匹配
    for (const candidate of candidates) {
      const found = headers.find(h => h.includes(candidate));
      if (found) return found;
    }
    return null;
  }

  async confirmImportSupplierCert() {
    const matchedRows = this.importPreviewData().filter(row => row.matched && row.matchedWorker);

    if (matchedRows.length === 0) {
      alert('沒有可匯入的資料');
      return;
    }

    if (!confirm(`確定要更新 ${matchedRows.length} 位工人的供應商認證號碼嗎？`)) {
      return;
    }

    try {
      this.isLoading = true;

      for (const row of matchedRows) {
        if (row.matchedWorker?._id) {
          await this.mongodbService.patch('worker', row.matchedWorker._id, {
            supplierIndustrialSafetyNumber: row.certNumber
          });
        }
      }

      alert(`成功更新 ${matchedRows.length} 位工人的供應商認證號碼`);

      // 重新載入工人資料
      await this.loadSiteWorkers();

      // 關閉 modal
      this.closeImportSupplierCertModal();

    } catch (error) {
      console.error('更新供應商認證時發生錯誤', error);
      alert('更新供應商認證時發生錯誤');
    } finally {
      this.isLoading = false;
    }
  }
}
