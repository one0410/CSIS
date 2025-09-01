import { Component, OnInit, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule, ActivatedRoute, Router } from '@angular/router';
import { CurrentSiteService } from '../../../services/current-site.service';
import { Equipment } from '../../../model/equipment.model';
import { MongodbService } from '../../../services/mongodb.service';

@Component({
  selector: 'app-site-equipment',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  templateUrl: './site-equipment.component.html',
  styleUrl: './site-equipment.component.scss',
})
export class SiteEquipmentComponent implements OnInit {
  siteId: string | null = null;
  isLoading = signal(true);
  equipmentList = signal<Equipment[]>([]);
  
  // 計算不合格設備的數量
  disqualifiedCount = computed(() => {
    return this.equipmentList().filter(equipment => 
      equipment.isQualified === false && equipment.inspectionDate !== undefined
    ).length;
  });

  // 計算即將到期和已過期的檢查數量
  expiringCount = computed(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const threeDaysLater = new Date(today);
    threeDaysLater.setDate(today.getDate() + 3);
    
    return this.equipmentList().filter(equipment => {
      const nextInspectionDate = this.getNextInspectionDate(equipment);
      if (!nextInspectionDate) return false;
      
      const nextDate = new Date(nextInspectionDate);
      nextDate.setHours(0, 0, 0, 0);
      
      // 包含已過期和即將到期（3天內）的檢查
      return nextDate <= threeDaysLater;
    }).length;
  });

  // 計算下次檢查日期（如果沒有設定但有意義的檢查類型，則自動計算）
  getNextInspectionDate(equipment: Equipment): Date | null {
    // 如果有設定具體的下次檢查日期，直接返回
    if (equipment.nextInspectionDate) {
      return equipment.nextInspectionDate;
    }
    
    // 如果有檢查日期和檢查類型，且不是自定義類型，則自動計算
    if (equipment.inspectionDate && equipment.nextInspectionType && equipment.nextInspectionType !== 'custom') {
      const baseDate = new Date(equipment.inspectionDate);
      let nextDate: Date;

      switch (equipment.nextInspectionType) {
        case 'weekly':
          nextDate = new Date(baseDate.getTime() + 7 * 24 * 60 * 60 * 1000);
          break;
        case 'monthly':
          nextDate = new Date(baseDate.getFullYear(), baseDate.getMonth() + 1, baseDate.getDate());
          break;
        case 'quarterly':
          nextDate = new Date(baseDate.getFullYear(), baseDate.getMonth() + 3, baseDate.getDate());
          break;
        case 'biannual':
          nextDate = new Date(baseDate.getFullYear(), baseDate.getMonth() + 6, baseDate.getDate());
          break;
        case 'yearly':
          nextDate = new Date(baseDate.getFullYear() + 1, baseDate.getMonth(), baseDate.getDate());
          break;
        default:
          return null;
      }

      return nextDate;
    }

    // 如果是自定義類型但沒有設定具體日期，返回 null
    if (equipment.nextInspectionType === 'custom' && !equipment.nextInspectionDate) {
      return null;
    }

    return null;
  }

  // 檢查是否即將到期（3天內）或已過期
  isInspectionExpiringSoon(equipment: Equipment): boolean {
    const nextInspectionDate = this.getNextInspectionDate(equipment);
    if (!nextInspectionDate) return false;
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const threeDaysLater = new Date(today);
    threeDaysLater.setDate(today.getDate() + 3);
    
    const nextDate = new Date(nextInspectionDate);
    nextDate.setHours(0, 0, 0, 0);
    
    // 包含已過期和即將到期（3天內）的檢查
    return nextDate <= threeDaysLater;
  }

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private currentSiteService: CurrentSiteService,
    private mongodbService: MongodbService
  ) {}

  async ngOnInit() {
    this.route.parent?.paramMap.subscribe((params) => {
      this.siteId = params.get('id');
      if (this.siteId) {
        this.loadEquipmentList();
      }
    });
  }

  async loadEquipmentList() {
    this.isLoading.set(true);
    try {
      if (!this.siteId) return;

      const data = await this.mongodbService.getArray('equipment', {
        siteId: this.siteId,
      });
      this.equipmentList.set(data);
      
      // 同時更新 CurrentSiteService 中的機具列表
      await this.currentSiteService.refreshEquipmentList();
    } catch (error) {
      console.error('Error loading equipment list', error);
    } finally {
      this.isLoading.set(false);
    }
  }

  toggleAddForm() {
    // 跳轉到新增設備頁面
    this.router.navigate(['/site', this.siteId, 'equipment', 'new']);
  }

  navigateToDetail(equipmentId: string) {
    this.router.navigate(['/site', this.siteId, 'equipment', equipmentId]);
  }

  async deleteEquipment(equipment: Equipment, event: Event) {
    event.stopPropagation();
    if (!confirm('確定要刪除 ' + equipment.name + ' 此設備？')) return;

    try {
      const response = await this.mongodbService.delete('equipment', equipment._id!);

      if (response) {
        this.equipmentList.update((list) =>
          list.filter((item) => item._id !== equipment._id)
        );
        
        // 發送 WebSocket 事件並更新機具列表
        await this.currentSiteService.onEquipmentDeleted(equipment._id!, this.siteId!);
      } else {
        console.error('Failed to delete equipment');
      }
    } catch (error) {
      console.error('Error deleting equipment', error);
    }
  }



  getNextInspectionTypeText(type?: 'weekly' | 'monthly' | 'quarterly' | 'biannual' | 'yearly' | 'custom'): string {
    switch (type) {
      case 'weekly': return '每週';
      case 'monthly': return '每月';
      case 'quarterly': return '每季';
      case 'biannual': return '每半年';
      case 'yearly': return '每年';
      case 'custom': return '自定義日期';
      default: return '未設定';
    }
  }
}
