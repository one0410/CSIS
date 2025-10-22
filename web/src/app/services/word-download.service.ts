import { Injectable, inject } from '@angular/core';
import { CurrentSiteService } from './current-site.service';
import { DocxTemplateService } from './docx-template.service';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import dayjs from 'dayjs';

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
          // 嘗試生成 Word 文件
          const result = await this.docxTemplateService.generateFormDocxBlob(formItem.id, formItem.formType);
          zip.file(result.fileName, result.blob);
          successCount++;

        } catch (error) {
          console.error(`生成 ${formItem.title} Word 失敗:`, error);
          
          const errorMessage = error instanceof Error ? error.message : '未知錯誤';
          
          // 如果是不支援的表單類型，創建說明文件
          if (errorMessage.includes('尚未支援批量下載')) {
            const note = `此表單類型暫不支援批量下載\n\n` +
              `表單類型: ${formItem.formType}\n` +
              `表單名稱: ${formItem.title}\n` +
              `說明: 請使用單個下載功能下載此類型表單\n` +
              `時間: ${new Date().toLocaleString()}`;
            zip.file(`說明_${this.getFormFileName(formItem)}.txt`, note);
          } else {
            // 其他錯誤創建錯誤報告
            const errorReport = `錯誤報告 - ${this.getFormFileName(formItem)}\n\n` +
              `表單: ${formItem.title}\n` +
              `表單類型: ${formItem.formType}\n` +
              `錯誤: ${errorMessage}\n` +
              `時間: ${new Date().toLocaleString()}`;
            zip.file(`錯誤報告_${this.getFormFileName(formItem)}.txt`, errorReport);
          }
        }
      }

      // 生成ZIP檔案
      const zipBlob = await zip.generateAsync({ 
        type: 'blob',
        compression: 'DEFLATE',
        compressionOptions: {
          level: 6
        }
      });

      // 生成ZIP檔案名稱
      const siteName = currentSite.projectName || '未知工地';
      const today = dayjs().format('YYYY-MM-DD');
      const zipFileName = `${siteName}_${today}_表單集合.zip`;

      // 下載ZIP檔案
      saveAs(zipBlob, zipFileName);

      // 顯示成功訊息
      const message = `批量下載完成！\n` +
        `成功生成: ${successCount} 個表單\n` +
        `失敗: ${total - successCount} 個表單\n` +
        `檔案名稱: ${zipFileName}`;
      
      if (successCount > 0) {
        alert(message);
      } else {
        alert('沒有成功生成任何表單文件，請檢查表單資料或聯繫系統管理員。');
      }

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
    const supportedTypes = [
      'sitePermit',
      'toolboxMeeting',
      'environmentChecklist',
      'specialWorkChecklist',
      'safetyIssueRecord',
      'hazardNotice',
      'training'
    ];
    return supportedTypes.includes(formType);
  }

  /**
   * 獲取表單檔案名稱
   */
  private getFormFileName(formItem: any): string {
    const formTypeDisplay = this.getFormTypeDisplay(formItem.formType);
    const contractor = formItem.contractor || '未知廠商';
    const date = dayjs().format('YYYY-MM-DD');
    const formId = formItem.id ? formItem.id.substring(0, 8) : '未知ID';

    return `${formTypeDisplay}_${contractor}_${date}_${formId}`;
  }

  /**
   * 獲取表單類型顯示名稱
   */
  private getFormTypeDisplay(formType: string): string {
    switch (formType) {
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
        return '工安缺失紀錄單';
      case 'hazardNotice':
        return '危害告知單';
      case 'training':
        return '教育訓練';
      default:
        return formType;
    }
  }
} 