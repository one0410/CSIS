import { Injectable, signal } from '@angular/core';
import { Photo, PhotoGroup, PhotoTag } from '../site-list/site-detail/site-photos/site-photos.component';
import { Observable, from, of, Subject } from 'rxjs';
import dayjs from 'dayjs';

// 照片統計資訊介面
export interface PhotoStats {
  count: number;  // 照片張數
  size: number;   // 照片大小 (MB)
}

@Injectable({
  providedIn: 'root'
})
export class PhotoService {
  private page = signal<number>(1);
  private pageSize = 20; // 增加每頁載入的照片數量
  private loading = signal<boolean>(false);
  private hasMore = signal<boolean>(true);

  // 照片統計更新通知
  private photoStatsUpdated = new Subject<string>();
  public photoStatsUpdated$ = this.photoStatsUpdated.asObservable();

  // 假設的照片資料快取
  private photoCache: { [projectNo: string]: Photo[] } = {};
  // 假設的照片大小資料 (單位: MB)
  private photoSizes: { [photoId: number]: number } = {};

  // 系統標籤定義
  public readonly systemTags: PhotoTag[] = [
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

  constructor() {
    // 初始化範例照片大小資料
    this.initDemoData();
  }

  private initDemoData() {
    // 為模擬資料建立隨機照片大小
    for (let i = 1; i <= 200; i++) {
      // 每張照片 1-5 MB
      this.photoSizes[i] = Math.random() * 4 + 1;
    }
  }

  /**
   * 獲取照片統計資訊
   * @param siteId 工地ID
   * @returns Promise<PhotoStats> 照片統計資訊
   */
  async getPhotoStats(siteId: string): Promise<PhotoStats> {
    try {
      const url = this.getApiUrl(`/api/photos-stats/${siteId}`);
      
      const response = await fetch(url, {
        method: 'GET',
        mode: 'cors',
        credentials: 'include'
      });
      
      if (!response.ok) {
        throw new Error('無法獲取照片統計');
      }
      
      const stats = await response.json();
      
      return {
        count: stats.count || 0,
        size: stats.size || 0
      };
    } catch (error) {
      console.error('取得照片統計數據時發生錯誤:', error);
      // 如果API調用失敗，返回預設值
      return {
        count: 0,
        size: 0
      };
    }
  }

  /**
   * 通知照片統計已更新
   * @param siteId 工地ID
   */
  notifyPhotoStatsUpdated(siteId: string) {
    this.photoStatsUpdated.next(siteId);
  }

  // 處理 API URL，根據環境添加基礎路徑
  private getApiUrl(path: string): string {
    if (window.location.port === '4200') {
      return `http://localhost:3000${path}`;
    }
    return path;
  }

  // 獲取當前頁碼
  getCurrentPage(): number {
    return this.page();
  }

  nextPage(): void {
    const newPage = this.page() + 1;
    this.page.set(newPage);
    console.log('頁碼更新:', newPage);
  }

  resetPagination(): void {
    console.log('重置分頁狀態');
    this.page.set(1);
    this.hasMore.set(true);
    console.log('分頁重置完成: page =', this.page(), 'hasMore =', this.hasMore());
  }

  // 檢查是否還有更多照片可以載入
  hasMorePhotos(): boolean {
    return this.hasMore();
  }

  getPhotos(siteId: string, searchParams?: {
    startDate?: string;
    endDate?: string;
    category?: string;
  }): Observable<Photo[]> {
    if (!this.hasMore() || this.loading()) {
      console.log('跳過載入：hasMore =', this.hasMore(), 'loading =', this.loading());
      return of([]);
    }

    this.loading.set(true);
    
    // 構建查詢參數
    let path = `/api/photos?page=${this.page()}&pageSize=${this.pageSize}`;
    if (siteId) {
      path += `&siteId=${siteId}`;
    }
    
    // 添加搜尋條件
    if (searchParams) {
      if (searchParams.startDate) {
        path += `&startDate=${searchParams.startDate}`;
      }
      if (searchParams.endDate) {
        path += `&endDate=${searchParams.endDate}`;
      }
      if (searchParams.category) {
        path += `&category=${encodeURIComponent(searchParams.category)}`;
      }
    }

    const url = this.getApiUrl(path);
    console.log('請求照片 URL:', url);

    return from(
      fetch(url, {
        method: 'GET',
        mode: 'cors',
        credentials: 'include'
      })
        .then(response => {
          if (!response.ok) {
            throw new Error('無法獲取照片');
          }
          return response.json();
        })
        .then(response => {
          this.loading.set(false);
          
          console.log('API 回應原始資料:', response);
          
          // 處理不同的 API 回應格式
          let photos: any[] = [];
          
          if (Array.isArray(response)) {
            // 直接是陣列格式
            photos = response;
          } else if (response && Array.isArray(response.data)) {
            // 包含 data 屬性的格式
            photos = response.data;
          } else if (response && response.files && Array.isArray(response.files)) {
            // GridFS 格式
            photos = response.files;
          } else {
            console.warn('未知的 API 回應格式:', response);
            photos = [];
          }
          
          console.log('處理後的照片資料:', photos.length, '張');
          
          // 如果返回的照片數量小於頁面大小，表示沒有更多照片了
          if (photos.length < this.pageSize) {
            console.log('沒有更多照片了，設定 hasMore = false');
            this.hasMore.set(false);
          }
          
          // 將API響應轉換為Photo對象
          return photos.map((item: any) => ({
            id: item._id || item.id || item.filename,
            url: this.getApiUrl(`/api/gridfs/${item.filename}`), // 原始圖片 URL
            thumbnailUrl: this.getApiUrl(`/api/gridfs/thumbnail/${item.filename}?width=400&quality=80`), // 縮圖 URL
            date: item.metadata?.uploadDate || dayjs().format('YYYY-MM-DD'),
            metadata: {
              ...item.metadata || {},
              // 確保 title 有值，優先使用 metadata.title，其次 originalName，最後用 filename
              title: item.metadata?.title || item.metadata?.originalName || item.filename
            }
          }));
        })
        .catch(error => {
          this.loading.set(false);
          console.error('獲取照片時發生錯誤:', error);
          return [];
        })
    );
  }

  // 將照片上傳到MongoDB GridFS
  uploadPhoto(file: File, metadata?: { [key: string]: any }): Observable<any> {
    // 檢查文件大小
    const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
    if (file.size > MAX_FILE_SIZE) {
      return from(Promise.reject(new Error(`文件過大，大小限制為 ${MAX_FILE_SIZE / (1024 * 1024)}MB`)));
    }
    
    if (!file || file.size === 0) {
      return from(Promise.reject(new Error('文件為空')));
    }
    
    const formData = new FormData();
    formData.append('file', file);
    
    if (metadata) {
      Object.entries(metadata).forEach(([key, value]) => {
        formData.append(key, value);
      });
    }
    
    const url = this.getApiUrl('/api/gridfs/upload');
    
    return from(
      fetch(url, {
        method: 'POST',
        body: formData,
        mode: 'cors',
        credentials: 'include'
      })
      .then(response => {
        if (!response.ok) {
          return response.json().then(errorData => {
            throw new Error(errorData.message || '上傳照片失敗');
          }).catch(() => {
            throw new Error('上傳照片失敗');
          });
        }
        return response.json();
      })
      .catch(error => {
        console.error('照片上傳失敗:', error);
        throw error;
      })
    );
  }

  // 上傳帶有系統標籤的照片
  uploadPhotoWithSystemTag(file: File, systemTagTitle: string, siteId: string, projectNo: string, additionalMetadata?: { [key: string]: any }): Observable<any> {
    // 找到對應的系統標籤
    const systemTag = this.systemTags.find(tag => tag.title === systemTagTitle);
    if (!systemTag) {
      return from(Promise.reject(new Error('找不到指定的系統標籤')));
    }

    console.log('正在上傳帶有系統標籤的照片:', {
      systemTagTitle,
      systemTag,
      siteId,
      projectNo,
      additionalMetadata
    });

    // 準備包含系統標籤的元數據
    const metadata = {
      projectNo: projectNo,
      siteId: siteId,
      tags: JSON.stringify([systemTag]), // 轉換為 JSON 字串以便傳輸
      category: systemTagTitle, // 向後兼容
      originalName: file.name, // 確保有原始檔名
      title: file.name, // 預設使用檔名作為標題
      ...additionalMetadata // 合併額外的元數據
    };

    return this.uploadPhoto(file, metadata);
  }

  // 從MongoDB GridFS中刪除照片
  deletePhoto(filename: string): Observable<any> {
    const url = this.getApiUrl(`/api/gridfs/${filename}`);
    
    return from(
      fetch(url, {
        method: 'DELETE',
        mode: 'cors',
        credentials: 'include'
      })
      .then(response => {
        if (!response.ok) {
          return response.json().then(errorData => {
            throw new Error(errorData.message || '刪除照片失敗');
          }).catch(() => {
            throw new Error('刪除照片失敗');
          });
        }
        return response.json();
      })
      .catch(error => {
        console.error('刪除照片時發生錯誤:', error);
        throw error;
      })
    );
  }

  groupPhotosByDate(photos: Photo[]): PhotoGroup[] {
    // 先將圖片依日期排序（新到舊）
    const sortedPhotos = [...photos].sort((a, b) => 
      new Date(b.date).getTime() - new Date(a.date).getTime()
    );

    // 建立一個 Map 來存儲分組
    const groups = new Map<string, Photo[]>();

    // 將圖片分組
    sortedPhotos.forEach(photo => {
      const date = photo.date.split('T')[0]; // 只取日期部分
      if (!groups.has(date)) {
        groups.set(date, []);
      }
      groups.get(date)!.push(photo);
    });

    // 轉換成陣列格式並加入顯示用的日期格式
    return Array.from(groups.entries()).map(([date, photos]) => ({
      date: new Date(date),
      displayDate: dayjs(date).format('YYYY年MM月DD日'),
      photos: photos
    }));
  }

  getPhotoThumbnailUrl(filename: string): string {
    let url = `/api/gridfs/file/${filename}?thumbnail=true`;
    if (window.location.port === '4200') {
      url = `http://localhost:3000${url}`;
    }
    return url;
  }
}
