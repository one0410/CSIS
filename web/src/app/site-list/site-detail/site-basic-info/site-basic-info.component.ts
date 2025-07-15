import { Component, OnInit, OnDestroy, ViewChild, ElementRef, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Site } from '../../site-list.component';
import { MongodbService } from '../../../services/mongodb.service';
import { ToastService } from '../../../services/toast.service';
import { PhotoService, PhotoStats } from '../../../services/photo.service';
import { ActivatedRoute } from '@angular/router';
import { CurrentSiteService } from '../../../services/current-site.service';
import { AreaService } from '../../../services/area.service';
import { AuthService } from '../../../services/auth.service';
import { Subscription } from 'rxjs';

@Component({
    selector: 'app-site-basic-info',
    imports: [CommonModule, FormsModule],
    templateUrl: './site-basic-info.component.html',
    styleUrl: './site-basic-info.component.scss'
})

export class SiteBasicInfoComponent implements OnInit, OnDestroy {
  // 使用 computed 創建本地計算屬性，讓模板使用更簡潔
  site = computed(() => this.currentSiteService.currentSite());
  currentUser = computed(() => this.authService.user());
  
  // 動態照片統計資料
  photoStats = signal<PhotoStats>({ count: 0, size: 0 });
  
  // 縣市和鄉鎮市區相關
  counties = signal<string[]>([]);
  townships = signal<string[]>([]);
  
  // 訂閱管理
  private photoStatsSubscription?: Subscription;
  
  @ViewChild('logoFileInput') logoFileInput!: ElementRef;
  @ViewChild('imageFileInput') imageFileInput!: ElementRef;
  isEditMode = false;
  editForm: any = {
    logoFile: null,
    logoPreview: '',
    imageFile: null,
    imagePreview: '',
  };
  originalForm: any = {};

  constructor(
    private mongodbService: MongodbService, 
    private toastService: ToastService,
    private photoService: PhotoService,
    private route: ActivatedRoute,
    private currentSiteService: CurrentSiteService,
    private areaService: AreaService,
    private authService: AuthService
  ) {}

  async ngOnInit() {
    // 初始化縣市清單
    this.counties.set(this.areaService.getCountyNames());
    
    // 从父路由获取工地ID
    const parent = this.route.parent;
    if (parent) {
      parent.paramMap.subscribe(async params => {
        const siteId = params.get('id');
        if (siteId) {
          // 使用 CurrentSiteService 獲取工地資訊，避免重複從資料庫載入
          await this.currentSiteService.loadSite(siteId);
          this.resetForm();
          await this.updatePhotoStats();
          
          // 訂閱照片統計更新通知
          this.photoStatsSubscription = this.photoService.photoStatsUpdated$.subscribe(updatedSiteId => {
            if (updatedSiteId === siteId) {
              this.updatePhotoStats();
            }
          });
        }
      });
    }
  }

  ngOnDestroy() {
    // 清理訂閱
    if (this.photoStatsSubscription) {
      this.photoStatsSubscription.unsubscribe();
    }
  }

  async updatePhotoStats() {
    const currentSite = this.site();
    if (currentSite && currentSite._id) {
      try {
        // 取得照片統計數據
        const stats = await this.photoService.getPhotoStats(currentSite._id);
        
        // 更新本地 signal
        this.photoStats.set(stats);
        
        // 同時更新 site 的照片計數和容量以保持向後相容
        const updatedSite = {...currentSite, photoCount: stats.count, photoSize: stats.size};
        this.currentSiteService.updateSite(updatedSite);
      } catch (error) {
        console.error('取得照片統計數據時發生錯誤:', error);
      }
    }
  }

  resetForm() {
    const currentSite = this.site();
    if (currentSite) {
      // 深層複製 site 物件，避免直接操作原始資料
      this.editForm = {
        projectNo: currentSite.projectNo,
        projectName: currentSite.projectName,
        startDate: currentSite.startDate,
        endDate: currentSite.endDate,
        county: currentSite.county,
        town: currentSite.town,
        factories: JSON.parse(JSON.stringify(currentSite.factories || [])),
        constructionTypes: JSON.parse(JSON.stringify(currentSite.constructionTypes || [])),
        remark: currentSite.remark || '',
        formLogo: currentSite.formLogo || '',
        logoFile: null,
        logoPreview: '',
        image: currentSite.image || '',
        imageFile: null,
        imagePreview: '',
      };
      
      // 如果有縣市，載入對應的鄉鎮市區
      if (currentSite.county) {
        this.loadTownshipsByCounty(currentSite.county);
      }
      
      // 保存原始資料用於取消操作
      this.originalForm = JSON.parse(JSON.stringify(this.editForm));
    }
  }

  toggleEditMode() {
    this.isEditMode = true;
    this.resetForm();
  }

  cancelEdit() {
    this.isEditMode = false;
    this.resetForm();
  }

  async saveChanges() {
    try {
      const currentSite = this.site();
      if (currentSite && currentSite._id) {
        // 如果有新上傳的Logo，處理圖片並更新formLogo
        if (this.editForm.logoFile) {
          this.editForm.formLogo = await this.processImage(this.editForm.logoFile, 200, 200);
          delete this.editForm.logoFile;
          delete this.editForm.logoPreview;
        }
        
        // 如果有新上傳的工地圖片，處理圖片並更新image
        if (this.editForm.imageFile) {
          this.editForm.image = await this.processImage(this.editForm.imageFile, 400, 300);
          delete this.editForm.imageFile;
          delete this.editForm.imagePreview;
        }
        
        // 使用 CurrentSiteService 來更新資料庫和本地狀態
        const updatedSite = await this.currentSiteService.saveSiteChanges(currentSite._id, this.editForm);
        
        if (updatedSite) {
          this.isEditMode = false;
          console.log('工地資料更新成功');
          
          // 顯示成功訊息
          this.toastService.info('工地資料已更新');
        }
      }
    } catch (error) {
      console.error('更新工地資料時發生錯誤:', error);
      // 顯示錯誤訊息
      this.toastService.error('更新失敗，請稍後再試');
    }
  }

  // 照片相關方法
  calculatePhotoUsage(): number {
    const stats = this.photoStats();
    if (!stats || !stats.size) {
      return 0;
    }
    // 計算使用百分比，最大容量為 1000MB
    const usage = (stats.size / 1000) * 100;
    // 四捨五入到小數點後兩位
    return Math.round(usage * 100) / 100;
  }

  getProgressBarClass(): string {
    const usage = this.calculatePhotoUsage();
    
    if (usage >= 90) {
      return 'bg-danger'; // 使用量 >= 90% 顯示紅色
    } else if (usage >= 70) {
      return 'bg-warning'; // 使用量 >= 70% 顯示黃色
    } else {
      return 'bg-success'; // 使用量 < 70% 顯示綠色
    }
  }

  // 工地圖片相關方法
  onImageSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      const file = input.files[0];
      const validTypes = ['image/jpeg', 'image/png', 'image/jpg'];
      
      if (!validTypes.includes(file.type)) {
        this.toastService.error('請上傳 JPG 或 PNG 格式的圖片');
        return;
      }
      
      this.editForm.imageFile = file;
      this.createImagePreview(file);
    }
  }

  removeImage() {
    this.editForm.imageFile = null;
    this.editForm.imagePreview = '';
    this.editForm.image = '';
    if (this.imageFileInput) {
      this.imageFileInput.nativeElement.value = '';
    }
  }

  onImageDragOver(event: DragEvent) {
    event.preventDefault();
    event.stopPropagation();
    const element = event.currentTarget as HTMLElement;
    if (element) {
      element.classList.add('dragover');
    }
  }

  onImageDragLeave(event: DragEvent) {
    event.preventDefault();
    event.stopPropagation();
    const element = event.currentTarget as HTMLElement;
    if (element) {
      element.classList.remove('dragover');
    }
  }

  onImageDrop(event: DragEvent) {
    event.preventDefault();
    event.stopPropagation();
    
    const element = event.currentTarget as HTMLElement;
    if (element) {
      element.classList.remove('dragover');
    }
    
    if (event.dataTransfer && event.dataTransfer.files.length > 0) {
      const file = event.dataTransfer.files[0];
      const validTypes = ['image/jpeg', 'image/png', 'image/jpg'];
      
      if (!validTypes.includes(file.type)) {
        this.toastService.error('請上傳 JPG 或 PNG 格式的圖片');
        return;
      }
      
      this.editForm.imageFile = file;
      this.createImagePreview(file);
    }
  }

  private createImagePreview(file: File) {
    const reader = new FileReader();
    reader.onload = (e) => {
      this.editForm.imagePreview = e.target?.result as string;
    };
    reader.readAsDataURL(file);
  }

  // Logo 相關方法
  onLogoSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      const file = input.files[0];
      const validTypes = ['image/jpeg', 'image/png', 'image/jpg'];
      
      if (!validTypes.includes(file.type)) {
        this.toastService.error('請上傳 JPG 或 PNG 格式的圖片');
        return;
      }
      
      this.editForm.logoFile = file;
      this.createLogoPreview(file);
    }
  }

  removeLogo() {
    this.editForm.logoFile = null;
    this.editForm.logoPreview = '';
    this.editForm.formLogo = '';
    if (this.logoFileInput) {
      this.logoFileInput.nativeElement.value = '';
    }
  }

  onDragOver(event: DragEvent) {
    event.preventDefault();
    event.stopPropagation();
    const element = event.currentTarget as HTMLElement;
    if (element) {
      element.classList.add('dragover');
    }
  }

  onDragLeave(event: DragEvent) {
    event.preventDefault();
    event.stopPropagation();
    const element = event.currentTarget as HTMLElement;
    if (element) {
      element.classList.remove('dragover');
    }
  }

  onDrop(event: DragEvent) {
    event.preventDefault();
    event.stopPropagation();
    
    const element = event.currentTarget as HTMLElement;
    if (element) {
      element.classList.remove('dragover');
    }
    
    if (event.dataTransfer && event.dataTransfer.files.length > 0) {
      const file = event.dataTransfer.files[0];
      const validTypes = ['image/jpeg', 'image/png', 'image/jpg'];
      
      if (!validTypes.includes(file.type)) {
        this.toastService.error('請上傳 JPG 或 PNG 格式的圖片');
        return;
      }
      
      this.editForm.logoFile = file;
      this.createLogoPreview(file);
    }
  }

  private createLogoPreview(file: File) {
    const reader = new FileReader();
    reader.onload = (e) => {
      this.editForm.logoPreview = e.target?.result as string;
    };
    reader.readAsDataURL(file);
  }

  // 通用的圖片處理方法
  private async processImage(file: File, maxWidth: number, maxHeight: number): Promise<string> {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          // 調整圖片大小
          const canvas = document.createElement('canvas');
          let width = img.width;
          let height = img.height;
          
          // 如果圖片超過最大尺寸，等比例縮小
          if (width > maxWidth || height > maxHeight) {
            const ratio = Math.min(maxWidth / width, maxHeight / height);
            width *= ratio;
            height *= ratio;
          }
          
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx?.drawImage(img, 0, 0, width, height);
          
          // 將 canvas 轉為 Data URL
          const dataUrl = canvas.toDataURL(file.type);
          resolve(dataUrl);
        };
        img.src = e.target?.result as string;
      };
      reader.readAsDataURL(file);
    });
  }

  // 廠區相關方法
  addFactory() {
    this.editForm.factories.push({ name: '', areas: [''] });
  }

  removeFactory(index: number) {
    this.editForm.factories.splice(index, 1);
    if (this.editForm.factories.length === 0) {
      this.addFactory();
    }
  }

  addArea(factoryIndex: number) {
    this.editForm.factories[factoryIndex].areas.push('');
  }

  removeArea(factoryIndex: number, areaIndex: number) {
    this.editForm.factories[factoryIndex].areas.splice(areaIndex, 1);
    if (this.editForm.factories[factoryIndex].areas.length === 0) {
      this.addArea(factoryIndex);
    }
  }

  // 作業類型相關方法
  addConstructionType() {
    this.editForm.constructionTypes.push('');
  }

  removeConstructionType(index: number) {
    this.editForm.constructionTypes.splice(index, 1);
  }

  // 縣市和鄉鎮市區相關方法
  onCountyChange(selectedCounty: string) {
    // 更新表單的縣市
    this.editForm.county = selectedCounty;
    
    // 清空鄉鎮市區選項
    this.editForm.town = '';
    
    // 載入對應的鄉鎮市區
    this.loadTownshipsByCounty(selectedCounty);
  }

  loadTownshipsByCounty(countyName: string) {
    if (countyName) {
      const townshipNames = this.areaService.getTownshipNamesByCounty(countyName);
      this.townships.set(townshipNames);
    } else {
      this.townships.set([]);
    }
  }

  onTownshipChange(selectedTownship: string) {
    this.editForm.town = selectedTownship;
  }

  // 檢查當前使用者是否有權限編輯基本資訊
  canEditBasicInfo(): boolean {
    const user = this.currentUser();
    const currentSite = this.site();
    if (!user || !currentSite?._id) return false;
    
    // 取得當前使用者在此工地的角色
    const userSiteRole = user.belongSites?.find(site => site.siteId === currentSite._id)?.role;
    
    // 只有專案經理(projectManager)和專案秘書(secretary)可以編輯基本資訊 或 currentUser是管理員
    return userSiteRole === 'projectManager' || userSiteRole === 'secretary' || this.currentUser()?.role === 'admin';
  }
}
