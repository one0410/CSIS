import { Component, computed, OnInit } from '@angular/core';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';

import { MongodbService } from '../../../services/mongodb.service';
import { Worker } from '../../../model/worker.model';
import { CurrentSiteService } from '../../../services/current-site.service';

@Component({
  selector: 'app-site-worker-list',
  standalone: true,
  imports: [FormsModule, RouterModule],
  templateUrl: './site-worker-list.component.html',
  styleUrls: ['./site-worker-list.component.scss']
})
export class SiteWorkerListComponent implements OnInit {
  siteId: string | null = null;
  site = computed(() => this.currentSiteService.currentSite());
  
  // 工作人員資料
  isLoading = false;
  siteWorkers: Worker[] = [];
  filteredSiteWorkers: Worker[] = [];
  allWorkers: Worker[] = [];
  
  // 危害告知狀態
  workerHazardNoticeStatus: Map<string, boolean> = new Map();
  hazardNoticeForms: any[] = [];
  
  // 教育訓練狀態
  workerTrainingStatus: Map<string, boolean> = new Map();
  trainingForms: any[] = [];
  
  // 搜尋相關
  searchQuery = '';
  searchResults: Worker[] = [];
  searchPerformed = false;
  
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

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private mongodbService: MongodbService,
    private currentSiteService: CurrentSiteService
  ) {}

  async ngOnInit() {
    this.route.parent?.paramMap.subscribe(params => {
      this.siteId = params.get('id');
      this.loadSiteData();
    });
    
    await this.loadAllWorkers();
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
      console.error('載入工地資料時發生錯誤', error);
    } finally {
      this.isLoading = false;
    }
  }

  async loadSiteWorkers() {
    if (!this.siteId) return;
    
    try {
      // 獲取工地工作人員, 找出belongSites包含this.siteId的工人
      const siteWorkers = await this.mongodbService.get('worker', { belongSites: { $elemMatch: { siteId: this.siteId } } });
      
      if (siteWorkers && siteWorkers.length > 0) {
        this.siteWorkers = siteWorkers;
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
      this.hazardNoticeForms = await this.mongodbService.get('siteForm', {
        siteId: this.siteId,
        formType: 'hazardNotice'
      });
      
      // 收集所有已簽名的工人身份證號碼或電話號碼
      const signedWorkerIds = new Set<string>();
      
      this.hazardNoticeForms.forEach((form: any) => {
        if (form.workerSignatures && form.workerSignatures.length > 0) {
          form.workerSignatures.forEach((signature: any) => {
            if (signature.idno) {
              signedWorkerIds.add(signature.idno);
            }
            if (signature.tel) {
              signedWorkerIds.add(signature.tel);
            }
          });
        }
      });
      
      // 為每個工人設定危害告知狀態
      this.siteWorkers.forEach(worker => {
                const hasHazardNotice = signedWorkerIds.has(worker.idno) ||                                (worker.tel ? signedWorkerIds.has(worker.tel) : false);
        this.workerHazardNoticeStatus.set(worker._id!, hasHazardNotice);
      });
      
    } catch (error) {
      console.error('載入工人危害告知狀態時發生錯誤', error);
    }
  }

  // 檢查工人是否有危害告知
  hasHazardNotice(worker: Worker): boolean {
    return this.workerHazardNoticeStatus.get(worker._id!) || false;
  }

  // 從教育訓練表單中查詢工人簽名狀態
  async loadWorkerTrainingStatus() {
    if (!this.siteId) return;
    
    try {
      // 清空之前的狀態
      this.workerTrainingStatus.clear();
      
      // 獲取該工地的所有教育訓練表單
      this.trainingForms = await this.mongodbService.get('siteForm', {
        siteId: this.siteId,
        formType: 'training'
      });
      
      // 收集所有已簽名的工人身份證號碼或電話號碼
      const signedWorkerIds = new Set<string>();
      
      this.trainingForms.forEach((form: any) => {
        if (form.workerSignatures && form.workerSignatures.length > 0) {
          form.workerSignatures.forEach((signature: any) => {
            if (signature.idno) {
              signedWorkerIds.add(signature.idno);
            }
            if (signature.tel) {
              signedWorkerIds.add(signature.tel);
            }
          });
        }
      });
      
      // 為每個工人設定教育訓練狀態
      this.siteWorkers.forEach(worker => {
        const hasTraining = signedWorkerIds.has(worker.idno) ||
                           (worker.tel ? signedWorkerIds.has(worker.tel) : false);
        this.workerTrainingStatus.set(worker._id!, hasTraining);
      });
      
    } catch (error) {
      console.error('載入工人教育訓練狀態時發生錯誤', error);
    }
  }

  // 檢查工人是否有教育訓練
  hasTraining(worker: Worker): boolean {
    return this.workerTrainingStatus.get(worker._id!) || false;
  }

  async loadAllWorkers() {
    try {
      this.allWorkers = await this.mongodbService.get('worker', {});
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

  searchWorkers() {
    this.searchPerformed = true;
    
    if (!this.searchQuery.trim()) {
      this.searchResults = [];
      return;
    }
    
    const query = this.searchQuery.toLowerCase();
    
    // 過濾已經在工地工作人員中的人員
    const siteWorkerIds = this.siteWorkers.map(worker => worker._id);
    
    this.searchResults = this.allWorkers.filter(worker => 
      (worker.name?.toLowerCase().includes(query) || 
       worker.idno?.toLowerCase().includes(query) || 
       worker.contractingCompanyName?.toLowerCase().includes(query)) && 
      !siteWorkerIds.includes(worker._id)
    );
  }

  async addWorkerToSite(worker: Worker) {
    if (!this.siteId || !worker._id) return;
    
    try {
      this.isLoading = true;
      
      // 創建工地工作人員關聯
      worker.belongSites = [...(worker.belongSites || []), { siteId: this.siteId, assignDate: new Date() }];
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

  getPageNumbers(): number[] {
    const pages: number[] = [];
    for (let i = 1; i <= this.totalPages; i++) {
      pages.push(i);
    }
    return pages;
  }

  goToPage(page: number) {
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

  getSelectedWorkersCount(): number {
    return this.filteredModalWorkers.filter(worker => worker.selected).length;
  }

  async addSelectedWorkers() {
    const selectedWorkers = this.filteredModalWorkers.filter(worker => worker.selected);
    
    if (selectedWorkers.length === 0 || !this.siteId) return;
    
    try {
      this.isLoading = true;
      
      // 批次添加工作人員
      for (const worker of selectedWorkers) {
        if (worker._id) {
          worker.belongSites = [...(worker.belongSites || []), { siteId: this.siteId, assignDate: new Date() }];
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
      this.router.navigate(['/site', this.siteId, 'forms', 'hazard-notice', targetFormId], {
        queryParams: { workerId: worker._id }
      });
    } else {
      // 如果沒有任何危害告知表單，跳轉到創建新表單頁面
      this.router.navigate(['/site', this.siteId, 'forms', 'create-hazard-notice'], {
        queryParams: { workerId: worker._id }
      });
    }
  }
  
  // 跳轉到教育訓練頁面
  goToTraining(worker: Worker) {
    if (!this.siteId) return;
    
    // 尋找包含此工人簽名的表單
    let targetFormId: string | null = null;
    
    for (const form of this.trainingForms) {
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
    
    // 如果找不到現有表單，使用最新的教育訓練表單，或創建新的
    if (!targetFormId && this.trainingForms.length > 0) {
      // 使用最新的教育訓練表單
      const latestForm = this.trainingForms[this.trainingForms.length - 1];
      targetFormId = latestForm._id;
    }
    
    if (targetFormId) {
      // 跳轉到教育訓練表單
      this.router.navigate(['/site', this.siteId, 'forms', 'training', targetFormId], {
        queryParams: { workerId: worker._id }
      });
    } else {
      // 如果沒有任何教育訓練表單，跳轉到創建新表單頁面
      this.router.navigate(['/site', this.siteId, 'forms', 'create-training'], {
        queryParams: { workerId: worker._id }
      });
    }
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
}
