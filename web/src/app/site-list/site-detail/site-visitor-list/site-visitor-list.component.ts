import { Component, computed, signal, inject, OnInit, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { QRCodeComponent } from 'angularx-qrcode';
import { Worker } from '../../../model/worker.model';
import { Visitor } from '../../../model/visitor.model';
import { MongodbService } from '../../../services/mongodb.service';
import { CurrentSiteService } from '../../../services/current-site.service';

@Component({
  selector: 'app-site-visitor-list',
  imports: [CommonModule, FormsModule, QRCodeComponent],
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
  visitors = signal<Visitor[]>([]);
  loading = signal<boolean>(false);
  showAddForm = signal<boolean>(false);
  editingVisitorId = signal<string | null>(null);
  editingVisitor = signal<{ idno: string; tel: string }>({ idno: '', tel: '' });
  
  // 危害告知狀態 (現在從 visitor.hazardNoticeCompleted 直接取得)
  // visitorHazardNoticeStatus = signal<Map<string, boolean>>(new Map());
  
  // QR Code modal 相關
  showQRModal = signal<boolean>(false);
  hazardNoticeUrl = computed(() => {
    const currentSite = this.site();
    if (!currentSite?._id) return '';
    const baseUrl = window.location.origin;
    return `${baseUrl}/visitor-hazard-notice/${currentSite._id}`;
  });

  // 新增訪客表單
  newVisitor: Partial<Visitor> = {
    name: '',
    idno: '',
    tel: '',
    hazardNoticeCompleted: false
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

      // 查詢該工地的訪客
      const filter = {
        'siteId': currentSite._id
      };
      
      const visitors = await this.mongodbService.get('visitor', filter) as Visitor[];
      this.visitors.set(visitors);
      
    } catch (error) {
      console.error('載入訪客列表失敗:', error);
    } finally {
      this.loading.set(false);
    }
  }

  // 檢查訪客是否有危害告知
  hasHazardNotice(visitor: Visitor): boolean {
    return visitor.hazardNoticeCompleted || false;
  }

  showAddVisitorForm() {
    // 導航到危害告知頁面供現場簽名（強制新增模式）
    const currentSite = this.site();
    if (currentSite?._id) {
      this.router.navigate(['/visitor-hazard-notice', currentSite._id, 'new']);
    } else {
      alert('工地資訊尚未載入');
    }
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
      hazardNoticeCompleted: false
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

    const existingVisitor = await this.mongodbService.get('visitor', {
      name: visitor.name.trim(),
      siteId: currentSite._id
    });

    if (existingVisitor && existingVisitor.length > 0) {
      alert(`訪客 "${visitor.name.trim()}" 已存在，請勿重複新增`);
      return;
    }

    try {
      this.loading.set(true);
      
      // 設定 visitor 物件
      const newVisitorData: Omit<Visitor, '_id'> = {
        name: visitor.name!.trim(),
        idno: visitor.idno?.trim(),
        tel: visitor.tel?.trim(),
        hazardNoticeCompleted: false,
        siteId: currentSite._id,
        entryDate: new Date(),
        createdAt: new Date(),
        updatedAt: new Date()
      };

      const result = await this.mongodbService.post('visitor', newVisitorData);

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

  async deleteVisitor(visitor: Visitor) {
    if (!confirm(`確定要刪除訪客 ${visitor.name} 嗎？`)) {
      return;
    }

    try {
      this.loading.set(true);
      
      const result = await this.mongodbService.delete('visitor', visitor._id!);

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

  startEditVisitor(visitor: Visitor) {
    this.editingVisitorId.set(visitor._id!);
    this.editingVisitor.set({
      idno: visitor.idno || '',
      tel: visitor.tel || ''
    });
  }

  cancelEditVisitor() {
    this.editingVisitorId.set(null);
    this.editingVisitor.set({ idno: '', tel: '' });
  }

  async saveEditVisitor(visitor: Visitor) {
    const editData = this.editingVisitor();
    if (!editData) return;

    try {
      this.loading.set(true);
      
      const updateData = {
        idno: editData.idno,
        tel: editData.tel,
        updatedAt: new Date()
      };

      const result = await this.mongodbService.patch('visitor', visitor._id!, updateData);

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

  // QR Code modal 相關方法
  showQRCodeModal() {
    this.showQRModal.set(true);
  }

  hideQRCodeModal() {
    this.showQRModal.set(false);
  }

  copyUrl(inputElement: HTMLInputElement) {
    inputElement.select();
    inputElement.setSelectionRange(0, 99999); // For mobile devices
    navigator.clipboard.writeText(inputElement.value).then(() => {
      alert('網址已複製到剪貼簿');
    }).catch(() => {
      // Fallback for older browsers
      document.execCommand('copy');
      alert('網址已複製到剪貼簿');
    });
  }

  // 查看訪客危害告知單
  viewVisitorDetail(visitor: Visitor) {
    const currentSite = this.site();
    if (currentSite?._id && visitor._id) {
      this.router.navigate(['/visitor-hazard-notice', currentSite._id, visitor._id]);
    } else {
      alert('無法查看訪客詳情');
    }
  }
}
