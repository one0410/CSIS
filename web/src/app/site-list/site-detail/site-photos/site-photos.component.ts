import { Component, Input, OnInit, computed, signal } from '@angular/core';
import { PhotoService } from '../../../services/photo.service';
import { CommonModule } from '@angular/common';
import dayjs from 'dayjs';
import { ActivatedRoute } from '@angular/router';
import { Site } from '../../../site-list/site-list.component';
import { MongodbService } from '../../../services/mongodb.service';
import { CurrentSiteService } from '../../../services/current-site.service';
import { FormsModule } from '@angular/forms';
import { GridFSService } from '../../../services/gridfs.service';

@Component({
    selector: 'app-site-photos',
    imports: [CommonModule, FormsModule],
    templateUrl: './site-photos.component.html',
    styleUrls: ['./site-photos.component.scss']
})
export class SitePhotosComponent implements OnInit {
  siteId = '';
  site = computed(() => this.currentSiteService.currentSite());
  photoCount = computed(() => this.photoGroups().reduce((acc, group) => acc + group.photos.length, 0));
  
  photoGroups = signal<PhotoGroup[]>([]);
  photoCategories = signal<string[]>([]);
  isLoading = signal<boolean>(false);
  scrollThreshold = 200;
  uploadProgress = signal<number>(0);
  uploadingFiles = signal<boolean>(false);
  selectedPhoto = signal<Photo | null>(null);
  
  // 搜尋相關屬性
  searchStartDate: string = '';
  searchEndDate: string = '';
  searchCategory: string = '';
  allPhotos: Photo[] = []; // 儲存所有照片，用於搜尋過濾
  isFiltered = signal<boolean>(false);

  constructor(private photoService: PhotoService,
    private route: ActivatedRoute,
    private mongodbService: MongodbService,
    private currentSiteService: CurrentSiteService,
    private gridfsService: GridFSService) {
    this.route.parent?.paramMap.subscribe(async params => {
      this.siteId = params.get('id') || '';
      
      // 使用 CurrentSiteService 獲取工地資訊，避免重複從資料庫載入
      await this.currentSiteService.loadSite(this.siteId);

      if (this.site()) {
        // 重置分頁狀態，確保每次返回此元件時都從第一頁開始加載
        this.photoService.resetPagination();
        this.loadPhotos();
        this.setupScrollListener();
      }
    });
  }

  ngOnInit() {
    // 確保在初始化時也重置分頁狀態
    this.photoService.resetPagination();
  }

  private setupScrollListener(): void {
    window.addEventListener('scroll', () => {
      this.checkScrollPosition();
    });
  }

  private checkScrollPosition(): void {
    if (this.isLoading()) return;

    const windowHeight = window.innerHeight;
    const documentHeight = document.documentElement.scrollHeight;
    const scrollTop = window.scrollY;

    if (windowHeight + scrollTop >= documentHeight - this.scrollThreshold) {
      this.loadPhotos();
    }
  }

  async loadPhotos() {
    const currentSite = this.site();
    if (!currentSite) return;

    this.isLoading.set(true);
    this.photoService.getPhotos(currentSite._id!).subscribe({
      next: (newPhotos) => {
        // 將新圖片加入現有的分組中
        this.updateImageGroups(newPhotos);
        this.photoService.nextPage();
        this.isLoading.set(false);
      },
      error: (error) => {
        console.error('載入圖片時發生錯誤:', error);
        this.isLoading.set(false);
      }
    });
  }

  private updateImageGroups(newPhotos: Photo[]): void {
    let allPhotos: Photo[];
    
    // 檢查是否為第一頁加載
    if (this.photoService.getCurrentPage() === 1) {
      // 如果是第一頁，直接使用新照片替換舊列表
      allPhotos = [...newPhotos];
    } else {
      // 如果不是第一頁（無限滾動加載），則追加新照片
      allPhotos = this.getAllPhotosFromGroups();
      allPhotos.push(...newPhotos);
    }
    
    // 保存所有照片用於搜尋
    this.allPhotos = [...allPhotos];
    
    // 如果有搜尋條件，則應用過濾
    if (this.isSearchActive()) {
      const filteredPhotos = this.filterPhotos(allPhotos);
      this.photoGroups.set(this.groupPhotosByDate(filteredPhotos));
    } else {
      this.photoGroups.set(this.groupPhotosByDate(allPhotos));
    }
    
    // 更新分類列表
    this.updatePhotoCategories(allPhotos);
  }

  private getAllPhotosFromGroups(): Photo[] {
    return this.photoGroups().reduce((acc, group) => [...acc, ...group.photos], [] as Photo[]);
  }

  onPhotoLoad(event: Event): void {
    const img = event.target as HTMLImageElement;
    img.classList.add('loaded');
  }

  private groupPhotosByDate(photos: Photo[]): PhotoGroup[] {
    const groups = new Map<string, Photo[]>();
    
    photos.forEach(photo => {
      const dateStr = new Date(photo.date).toDateString();
      if (!groups.has(dateStr)) {
        groups.set(dateStr, []);
      }
      groups.get(dateStr)!.push(photo);
    });

    return Array.from(groups.entries()).map(([dateStr, photos]) => ({
      date: new Date(dateStr),
      displayDate: dayjs(dateStr).format('YYYY年MM月DD日'),
      photos: photos
    }));
  }

  private async handleFiles(files: FileList) {
    this.uploadingFiles.set(true);
    this.uploadProgress.set(0);
    
    const totalFiles = files.length;
    let uploadedCount = 0;
    
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (file.type.startsWith('image/')) {
        try {
          await this.uploadFile(file);
          uploadedCount++;
          this.uploadProgress.set(Math.round((uploadedCount / totalFiles) * 100));
        } catch (error) {
          console.error('上傳文件時發生錯誤:', error);
        }
      }
    }
    
    this.uploadingFiles.set(false);
    // 上傳完成後刷新照片列表
    this.photoService.resetPagination();
    this.loadPhotos();
    
    // 通知照片統計更新
    const currentSite = this.site();
    if (currentSite && currentSite._id) {
      this.photoService.notifyPhotoStatsUpdated(currentSite._id);
    }
  }

  private async uploadFile(file: File): Promise<void> {
    const currentSite = this.site();
    if (!currentSite) return;
    
    try {
      // 準備元數據
      const metadata = {
        projectNo: currentSite.projectNo,
        siteId: currentSite._id!
      };
      
      // 使用 GridFSService 上傳檔案
      const result = await this.gridfsService.uploadFile(file, metadata);
      console.log('照片上傳成功:', result);
      return;
    } catch (error) {
      console.error('照片上傳失敗:', error);
      throw error;
    }
  }

  onFileSelected(event: any) {
    const files = event.target.files;
    if (files && files.length > 0) {
      this.handleFiles(files);
    }
  }

  deletePhoto(photo: Photo) {
    if (!photo || !photo.url) {
      return;
    }
    
    // 從 URL 中獲取檔案名稱
    const filename = photo.url.split('/').pop();
    if (!filename) {
      return;
    }

    if (confirm('確定要刪除 ' + photo.title + ' 照片嗎？')) {
      this.deletePhotoByFilename(filename, photo.id);
    }
  }
  
  private async deletePhotoByFilename(filename: string, photoId: number) {
    try {
      // 使用 GridFSService 刪除檔案
      await this.gridfsService.deleteFile(filename);
      
      // 更新本地照片列表
      const groups = [...this.photoGroups()];
      for (let i = 0; i < groups.length; i++) {
        const photoIndex = groups[i].photos.findIndex(p => p.id === photoId);
        if (photoIndex > -1) {
          groups[i].photos.splice(photoIndex, 1);
          
          // 如果該組沒有照片了，刪除該組
          if (groups[i].photos.length === 0) {
            groups.splice(i, 1);
          }
          
          this.photoGroups.set([...groups]);
          break;
        }
      }
      
      // 通知照片統計更新
      const currentSite = this.site();
      if (currentSite && currentSite._id) {
        this.photoService.notifyPhotoStatsUpdated(currentSite._id);
      }
    } catch (error) {
      console.error('刪除照片失敗:', error);
    }
  }

  onDragOver(event: DragEvent) {
    event.preventDefault();
    event.stopPropagation();
  }

  onDragLeave(event: DragEvent) {
    event.preventDefault();
    event.stopPropagation();
  }

  onDrop(event: DragEvent) {
    event.preventDefault();
    event.stopPropagation();
    const files = event.dataTransfer?.files;
    if (files && files.length > 0) {
      this.handleFiles(files);
    }
  }

  async openPhotoDetail(photo: Photo) {
    try {
      // 創建一個新的物件以避免直接修改原始參考
      const photoClone = { ...photo };
      
      // 從伺服器獲取最新的照片詳細資訊
      const filename = photo.url.split('/').pop();
      if (filename) {
        try {
          // 嘗試獲取完整的照片資訊
          const photoInfo = await this.gridfsService.getFileInfo(filename);
          
          if (photoInfo && photoInfo.metadata) {
            // 更新分類和描述
            if (photoInfo.metadata.category) {
              photoClone.metadata.category = photoInfo.metadata.category;
            }
            if (photoInfo.metadata.description) {
              photoClone.metadata.description = photoInfo.metadata.description;
            }
            if (photoInfo.metadata.title) {
              photoClone.title = photoInfo.metadata.title;
            }
            if (photoInfo.metadata.location) {
              photoClone.metadata.location = photoInfo.metadata.location;
            }
          }
        } catch (error) {
          console.warn('無法獲取照片詳細資訊:', error);
          // 繼續使用現有數據
        }
      }
      
      // 確保有分類欄位，如果沒有就設為空字串
      if (!photoClone.metadata.category) {
        photoClone.metadata.category = '';
      }
      // 確保有描述欄位，如果沒有就設為空字串
      if (!photoClone.metadata.description) {
        photoClone.metadata.description = '';
      }
      // 確保有地點欄位，如果沒有就設為空字串
      if (!photoClone.metadata.location) {
        photoClone.metadata.location = '';
      }
      this.selectedPhoto.set(photoClone);
      
      // 防止頁面滾動
      document.body.style.overflow = 'hidden';
    } catch (error) {
      console.error('開啟照片詳細資訊時發生錯誤:', error);
    }
  }

  closePhotoDetail(event?: MouseEvent) {
    // 如果有事件，且點擊位置是模態對話框內部元素（不是遮罩），則不關閉
    if (event) {
      const target = event.target as HTMLElement;
      // 如果點擊的是模態內容，不進行關閉操作
      if (target.closest('.modal-content')) {
        return;
      }
    }
    
    this.selectedPhoto.set(null);
    // 恢復頁面滾動
    document.body.style.overflow = '';
  }

  updatePhotoCategory() {
    // 此方法將在選擇或輸入分類後被呼叫
    console.log('更新照片分類:', this.selectedPhoto()?.metadata.category);
    
    // 檢查是否為新分類，如果是則加入分類列表
    const category = this.selectedPhoto()?.metadata.category?.trim();
    if (category && !this.photoCategories().includes(category)) {
      this.photoCategories.update(categories => [...categories, category].sort());
    }
  }
  
  updatePhotoTitle() {
    // 此方法將在編輯標題後被呼叫
    console.log('更新照片標題:', this.selectedPhoto()?.title);
  }
  
  updatePhotoDescription() {
    // 此方法將在編輯描述後被呼叫
    console.log('更新照片描述:', this.selectedPhoto()?.metadata.description);
  }
  
  updatePhotoLocation() {
    // 此方法將在編輯地點後被呼叫
    console.log('更新照片地點:', this.selectedPhoto()?.metadata.location);
  }
  
  savePhotoChanges() {
    const photo = this.selectedPhoto();
    if (!photo) return;
    
    // 儲存照片變更
    console.log('儲存照片變更:', photo);
    
    // 使用 GridFSService 更新檔案元數據
    this.updatePhotoMetadata(photo).then(() => {
      // 更新本地資料
      this.updateLocalPhoto(photo);
      // 關閉詳細視圖
      this.closePhotoDetail();
    }).catch(error => {
      console.error('儲存照片變更時發生錯誤:', error);
    });
  }
  
  private async updatePhotoMetadata(photo: Photo): Promise<void> {
    try {
      // 從 URL 中獲取檔案 ID
      const fileId = photo.url.split('/').pop();
      if (!fileId) {
        throw new Error('無法從 URL 獲取檔案 ID');
      }
      
      // 準備元數據
      const metadata = {
        title: photo.title,
        category: photo.metadata.category,
        description: photo.metadata.description,
        location: photo.metadata.location
      };
      
      // 使用 GridFSService 更新檔案元數據
      return await this.gridfsService.updateFileMetadata(fileId, metadata);
    } catch (error) {
      console.error('更新照片資訊失敗:', error);
      throw error;
    }
  }
  
  private updateLocalPhoto(updatedPhoto: Photo): void {
    const groups = [...this.photoGroups()];
    
    for (const group of groups) {
      const photoIndex = group.photos.findIndex(p => p.id === updatedPhoto.id);
      if (photoIndex !== -1) {
        // 更新陣列中的照片
        group.photos[photoIndex] = { ...updatedPhoto };
        break;
      }
    }
    
    // 更新 signal 值
    this.photoGroups.set(groups);
  }
  
  /**
   * 收集所有照片中的分類，並更新分類列表
   */
  private updatePhotoCategories(photos: Photo[]): void {
    // 建立一個 Set 來去除重複的分類
    const categories = new Set<string>();
    
    // 收集所有有效的分類
    photos.forEach(photo => {
      if (photo.metadata.category && photo.metadata.category.trim() !== '') {
        categories.add(photo.metadata.category.trim());
      }
    });
    
    // 將預設分類加入集合
    const defaultCategories = ['未分類', '機具管理'];
    defaultCategories.forEach(category => categories.add(category));
    
    // 轉換 Set 為陣列並排序
    const sortedCategories = Array.from(categories).sort();
    
    // 更新 signal
    this.photoCategories.set(sortedCategories);
  }

  /**
   * 搜尋照片
   */
  searchPhotos(): void {
    this.isFiltered.set(true);
    const filteredPhotos = this.filterPhotos(this.allPhotos);
    this.photoGroups.set(this.groupPhotosByDate(filteredPhotos));
  }
  
  /**
   * 根據搜尋條件過濾照片
   */
  private filterPhotos(photos: Photo[]): Photo[] {
    return photos.filter(photo => {
      const photoDate = new Date(photo.date);
      
      // 檢查起始日期
      if (this.searchStartDate) {
        const startDate = new Date(this.searchStartDate);
        if (photoDate < startDate) {
          return false;
        }
      }
      
      // 檢查結束日期
      if (this.searchEndDate) {
        const endDate = new Date(this.searchEndDate);
        // 將結束日期調整到當天結束
        endDate.setHours(23, 59, 59, 999);
        if (photoDate > endDate) {
          return false;
        }
      }
      
      // 檢查分類
      if (this.searchCategory && photo.metadata.category !== this.searchCategory) {
        return false;
      }
      
      return true;
    });
  }
  
  /**
   * 清除搜尋條件
   */
  clearSearch(): void {
    this.searchStartDate = '';
    this.searchEndDate = '';
    this.searchCategory = '';
    this.isFiltered.set(false);
    
    // 重新顯示所有照片
    this.photoGroups.set(this.groupPhotosByDate(this.allPhotos));
  }
  
  /**
   * 判斷是否有搜尋條件
   */
  isSearchActive(): boolean {
    return this.isFiltered() || !!(this.searchStartDate || this.searchEndDate || this.searchCategory);
  }
}

export interface PhotoGroup {
  date: Date;
  displayDate: string;
  photos: Photo[];
}

export interface Photo {
  id: number;
  url: string;
  title: string;
  date: string;  // ISO 格式的日期字串 (YYYY-MM-DD)
  metadata: {
    category?: string;
    description?: string;
    location?: string; // 新增地點欄位
  };
}
