import { Component, Input, OnInit, OnChanges, OnDestroy, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { CurrentSiteService } from '../../../../services/current-site.service';
import { PhotoService } from '../../../../services/photo.service';
import { GridFSService } from '../../../../services/gridfs.service';
import { MongodbService } from '../../../../services/mongodb.service';
import dayjs from 'dayjs';

interface PhotoStats {
  tagName: string;
  count: number;
  color: string;
  background: string;
}

interface DailyPhoto {
  _id: string;
  filename: string;
  uploadDate: string;
  length: number;
  contentType: string;
  metadata: {
    siteId: string;
    tags?: Array<{
      title: string;
      color: string;
      background: string;
    }>;
    description?: string;
    location?: string;
  };
}

@Component({
  selector: 'app-daily-photo-stats',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="card h-100">
      <div class="card-header d-flex justify-content-between align-items-center">
        <h6 class="mb-0">
          <i class="fas fa-camera me-2"></i>當日照片分類統計
        </h6>
        <div class="d-flex align-items-center gap-2">
          @if (photos().length > 0) {
            <small class="text-muted">
              共 {{ photos().length }} 張照片
            </small>
            <button 
              type="button" 
              class="btn btn-sm btn-outline-primary"
              (click)="downloadAllPhotos()"
              [disabled]="isDownloading()"
              title="下載今日所有照片">
              @if (isDownloading()) {
                <span class="spinner-border spinner-border-sm me-1" role="status"></span>
                下載中...
              } @else {
                <i class="fas fa-download me-1"></i>
                下載全部
              }
            </button>
          }
        </div>
      </div>
      <div class="card-body">
        @if (isLoading()) {
          <div class="text-center">
            <div class="spinner-border spinner-border-sm text-primary" role="status">
              <span class="visually-hidden">載入中...</span>
            </div>
          </div>
        } @else if (photos().length > 0) {
          <!-- 分類統計 -->
          @if (photoStats().length > 0) {
            <div class="mb-3">
              <h6 class="fs-6 text-muted mb-2">
                <i class="fas fa-tags me-1"></i>標籤統計
              </h6>
              <div class="d-flex flex-wrap gap-2 mb-3">
                @for (stat of photoStats(); track stat.tagName) {
                  <span 
                    class="badge"
                    [style.color]="stat.color"
                    [style.background-color]="stat.background"
                    title="{{ stat.tagName }}: {{ stat.count }} 張照片">
                    {{ stat.tagName }} ({{ stat.count }})
                  </span>
                }
              </div>
            </div>
          }
          
          <!-- 照片縮圖區域 -->
          <div class="mb-3">
            <h6 class="fs-6 text-muted mb-2">
              <i class="fas fa-images me-1"></i>照片預覽
            </h6>
            <div class="photo-grid">
              @for (photo of displayPhotos(); track photo._id) {
                <div 
                  class="photo-item" 
                  (click)="viewPhoto(photo)"
                  [title]="photo.filename + ' - 點擊查看詳情'">
                  <img 
                    [src]="photoService.getPhotoThumbnailUrl(photo._id)" 
                    [alt]="photo.filename"
                    class="photo-thumbnail"
                    loading="lazy"
                    (error)="onImageError($event)">
                  
                  <!-- 標籤覆蓋層 -->
                  @if (photo.metadata.tags && photo.metadata.tags.length > 0) {
                    <div class="photo-tags-overlay">
                      @for (tag of photo.metadata.tags.slice(0, 2); track tag.title) {
                        <span 
                          class="badge badge-sm"
                          [style.color]="tag.color"
                          [style.background-color]="tag.background">
                          {{ tag.title }}
                        </span>
                      }
                      @if (photo.metadata.tags.length > 2) {
                        <span class="badge badge-sm bg-secondary">
                          +{{ photo.metadata.tags.length - 2 }}
                        </span>
                      }
                    </div>
                  }
                </div>
              }
              
              <!-- 顯示更多按鈕 -->
              @if (photos().length > maxDisplayPhotos) {
                <div class="photo-item show-more-item" (click)="viewAllPhotos()">
                  <div class="show-more-content">
                    <i class="fas fa-plus fs-4 text-primary"></i>
                    <div class="text-center">
                      <small class="text-primary fw-medium">
                        查看全部<br>{{ photos().length }} 張
                      </small>
                    </div>
                  </div>
                </div>
              }
            </div>
          </div>
          
          <!-- 操作按鈕 -->
          <div class="d-flex justify-content-between align-items-center">
            <button 
              type="button" 
              class="btn btn-sm btn-outline-primary"
              (click)="viewAllPhotos()"
              title="查看所有照片">
              <i class="fas fa-images me-1"></i>
              查看全部照片
            </button>
            
            <!-- 檔案大小統計 -->
            <small class="text-muted">
              <i class="fas fa-hdd me-1"></i>
              {{ getTotalSize() }}
            </small>
          </div>
        } @else {
          <div class="text-center text-muted">
            <i class="fas fa-camera fs-1 mb-2 opacity-50"></i>
            <p class="mb-0">當日無照片記錄</p>
            <small>暫無任何照片上傳</small>
          </div>
        }
      </div>
    </div>
  `,
  styles: [`
    .photo-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(80px, 1fr));
      gap: 8px;
      max-height: 200px;
      overflow-y: auto;
    }
    
    .photo-item {
      position: relative;
      aspect-ratio: 1;
      border-radius: 6px;
      overflow: hidden;
      cursor: pointer;
      border: 1px solid #dee2e6;
      transition: all 0.2s ease;
      background: #f8f9fa;
    }
    
    .photo-item:hover {
      transform: translateY(-2px);
      box-shadow: 0 4px 8px rgba(0,0,0,0.15);
      border-color: #007bff;
    }
    
    .photo-thumbnail {
      width: 100%;
      height: 100%;
      object-fit: cover;
      transition: transform 0.2s ease;
    }
    
    .photo-item:hover .photo-thumbnail {
      transform: scale(1.05);
    }
    
    .photo-tags-overlay {
      position: absolute;
      top: 4px;
      left: 4px;
      right: 4px;
      display: flex;
      flex-wrap: wrap;
      gap: 2px;
      pointer-events: none;
    }
    
    .badge-sm {
      font-size: 0.65rem;
      padding: 0.1rem 0.3rem;
      line-height: 1;
    }
    
    .show-more-item {
      display: flex;
      align-items: center;
      justify-content: center;
      background: #f8f9fa;
      border: 2px dashed #dee2e6;
      transition: all 0.2s ease;
    }
    
    .show-more-item:hover {
      background: #e9ecef;
      border-color: #007bff;
    }
    
    .show-more-content {
      text-align: center;
      padding: 8px;
    }
    
    .photo-grid::-webkit-scrollbar {
      width: 6px;
    }
    
    .photo-grid::-webkit-scrollbar-track {
      background: #f1f1f1;
      border-radius: 3px;
    }
    
    .photo-grid::-webkit-scrollbar-thumb {
      background: #888;
      border-radius: 3px;
    }
    
    .photo-grid::-webkit-scrollbar-thumb:hover {
      background: #555;
    }
  `]
})
export class DailyPhotoStatsComponent implements OnInit, OnChanges, OnDestroy {
  @Input() selectedDate: string = '';
  
  // Signals
  photos = signal<DailyPhoto[]>([]);
  isLoading = signal<boolean>(false);
  isDownloading = signal<boolean>(false);
  
  // 計算屬性
  photoStats = computed(() => this.calculatePhotoStats());
  displayPhotos = computed(() => this.photos().slice(0, this.maxDisplayPhotos));
  
  // 常量
  maxDisplayPhotos = 9;
  
  // 私有變數
  private lastLoadedDate: string = '';

  constructor(
    private currentSiteService: CurrentSiteService,
    public photoService: PhotoService,
    private gridfsService: GridFSService,
    private mongodbService: MongodbService,
    private router: Router
  ) {}

  ngOnInit() {
    this.loadDailyPhotos();
  }

  ngOnChanges() {
    // 只有當選擇的日期改變時才重新載入
    if (this.selectedDate && this.selectedDate !== this.lastLoadedDate) {
      this.loadDailyPhotos();
    }
  }

  ngOnDestroy() {
    // 清理工作
  }

  private async loadDailyPhotos() {
    if (!this.selectedDate) return;
    
    this.isLoading.set(true);
    try {
      const currentSite = this.currentSiteService.currentSite();
      if (!currentSite?._id) {
        this.photos.set([]);
        return;
      }

      this.lastLoadedDate = this.selectedDate;
      
      // 構建查詢條件：當日的照片
      const startDate = dayjs(this.selectedDate).startOf('day').toDate();
      const endDate = dayjs(this.selectedDate).endOf('day').toDate();
      
      const query = {
        'metadata.siteId': currentSite._id,
        'contentType': { $regex: '^image/' },
        'uploadDate': {
          $gte: startDate,
          $lte: endDate
        }
      };

      // 使用 GridFSService 查詢照片
      const photos = await this.gridfsService.getFiles(query);
      this.photos.set(photos.files || []);
    } catch (error) {
      console.error('載入當日照片時發生錯誤:', error);
      this.photos.set([]);
    } finally {
      this.isLoading.set(false);
    }
  }

  private calculatePhotoStats(): PhotoStats[] {
    const photos = this.photos();
    const tagCountMap = new Map<string, { count: number; color: string; background: string }>();

    photos.forEach(photo => {
      if (photo.metadata.tags && photo.metadata.tags.length > 0) {
        photo.metadata.tags.forEach(tag => {
          const existing = tagCountMap.get(tag.title);
          if (existing) {
            existing.count++;
          } else {
            tagCountMap.set(tag.title, {
              count: 1,
              color: tag.color,
              background: tag.background
            });
          }
        });
      }
    });

    // 轉換為陣列並排序（依數量降序）
    return Array.from(tagCountMap.entries())
      .map(([tagName, data]) => ({
        tagName,
        count: data.count,
        color: data.color,
        background: data.background
      }))
      .sort((a, b) => b.count - a.count);
  }


  getTotalSize(): string {
    const totalBytes = this.photos().reduce((sum, photo) => sum + (photo.length || 0), 0);
    
    if (totalBytes === 0) return '0 B';
    
    const units = ['B', 'KB', 'MB', 'GB'];
    const unitIndex = Math.floor(Math.log(totalBytes) / Math.log(1024));
    const size = totalBytes / Math.pow(1024, unitIndex);
    
    return `${size.toFixed(1)} ${units[unitIndex]}`;
  }

  onImageError(event: any) {
    // 圖片載入失敗時的處理
    event.target.src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iODAiIGhlaWdodD0iODAiIHZpZXdCb3g9IjAgMCA4MCA4MCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHJlY3Qgd2lkdGg9IjgwIiBoZWlnaHQ9IjgwIiBmaWxsPSIjRjhGOUZBIi8+CjxwYXRoIGQ9Ik00MCA0NkM0My4zMTM3IDQ2IDQ2IDQzLjMxMzcgNDYgNDBDNDYgMzYuNjg2MyA0My4zMTM3IDM0IDQwIDM0QzM2LjY4NjMgMzQgMzQgMzYuNjg2MyAzNCA0MEMzNCA0My4zMTM3IDM2LjY4NjMgNDYgNDAgNDZaIiBmaWxsPSIjREVFMkU2Ii8+CjxwYXRoIGQ9Ik0yNCA1NEg1NkMzMiA0OCA0OCA0OCA1NiA1NEgyNFoiIGZpbGw9IiNERUUyRTYiLz4KPC9zdmc+';
  }

  viewPhoto(photo: DailyPhoto) {
    // 導航到照片詳細頁面或開啟檢視模態框
    const currentSite = this.currentSiteService.currentSite();
    if (currentSite) {
      this.router.navigate(['/site', currentSite._id, 'photos'], {
        queryParams: { photoId: photo._id }
      });
    }
  }

  viewAllPhotos() {
    // 導航到照片頁面並篩選當日照片
    const currentSite = this.currentSiteService.currentSite();
    if (currentSite) {
      this.router.navigate(['/site', currentSite._id, 'photos'], {
        queryParams: { 
          startDate: this.selectedDate,
          endDate: this.selectedDate
        }
      });
    }
  }

  async downloadAllPhotos() {
    if (this.photos().length === 0) return;
    
    this.isDownloading.set(true);
    try {
      const dateStr = dayjs(this.selectedDate).format('YYYY-MM-DD');
      const currentSite = this.currentSiteService.currentSite();
      const siteName = currentSite?.projectName || '工地';
      
      // 建立 ZIP 檔案名稱
      const zipFileName = `${siteName}_${dateStr}_照片.zip`;
      
      // 動態導入 JSZip
      const JSZip = (await import('jszip')).default;
      const zip = new JSZip();
      
      // 下載所有照片並加入 ZIP
      let successCount = 0;
      for (const photo of this.photos()) {
        try {
          const imageBlob = await this.downloadPhotoBlob(photo._id);
          if (imageBlob) {
            // 根據標籤建立資料夾結構
            let folderName = '其他';
            if (photo.metadata.tags && photo.metadata.tags.length > 0) {
              folderName = photo.metadata.tags[0].title;
            }
            
            // 建立檔案路徑
            const fileName = `${folderName}/${photo.filename}`;
            zip.file(fileName, imageBlob);
            successCount++;
          }
        } catch (error) {
          console.warn(`下載照片 ${photo.filename} 失敗:`, error);
        }
      }
      
      if (successCount > 0) {
        // 生成 ZIP 檔案並下載
        const zipBlob = await zip.generateAsync({ type: 'blob' });
        
        // 建立下載連結
        const url = window.URL.createObjectURL(zipBlob);
        const link = document.createElement('a');
        link.href = url;
        link.download = zipFileName;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(url);
        
        alert(`成功下載 ${successCount} 張照片`);
      } else {
        alert('沒有照片可以下載');
      }
    } catch (error) {
      console.error('下載照片時發生錯誤:', error);
      alert('下載失敗，請稍後再試');
    } finally {
      this.isDownloading.set(false);
    }
  }

  private async downloadPhotoBlob(photoId: string): Promise<Blob | null> {
    try {
      let url = `/api/gridfs/file/${photoId}`;
      if (window.location.port === '4200') {
        url = `http://localhost:3000${url}`;
      }
      
      const response = await fetch(url);
      if (response.ok) {
        return await response.blob();
      }
      return null;
    } catch (error) {
      console.error(`下載照片 ${photoId} 失敗:`, error);
      return null;
    }
  }
} 