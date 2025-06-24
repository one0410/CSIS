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

      const data = await this.mongodbService.get('equipment', {
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
      const response = await fetch(`/api/mongodb/equipment/${equipment._id}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        this.equipmentList.update((list) =>
          list.filter((item) => item._id !== equipment._id)
        );
        
        // 發送 WebSocket 事件並更新機具列表
        await this.currentSiteService.onEquipmentDeleted(equipment._id!, this.siteId!);
      } else {
        console.error('Failed to delete equipment', await response.text());
      }
    } catch (error) {
      console.error('Error deleting equipment', error);
    }
  }
}
