import { Component, Input, OnInit, OnChanges, OnDestroy, computed, signal, inject, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MongodbService } from '../../../../services/mongodb.service';
import { CurrentSiteService } from '../../../../services/current-site.service';
import { GridFSService } from '../../../../services/gridfs.service';
import { PhotoService } from '../../../../services/photo.service';
import dayjs from 'dayjs';

interface ImprovementPhoto {
  issueId: string;
  issueDescription: string;
  responsibleUnit: string;
  issueDate: string;
  beforePhotos: PhotoInfo[];
  afterPhotos: PhotoInfo[];
  status: 'improved' | 'pending';
}

interface PhotoInfo {
  filename: string;
  url: string;
  uploadDate: string;
  title: string;
}

@Component({
  selector: 'app-weekly-improvement-photos',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="card h-100">
      <div class="card-header">
        <h6 class="mb-0">
          <i class="fas fa-camera me-2"></i>缺失改善照片
        </h6>
        <small class="text-muted">{{ getWeekRangeDisplay() }}</small>
      </div>
      <div class="card-body">
        @if (isLoading()) {
          <div class="text-center">
            <div class="spinner-border spinner-border-sm text-primary" role="status">
              <span class="visually-hidden">載入中...</span>
            </div>
          </div>
        } @else {
          <!-- 統計概覽 -->
          <div class="mb-3">
            <div class="row text-center">
              <div class="col-4">
                <div class="stat-item">
                  <h5 class="text-primary mb-0">{{ getTotalIssues() }}</h5>
                  <small class="text-muted">總缺失</small>
                </div>
              </div>
              <div class="col-4">
                <div class="stat-item">
                  <h5 class="text-success mb-0">{{ getImprovedCount() }}</h5>
                  <small class="text-muted">已改善</small>
                </div>
              </div>
              <div class="col-4">
                <div class="stat-item">
                  <h5 class="text-warning mb-0">{{ getPendingCount() }}</h5>
                  <small class="text-muted">改善中</small>
                </div>
              </div>
            </div>
          </div>

          @if (improvementPhotos().length > 0) {
            <div class="improvement-photos">
              @for (item of improvementPhotos(); track item.issueId) {
                <div class="improvement-item mb-4 p-3 border rounded">
                  <!-- 缺失資訊 -->
                  <div class="mb-3">
                    <div class="d-flex justify-content-between align-items-start">
                      <div>
                        <h6 class="mb-1">{{ item.issueDescription }}</h6>
                        <div class="d-flex gap-2 flex-wrap">
                          <small class="text-muted">
                            <i class="fas fa-building me-1"></i>{{ item.responsibleUnit }}
                          </small>
                          <small class="text-muted">
                            <i class="fas fa-calendar me-1"></i>{{ formatDate(item.issueDate) }}
                          </small>
                        </div>
                      </div>
                      <span 
                        class="badge"
                        [class]="item.status === 'improved' ? 'bg-success' : 'bg-warning'">
                        {{ item.status === 'improved' ? '已改善' : '改善中' }}
                      </span>
                    </div>
                  </div>

                  <!-- 改善前後照片對比 -->
                  <div class="row">
                    <!-- 改善前照片 -->
                    <div class="col-md-6">
                      <h6 class="text-danger small mb-2">
                        <i class="fas fa-exclamation-triangle me-1"></i>
                        改善前 ({{ item.beforePhotos.length }} 張)
                      </h6>
                      @if (item.beforePhotos.length > 0) {
                        <div class="photo-grid">
                          @for (photo of item.beforePhotos.slice(0, 4); track photo.filename) {
                            <div 
                              class="photo-item"
                              (click)="viewPhoto(photo)"
                              [title]="photo.title">
                              <img 
                                [src]="photoService.getPhotoThumbnailUrl(photo.filename)" 
                                [alt]="photo.title"
                                class="photo-thumbnail"
                                loading="lazy"
                                (error)="onImageError($event)">
                            </div>
                          }
                          @if (item.beforePhotos.length > 4) {
                            <div class="photo-item show-more-item">
                              <div class="show-more-content">
                                <i class="fas fa-plus"></i>
                                <small>+{{ item.beforePhotos.length - 4 }}</small>
                              </div>
                            </div>
                          }
                        </div>
                      } @else {
                        <div class="text-center text-muted p-3 border rounded">
                          <i class="fas fa-camera opacity-50"></i>
                          <p class="mb-0 small">無改善前照片</p>
                        </div>
                      }
                    </div>

                    <!-- 改善後照片 -->
                    <div class="col-md-6">
                      <h6 class="text-success small mb-2">
                        <i class="fas fa-check-circle me-1"></i>
                        改善後 ({{ item.afterPhotos.length }} 張)
                      </h6>
                      @if (item.afterPhotos.length > 0) {
                        <div class="photo-grid">
                          @for (photo of item.afterPhotos.slice(0, 4); track photo.filename) {
                            <div 
                              class="photo-item"
                              (click)="viewPhoto(photo)"
                              [title]="photo.title">
                              <img 
                                [src]="photo.url" 
                                [alt]="photo.title"
                                class="photo-thumbnail"
                                loading="lazy"
                                (error)="onImageError($event)">
                            </div>
                          }
                          @if (item.afterPhotos.length > 4) {
                            <div class="photo-item show-more-item">
                              <div class="show-more-content">
                                <i class="fas fa-plus"></i>
                                <small>+{{ item.afterPhotos.length - 4 }}</small>
                              </div>
                            </div>
                          }
                        </div>
                      } @else {
                        <div class="text-center text-muted p-3 border rounded">
                          <i class="fas fa-camera opacity-50"></i>
                          <p class="mb-0 small">
                            {{ item.status === 'improved' ? '缺少改善後照片' : '待上傳改善後照片' }}
                          </p>
                        </div>
                      }
                    </div>
                  </div>
                </div>
              }
            </div>
          } @else {
            <div class="text-center text-muted">
              <i class="fas fa-camera fs-1 mb-2 opacity-50"></i>
              <p class="mb-0">該週無缺失改善照片</p>
              <small>暫無缺失記錄或改善照片</small>
            </div>
          }
        }
      </div>
    </div>
  `,
  styles: [`
    .stat-item {
      padding: 0.5rem;
    }
    .improvement-item {
      background-color: #f8f9fa;
      transition: all 0.2s ease;
    }
    .improvement-item:hover {
      background-color: #e9ecef;
      transform: translateY(-1px);
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    }
    .photo-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 8px;
      max-height: 160px;
    }
    .photo-item {
      position: relative;
      aspect-ratio: 1;
      border-radius: 6px;
      overflow: hidden;
      cursor: pointer;
      border: 1px solid #dee2e6;
      transition: all 0.2s ease;
      background: #fff;
    }
    .photo-item:hover {
      transform: scale(1.02);
      box-shadow: 0 2px 8px rgba(0,0,0,0.15);
      border-color: #007bff;
    }
    .photo-thumbnail {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }
    .show-more-item {
      display: flex;
      align-items: center;
      justify-content: center;
      background: #f8f9fa;
      border: 2px dashed #dee2e6;
    }
    .show-more-item:hover {
      background: #e9ecef;
      border-color: #007bff;
    }
    .show-more-content {
      text-align: center;
      color: #6c757d;
    }
    .improvement-photos {
      max-height: 400px;
      overflow-y: auto;
    }
    .improvement-photos::-webkit-scrollbar {
      width: 6px;
    }
    .improvement-photos::-webkit-scrollbar-track {
      background: #f1f1f1;
    }
    .improvement-photos::-webkit-scrollbar-thumb {
      background: #888;
      border-radius: 3px;
    }
    .improvement-photos::-webkit-scrollbar-thumb:hover {
      background: #555;
    }
  `]
})
export class WeeklyImprovementPhotosComponent implements OnInit, OnChanges, OnDestroy {
  @Input() selectedWeek!: string;
  
  private mongodbService = inject(MongodbService);
  private currentSiteService = inject(CurrentSiteService);
  private gridfsService = inject(GridFSService);
  
  improvementPhotos = signal<ImprovementPhoto[]>([]);
  isLoading = signal<boolean>(false);
  
  private lastLoadedWeek: string | null = null;
  private loadingPromise: Promise<void> | null = null;
  private isDestroyed = false;

  constructor(
    public photoService: PhotoService
  ) {
    effect(() => {
      const currentSite = this.currentSiteService.currentSite();
      
      if (currentSite?._id && this.selectedWeek && !this.isDestroyed) {
        this.loadWeeklyImprovementPhotos();
      }
    });
  }

  ngOnInit() {
    // 初始載入會由 effect 處理
  }

  ngOnChanges() {
    const currentSite = this.currentSiteService.currentSite();
    if (currentSite?._id && this.selectedWeek && this.selectedWeek !== this.lastLoadedWeek) {
      this.loadWeeklyImprovementPhotos();
    }
  }

  ngOnDestroy() {
    this.isDestroyed = true;
  }

  private async loadWeeklyImprovementPhotos(): Promise<void> {
    if (!this.selectedWeek || this.selectedWeek === this.lastLoadedWeek) {
      return;
    }

    if (this.loadingPromise) {
      await this.loadingPromise;
      return;
    }

    const currentSite = this.currentSiteService.currentSite();
    if (!currentSite?._id) {
      this.improvementPhotos.set([]);
      return;
    }

    this.isLoading.set(true);
    this.lastLoadedWeek = this.selectedWeek;

    this.loadingPromise = this.performWeeklyImprovementPhotosLoad(currentSite._id, this.selectedWeek);
    await this.loadingPromise;
    this.loadingPromise = null;
  }

  private async performWeeklyImprovementPhotosLoad(siteId: string, weekStart: string): Promise<void> {
    try {
      const startDate = dayjs(weekStart);
      const endDate = startDate.add(6, 'day');

      // 查詢安全缺失記錄
      const query = {
        siteId: siteId,
        formType: 'safetyIssueRecord',
        issueDate: {
          $gte: startDate.format('YYYY-MM-DD'),
          $lte: endDate.format('YYYY-MM-DD')
        }
      };

      console.log('查詢週報表缺失改善照片:', query);

      const defectRecords = await this.mongodbService.getArray('siteForm', query);

      if (!defectRecords || !Array.isArray(defectRecords)) {
        this.improvementPhotos.set([]);
        return;
      }

      // 處理每個缺失記錄
      const improvementPhotos: ImprovementPhoto[] = [];
      
      for (const record of defectRecords) {
        const improvement = await this.processDefectRecord(record, siteId);
        if (improvement) {
          improvementPhotos.push(improvement);
        }
      }

      // 按改善狀態和日期排序
      improvementPhotos.sort((a, b) => {
        // 已改善的排在前面
        if (a.status !== b.status) {
          return a.status === 'improved' ? -1 : 1;
        }
        // 同狀態按日期排序
        return dayjs(b.issueDate).valueOf() - dayjs(a.issueDate).valueOf();
      });

      this.improvementPhotos.set(improvementPhotos);

    } catch (error) {
      console.error('載入週報表缺失改善照片時發生錯誤:', error);
      this.improvementPhotos.set([]);
    } finally {
      this.isLoading.set(false);
    }
  }

  private async processDefectRecord(record: any, siteId: string): Promise<ImprovementPhoto | null> {
    try {
      // 如果記錄中沒有照片，直接返回空照片的改善記錄
      if (!record.issuePhotos || record.issuePhotos.length === 0) {
        return {
          issueId: record._id,
          issueDescription: record.issueDescription || '缺失說明',
          responsibleUnit: this.getResponsibleUnitName(record.responsibleUnit),
          issueDate: record.issueDate,
          beforePhotos: [],
          afterPhotos: [],
          status: record.reviewResult === 'completed' ? 'improved' : 'pending'
        };
      }

      // 分類照片：改善前/改善後（使用 issuePhotos 中的 improvementStatus）
      const beforePhotos: PhotoInfo[] = [];
      const afterPhotos: PhotoInfo[] = [];

      // 處理記錄中的照片
      for (const issuePhoto of record.issuePhotos) {
        const photoInfo: PhotoInfo = {
          filename: issuePhoto.filename,
          url: `/api/gridfs/${issuePhoto.filename}`,
          uploadDate: record.issueDate, // 使用缺失日期作為上傳日期的替代
          title: issuePhoto.title
        };

        // 根據 improvementStatus 分類照片
        if (issuePhoto.improvementStatus === 'after') {
          afterPhotos.push(photoInfo);
        } else {
          beforePhotos.push(photoInfo);
        }
      }

      // 判斷改善狀態：有改善後照片且複查結果為已完成，則認為已改善
      const status = (afterPhotos.length > 0 && record.reviewResult === 'completed') 
        ? 'improved' 
        : 'pending';

      return {
        issueId: record._id,
        issueDescription: record.issueDescription || '缺失說明',
        responsibleUnit: this.getResponsibleUnitName(record.responsibleUnit),
        issueDate: record.issueDate,
        beforePhotos,
        afterPhotos,
        status
      };

    } catch (error) {
      console.error('處理缺失記錄時發生錯誤:', error);
      return null;
    }
  }

  private getResponsibleUnitName(unit: string): string {
    switch (unit) {
      case 'MIC':
        return 'MIC';
      case 'supplier':
        return '供應商';
      default:
        return unit || '未知單位';
    }
  }

  getWeekRangeDisplay(): string {
    const startDate = dayjs(this.selectedWeek);
    const endDate = startDate.add(6, 'day');
    return `${startDate.format('YYYY/MM/DD')} - ${endDate.format('YYYY/MM/DD')}`;
  }

  getTotalIssues(): number {
    return this.improvementPhotos().length;
  }

  getImprovedCount(): number {
    return this.improvementPhotos().filter(item => item.status === 'improved').length;
  }

  getPendingCount(): number {
    return this.improvementPhotos().filter(item => item.status === 'pending').length;
  }

  formatDate(date: string): string {
    return dayjs(date).format('MM/DD');
  }

  viewPhoto(photo: PhotoInfo): void {
    // 開啟照片檢視 - 可以實作模態框或導航到照片頁面
    window.open(photo.url, '_blank');
  }

  onImageError(event: any): void {
    // 圖片載入失敗時的處理
    event.target.src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iODAiIGhlaWdodD0iODAiIHZpZXdCb3g9IjAgMCA4MCA4MCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHJlY3Qgd2lkdGg9IjgwIiBoZWlnaHQ9IjgwIiBmaWxsPSIjRjhGOUZBIi8+CjxwYXRoIGQ9Ik00MCA0NkM0My4zMTM3IDQ2IDQ2IDQzLjMxMzcgNDYgNDBDNDYgMzYuNjg2MyA0My4zMTM3IDM0IDQwIDM0QzM2LjY4NjMgMzQgMzQgMzYuNjg2MyAzNCA0MEMzNCA0My4zMTM3IDM2LjY4NjMgNDYgNDAgNDZaIiBmaWxsPSIjREVFMkU2Ii8+CjxwYXRoIGQ9Ik0yNCA1NEg1NkMzMiA0OCA0OCA0OCA1NiA1NEgyNFoiIGZpbGw9IiNERUUyRTYiLz4KPC9zdmc+';
  }
} 