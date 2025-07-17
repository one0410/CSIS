import { Injectable, inject } from '@angular/core';
import { CurrentSiteService } from './current-site.service';
import { DocxTemplateService } from './docx-template.service';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';

export interface DownloadProgress {
  current: number;
  total: number;
  currentItem: string;
}

@Injectable({
  providedIn: 'root'
})
export class WordDownloadService {
  private currentSiteService = inject(CurrentSiteService);
  private docxTemplateService = inject(DocxTemplateService);

  /**
   * 下載單個表單的Word
   */
  async downloadSingleFormWord(formItem: any): Promise<void> {
    try {
      const currentSite = this.currentSiteService.currentSite();
      if (!currentSite?._id) {
        throw new Error('無法取得當前工地資訊');
      }

      // 檢查是否支援此表單類型
      if (this.isFormTypeSupported(formItem.formType)) {
        await this.docxTemplateService.generateFormDocx(formItem.id, formItem.formType);
        return;
      }

      // 對於尚未支援的表單類型，顯示提示
      throw new Error(`表單類型 ${formItem.formType} 尚未支援Word下載`);
      
    } catch (error) {
      console.error('下載單個表單Word失敗:', error);
      const errorMessage = error instanceof Error ? error.message : '未知錯誤';
      alert(`下載失敗: ${errorMessage}`);
    }
  }

  /**
   * 批量下載表單Word並打包成ZIP
   */
  async downloadAllFormsWord(
    formItems: any[], 
    onProgress?: (progress: DownloadProgress) => void
  ): Promise<void> {
    if (formItems.length === 0) {
      alert('沒有可下載的表單');
      return;
    }

    try {
      const currentSite = this.currentSiteService.currentSite();
      if (!currentSite?._id) {
        throw new Error('無法取得當前工地資訊');
      }

      const zip = new JSZip();
      const total = formItems.length;
      let successCount = 0;

      for (let i = 0; i < formItems.length; i++) {
        const formItem = formItems[i];
        
        // 更新進度
        onProgress?.({
          current: i + 1,
          total: total,
          currentItem: this.getFormFileName(formItem)
        });

        try {
          // 檢查是否支援此表單類型
          if (this.isFormTypeSupported(formItem.formType)) {
            // 這裡我們需要修改 DocxTemplateService 來返回 Blob 而不是直接下載
            // 暫時先跳過不支援的類型
            console.log(`跳過不支援批量下載的表單類型: ${formItem.formType}`);
            
            // 創建一個說明文件
            const note = `此表單類型 (${formItem.formType}) 暫不支援批量下載\n` +
                        `請使用單個下載功能\n` +
                        `表單: ${formItem.title}\n` +
                        `時間: ${new Date().toLocaleString()}`;
            zip.file(`說明_${this.getFormFileName(formItem)}.txt`, note);
          } else {
            throw new Error(`表單類型 ${formItem.formType} 尚未支援`);
          }
          
        } catch (error) {
          console.error(`生成 ${formItem.title} Word 失敗:`, error);
          // 為失敗的表單創建錯誤報告
          const errorReport = `錯誤報告 - ${this.getFormFileName(formItem)}\n\n` +
                             `表單: ${formItem.title}\n` +
                             `錯誤: ${error instanceof Error ? error.message : '未知錯誤'}\n` +
                             `時間: ${new Date().toLocaleString()}`;
          zip.file(`錯誤報告_${this.getFormFileName(formItem)}.txt`, errorReport);
        }
      }

      // 生成ZIP檔案
      const zipBlob = await zip.generateAsync({ type: 'blob' });
      
      // 生成ZIP檔案名稱
      const siteName = currentSite.projectName || '未知工地';
      const today = new Date().toISOString().split('T')[0];
      const zipFileName = `${siteName}_${today}_表單集合.zip`;
      
      // 下載ZIP檔案
      saveAs(zipBlob, zipFileName);
      
    } catch (error) {
      console.error('批量下載表單Word失敗:', error);
      const errorMessage = error instanceof Error ? error.message : '未知錯誤';
      alert(`批量下載失敗: ${errorMessage}`);
    }
  }

  /**
   * 檢查表單類型是否支援Word下載
   */
  private isFormTypeSupported(formType: string): boolean {
    const supportedTypes = ['sitePermit', 'toolboxMeeting', 'environmentChecklist', 'specialWorkChecklist'];
    return supportedTypes.includes(formType);
  }

  /**
   * 獲取表單檔案名稱
   */
  private getFormFileName(formItem: any): string {
    const formTypeDisplay = this.getFormTypeDisplay(formItem.formType);
    const contractor = formItem.contractor || '未知廠商';
    const date = new Date().toISOString().split('T')[0];
    const formId = formItem.id ? formItem.id.substring(0, 8) : '未知ID';
    
    return `${formTypeDisplay}_${contractor}_${date}_${formId}`;
  }

  /**
   * 獲取表單類型顯示名稱
   */
  private getFormTypeDisplay(formType: string): string {
    switch(formType) {
      case 'sitePermit':
        return '工地許可單';
      case 'toolboxMeeting':
        return '工具箱會議';
      case 'environmentChecklist':
        return '環安衛自檢表';
      case 'specialWorkChecklist':
        return '特殊作業自檢表';
      case 'safetyPatrolChecklist':
        return '工安巡迴檢查表';
      case 'safetyIssueRecord':
        return '安全缺失記錄單';
      case 'hazardNotice':
        return '危害告知單';
      case 'training':
        return '教育訓練';
      default:
        return formType;
    }
  }
} 