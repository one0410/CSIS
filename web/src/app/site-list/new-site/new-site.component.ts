import { Component } from '@angular/core';
import { Site } from '../site-list.component';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { MongodbService } from '../../services/mongodb.service';
import { CommonModule } from '@angular/common';

@Component({
    selector: 'app-new-site',
    imports: [FormsModule, CommonModule],
    templateUrl: './new-site.component.html',
    styleUrl: './new-site.component.scss'
})
export class NewSiteComponent {

  site: Site = {
    projectNo: '',
    projectName: '',
    image: '',
    startDate: '',
    endDate: '',
    county: '',
    town: '',
    factories: [],
    constructionTypes: [],
  }
  newArea: string = '';
  newConstructionType: string = '';
  isSubmitting: boolean = false;
  submitMessage: string = '';
  submitMessageType: 'success' | 'error' | '' = '';

  constructor(
    protected router: Router,
    private mongodbService: MongodbService
  ) {}

  addFactory() {
    this.site.factories.push({ name: '', areas: [] });
  }

  addArea(event: Event, factory: { name: string; areas: string[] }) {
    event.preventDefault();
    console.log('addArea', event);
    const target = event.target as HTMLInputElement;
    factory.areas.push(target.value);
    target.value = '';
  }

  removeFactory(index: number) {
    this.site.factories.splice(index, 1);
  }

  removeArea(factory: { name: string; areas: string[] }, index: number) {
    factory.areas.splice(index, 1);
  }

  addConstructionType(event: Event) {
    event.preventDefault();
    const target = event.target as HTMLInputElement;
    if (target.value.trim() && !this.site.constructionTypes.includes(target.value.trim())) {
      this.site.constructionTypes.push(target.value.trim());
      target.value = '';
    }
  }

  removeConstructionType(index: number) {
    this.site.constructionTypes.splice(index, 1);
  }

  async onSubmit() {
    this.isSubmitting = true;
    this.submitMessage = '';
    this.submitMessageType = '';

    try {
      // 驗證必填欄位
      if (!this.site.projectNo?.trim()) {
        throw new Error('專案編號為必填欄位');
      }
      if (!this.site.projectName?.trim()) {
        throw new Error('工地名稱為必填欄位');
      }
      if (!this.site.startDate) {
        throw new Error('工期開始日期為必填欄位');
      }
      if (!this.site.endDate) {
        throw new Error('工期結束日期為必填欄位');
      }

      // 檢查日期邏輯
      if (new Date(this.site.startDate) >= new Date(this.site.endDate)) {
        throw new Error('工期結束日期必須晚於開始日期');
      }

      // 準備要儲存的資料
      const siteData = {
        ...this.site,
        photoCount: 0,
        photoSize: 0,
        remark: ''
      };

      // 呼叫 API 新增工地
      const result = await this.mongodbService.post('site', siteData);
      
      if (result && result.insertedId) {
        this.submitMessage = '工地新增成功！';
        this.submitMessageType = 'success';
        
        // 延遲跳轉，讓使用者看到成功訊息
        setTimeout(() => {
          this.router.navigate(['/sitelist']);
        }, 1500);
      } else {
        throw new Error('新增工地失敗，請稍後再試');
      }
    } catch (error: any) {
      this.submitMessage = error.message || '發生未知錯誤';
      this.submitMessageType = 'error';
    } finally {
      this.isSubmitting = false;
    }
  }
}
