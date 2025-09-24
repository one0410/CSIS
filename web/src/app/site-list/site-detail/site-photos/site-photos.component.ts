import { Component, Input, OnInit, AfterViewInit, OnDestroy, computed, signal } from '@angular/core';
import { PhotoService } from '../../../services/photo.service';
import { CommonModule } from '@angular/common';
import dayjs from 'dayjs';
import { ActivatedRoute, Router } from '@angular/router';
import { Site } from '../../../site-list/site-list.component';
import { MongodbService } from '../../../services/mongodb.service';
import { CurrentSiteService } from '../../../services/current-site.service';
import { FormsModule } from '@angular/forms';
import { GridFSService } from '../../../services/gridfs.service';
import { AuthService } from '../../../services/auth.service';

@Component({
  selector: 'app-site-photos',
  imports: [CommonModule, FormsModule],
  templateUrl: './site-photos.component.html',
  styleUrls: ['./site-photos.component.scss']
})
export class SitePhotosComponent implements OnInit, AfterViewInit, OnDestroy {
  siteId = '';
  site = computed(() => this.currentSiteService.currentSite());
  photoCount = computed(() => {
    // 如果有總數資訊，顯示總數，否則顯示已載入的數量
    const total = this.totalPhotoCount();
    if (total > 0) {
      return total;
    }
    return this.photoGroups().reduce((acc, group) => acc + group.photos.length, 0);
  });

  photoGroups = signal<PhotoGroup[]>([]);
  photoCategories = signal<string[]>([]);
  isLoading = signal<boolean>(false);
  scrollThreshold = 200;
  uploadProgress = signal<number>(0);
  uploadingFiles = signal<boolean>(false);
  selectedPhoto = signal<Photo | null>(null);
  totalPhotoCount = signal<number>(0); // 儲存總照片數量

  // 搜尋相關屬性
  searchStartDate: string = '';
  searchEndDate: string = '';
  searchCategory: string = '';
  allPhotos: Photo[] = []; // 儲存所有照片，用於搜尋過濾
  isFiltered = signal<boolean>(false);

  // 檢測是否為移動設備（手機、平板、iPad）
  isMobileDevice = computed(() => {
    const userAgent = navigator.userAgent;
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|tablet/i.test(userAgent) ||
      // 額外檢測iPad（iOS 13+的iPad可能不會顯示iPad在userAgent中）
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  });

  // 標籤管理相關
  newTagTitle = '';
  newTagColor = '#ffffff';
  newTagBackground = '#007bff';
  showNewTagModal = signal<boolean>(false);

  // 預設顏色組合
  presetColors = [
    { color: '#ffffff', background: '#007bff', name: '藍色' },
    { color: '#ffffff', background: '#28a745', name: '綠色' },
    { color: '#ffffff', background: '#dc3545', name: '紅色' },
    { color: '#ffffff', background: '#ffc107', name: '黃色' },
    { color: '#ffffff', background: '#6f42c1', name: '紫色' },
    { color: '#ffffff', background: '#fd7e14', name: '橘色' },
    { color: '#ffffff', background: '#20c997', name: '青色' },
    { color: '#ffffff', background: '#e83e8c', name: '粉色' },
    { color: '#000000', background: '#f8f9fa', name: '淺灰色' },
    { color: '#ffffff', background: '#6c757d', name: '深灰色' }
  ];

  // 系統標籤定義
  systemTags: PhotoTag[] = [
    {
      title: '機具管理',
      color: '#ffffff',
      background: '#28a745',
      isSystemTag: true
    },
    {
      title: '工地缺失',
      color: '#ffffff',
      background: '#dc3545',
      isSystemTag: true
    },
    {
      title: '危害告知',
      color: '#ffffff',
      background: '#0d6efd',
      isSystemTag: true
    }
  ];

  // 滾動監聽器清理函數
  private cleanupScrollListener?: () => void;

  // 權限檢查 - 只有管理員、專案經理、專案秘書可以管理標籤
  canManageTags = computed(() => {
    const user = this.authService.user();

    if (!user) {
      return false;
    }

    // 檢查全域角色
    const globalAllowedRoles = ['admin', 'manager', 'secretary'];
    const hasGlobalPermission = globalAllowedRoles.includes(user.role);

    // 檢查工地特定角色（如果有 belongSites 的話）
    let hasSitePermission = false;
    if (user.belongSites && user.belongSites.length > 0) {
      const siteAllowedRoles = ['專案經理', '專案秘書', '專案工程師'];
      hasSitePermission = user.belongSites.some(site =>
        site.siteId === this.siteId && siteAllowedRoles.includes(site.role)
      );
    }

    return hasGlobalPermission || hasSitePermission;
  });

  constructor(private photoService: PhotoService,
    private route: ActivatedRoute,
    private router: Router,
    private mongodbService: MongodbService,
    private currentSiteService: CurrentSiteService,
    private gridfsService: GridFSService,
    private authService: AuthService) {
    this.route.parent?.paramMap.subscribe(async params => {
      this.siteId = params.get('id') || '';

      // 使用 CurrentSiteService 獲取工地資訊，避免重複從資料庫載入
      await this.currentSiteService.loadSite(this.siteId);

      if (this.site()) {
        // 清理舊的滾動監聽器
        if (this.cleanupScrollListener) {
          this.cleanupScrollListener();
          this.cleanupScrollListener = undefined;
        }

        // 重置分頁狀態，確保每次返回此元件時都從第一頁開始加載
        this.photoService.resetPagination();

        // 清空現有照片
        this.photoGroups.set([]);
        this.allPhotos = [];

        // 載入照片統計資訊
        this.loadPhotoStats();

        // 處理查詢參數
        this.route.queryParamMap.subscribe(queryParams => {
          const startDate = queryParams.get('startDate');
          const endDate = queryParams.get('endDate');
          const photoId = queryParams.get('photoId');

          if (startDate) {
            this.searchStartDate = startDate;
          }
          if (endDate) {
            this.searchEndDate = endDate;
          }

          // 如果有日期參數，自動執行搜尋
          if (startDate || endDate) {
            this.searchPhotos();
          } else {
            this.loadPhotos();
          }

          // 如果有指定照片ID，可以後續實作自動定位到該照片
          if (photoId) {
            // TODO: 實作自動定位到指定照片的功能
            console.log('Navigate to photo:', photoId);
          }
        });

        // 延遲設置滾動監聽器，確保 DOM 已準備好
        setTimeout(() => {
          this.setupScrollListener();
        }, 300);
      }
    });
  }

  ngOnInit() {
    // 確保在初始化時也重置分頁狀態
    this.photoService.resetPagination();
    // 載入照片統計資訊
    this.loadPhotoStats();
  }

  ngAfterViewInit() {
    // 確保 DOM 已經準備好後再設置滾動監聽器
    // 注意：這裡只是備用，主要的設置在構造函數中
    setTimeout(() => {
      // 如果還沒有設置監聽器，則設置
      if (!this.cleanupScrollListener) {
        this.setupScrollListener();
      }
    }, 500);
  }

  ngOnDestroy() {
    // 清理滾動監聽器
    if (this.cleanupScrollListener) {
      this.cleanupScrollListener();
    }
  }

  // 載入照片統計資訊
  async loadPhotoStats() {
    const currentSite = this.site();
    if (currentSite && currentSite._id) {
      try {
        const stats = await this.photoService.getPhotoStats(currentSite._id);
        this.totalPhotoCount.set(stats.count);
      } catch (error) {
        console.error('載入照片統計失敗:', error);
      }
    }
  }

  private setupScrollListener(): void {
    // 先清理舊的監聽器
    if (this.cleanupScrollListener) {
      this.cleanupScrollListener();
      this.cleanupScrollListener = undefined;
    }

    // 等待 DOM 更新後再設置監聽器
    setTimeout(() => {
      // 尋找實際可滾動的父容器（右側內容區）
      const scrollContainer = document.querySelector('.flex-fill[style*="overflow-y: auto"]') as HTMLElement;

      if (!scrollContainer) {
        console.log('找不到滾動容器，1秒後重試...');
        // 如果找不到容器，稍後重試
        setTimeout(() => this.setupScrollListener(), 1000);
        return;
      }

      console.log('找到滾動容器，設置滾動監聽器');

      // 主要滾動處理函數
      const scrollHandler = () => {
        const scrollTop = scrollContainer.scrollTop;
        const clientHeight = scrollContainer.clientHeight;
        const scrollHeight = scrollContainer.scrollHeight;

        // 當距離底部小於 200px 時開始載入
        if (scrollHeight - (scrollTop + clientHeight) < 200) {
          this.loadMorePhotos();
        }
      };

      // 添加節流的滾動監聽器
      let ticking = false;
      const throttledScrollHandler = () => {
        if (!ticking) {
          requestAnimationFrame(() => {
            scrollHandler();
            ticking = false;
          });
          ticking = true;
        }
      };

      scrollContainer.addEventListener('scroll', throttledScrollHandler, { passive: true });

      // 儲存清理函數
      this.cleanupScrollListener = () => {
        scrollContainer.removeEventListener('scroll', throttledScrollHandler);
      };

      // 初次檢查是否需要載入更多
      scrollHandler();

    }, 200);
  }

  private checkScrollPosition(): void {
    if (this.isLoading()) {
      return;
    }

    // 檢查是否還有更多照片可以載入
    if (!this.photoService.hasMorePhotos()) {
      return;
    }

    const windowHeight = window.innerHeight;
    const documentHeight = document.documentElement.scrollHeight;
    const scrollTop = window.scrollY || document.documentElement.scrollTop || document.body.scrollTop;
    const scrollBottom = scrollTop + windowHeight;

    // 計算距離底部的距離
    const distanceFromBottom = documentHeight - scrollBottom;

    // 使用百分比作為額外檢查
    const scrollPercentage = (scrollTop + windowHeight) / documentHeight;

    // 當距離底部小於 200px 或滾動超過 85% 時觸發載入
    if (distanceFromBottom < this.scrollThreshold || scrollPercentage >= 0.85) {
      this.loadPhotos();
    }
  }

  async loadPhotos() {
    const currentSite = this.site();
    if (!currentSite) return;

    this.isLoading.set(true);

    // 準備搜尋參數
    const searchParams = {
      startDate: this.searchStartDate || undefined,
      endDate: this.searchEndDate || undefined,
      category: this.searchCategory || undefined
    };

    this.photoService.getPhotos(currentSite._id!, searchParams).subscribe({
      next: (newPhotos) => {
        if (newPhotos.length === 0) {
          this.isLoading.set(false);
          return;
        }

        // 將新圖片加入現有的分組中
        this.updateImageGroups(newPhotos);

        // 更新頁碼，準備下次載入
        this.photoService.nextPage();
        this.isLoading.set(false);
      },
      error: (error) => {
        console.error('載入圖片時發生錯誤:', error);
        this.isLoading.set(false);
      }
    });
  }

  // 手動載入更多照片
  loadMorePhotos(): void {
    if (this.isLoading()) {
      return;
    }

    if (!this.photoService.hasMorePhotos()) {
      return;
    }

    this.loadPhotos();
  }

  private updateImageGroups(newPhotos: Photo[]): void {
    let allPhotos: Photo[];

    // 獲取當前已顯示的所有照片
    const existingPhotos = this.getAllPhotosFromGroups();

    // 如果沒有現有照片（第一次載入）或是重新搜尋（重置後的第一頁）
    if (existingPhotos.length === 0 || this.photoService.getCurrentPage() === 1) {
      // 使用新照片作為初始列表
      allPhotos = [...newPhotos];
    } else {
      // 追加新照片到現有列表（無限滾動）
      allPhotos = [...existingPhotos, ...newPhotos];
    }

    // 保存所有照片用於搜尋
    this.allPhotos = [...allPhotos];

    // 更新照片分組顯示
    this.photoGroups.set(this.groupPhotosByDate(allPhotos));

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
    
    // 🔧 重要修正：將 FileList 轉換為 Array，避免在處理過程中被清空
    const fileArray: File[] = Array.from(files);
    
    this.uploadingFiles.set(true);
    this.uploadProgress.set(0);

    const totalFiles = fileArray.length;
    let uploadedCount = 0;

    // 手機瀏覽器上的特殊處理
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    if (isMobile) {
      console.log('檢測到手機瀏覽器，正在處理檔案上傳...');
    }

    for (let i = 0; i < fileArray.length; i++) {
      const file = fileArray[i];
      
      if (file.type.startsWith('image/')) {
        try {
          await this.uploadFile(file);
          uploadedCount++;
          this.uploadProgress.set(Math.round((uploadedCount / totalFiles) * 100));
        } catch (error) {
          console.error(`❌ 上傳文件 ${file.name} 時發生錯誤:`, error);
        }
      } else {
        console.warn(`⚠️ 跳過非圖片文件: ${file.name} (類型: ${file.type})`);
      }
    }

    console.log(`✅ 文件處理完成! 總共處理: ${totalFiles} 個，成功上傳: ${uploadedCount} 個`);
    
    this.uploadingFiles.set(false);
    // 上傳完成後刷新照片列表
    this.photoService.resetPagination();
    this.loadPhotos();

    // 通知照片統計更新
    const currentSite = this.site();
    if (currentSite && currentSite._id) {
      this.photoService.notifyPhotoStatsUpdated(currentSite._id);
      // 重新載入照片統計
      this.loadPhotoStats();
    }
  }

  private async uploadFile(file: File): Promise<void> {
    console.log(`🚀 開始上傳文件: ${file.name}`);
    
    const currentSite = this.site();
    if (!currentSite) {
      console.error('❌ 找不到工地資訊，無法上傳文件:', file.name);
      return;
    }

    try {
      // 準備元數據，包含標籤信息
      const metadata = {
        projectNo: currentSite.projectNo,
        siteId: currentSite._id!,
        tags: [], // 從這個組件上傳的照片沒有特定的系統標籤
        originalName: file.name, // 確保有原始檔名
        title: file.name // 預設使用檔名作為標題
      };

      console.log(`📤 正在上傳 ${file.name} 到 GridFS...`);
      // 使用 GridFSService 上傳檔案
      const result = await this.gridfsService.uploadFile(file, metadata);
      console.log(`✅ 照片 ${file.name} 上傳成功:`, result);
      return;
    } catch (error) {
      console.error(`❌ 照片 ${file.name} 上傳失敗:`, error);
      throw error;
    }
  }

  // 為其他組件提供的上傳方法，可以指定系統標籤
  async uploadFileWithSystemTag(file: File, systemTagTitle: string): Promise<any> {
    const currentSite = this.site();
    if (!currentSite) throw new Error('找不到工地資訊');

    // 找到對應的系統標籤
    const systemTag = this.systemTags.find(tag => tag.title === systemTagTitle);
    if (!systemTag) throw new Error('找不到指定的系統標籤');

    try {
      // 準備元數據，包含系統標籤
      const metadata = {
        projectNo: currentSite.projectNo,
        siteId: currentSite._id!,
        tags: [systemTag],
        originalName: file.name, // 確保有原始檔名
        title: file.name // 預設使用檔名作為標題
      };

      // 使用 GridFSService 上傳檔案
      const result = await this.gridfsService.uploadFile(file, metadata);
      console.log('照片上傳成功（含系統標籤）:', result);
      return result;
    } catch (error) {
      console.error('照片上傳失敗:', error);
      throw error;
    }
  }

  onFileSelected(event: any) {
    const files = event.target.files;
    if (files && files.length > 0) {
      this.handleFiles(files);
      // 重置檔案輸入框，確保同一檔案可以再次選擇
      event.target.value = '';
    }
  }

  onCameraCapture(event: any) {
    const files = event.target.files;
    if (files && files.length > 0) {
      this.handleFiles(files);
      // 重置檔案輸入框，確保可以重複拍照
      event.target.value = '';
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

    if (confirm('確定要刪除 ' + photo.metadata.title + ' 照片嗎？')) {
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
        // 重新載入照片統計
        this.loadPhotoStats();
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
            if (photoInfo.metadata.tags) {
              photoClone.metadata.tags = [...photoInfo.metadata.tags];

              // 如果 tags 中包含自定義標簽, 則將 isSystemTag 設為 false
              // 系統標籤則維持 true
              const customTags = this.getUserDefinedTags();
              photoClone.metadata.tags.forEach(tag => {
                if (customTags.some(customTag => customTag.title === tag.title)) {
                  tag.isSystemTag = false;
                }
              });
            }
            if (photoInfo.metadata.description) {
              photoClone.metadata.description = photoInfo.metadata.description;
            }
            if (photoInfo.metadata.title) {
              photoClone.metadata.title = photoInfo.metadata.title;
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
      if (!photoClone.metadata.tags || photoClone.metadata.tags.length === 0) {
        photoClone.metadata.tags = [];
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
    // 此方法現在用於更新照片標籤
    console.log('更新照片標籤:', this.selectedPhoto()?.metadata.tags);
  }

  updatePhotoTitle() {
    // 此方法將在編輯標題後被呼叫
    console.log('更新照片標題:', this.selectedPhoto()?.metadata.title);
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
        title: photo.metadata.title || photo.metadata.originalName || fileId,
        tags: photo.metadata.tags || [],
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
      if (photo.metadata.tags && photo.metadata.tags.length > 0) {
        photo.metadata.tags.forEach(tag => {
          if (tag.title && tag.title.trim() !== '') {
            categories.add(tag.title.trim());
          }
        });
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

    // 如果有搜尋條件，重置分頁並重新載入所有照片
    if (this.searchStartDate || this.searchEndDate || this.searchCategory) {
      this.photoService.resetPagination();
      this.photoGroups.set([]);
      this.allPhotos = [];
      this.loadPhotos();
    } else {
      // 如果沒有搜尋條件，顯示所有已載入的照片
      const filteredPhotos = this.filterPhotos(this.allPhotos);
      this.photoGroups.set(this.groupPhotosByDate(filteredPhotos));
    }
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
      if (this.searchCategory && !(photo.metadata.tags && photo.metadata.tags.some(tag => tag.title === this.searchCategory))) {
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

    // 重置分頁並重新載入所有照片
    this.photoService.resetPagination();
    this.photoGroups.set([]);
    this.allPhotos = [];
    this.loadPhotos();
  }

  /**
   * 判斷是否有搜尋條件
   */
  isSearchActive(): boolean {
    return this.isFiltered() || !!(this.searchStartDate || this.searchEndDate || this.searchCategory);
  }

  // 標籤管理方法
  addTagToPhoto(tag: PhotoTag): void {
    const photo = this.selectedPhoto();
    if (!photo) return;

    if (!photo.metadata.tags) {
      photo.metadata.tags = [];
    }

    // 檢查標籤是否已存在
    const existingTag = photo.metadata.tags.find(t => t.title === tag.title);
    if (!existingTag) {
      photo.metadata.tags.push({ ...tag });
    }
  }

  removeTagFromPhoto(tagIndex: number): void {
    const photo = this.selectedPhoto();
    if (!photo || !photo.metadata.tags) return;

    const tag = photo.metadata.tags[tagIndex];

    // 系統標籤不可刪除
    if (tag.isSystemTag) {
      alert('系統標籤無法刪除');
      return;
    }

    photo.metadata.tags.splice(tagIndex, 1);
  }

  openNewTagModal(): void {
    if (!this.canManageTags()) {
      alert('您沒有權限管理標籤');
      return;
    }

    // 重置表單為預設值
    this.newTagTitle = '';
    this.newTagColor = '#ffffff';
    this.newTagBackground = '#007bff';
    this.showNewTagModal.set(true);

    // 防止頁面滾動
    document.body.style.overflow = 'hidden';
  }

  closeNewTagModal(): void {
    this.showNewTagModal.set(false);
    // 恢復頁面滾動
    document.body.style.overflow = '';
  }

  selectPresetColor(preset: { color: string; background: string; name: string }): void {
    this.newTagColor = preset.color;
    this.newTagBackground = preset.background;
  }

  createNewTag(): void {
    if (!this.newTagTitle.trim()) {
      alert('請輸入標籤名稱');
      return;
    }

    const newTag: PhotoTag = {
      title: this.newTagTitle.trim(),
      color: this.newTagColor,
      background: this.newTagBackground,
      isSystemTag: false
    };

    // 添加到當前照片
    this.addTagToPhoto(newTag);

    // 關閉對話框
    this.closeNewTagModal();
  }

  // 獲取所有可用標籤（系統標籤 + 用戶自定義標籤）
  getAvailableTags(): PhotoTag[] {
    const userTags: PhotoTag[] = [];

    // 從所有照片中收集用戶自定義標籤
    this.allPhotos.forEach(photo => {
      if (photo.metadata.tags) {
        photo.metadata.tags.forEach(tag => {
          if (!tag.isSystemTag && !userTags.find(t => t.title === tag.title)) {
            userTags.push({ ...tag });
          }
        });
      }
    });

    return [...this.systemTags, ...userTags];
  }

  // 獲取僅用戶自定義標籤（排除系統標籤）
  getUserDefinedTags(): PhotoTag[] {
    const userTags: PhotoTag[] = [];

    // 加入幾個系統標籤, 空調系統/給排水系統/消防系統/電力系統/內裝系統/製程系統/監控系統/環安
    let systemTags = ['空調系統', '給排水系統', '消防系統', '電力系統', '內裝系統', '製程系統', '監控系統', '環安'];
    for (let i = 0; i < systemTags.length; i++) {
      userTags.push({
        title: systemTags[i],
        color: this.presetColors[i].color,
        background: this.presetColors[i].background,
        isSystemTag: false
      });
    }

    // 從所有照片中收集用戶自定義標籤
    this.allPhotos.forEach(photo => {
      if (photo.metadata.tags) {
        photo.metadata.tags.forEach(tag => {
          if (!tag.isSystemTag && !userTags.find(t => t.title === tag.title)) {
            userTags.push({ ...tag });
          }
        });
      }
    });

    return userTags;
  }

  // 檢查照片是否已有某個標籤
  hasTag(photo: Photo, tagTitle: string): boolean {
    return photo.metadata.tags?.some(tag => tag.title === tagTitle) || false;
  }

  // 檢查照片是否包含系統標籤（機具管理、工地缺失等）
  hasSystemTags(photo: Photo): boolean {
    if (!photo.metadata.tags) {
      return false;
    }

    return photo.metadata.tags.some(tag =>
      tag.isSystemTag === true ||
      this.systemTags.some(systemTag => systemTag.title === tag.title)
    );
  }

  // 檢查照片是否為機具管理照片且包含設備ID
  isEquipmentPhoto(photo: Photo): boolean {
    return (photo.metadata.tags?.some(tag => tag.title === '機具管理') ?? false) && 
           !!photo.metadata.equipmentId;
  }

  // 導航到設備詳情頁面
  navigateToEquipment(photo: Photo): void {
    if (!photo.metadata.equipmentId) return;
    
    this.router.navigate(['/site', this.siteId, 'equipment', photo.metadata.equipmentId]);
  }
}

export interface PhotoGroup {
  date: Date;
  displayDate: string;
  photos: Photo[];
}

export interface Photo {
  id: number;
  url: string; // 原始圖片 URL
  thumbnailUrl?: string; // 縮圖 URL
  // title: string;
  date: string;  // ISO 格式的日期字串 (YYYY-MM-DD)
  metadata: {
    tags?: PhotoTag[];
    title: string;
    description?: string;
    location?: string; // 新增地點欄位
    equipmentId?: string; // 機具管理照片的設備ID
    equipmentName?: string; // 機具管理照片的設備名稱
    originalName?: string; // 原始檔案名稱
  };
}

export interface PhotoTag {
  title: string;
  color: string;
  background: string;
  isSystemTag?: boolean; // 系統標籤不可刪除
}
