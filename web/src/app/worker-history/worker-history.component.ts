import { Component, OnInit, signal } from '@angular/core';

import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { MongodbService } from '../services/mongodb.service';
import { Worker } from '../model/worker.model';
import dayjs from 'dayjs';

interface HistoryRecord {
  _id: string;
  date: string;
  type: 'hazard_notice' | 'training' | 'toolbox_meeting' | 'site_assignment' | 'form_submission' | 'certification';
  title: string;
  description: string;
  status: 'completed' | 'pending' | 'expired';
  details?: any;
  siteId?: string;
  siteName?: string;
  formId?: string;
}



@Component({
  selector: 'app-worker-history',
  standalone: true,
  imports: [FormsModule, RouterModule],
  templateUrl: './worker-history.component.html',
  styleUrls: ['./worker-history.component.scss']
})
export class WorkerHistoryComponent implements OnInit {
  workerId = signal<string>('');
  worker = signal<Worker | null>(null);
  historyRecords = signal<HistoryRecord[]>([]);
  filteredRecords = signal<HistoryRecord[]>([]);
  isLoading = signal<boolean>(true);
  error = signal<string>('');
  
  // 篩選條件
  selectedType = signal<string>('');
  selectedStatus = signal<string>('');
  selectedDateRange = signal<string>('');
  searchQuery = signal<string>('');

  // 統計數據
  totalRecords = signal<number>(0);
  completedRecords = signal<number>(0);
  pendingRecords = signal<number>(0);

  // 類型和狀態選項
  recordTypes = [
    { value: '', label: '全部類型' },
    { value: 'hazard_notice', label: '危害告知' },
    { value: 'training', label: '教育訓練' },
    { value: 'toolbox_meeting', label: '工具箱會議' },
    { value: 'site_assignment', label: '工地指派' },
    { value: 'form_submission', label: '表單填寫' },
    { value: 'certification', label: '證照更新' }
  ];

  statusOptions = [
    { value: '', label: '全部狀態' },
    { value: 'completed', label: '已完成' },
    { value: 'pending', label: '待處理' },
    { value: 'expired', label: '已過期' }
  ];

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private mongodbService: MongodbService
  ) {}

  async ngOnInit() {
    const id = this.route.snapshot.paramMap.get('id');
    if (id) {
      this.workerId.set(id);
      await this.loadWorkerInfo();
      await this.loadHistoryRecords();
    } else {
      this.error.set('未提供工作人員ID');
      this.isLoading.set(false);
    }
  }

  async loadWorkerInfo() {
    try {
      const worker = await this.mongodbService.getById('worker', this.workerId());
      if (worker) {
        this.worker.set(worker);
      } else {
        throw new Error('找不到工作人員資料');
      }
    } catch (error) {
      console.error('載入工作人員資料失敗:', error);
      this.error.set('載入工作人員資料失敗');
    }
  }

  async loadHistoryRecords() {
    try {
      this.isLoading.set(true);
      
      const worker = this.worker();
      if (!worker) {
        throw new Error('工作人員資料尚未載入');
      }

      const records: HistoryRecord[] = [];

      // 1. 載入危害告知記錄 - 從 siteForm collection 中查找
      const hazardForms = await this.mongodbService.get('siteForm', {
        formType: 'hazardNotice'
      });

      // 查找包含此工作人員簽名的危害告知表單
      for (const form of hazardForms) {
        if (form.workerSignatures && Array.isArray(form.workerSignatures)) {
          const hasWorkerSigned = form.workerSignatures.some((sig: any) => 
            sig.idno === worker.idno || (worker.tel && sig.tel === worker.tel)
          );
          
          if (hasWorkerSigned) {
            // 取得工地資訊
            const site = await this.getSiteInfo(form.siteId);
            
            records.push({
              _id: form._id,
              date: this.findWorkerSignDate(form.workerSignatures, worker) || form.createdAt || form.applyDate,
              type: 'hazard_notice',
              title: '危害告知表單',
              description: `已簽署危害告知表單 - ${site?.projectName || '未知工地'}`,
              status: 'completed',
              details: form,
              siteId: form.siteId,
              siteName: site?.projectName,
              formId: form._id
            });
          }
        }
      }

      // 2. 載入教育訓練記錄 - 從 siteForm collection 中查找
      const trainingForms = await this.mongodbService.get('siteForm', {
        formType: 'training'
      });

      // 查找包含此工作人員簽名的教育訓練表單
      for (const form of trainingForms) {
        if (form.workerSignatures && Array.isArray(form.workerSignatures)) {
          const hasWorkerSigned = form.workerSignatures.some((sig: any) => 
            sig.idno === worker.idno || (worker.tel && sig.tel === worker.tel)
          );
          
          if (hasWorkerSigned) {
            // 取得工地資訊
            const site = await this.getSiteInfo(form.siteId);
            
            records.push({
              _id: form._id,
              date: this.findWorkerSignDate(form.workerSignatures, worker) || form.createdAt || form.applyDate,
              type: 'training',
              title: '教育訓練記錄',
              description: `已完成教育訓練 - ${site?.projectName || '未知工地'}`,
              status: 'completed',
              details: form,
              siteId: form.siteId,
              siteName: site?.projectName,
              formId: form._id
            });
          }
        }
      }

      // 3. 載入工具箱會議記錄 - 從 siteForm collection 中查找
      const toolboxMeetingForms = await this.mongodbService.get('siteForm', {
        formType: 'toolboxMeeting'
      });

      // 查找包含此工作人員簽名的工具箱會議表單
      for (const form of toolboxMeetingForms) {
        if (form.healthWarnings) {
          const allSignatureArrays = [
            form.healthWarnings.attendeeMainContractorSignatures || [],
            form.healthWarnings.attendeeSubcontractor1Signatures || [],
            form.healthWarnings.attendeeSubcontractor2Signatures || [],
            form.healthWarnings.attendeeSubcontractor3Signatures || []
          ];
          
          const hasWorkerSigned = allSignatureArrays.some(signatures => 
            signatures.some((sig: any) => 
              (sig.idno && sig.idno === worker.idno) || 
              (sig.tel && worker.tel && sig.tel === worker.tel)
            )
          );
          
          if (hasWorkerSigned) {
            // 找出工作人員的簽名日期
            let signDate = form.createdAt || form.applyDate;
            for (const signatures of allSignatureArrays) {
              const workerSignature = signatures.find((sig: any) => 
                (sig.idno && sig.idno === worker.idno) || 
                (sig.tel && worker.tel && sig.tel === worker.tel)
              );
              if (workerSignature && workerSignature.signedAt) {
                signDate = workerSignature.signedAt;
                break;
              }
            }
            
            // 取得工地資訊
            const site = await this.getSiteInfo(form.siteId);
            
            records.push({
              _id: form._id,
              date: signDate,
              type: 'toolbox_meeting',
              title: '工具箱會議記錄',
              description: `已參與工具箱會議 - ${site?.projectName || '未知工地'}`,
              status: 'completed',
              details: form,
              siteId: form.siteId,
              siteName: site?.projectName,
              formId: form._id
            });
          }
        }
      }

      // 4. 載入工地指派記錄 - 從工作人員的 belongSites 中取得
      if (worker.belongSites && Array.isArray(worker.belongSites)) {
        for (const siteAssignment of worker.belongSites) {
          const site = await this.getSiteInfo(siteAssignment.siteId);
          
          records.push({
            _id: `assignment_${siteAssignment.siteId}`,
            date: dayjs(siteAssignment.assignDate).toISOString(), // 使用當前日期作為預設值
            type: 'site_assignment',
            title: '工地指派',
            description: `被指派到工地 - ${site?.projectName || '未知工地'}`,
            status: 'completed',
            details: siteAssignment,
            siteId: siteAssignment.siteId,
            siteName: site?.projectName
          });
        }
      }

      // 按日期排序（最新的在前）
      records.sort((a, b) => {
        const dateA = new Date(a.date);
        const dateB = new Date(b.date);
        return dateB.getTime() - dateA.getTime();
      });

      this.historyRecords.set(records);
      this.filteredRecords.set(records);
      this.updateStatistics();
      
    } catch (error) {
      console.error('載入歷史記錄失敗:', error);
      this.error.set('載入歷史記錄失敗');
    } finally {
      this.isLoading.set(false);
    }
  }

  filterRecords() {
    let filtered = [...this.historyRecords()];

    // 按類型篩選
    if (this.selectedType()) {
      filtered = filtered.filter(record => record.type === this.selectedType());
    }

    // 按狀態篩選
    if (this.selectedStatus()) {
      filtered = filtered.filter(record => record.status === this.selectedStatus());
    }

    // 按關鍵字搜尋
    if (this.searchQuery()) {
      const query = this.searchQuery().toLowerCase();
      filtered = filtered.filter(record => 
        record.title.toLowerCase().includes(query) ||
        record.description.toLowerCase().includes(query) ||
        (record.siteName && record.siteName.toLowerCase().includes(query))
      );
    }

    // 按日期範圍篩選
    if (this.selectedDateRange()) {
      const now = new Date();
      let startDate: Date;
      
      switch (this.selectedDateRange()) {
        case '7days':
          startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
          break;
        case '30days':
          startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
          break;
        case '90days':
          startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
          break;
        default:
          startDate = new Date(0);
      }
      
      filtered = filtered.filter(record => new Date(record.date) >= startDate);
    }

    this.filteredRecords.set(filtered);
  }

  updateStatistics() {
    const records = this.historyRecords();
    this.totalRecords.set(records.length);
    this.completedRecords.set(records.filter(r => r.status === 'completed').length);
    this.pendingRecords.set(records.filter(r => r.status === 'pending').length);
  }

  onTypeChange(event: any) {
    this.selectedType.set(event.target.value);
    this.filterRecords();
  }

  onStatusChange(event: any) {
    this.selectedStatus.set(event.target.value);
    this.filterRecords();
  }

  onDateRangeChange(event: any) {
    this.selectedDateRange.set(event.target.value);
    this.filterRecords();
  }

  onSearchChange(event: any) {
    this.searchQuery.set(event.target.value);
    this.filterRecords();
  }

  getTypeLabel(type: string): string {
    const typeOption = this.recordTypes.find(t => t.value === type);
    return typeOption ? typeOption.label : type;
  }

  getStatusBadgeClass(status: string): string {
    switch (status) {
      case 'completed': return 'bg-success';
      case 'pending': return 'bg-warning';
      case 'expired': return 'bg-danger';
      default: return 'bg-secondary';
    }
  }

  getStatusLabel(status: string): string {
    const statusOption = this.statusOptions.find(s => s.value === status);
    return statusOption ? statusOption.label : status;
  }

  getTypeIcon(type: string): string {
    switch (type) {
      case 'hazard_notice': return 'bi-exclamation-triangle-fill';
      case 'training': return 'bi-mortarboard-fill';
      case 'toolbox_meeting': return 'bi-tools';
      case 'site_assignment': return 'bi-geo-alt-fill';
      case 'form_submission': return 'bi-file-earmark-text-fill';
      case 'certification': return 'bi-award-fill';
      default: return 'bi-circle-fill';
    }
  }

  formatDate(dateString: string): string {
    const date = new Date(dateString);
    return date.toLocaleString('zh-TW', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  calculateAge(birthday: string): string {
    if (!birthday) return '未知';
    
    const birthDate = new Date(birthday);
    const today = new Date();
    const age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
      return (age - 1).toString();
    }
    
    return age.toString();
  }

  goToRecord(record: HistoryRecord) {
    if (record.formId && record.siteId) {
      switch (record.type) {
        case 'hazard_notice':
          this.router.navigate(['/site', record.siteId, 'forms', 'hazard-notice', record.formId]);
          break;
        case 'training':
          this.router.navigate(['/site', record.siteId, 'forms', 'training', record.formId]);
          break;
        case 'toolbox_meeting':
          this.router.navigate(['/site', record.siteId, 'forms', 'toolbox-meeting', record.formId]);
          break;
        default:
          break;
      }
    }
  }

  // 輔助方法：取得工地資訊
  private async getSiteInfo(siteId: string) {
    try {
      const site = await this.mongodbService.getById('site', siteId);
      return site;
    } catch (error) {
      console.error('取得工地資訊失敗:', error);
      return null;
    }
  }

  // 輔助方法：找出工作人員的簽名日期
  private findWorkerSignDate(signatures: any[], worker: Worker): string | null {
    const workerSignature = signatures.find((sig: any) => 
      sig.idno === worker.idno || (worker.tel && sig.tel === worker.tel)
    );
    return workerSignature?.signDate || null;
  }

  goBack() {
    window.history.back();
  }
} 