import { Injectable, inject } from '@angular/core';
import Docxtemplater from 'docxtemplater';
import PizZip from 'pizzip';
import { saveAs } from 'file-saver';
import { MongodbService } from './mongodb.service';
import { CurrentSiteService } from './current-site.service';
import dayjs from 'dayjs';

@Injectable({
  providedIn: 'root'
})
export class DocxTemplateService {
  private mongodbService = inject(MongodbService);
  private currentSiteService = inject(CurrentSiteService);

  /**
   * 生成工作許可單 DOCX
   */
  async generateWorkPermitDocx(formId: string): Promise<void> {
    try {
      // 獲取表單資料
      const formData = await this.mongodbService.getById('siteForm', formId);
      const currentSite = this.currentSiteService.currentSite();
      
      if (!formData || !currentSite) {
        throw new Error('無法獲取表單或工地資料');
      }

      // 載入模板檔案
      const templatePath = '/template/帆宣-ee-4404-01工作許可單.docx';
      const response = await fetch(templatePath);
      
      if (!response.ok) {
        throw new Error(`無法載入模板檔案: ${response.status}`);
      }
      
             const arrayBuffer = await response.arrayBuffer();
       const zip = new PizZip(arrayBuffer);

       // 設定圖片模組
       const modules = [];
       
       try {
         // 使用動態 import 載入 ImageModule
         const ImageModule = await import('docxtemplater-image-module-free');
         
         const imageOptions = {
           centered: true,
           getImage: (tagValue: string) => {
             return this.getImageData(tagValue);
           },
           getSize: (img: ArrayBuffer, tagValue: string): [number, number] => {
             return [120, 60]; // 簽名圖片尺寸：寬度120px, 高度60px
           }
         };
         
         const ModuleConstructor = ImageModule.default || ImageModule;
         const imageModule = new ModuleConstructor(imageOptions);
         modules.push(imageModule);
       } catch (error) {
         console.error('ImageModule 載入失敗:', error);
       }

       // 創建 docxtemplater 實例
       const doc = new Docxtemplater()
         .loadZip(zip);
       
       // 添加模組
       if (modules.length > 0) {
         modules.forEach(module => {
           doc.attachModule(module);
         });
       }
       
       doc.setOptions({
         paragraphLoop: true,
         linebreaks: true,
       });
       
       console.log('Docxtemplater 初始化完成');

             // 準備模板數據
       const templateData = this.prepareWorkPermitData(formData, currentSite);
       
       console.log('原始表單數據:', formData);
       console.log('簽名數據檢查:', {
         applicantSignature: formData.applicantSignature,
         departmentManagerSignature: formData.departmentManagerSignature,
         reviewSignature: formData.reviewSignature,
         approvalSignature: formData.approvalSignature
       });
                console.log('模板數據:', templateData);
         console.log('簽名圖片數據詳細檢查:', {
           applicantSignatureImage: templateData.applicantSignatureImage?.substring(0, 100) + '...',
           departmentManagerSignatureImage: templateData.departmentManagerSignatureImage?.substring(0, 100) + '...',
           reviewSignatureImage: templateData.reviewSignatureImage?.substring(0, 100) + '...',
           approvalSignatureImage: templateData.approvalSignatureImage?.substring(0, 100) + '...'
         });
         
         // 檢查是否有任何圖片數據
         const hasImages = [
           templateData.applicantSignatureImage,
           templateData.departmentManagerSignatureImage,
           templateData.reviewSignatureImage,
           templateData.approvalSignatureImage
         ].some(img => img && img.length > 0);
         
         console.log('是否包含圖片數據:', hasImages);

       // 渲染文檔
       console.log('開始渲染文檔...');
       try {
         doc.render(templateData);
         console.log('文檔渲染成功');
       } catch (error) {
         console.error('文檔渲染失敗:', error);
         throw error;
       }

      // 生成並下載檔案
      const output = doc.getZip().generate({
        type: 'blob',
        mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      });

      // 生成檔案名稱
      const fileName = `工作許可單_${formData.applyDate || new Date().toISOString().split('T')[0]}_${formData.projectNo || formId}.docx`;
      
      saveAs(output, fileName);

    } catch (error) {
      console.error('生成工作許可單DOCX失敗:', error);
      throw error;
    }
  }

  /**
   * 準備工作許可單的模板數據
   */
  private prepareWorkPermitData(formData: any, currentSite: any): any {
    // 處理日期格式
    const formatDate = (dateStr: string) => {
      if (!dateStr) return '';
      const date = new Date(dateStr);
      return `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}-${date.getDate().toString().padStart(2, '0')}`;
    };

    return {
      // 基本資料
      applyDate: formatDate(formData.applyDate) || formatDate(new Date().toISOString()),
      applyDateYear: dayjs(formData.applyDate).year(),
      applyDateMonth: dayjs(formData.applyDate).month() + 1,
      applyDateDay: dayjs(formData.applyDate).date(),
      workContent: formData.workContent || formData.workDescription || '',
      workSite: formData.workLocation || '',
      workArea: formData.workArea || '',
      workStartTimeYear: dayjs(formData.workStartTime).year(),
      workStartTimeMonth: dayjs(formData.workStartTime).month() + 1,
      workStartTimeDay: dayjs(formData.workStartTime).date(),
      workStartTimeHour: dayjs(formData.workStartTime).hour(),
      workStartTimeMinute: dayjs(formData.workStartTime).minute(),
      workEndTimeYear: dayjs(formData.workEndTime).year(),
      workEndTimeMonth: dayjs(formData.workEndTime).month() + 1,
      workEndTimeDay: dayjs(formData.workEndTime).date(),
      workEndTimeHour: dayjs(formData.workEndTime).hour(),
      workEndTimeMinute: dayjs(formData.workEndTime).minute(),
      supervisor: formData.supervisor || '',
      supervisorContact: formData.supervisorContact || '',
      supervisorPhone: formData.supervisorPhone || '',
      projectNo: formData.projectNo || '',
      projectName: formData.projectName || currentSite?.name || '',
      
      // 申請人資訊
      applicant: formData.applicant || '',
      
      // 簡化的作業類別勾選
      workTypes: formData.selectedCategories || [],

             // 作業類別勾選框
       isNo1: (formData.selectedCategories || []).includes('動火作業'),
       isNo2: (formData.selectedCategories || []).includes('高架作業'),
       isNo3: (formData.selectedCategories || []).includes('局限空間作業'),
       isNo4: (formData.selectedCategories || []).includes('電力作業'),
       isNo5: (formData.selectedCategories || []).includes('吊籠作業'),
       isNo6: (formData.selectedCategories || []).includes('起重吊掛作業'),
       isNo7: (formData.selectedCategories || []).includes('施工架組裝作業'),
       isNo8: (formData.selectedCategories || []).includes('管線拆離作業'),
       isNo9: (formData.selectedCategories || []).includes('開口作業'),
       isNo10: (formData.selectedCategories || []).includes('化學作業'),
       isNo11: (formData.selectedCategories || []).includes('其他'),

             // 備註
       remarks: formData.remarks || '',
       
       // 簽名圖片 - 傳遞base64圖片數據給圖片模組
       applicantSignatureImage: this.getValidSignatureImage(formData.applicantSignature?.signature),
       departmentManagerSignatureImage: this.getValidSignatureImage(formData.departmentManagerSignature?.signature),
       reviewSignatureImage: this.getValidSignatureImage(formData.reviewSignature?.signature),
       approvalSignatureImage: this.getValidSignatureImage(formData.approvalSignature?.signature),
       
       // 簽名人姓名
       applicantName: formData.applicantSignature?.name || '',
       departmentManagerName: formData.departmentManagerSignature?.name || '',
       reviewName: formData.reviewSignature?.name || '',
       approvalName: formData.approvalSignature?.name || '',
       
       // 簽名日期 - 處理可能是Date物件或字串的情況
       applicantSignDate: formData.applicantSignature?.signedAt ? formatDate(formData.applicantSignature.signedAt instanceof Date ? formData.applicantSignature.signedAt.toISOString() : formData.applicantSignature.signedAt.toString()) : '',
       departmentManagerSignDate: formData.departmentManagerSignature?.signedAt ? formatDate(formData.departmentManagerSignature.signedAt instanceof Date ? formData.departmentManagerSignature.signedAt.toISOString() : formData.departmentManagerSignature.signedAt.toString()) : '',
       reviewSignDate: formData.reviewSignature?.signedAt ? formatDate(formData.reviewSignature.signedAt instanceof Date ? formData.reviewSignature.signedAt.toISOString() : formData.reviewSignature.signedAt.toString()) : '',
       approvalSignDate: formData.approvalSignature?.signedAt ? formatDate(formData.approvalSignature.signedAt instanceof Date ? formData.approvalSignature.signedAt.toISOString() : formData.approvalSignature.signedAt.toString()) : '',
       
       // 表單狀態
       status: formData.status || 'draft'
    };
  }

  /**
   * 驗證並獲取有效的簽名圖片數據
   */
  private getValidSignatureImage(signature?: string): string {
    if (!signature || signature.trim() === '') {
      console.log('簽名數據為空或undefined');
      return '';
    }
    
    if (!signature.startsWith('data:image/')) {
      console.log('簽名數據格式不正確:', signature.substring(0, 50));
      return '';
    }
    
    console.log('簽名數據有效，長度:', signature.length);
    return signature;
  }

  /**
   * 獲取圖片數據（用於簽名圖片等）
   */
  private getImageData(tagValue: string): ArrayBuffer {
    try {
      console.log('getImageData 收到的值:', tagValue);
      
      // 如果是簽名圖片，tagValue會是base64格式的圖片數據
      if (tagValue && typeof tagValue === 'string' && tagValue.startsWith('data:image/')) {
        // 移除data:image/png;base64,前綴
        const base64Data = tagValue.split(',')[1];
        
        // 將base64轉換為ArrayBuffer
        const binaryString = atob(base64Data);
        const len = binaryString.length;
        const bytes = new Uint8Array(len);
        
        for (let i = 0; i < len; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }
        
        return bytes.buffer;
      }
      
      // 如果沒有簽名數據，返回透明的1x1像素PNG
      const emptyPng = new Uint8Array([
        0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D,
        0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
        0x08, 0x06, 0x00, 0x00, 0x00, 0x1F, 0x15, 0xC4, 0x89, 0x00, 0x00, 0x00,
        0x0B, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9C, 0x63, 0x00, 0x01, 0x00, 0x00,
        0x05, 0x00, 0x01, 0x0D, 0x0A, 0x2D, 0xB4, 0x00, 0x00, 0x00, 0x00, 0x49,
        0x45, 0x4E, 0x44, 0xAE, 0x42, 0x60, 0x82
      ]);
      
      return emptyPng.buffer;
    } catch (error) {
      console.warn('處理圖片數據失敗:', error);
      // 返回透明的1x1像素PNG作為後備
      const emptyPng = new Uint8Array([
        0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D,
        0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
        0x08, 0x06, 0x00, 0x00, 0x00, 0x1F, 0x15, 0xC4, 0x89, 0x00, 0x00, 0x00,
        0x0B, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9C, 0x63, 0x00, 0x01, 0x00, 0x00,
        0x05, 0x00, 0x01, 0x0D, 0x0A, 0x2D, 0xB4, 0x00, 0x00, 0x00, 0x00, 0x49,
        0x45, 0x4E, 0x44, 0xAE, 0x42, 0x60, 0x82
      ]);
      return emptyPng.buffer;
    }
  }

  /**
   * 生成工具箱會議記錄 DOCX
   */
  async generateToolboxMeetingDocx(formId: string): Promise<void> {
    try {
      // 獲取表單資料
      const formData = await this.mongodbService.getById('siteForm', formId);
      const currentSite = this.currentSiteService.currentSite();
      
      if (!formData || !currentSite) {
        throw new Error('無法獲取表單或工地資料');
      }

      // 載入模板檔案
      const templatePath = '/template/帆宣-ee-4411-15工具箱會議及巡檢紀錄.docx';
      const response = await fetch(templatePath);
      
      if (!response.ok) {
        throw new Error(`無法載入模板檔案: ${response.status}`);
      }
      
      const arrayBuffer = await response.arrayBuffer();
      const zip = new PizZip(arrayBuffer);

      // 設定圖片模組
      const modules = [];
      
      try {
        // 使用動態 import 載入 ImageModule
        const ImageModule = await import('docxtemplater-image-module-free');
        
        const imageOptions = {
          centered: true,
          getImage: (tagValue: string) => {
            return this.getImageData(tagValue);
          },
          getSize: (img: ArrayBuffer, tagValue: string): [number, number] => {
            return [120, 60]; // 簽名圖片尺寸：寬度120px, 高度60px
          }
        };
        
        const ModuleConstructor = ImageModule.default || ImageModule;
        const imageModule = new ModuleConstructor(imageOptions);
        modules.push(imageModule);
      } catch (error) {
        console.error('ImageModule 載入失敗:', error);
      }

      // 創建 docxtemplater 實例
      const doc = new Docxtemplater()
        .loadZip(zip);
      
      // 添加模組
      if (modules.length > 0) {
        modules.forEach(module => {
          doc.attachModule(module);
        });
      }

      // 準備模板資料
      const templateData = this.prepareToolboxMeetingData(formData, currentSite);

      // 填充模板
      doc.render(templateData);

      // 生成文檔
      const out = doc.getZip().generate({ type: 'blob' });

      // 生成檔案名稱
      const fileName = `工具箱會議記錄_${currentSite.projectName}_${formData.applyDate}_${formData._id.substring(0, 8)}.docx`;

      // 下載檔案
      saveAs(out, fileName);

    } catch (error) {
      console.error('無法生成工具箱會議記錄 DOCX:', error);
      throw error;
    }
  }

  /**
   * 準備工具箱會議模板資料
   */
  private prepareToolboxMeetingData(formData: any, currentSite: any): any {
    const applyDate = dayjs(formData.applyDate);

    return {
      // 基本資訊
      projectName: currentSite.projectName || '',
      meetingDate: formData.applyDate || '',
      meetingDateYear: applyDate.year().toString(),
      meetingDateMonth: (applyDate.month() + 1).toString().padStart(2, '0'),
      meetingDateDay: applyDate.date().toString().padStart(2, '0'),
      meetingTime: formData.meetingTime || '',
      meetingLocation: formData.meetingLocation || '',
      hostCompany: formData.hostCompany || '',
      hostPerson: formData.hostPerson || '',
      
      // 簽名圖片
      leaderSignature: formData.leaderSignature || '',
      siteManagerSignature: formData.siteManagerSignature || '',
      worker1Signature: formData.worker1Signature || '',
      worker2Signature: formData.worker2Signature || '',
      worker3Signature: formData.worker3Signature || ''
    };
  }

  /**
   * 生成環安衛自主檢點表 DOCX
   */
  async generateEnvironmentChecklistDocx(formId: string): Promise<void> {
    try {
      // 獲取表單資料
      const formData = await this.mongodbService.getById('siteForm', formId);
      const currentSite = this.currentSiteService.currentSite();
      
      if (!formData || !currentSite) {
        throw new Error('無法獲取表單或工地資料');
      }

      // 載入模板檔案
      const templatePath = '/template/帆宣-ee-4404-02環安衛自主檢點表.docx';
      const response = await fetch(templatePath);
      
      if (!response.ok) {
        throw new Error(`無法載入模板檔案: ${response.status}`);
      }
      
      const arrayBuffer = await response.arrayBuffer();
      const zip = new PizZip(arrayBuffer);

      // 設定圖片模組
      const modules = [];
      
      try {
        // 使用動態 import 載入 ImageModule
        const ImageModule = await import('docxtemplater-image-module-free');
        
        const imageOptions = {
          centered: true,
          getImage: (tagValue: string) => {
            return this.getImageData(tagValue);
          },
          getSize: (img: ArrayBuffer, tagValue: string): [number, number] => {
            return [120, 60]; // 簽名圖片尺寸：寬度120px, 高度60px
          }
        };
        
        const ModuleConstructor = ImageModule.default || ImageModule;
        const imageModule = new ModuleConstructor(imageOptions);
        modules.push(imageModule);
      } catch (error) {
        console.error('ImageModule 載入失敗:', error);
      }

      // 創建 docxtemplater 實例
      const doc = new Docxtemplater()
        .loadZip(zip);
      
      // 添加模組
      if (modules.length > 0) {
        modules.forEach(module => {
          doc.attachModule(module);
        });
      }

      // 準備模板資料
      const templateData = this.prepareEnvironmentChecklistData(formData, currentSite);

      // 填充模板
      doc.render(templateData);

      // 生成文檔
      const out = doc.getZip().generate({ type: 'blob' });

      // 生成檔案名稱
      const fileName = `環安衛自主檢點表_${currentSite.projectName}_${formData.checkDate}_${formData._id.substring(0, 8)}.docx`;

      // 下載檔案
      saveAs(out, fileName);

    } catch (error) {
      console.error('無法生成環安衛自主檢點表 DOCX:', error);
      throw error;
    }
  }

  /**
   * 準備環安衛自主檢點表模板資料
   */
  private prepareEnvironmentChecklistData(formData: any, currentSite: any): any {
    const checkDate = dayjs(formData.checkDate);

    return {
      // 基本資訊
      projectNo: formData.projectNo || currentSite.projectNo || '',
      factoryArea: formData.factoryArea || '',
      checkDate: formData.checkDate || '',
      checkDateYear: checkDate.year().toString(),
      checkDateMonth: (checkDate.month() + 1).toString().padStart(2, '0'),
      checkDateDay: checkDate.date().toString().padStart(2, '0'),
      location: formData.location || '',
      
      // 檢點項目結果
      items: formData.items || {},
      fixes: formData.fixes || {},
      
      // 時間
      preWorkCheckTime: formData.preWorkCheckTime || '',
      postWorkCheckTime: formData.postWorkCheckTime || '',
      
      // 簽名圖片
      preWorkSupervisorSignature: formData.preWorkSupervisorSignature || '',
      preWorkWorkerSignature: formData.preWorkWorkerSignature || '',
      postWorkSupervisorSignature: formData.postWorkSupervisorSignature || '',
      postWorkWorkerSignature: formData.postWorkWorkerSignature || '',
      
      // 備註
      remarks: formData.remarks || ''
    };
  }

  /**
   * 生成特殊作業工安自主檢點表 DOCX
   */
  async generateSpecialWorkChecklistDocx(formId: string): Promise<void> {
    try {
      // 獲取表單資料
      const formData = await this.mongodbService.getById('siteForm', formId);
      const currentSite = this.currentSiteService.currentSite();
      
      if (!formData || !currentSite) {
        throw new Error('無法獲取表單或工地資料');
      }

      if (!formData.workType) {
        throw new Error('表單缺少作業類型資訊');
      }

      // 根據作業類型選擇對應的模板檔案
      const templatePath = this.getSpecialWorkTemplateePath(formData.workType);
      const response = await fetch(templatePath);
      
      if (!response.ok) {
        throw new Error(`無法載入模板檔案: ${response.status}`);
      }
      
      const arrayBuffer = await response.arrayBuffer();
      const zip = new PizZip(arrayBuffer);

      // 設定圖片模組
      const modules = [];
      
      try {
        // 使用動態 import 載入 ImageModule
        const ImageModule = await import('docxtemplater-image-module-free');
        
        const imageOptions = {
          centered: true,
          getImage: (tagValue: string) => {
            return this.getImageData(tagValue);
          },
          getSize: (img: ArrayBuffer, tagValue: string): [number, number] => {
            return [120, 60]; // 簽名圖片尺寸：寬度120px, 高度60px
          }
        };
        
        const ModuleConstructor = ImageModule.default || ImageModule;
        const imageModule = new ModuleConstructor(imageOptions);
        modules.push(imageModule);
      } catch (error) {
        console.error('ImageModule 載入失敗:', error);
      }
      
      // 創建 docxtemplater 實例
      const doc = new Docxtemplater()
      .loadZip(zip);
      
      // expression 模組
      const expressionParser = await import('angular-expressions');

      // 修正 parser 設定，避免型別錯誤
      doc.setOptions({
        parser: (tag: string) => {
          // angular-expressions 的 compile 回傳一個 function
          const compiled = (expressionParser.default || expressionParser).compile(tag);
          return {
            get: (scope: any) => compiled(scope)
          };
        },
        nullGetter: (part: any) => {
          return '';
        }
      });
      
      // 添加模組
      if (modules.length > 0) {
        modules.forEach(module => {
          doc.attachModule(module);
        });
      }

      // 準備模板資料
      const templateData = this.prepareSpecialWorkChecklistData(formData, currentSite);

      // 填充模板
      doc.render(templateData);

      // 生成文檔
      const out = doc.getZip().generate({ type: 'blob' });

      // 生成檔案名稱
      const fileName = `特殊作業工安自主檢點表_${formData.workType}_${currentSite.projectName}_${formData.applyDate}_${formData._id.substring(0, 8)}.docx`;

      // 下載檔案
      saveAs(out, fileName);

    } catch (error) {
      console.error('無法生成特殊作業工安自主檢點表 DOCX:', error);
      throw error;
    }
  }

  /**
   * 根據作業類型獲取對應的模板路徑
   */
  private getSpecialWorkTemplateePath(workType: string): string {
    const templateMap: { [key: string]: string } = {
      '動火作業': '/template/ee-4404-03 特殊作業工安自主檢點表(動火作業) .docx',
      '高架作業': '/template/ee-4404-03 特殊作業工安自主檢點表(高架作業).docx',
      '局限空間作業': '/template/ee-4404-03 特殊作業工安自主檢點表(局限空間作業).docx',
      '電力作業': '/template/ee-4404-03 特殊作業工安自主檢點表(電力作業) .docx',
      '吊籠作業': '/template/ee-4404-03 特殊作業工安自主檢點表(吊籠作業) .docx',
      '起重吊掛作業': '/template/ee-4404-03 特殊作業工安自主檢點表(起重吊掛作業).docx',
      '施工架組裝作業': '/template/ee-4404-03 特殊作業工安自主檢點表(施工架組裝作業).docx',
      '管線拆裝作業': '/template/ee-4404-03 特殊作業工安自主檢點表(管線拆離作業).docx',
      '開口作業': '/template/ee-4404-03 特殊作業工安自主檢點表(開口作業) .docx',
      '化學作業': '/template/ee-4404-03 特殊作業工安自主檢點表(化學作業) .docx'
    };

    const templatePath = templateMap[workType];
    if (!templatePath) {
      throw new Error(`不支援的作業類型: ${workType}`);
    }

    return templatePath;
  }

  /**
   * 準備特殊作業工安自主檢點表模板資料
   */
  private prepareSpecialWorkChecklistData(formData: any, currentSite: any): any {
    const applyDate = dayjs(formData.applyDate);

    for (const key in formData.items) {
      if (formData.items[key] == '正常') {
        formData.items[key + 'Normal'] = 'V';
      } else if (formData.items[key] == '異常') {
        formData.items[key + 'Abnormal'] = 'V';
      }
    }

    return {
      // 基本資訊
      projectNo: formData.projectNo || currentSite.projectNo || '',
      factoryArea: formData.factoryArea || '',
      location: formData.location || '',
      applyDate: formData.applyDate || '',
      applyDateYear: applyDate.year().toString(),
      applyDateMonth: (applyDate.month() + 1).toString().padStart(2, '0'),
      applyDateDay: applyDate.date().toString().padStart(2, '0'),
      workType: formData.workType || '',
      
      // 檢點項目結果
      items: formData.items || {},
      fixes: formData.fixes || {},
      itemInputs: formData.itemInputs || {},
      
      // 時間
      preWorkCheckTime: formData.preWorkCheckTime || '',
      postWorkCheckTime: formData.postWorkCheckTime || '',
      
      // 簽名圖片
      preWorkSupervisorSignature: formData.preWorkSupervisorSignature || '',
      preWorkWorkerSignature: formData.preWorkWorkerSignature || '',
      postWorkSupervisorSignature: formData.postWorkSupervisorSignature || '',
      postWorkWorkerSignature: formData.postWorkWorkerSignature || '',
      
      // 備註
      remarks: formData.remarks || ''
    };
  }

  /**
   * 根據表單類型生成對應的DOCX
   */
  async generateFormDocx(formId: string, formType: string): Promise<void> {
    switch (formType) {
      case 'sitePermit':
        return this.generateWorkPermitDocx(formId);
      case 'toolboxMeeting':
        return this.generateToolboxMeetingDocx(formId);
      case 'environmentChecklist':
        return this.generateEnvironmentChecklistDocx(formId);
      case 'specialWorkChecklist':
        return this.generateSpecialWorkChecklistDocx(formId);
      default:
        throw new Error(`不支援的表單類型: ${formType}`);
    }
  }
} 