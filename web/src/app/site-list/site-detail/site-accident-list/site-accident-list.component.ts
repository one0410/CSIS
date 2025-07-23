import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { AccidentService } from '../../../services/accident.service';
import { Accident } from '../../../model/accident.model';

@Component({
  selector: 'app-site-accident-list',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './site-accident-list.component.html',
  styleUrls: ['./site-accident-list.component.scss']
})
export class SiteAccidentListComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private accidentService = inject(AccidentService);

  // 狀態管理
  loading = signal(false);
  showModal = signal(false);
  siteId = signal('');
  accidents = signal<Accident[]>([]);
  editingAccident = signal<Accident>({} as Accident);
  accidentDateStr = '';

  // 計算屬性
  isEditing = computed(() => !!this.editingAccident()._id);

  ngOnInit() {
    // 從父路由獲取工地ID - 與其他子組件保持一致
    this.route.parent?.paramMap.subscribe(params => {
      const id = params.get('id');
      if (id) {
        this.siteId.set(id);
        this.loadAccidents();
      }
    });
  }

  async loadAccidents() {
    try {
      this.loading.set(true);
      const accidents = await this.accidentService.getAccidentsBySite(this.siteId());
      // 按日期時間倒序排列
      const sortedAccidents = accidents.sort((a, b) => {
        const dateTimeA = new Date(`${a.incidentDate}T${a.incidentTime}:00`).getTime();
        const dateTimeB = new Date(`${b.incidentDate}T${b.incidentTime}:00`).getTime();
        return dateTimeB - dateTimeA;
      });
      this.accidents.set(sortedAccidents);
    } catch (error) {
      console.error('載入工安事故資料失敗:', error);
      alert('載入工安事故資料失敗，請稍後再試');
    } finally {
      this.loading.set(false);
    }
  }

  showAddAccidentModal() {
    const now = new Date();
    const today = now.toISOString().split('T')[0];
    const currentTime = now.toTimeString().slice(0, 5);
    
    this.editingAccident.set({
      title: '',
      description: '',
      incidentDate: new Date(today),
      incidentTime: currentTime,
      reporterName: '',
      reporterTitle: '',
      reporterPhone: '',
      severity: 'minor',
      category: 'other',
      status: 'reported',
      siteId: this.siteId(),
      location: '',
      witnessCount: 0,
      injuredCount: 0,
      notes: ''
    } as Accident);
    
    this.accidentDateStr = today;
    this.showModal.set(true);
  }

  editAccident(accident: Accident) {
    this.editingAccident.set({ ...accident });
    // 轉換日期格式給input[type="date"]使用
    this.accidentDateStr = new Date(accident.incidentDate).toISOString().split('T')[0];
    this.showModal.set(true);
  }

  hideModal() {
    this.showModal.set(false);
    this.editingAccident.set({} as Accident);
    this.accidentDateStr = '';
  }

  isFormValid(): boolean {
    const accident = this.editingAccident();
    return !!(
      accident.description?.trim() &&
      accident.reporterName?.trim() &&
      accident.incidentTime?.trim() &&
      this.accidentDateStr &&
      accident.severity &&
      accident.category
    );
  }

  async saveAccident() {
    if (!this.isFormValid()) {
      alert('請填寫所有必填欄位');
      return;
    }

    try {
      this.loading.set(true);
      
      const accident = this.editingAccident();
      accident.incidentDate = new Date(this.accidentDateStr);
      
      if (accident._id) {
        await this.accidentService.updateAccident(accident._id, accident);
        alert('事故記錄更新成功');
      } else {
        await this.accidentService.createAccident(accident);
        alert('事故回報成功');
      }

      this.hideModal();
      await this.loadAccidents();
    } catch (error) {
      console.error('儲存事故資料失敗:', error);
      alert('儲存事故資料失敗，請稍後再試');
    } finally {
      this.loading.set(false);
    }
  }

  async deleteAccident(accident: Accident) {
    if (!confirm(`確定要刪除「${accident.description.substring(0, 30)}...」這筆事故記錄嗎？`)) {
      return;
    }

    try {
      this.loading.set(true);
      await this.accidentService.deleteAccident(accident._id!);
      alert('事故記錄刪除成功');
      await this.loadAccidents();
    } catch (error) {
      console.error('刪除事故資料失敗:', error);
      alert('刪除事故資料失敗，請稍後再試');
    } finally {
      this.loading.set(false);
    }
  }

  viewAccidentDetail(accident: Accident) {
    // 可以實作詳細檢視modal或跳轉到詳細頁面
    alert(`事故詳細資訊：\n\n日期時間：${new Date(accident.incidentDate).toLocaleDateString()} ${accident.incidentTime}\n事故內容：${accident.description}\n回報人員：${accident.reporterName}\n嚴重程度：${this.getSeverityText(accident.severity)}\n處理狀態：${this.getStatusText(accident.status)}`);
  }

  private getSeverityText(severity: string): string {
    const severityMap: { [key: string]: string } = {
      'minor': '輕微',
      'moderate': '中等',
      'serious': '嚴重',
      'critical': '危急'
    };
    return severityMap[severity] || severity;
  }

  private getStatusText(status: string): string {
    const statusMap: { [key: string]: string } = {
      'reported': '已回報',
      'investigating': '調查中',
      'resolved': '已解決',
      'closed': '已結案'
    };
    return statusMap[status] || status;
  }
} 