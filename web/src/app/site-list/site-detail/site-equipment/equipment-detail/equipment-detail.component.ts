import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { Equipment, EquipmentPhoto } from '../../../../model/equipment.model';
import { MongodbService } from '../../../../services/mongodb.service';
import { GridFSService } from '../../../../services/gridfs.service';
import { CurrentSiteService } from '../../../../services/current-site.service';
import { PhotoService } from '../../../../services/photo.service';

@Component({
  selector: 'app-equipment-detail',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './equipment-detail.component.html',
  styleUrl: './equipment-detail.component.scss',
})
export class EquipmentDetailComponent implements OnInit {
  siteId: string | null = null;
  equipmentId: string | null = null;
  isLoading = signal(true);
  equipment = signal<Equipment | null>(null);
  isEditing = signal(false);
  editedEquipment: Equipment | null = null;
  isNewEquipment = signal(false);

  // 照片上傳相關
  isUploading = signal(false);
  selectedFiles: File[] = [];
  photoCaption = '';
  uploadProgress = { current: 0, total: 0 };

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private mongodbService: MongodbService,
    private gridFSService: GridFSService,
    private currentSiteService: CurrentSiteService,
    private photoService: PhotoService
  ) {}

  ngOnInit() {
    this.route.paramMap.subscribe((params) => {
      this.siteId = params.get('id');
      this.equipmentId = params.get('equipmentId');
      
      if (this.equipmentId === 'new') {
        // 新增設備模式
        this.isNewEquipment.set(true);
        this.isEditing.set(true);
        this.initNewEquipment();
      } else if (this.equipmentId) {
        // 編輯現有設備模式
        this.isNewEquipment.set(false);
        this.loadEquipmentDetails();
      }
    });
  }

  initNewEquipment() {
    this.isLoading.set(true);
    const newEquipment: Equipment = {
      siteId: this.siteId || '',
      name: '',
      status: 'available',
    };
    this.equipment.set(newEquipment);
    this.editedEquipment = { ...newEquipment };
    this.isLoading.set(false);
  }

  async loadEquipmentDetails() {
    this.isLoading.set(true);
    try {
      if (!this.equipmentId) return;

      const data = await this.mongodbService.getById(
        'equipment',
        this.equipmentId
      );

      this.equipment.set(data);
    } catch (error) {
      console.error('Error loading equipment details', error);
    } finally {
      this.isLoading.set(false);
    }
  }

  getPhotoUrl(filename: string) {
    if (window.location.port === '4200') {
      return 'http://localhost:3000' + '/api/gridfs/' + filename;
    }
    return '/api/gridfs/' + filename;
  }

  startEditing() {
    if (this.equipment()) {
      this.editedEquipment = JSON.parse(JSON.stringify(this.equipment()));
      this.isEditing.set(true);
    }
  }

  cancelEditing() {
    if (this.isNewEquipment()) {
      // 如果是新增設備，返回設備列表
      this.goBack();
    } else {
      // 如果是編輯現有設備，取消編輯
      this.isEditing.set(false);
      this.editedEquipment = null;
    }
  }

  async saveEquipment() {
    if (!this.editedEquipment) return;

    try {
      if (this.isNewEquipment()) {
        // 新增設備
        const result = await this.mongodbService.post(
          'equipment',
          this.editedEquipment
        );
        
        if (result.insertedId) {
          this.editedEquipment._id = result.insertedId;
          this.equipment.set(this.editedEquipment);
          this.isEditing.set(false);
          this.isNewEquipment.set(false);
          this.equipmentId = result.insertedId;
          
          // 發送 WebSocket 事件並更新機具列表
          await this.currentSiteService.onEquipmentCreated(result.insertedId, this.siteId!);
          
          // 跳轉到編輯模式的URL
          this.router.navigate(['/site', this.siteId, 'equipment', result.insertedId], { replaceUrl: true });
        } else {
          console.error('新增設備失敗', result.error);
        }
      } else {
        // 編輯現有設備
        if (!this.equipmentId) return;
        
        const result = await this.mongodbService.put(
          'equipment',
          this.equipmentId,
          this.editedEquipment
        );
        
        if (result) {
          this.equipment.set(this.editedEquipment);
          this.isEditing.set(false);
          this.editedEquipment = null;
          
          // 發送 WebSocket 事件並更新機具列表
          await this.currentSiteService.onEquipmentUpdated(this.equipmentId, this.siteId!);
        } else {
          console.error('更新設備資訊失敗');
        }
      }
    } catch (error) {
      console.error('儲存設備時發生錯誤:', error);
    }
  }

  onFilesSelected(event: Event) {
    const element = event.target as HTMLInputElement;
    if (element.files && element.files.length > 0) {
      // 將新選擇的檔案添加到現有列表中
      const newFiles = Array.from(element.files);
      this.selectedFiles = [...this.selectedFiles, ...newFiles];
    }
  }

  removeSelectedFile(index: number) {
    this.selectedFiles.splice(index, 1);
  }

  clearSelectedFiles() {
    this.selectedFiles = [];
    // 重置檔案選擇器
    const fileInput = document.getElementById('photo-upload') as HTMLInputElement;
    if (fileInput) {
      fileInput.value = '';
    }
  }

  formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  async uploadPhotos() {
    if (this.selectedFiles.length === 0 || !this.equipmentId) return;

    this.isUploading.set(true);
    this.uploadProgress = { current: 0, total: this.selectedFiles.length };

    try {
      const currentSite = await this.currentSiteService.currentSite();
      if (!currentSite) {
        throw new Error('找不到工地資訊');
      }

      const currentEquipment = this.equipment();
      if (!currentEquipment) return;

      const newPhotos: EquipmentPhoto[] = [];
      const uploadPromises: Promise<any>[] = [];

      // 為每張照片建立上傳Promise
      for (let i = 0; i < this.selectedFiles.length; i++) {
        const file = this.selectedFiles[i];
        const uploadPromise = new Promise<any>((resolve, reject) => {
          this.photoService.uploadPhotoWithSystemTag(
            file,
            '機具管理',
            this.siteId!,
            currentSite.projectNo,
            {
              equipmentId: this.equipmentId, // 加入設備ID到metadata中
              equipmentName: currentEquipment.name // 同時加入設備名稱以便識別
            }
          ).subscribe({
            next: (result) => {
              this.uploadProgress.current = i + 1;
              resolve(result);
            },
            error: (error) => reject(error)
          });
        });
        uploadPromises.push(uploadPromise);
      }

      // 等待所有照片上傳完成
      const uploadResults = await Promise.all(uploadPromises);
      
      // 檢查上傳結果並建立照片資訊
      for (const uploadResult of uploadResults) {
        if (!uploadResult || !uploadResult.filename) {
          throw new Error('部分照片上傳失敗');
        }
        
        const newPhoto: EquipmentPhoto = {
          siteId: this.siteId!,
          equipmentId: this.equipmentId,
          filename: uploadResult.filename,
          caption: this.photoCaption,
          uploadDate: new Date(),
        };
        newPhotos.push(newPhoto);
      }
      
      // 更新設備照片列表
      const updatedEquipment = { 
        ...currentEquipment,
        photos: [...(currentEquipment.photos || []), ...newPhotos]
      };
      
      // 使用MongoDB服務更新設備資訊
      const result = await this.mongodbService.put(
        'equipment',
        this.equipmentId,
        updatedEquipment
      );
      
      if (result) {
        this.equipment.set(updatedEquipment);
        this.resetPhotoForm();
        
        // 通知照片服務統計更新
        this.photoService.notifyPhotoStatsUpdated(this.siteId!);
        
        alert(`成功上傳 ${newPhotos.length} 張照片`);
      } else {
        console.error('更新設備照片資訊失敗');
        alert('照片上傳成功，但更新設備資訊失敗');
      }
    } catch (error) {
      console.error('上傳照片時發生錯誤:', error);
      alert('上傳照片失敗，請稍後重試');
    } finally {
      this.isUploading.set(false);
      this.uploadProgress = { current: 0, total: 0 };
    }
  }

  resetPhotoForm() {
    this.selectedFiles = [];
    this.photoCaption = '';
    this.uploadProgress = { current: 0, total: 0 };
    // 重置檔案選擇器
    const fileInput = document.getElementById(
      'photo-upload'
    ) as HTMLInputElement;
    if (fileInput) {
      fileInput.value = '';
    }
  }

  async deletePhoto(photoIndex: number) {
    if (!confirm('確定要刪除此照片？')) return;

    const currentEquipment = this.equipment();
    if (!currentEquipment || !currentEquipment.photos || !this.equipmentId)
      return;

    const updatedPhotos = [...currentEquipment.photos];
    const deletedPhoto = updatedPhotos[photoIndex];
    updatedPhotos.splice(photoIndex, 1);

    const updatedEquipment = {
      ...currentEquipment,
      photos: updatedPhotos,
    };

    try {
      // 先從GridFS中刪除實際的檔案
      if (deletedPhoto.filename) {
        // 從URL路徑中提取檔名
        const filename = deletedPhoto.filename.split('/').pop();
        if (filename) {
          try {
            await this.gridFSService.deleteFile(filename);
          } catch (error) {
            console.error('刪除檔案失敗，但將繼續更新設備資訊:', error);
          }
        }
      }

      // 更新設備資訊，移除照片參考
      const result = await this.mongodbService.put(
        'equipment',
        this.equipmentId,
        updatedEquipment
      );
      
      if (result) {
        this.equipment.set(updatedEquipment);
      } else {
        console.error('刪除照片失敗');
      }
    } catch (error) {
      console.error('刪除照片時發生錯誤:', error);
    }
  }

  goBack() {
    this.router.navigate(['/site', this.siteId, 'equipment']);
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

  onNextInspectionTypeChange() {
    if (!this.editedEquipment) return;

    const inspectionDate = this.editedEquipment.inspectionDate;
    if (!inspectionDate) return;

    const baseDate = new Date(inspectionDate);
    let nextDate: Date;

    switch (this.editedEquipment.nextInspectionType) {
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
      case 'custom':
        // 自定義日期不自動計算，保持現有值或清空
        return;
      default:
        // 清除下次檢查日期
        this.editedEquipment.nextInspectionDate = undefined;
        return;
    }

    this.editedEquipment.nextInspectionDate = nextDate;
  }

  onInspectionDateChange() {
    // 當檢查日期變更時，如果已經設定了下次檢查類型，重新計算下次檢查日期
    if (this.editedEquipment && this.editedEquipment.nextInspectionType && this.editedEquipment.nextInspectionType !== 'custom') {
      this.onNextInspectionTypeChange();
    }
  }
}
