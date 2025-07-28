import { Component, OnInit, inject, signal, computed, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AccidentService } from '../../../services/accident.service';
import { CurrentSiteService } from '../../../services/current-site.service';

@Component({
  selector: 'app-zero-accident-hours',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './zero-accident-hours.component.html',
  styleUrls: ['./zero-accident-hours.component.scss']
})
export class ZeroAccidentHoursComponent implements OnInit {
  private accidentService = inject(AccidentService);
  private currentSiteService = inject(CurrentSiteService);
  
  // 使用 computed 獲取當前工地和工地ID
  currentSite = computed(() => this.currentSiteService.currentSite());
  siteId = computed(() => this.currentSite()?._id || '');
  
  zeroAccidentHours = signal(0);
  lastAccidentDate = signal<Date | null>(null);
  loading = signal(false);

  constructor() {
    // 使用 effect 監聽工地ID變化，自動重新計算
    effect(() => {
      const currentSiteId = this.siteId();
      if (currentSiteId) {
        console.log('🔄 ZeroAccidentHours: 工地變化，重新計算零事故時數', currentSiteId);
        this.calculateZeroAccidentHours();
      } else {
        // 沒有工地時清空資料
        this.zeroAccidentHours.set(0);
        this.lastAccidentDate.set(null);
      }
    });
  }

  ngOnInit() {
    // ngOnInit 中不需要手動調用，effect 會自動處理
  }

  async calculateZeroAccidentHours(): Promise<void> {
    const currentSiteId = this.siteId();
    if (!currentSiteId) {
      console.warn('⚠️ ZeroAccidentHours: 沒有當前工地ID');
      return;
    }
    
    try {
      this.loading.set(true);
      console.log('🏗️ ZeroAccidentHours: 計算零事故時數...');
      
      // 使用優化後的方法，一次性獲取零事故時數和最後事故記錄
      const result = await this.accidentService.getZeroAccidentHoursWithLastAccident(currentSiteId);
      
      this.zeroAccidentHours.set(result.zeroAccidentHours);
      this.lastAccidentDate.set(result.lastAccidentDate);
      
      console.log('✅ ZeroAccidentHours: 零事故時數 =', result.zeroAccidentHours, '小時');
      console.log('📅 ZeroAccidentHours: 最後事故時間:', result.lastAccidentDate?.toLocaleString() || '無');
      
    } catch (error) {
      console.error('計算工安零事故時數時出錯:', error);
      this.zeroAccidentHours.set(0);
      this.lastAccidentDate.set(null);
    } finally {
      this.loading.set(false);
    }
  }
} 