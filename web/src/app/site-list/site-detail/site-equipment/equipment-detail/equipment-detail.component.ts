import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { Equipment, EquipmentPhoto } from '../../../../model/equipment.model';
import { MongodbService } from '../../../../services/mongodb.service';
import { GridFSService } from '../../../../services/gridfs.service';
import { CurrentSiteService } from '../../../../services/current-site.service';

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
  selectedFile: File | null = null;
  photoCaption = '';

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private mongodbService: MongodbService,
    private gridFSService: GridFSService,
    private currentSiteService: CurrentSiteService
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
          
          // 更新 CurrentSiteService 中的機具列表
          await this.currentSiteService.refreshEquipmentList();
          
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
          
          // 更新 CurrentSiteService 中的機具列表
          await this.currentSiteService.refreshEquipmentList();
        } else {
          console.error('更新設備資訊失敗');
        }
      }
    } catch (error) {
      console.error('儲存設備時發生錯誤:', error);
    }
  }

  onFileSelected(event: Event) {
    const element = event.target as HTMLInputElement;
    if (element.files && element.files.length > 0) {
      this.selectedFile = element.files[0];
    }
  }

  async uploadPhoto() {
    if (!this.selectedFile || !this.equipmentId) return;

    this.isUploading.set(true);

    try {
      // 使用GridFSService上傳圖片
      const metadata = {
        equipmentId: this.equipmentId,
        caption: this.photoCaption,
        type: 'equipment-photo',
        category: '機具管理',
        siteId: this.siteId!,
      };
      
      const uploadResult = await this.gridFSService.uploadFile(
        this.selectedFile,
        metadata
      );
      
      if (!uploadResult || !uploadResult.filename) {
        throw new Error('上傳照片失敗');
      }
           
      // 然後將照片資訊添加到設備的照片列表中
      const newPhoto: EquipmentPhoto = {
        siteId: this.siteId!,
        equipmentId: this.equipmentId,
        filename: uploadResult.filename,
        caption: this.photoCaption,
        uploadDate: new Date(),
      };
      
      const currentEquipment = this.equipment();
      if (!currentEquipment) return;
      
      const updatedEquipment = { 
        ...currentEquipment,
        photos: [...(currentEquipment.photos || []), newPhoto]
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
      } else {
        console.error('更新設備照片資訊失敗');
      }
    } catch (error) {
      console.error('上傳照片時發生錯誤:', error);
    } finally {
      this.isUploading.set(false);
    }
  }

  resetPhotoForm() {
    this.selectedFile = null;
    this.photoCaption = '';
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
}
