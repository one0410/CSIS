import { Component, OnInit } from '@angular/core';
import {
  FormBuilder,
  FormGroup,
  FormsModule,
  ReactiveFormsModule,
} from '@angular/forms';
import { CommonModule } from '@angular/common';
import { CdkDragDrop, moveItemInArray, CdkDropList, CdkDrag, CdkDragHandle } from '@angular/cdk/drag-drop';
import { FormVersion } from '../shared/form-version.model';
import { MongodbService } from '../../../services/mongodb.service';

interface SitePermitForm extends FormVersion {
  // 作業類別
  workCategory: string[];
  // 是否加入其他作業
  otherWork: boolean;
  // 其他作業
  otherWorkContent: string;
}

@Component({
  selector: 'app-site-permit',
  templateUrl: './site-permit.component.html',
  styleUrls: ['./site-permit.component.scss'],
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule, CdkDropList, CdkDrag, CdkDragHandle],
})
export class SitePermitComponent implements OnInit {
  formVersions: SitePermitForm[] = [];

  selectedVersion: SitePermitForm | null = null;
  editForm: FormGroup;
  isEditing: boolean = false;
  showPreview: boolean = false;

  // 圖片上傳相關
  logoPreview: string | null = null;
  isDragging: boolean = false;
  selectedFile: File | null = null;
  
  // 作業類別相關
  newCategory: string = '';
  draggedItemIndex: number | null = null;

  constructor(private fb: FormBuilder, private mongodbService: MongodbService) {
    this.editForm = this.fb.group({
      name: [''],
      logo: [''],
      header: [''],
      version: [''],
      remarks: [''],
      workCategory: [[]],
      otherWork: [false],
      otherWorkContent: [''],
    });
  }

  async ngOnInit(): Promise<void> {
    this.formVersions = await this.mongodbService.get('formVersion', {
      type: 'sitePermit',
    });
    if (this.formVersions.length > 0) {
      this.selectVersion(this.formVersions[0]);
    }
  }

  selectVersion(version: SitePermitForm): void {
    this.selectedVersion = version;
    this.isEditing = false;
    this.showPreview = false;
    this.logoPreview = null;
    this.selectedFile = null;
  }

  editVersion(): void {
    if (this.selectedVersion) {
      this.editForm.patchValue({
        name: this.selectedVersion.name,
        logo: this.selectedVersion.logo,
        header: this.selectedVersion.header,
        version: this.selectedVersion.version,
        remarks: this.selectedVersion.remarks || '',
        workCategory: this.selectedVersion.workCategory || [],
        otherWork: this.selectedVersion.otherWork || false,
        otherWorkContent: this.selectedVersion.otherWorkContent || '',
      });

      // 設置Logo預覽
      this.logoPreview = this.selectedVersion.logo;

      this.isEditing = true;
      this.showPreview = false;
    }
  }

  async saveVersion(): Promise<void> {
    if (this.editForm.valid) {
      const formValues = this.editForm.value;

      // 處理Logo上傳
      if (this.selectedFile) {
        // 在實際應用中，這裡會上傳文件到服務器
        // 簡化實作，直接使用預覽圖像URL
        formValues.logo = this.logoPreview;
      }

      let newVersion = '1.0.0';

      // 如果有選中版本，則版本號+0.0.1；否則使用默認值1.0.0
      if (this.selectedVersion) {
        const versionParts = this.selectedVersion.version.split('.');
        const newPatch = parseInt(versionParts[2]) + 1;
        newVersion = `${versionParts[0]}.${versionParts[1]}.${newPatch}`;
      } else {
        newVersion = formValues.version || '1.0.0';
      }

      const newFormVersion: SitePermitForm = {
        type: 'sitePermit',
        version: newVersion,
        name: formValues.name,
        logo: formValues.logo,
        header: formValues.header,
        remarks: formValues.remarks,
        workCategory: formValues.workCategory,
        otherWork: formValues.otherWork,
        otherWorkContent: formValues.otherWorkContent,
        createdAt: new Date(),
      };

      let response = await this.mongodbService.post(
        'formVersion',
        newFormVersion
      );
      if (response.insertedId) {
        newFormVersion._id = response.insertedId;

        this.formVersions.push(newFormVersion);
        this.selectVersion(newFormVersion);
      }
      this.isEditing = false;
    }
  }

  cancelEdit(): void {
    this.isEditing = false;
    this.logoPreview = null;
    this.selectedFile = null;
  }

  createNewVersion(): void {
    // 重置任何選擇，進入編輯模式
    this.selectedVersion = null;
    this.isEditing = true;
    this.showPreview = false;
    this.logoPreview = null;
    this.selectedFile = null;
    
    // 初始化表單為空值
    this.editForm.patchValue({
      name: '工地許可單',
      logo: '',
      header: '工地許可單',
      version: '1.0.0',
      remarks: '',
      workCategory: [],
      otherWork: false,
      otherWorkContent: '',
    });
  }

  previewForm(): void {
    this.showPreview = true;
    this.isEditing = false;
  }

  // 作業類別相關方法
  addWorkCategory(): void {
    if (!this.newCategory || this.newCategory.trim() === '') {
      return;
    }
    
    const currentCategories = this.editForm.get('workCategory')!.value || [];
    
    // 避免重複添加
    if (!currentCategories.includes(this.newCategory.trim())) {
      this.editForm.patchValue({
        workCategory: [...currentCategories, this.newCategory.trim()]
      });
    }
    
    // 清空輸入欄位
    this.newCategory = '';
  }
  
  removeWorkCategory(index: number): void {
    const currentCategories = [...this.editForm.get('workCategory')!.value];
    currentCategories.splice(index, 1);
    this.editForm.patchValue({
      workCategory: currentCategories
    });
  }
  
  // 處理拖放排序，使用Angular CDK的拖放功能
  dropWorkCategory(event: CdkDragDrop<string[]>): void {
    if (event.previousIndex === event.currentIndex) {
      return;
    }
    
    const currentCategories = [...this.editForm.get('workCategory')!.value];
    moveItemInArray(currentCategories, event.previousIndex, event.currentIndex);
    
    this.editForm.patchValue({
      workCategory: currentCategories
    });
  }

  // 拖曳事件處理
  onDragStart(event: DragEvent, index: number): void {
    this.draggedItemIndex = index;
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', index.toString());
    }
  }
  
  onCategoryDragOver(event: DragEvent): void {
    event.preventDefault();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'move';
    }
  }
  
  onCategoryDrop(event: DragEvent, targetIndex: number): void {
    event.preventDefault();
    if (this.draggedItemIndex !== null && this.draggedItemIndex !== targetIndex) {
      const currentCategories = [...this.editForm.get('workCategory')!.value];
      const item = currentCategories[this.draggedItemIndex];
      
      // 從原位置移除
      currentCategories.splice(this.draggedItemIndex, 1);
      // 插入到新位置
      currentCategories.splice(targetIndex, 0, item);
      
      this.editForm.patchValue({
        workCategory: currentCategories
      });
    }
    this.draggedItemIndex = null;
  }
  
  onDragEnd(): void {
    this.draggedItemIndex = null;
  }

  // 文件上傳相關方法
  onDragOver(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.isDragging = true;
  }

  onDragLeave(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.isDragging = false;
  }

  onDrop(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.isDragging = false;

    if (event.dataTransfer?.files && event.dataTransfer.files.length > 0) {
      const file = event.dataTransfer.files[0];
      this.processFile(file);
    }
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      const file = input.files[0];
      this.processFile(file);
    }
  }

  processFile(file: File): void {
    // 檢查文件類型
    if (!['image/jpeg', 'image/jpg', 'image/png'].includes(file.type)) {
      alert('只接受JPG或PNG格式的圖片');
      return;
    }

    this.selectedFile = file;

    // 讀取並處理圖像
    const reader = new FileReader();
    reader.onload = (e: ProgressEvent<FileReader>) => {
      if (e.target?.result) {
        const img = new Image();
        img.onload = () => {
          // 調整圖像大小
          const canvas = document.createElement('canvas');
          let width = img.width;
          let height = img.height;

          // 確保尺寸不超過200px
          if (width > 200 || height > 200) {
            if (width > height) {
              height = Math.round((height * 200) / width);
              width = 200;
            } else {
              width = Math.round((width * 200) / height);
              height = 200;
            }
          }

          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx?.drawImage(img, 0, 0, width, height);

          // 將調整後的圖像設置為預覽並更新表單值
          this.logoPreview = canvas.toDataURL(file.type);
          this.editForm.patchValue({
            logo: this.logoPreview,
          });
        };
        img.src = e.target.result as string;
      }
    };
    reader.readAsDataURL(file);
  }
}
