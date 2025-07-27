import { Injectable, inject } from '@angular/core';
import { Router } from '@angular/router';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import JSZip from 'jszip';
import { CurrentSiteService } from './current-site.service';
import { FormPdfGeneratorService } from './form-pdf-generator.service';

export interface DownloadProgress {
  current: number;
  total: number;
  currentItem: string;
}

@Injectable({
  providedIn: 'root'
})
export class PdfDownloadService {
  private currentSiteService = inject(CurrentSiteService);
  private router = inject(Router);
  private formPdfGeneratorService = inject(FormPdfGeneratorService);

    /**
   * 下載單個表單的PDF
   */
  async downloadSingleFormPdf(formItem: any): Promise<void> {
    try {
      const currentSite = this.currentSiteService.currentSite();
      if (!currentSite?._id) {
        throw new Error('無法取得當前工地資訊');
      }

      // 優先使用新的PDF生成服務
      if (this.isFormTypeSupported(formItem.formType)) {
        const pdfBlob = await this.formPdfGeneratorService.generateFormPdf(formItem.id, formItem.formType);
        const fileName = this.getFormFileName(formItem);
        this.downloadBlob(pdfBlob, `${fileName}.pdf`);
        return;
      }

      // 對於尚未支援的表單類型，仍使用原來的方式
      const route = this.buildFormRoute(currentSite._id, formItem);
      const formUrl = window.location.origin + this.router.createUrlTree(route).toString();
      
      const fileName = this.getFormFileName(formItem);
      const pdfBlob = await this.generatePdfFromUrl(formUrl);
      
      this.downloadBlob(pdfBlob, `${fileName}.pdf`);
      
    } catch (error) {
      console.error('下載單個表單PDF失敗:', error);
      const errorMessage = error instanceof Error ? error.message : '未知錯誤';
      alert(`下載失敗: ${errorMessage}`);
    }
  }

  /**
   * 批量下載表單PDF並打包成ZIP
   */
  async downloadAllFormsPdf(
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

      for (let i = 0; i < formItems.length; i++) {
        const formItem = formItems[i];
        
        // 更新進度
        onProgress?.({
          current: i + 1,
          total: total,
          currentItem: this.getFormFileName(formItem)
        });

        try {
          // 構建表單路由
          const route = this.buildFormRoute(currentSite._id, formItem);
          const formUrl = window.location.origin + this.router.createUrlTree(route).toString();
          
          // 生成PDF
          const pdfBlob = await this.generatePdfFromUrl(formUrl);
          
          // 獲取檔案名稱
          const fileName = this.getFormFileName(formItem);
          
          // 添加到ZIP
          zip.file(`${fileName}.pdf`, pdfBlob);
          
        } catch (error) {
          console.error(`生成 ${formItem.title} PDF 失敗:`, error);
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
      
      // 下載ZIP檔案
      const today = new Date().toISOString().split('T')[0];
      const siteName = currentSite.projectName || '工地';
      this.downloadBlob(zipBlob, `${siteName}_${today}_表單集合.zip`);
      
    } catch (error) {
      console.error('批量下載表單PDF失敗:', error);
      const errorMessage = error instanceof Error ? error.message : '未知錯誤';
      alert(`批量下載失敗: ${errorMessage}`);
    }
  }

  /**
   * 從URL生成PDF
   */
  private async generatePdfFromUrl(url: string): Promise<Blob> {
    return new Promise((resolve, reject) => {
      // 創建隱藏的iframe
      const iframe = document.createElement('iframe');
      iframe.style.position = 'absolute';
      iframe.style.left = '-9999px';
      iframe.style.top = '-9999px';
      iframe.style.width = '1200px';
      iframe.style.height = '800px';
      iframe.style.border = 'none';
      
      document.body.appendChild(iframe);

      // 設定超時
      const timeout = setTimeout(() => {
        document.body.removeChild(iframe);
        reject(new Error('載入表單超時'));
      }, 30000); // 30秒超時

      iframe.onload = async () => {
        try {
          clearTimeout(timeout);
          
          // 等待內容完全載入
          await new Promise(resolve => setTimeout(resolve, 2000));
          
          const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
          if (!iframeDoc) {
            throw new Error('無法存取iframe內容');
          }

          // 尋找要列印的內容區域
          let printContent = iframeDoc.querySelector('.print-content');
          if (!printContent) {
            // 如果沒有 .print-content，嘗試使用整個body
            printContent = iframeDoc.body;
          }

          if (!printContent) {
            throw new Error('找不到可列印的內容');
          }

          // 使用html2canvas擷取內容
          const canvas = await html2canvas(printContent as HTMLElement, {
            allowTaint: true,
            useCORS: true,
            scale: 2, // 提高解析度
            logging: false,
            backgroundColor: '#ffffff'
          });

          // 創建PDF
          const imgData = canvas.toDataURL('image/png');
          const pdf = new jsPDF('p', 'mm', 'a4');
          
          const imgWidth = 210; // A4寬度
          const pageHeight = 295; // A4高度
          const imgHeight = (canvas.height * imgWidth) / canvas.width;
          let heightLeft = imgHeight;
          let position = 0;

          // 添加第一頁
          pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
          heightLeft -= pageHeight;

          // 如果內容超過一頁，添加更多頁面
          while (heightLeft >= 0) {
            position = heightLeft - imgHeight;
            pdf.addPage();
            pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
            heightLeft -= pageHeight;
          }

          // 生成PDF blob
          const pdfBlob = pdf.output('blob');
          
          // 清理
          document.body.removeChild(iframe);
          resolve(pdfBlob);
          
        } catch (error) {
          document.body.removeChild(iframe);
          reject(error);
        }
      };

      iframe.onerror = () => {
        clearTimeout(timeout);
        document.body.removeChild(iframe);
        reject(new Error('載入表單失敗'));
      };

      // 載入URL
      iframe.src = url;
    });
  }

  /**
   * 構建表單路由
   */
  private buildFormRoute(siteId: string, formItem: any): string[] {
    switch (formItem.formType) {
      case 'sitePermit':
        return ['/site', siteId, 'forms', 'permit', formItem.id];
      case 'toolboxMeeting':
        return ['/site', siteId, 'forms', 'toolbox-meeting', formItem.id];
      case 'environmentChecklist':
        return ['/site', siteId, 'forms', 'environment-check-list', formItem.id];
      case 'specialWorkChecklist':
        return ['/site', siteId, 'forms', 'special-work-checklist', formItem.id];
      case 'safetyPatrolChecklist':
        return ['/site', siteId, 'forms', 'safety-patrol-checklist', formItem.id];
      case 'safetyIssueRecord':
        return ['/site', siteId, 'forms', 'safety-issue-record', formItem.id];
      case 'hazardNotice':
        return ['/site', siteId, 'hazardNotice', formItem.id];
      case 'training':
                  return ['/site', siteId, 'training', formItem.id];
      default:
        return ['/site', siteId, 'forms', 'view', formItem.id];
    }
  }

  /**
   * 獲取表單檔案名稱
   */
  private getFormFileName(formItem: any): string {
    const formTypeMap: { [key: string]: string } = {
      'sitePermit': '工地許可單',
      'toolboxMeeting': '工具箱會議',
      'environmentChecklist': '環安衛自檢表',
      'specialWorkChecklist': '特殊作業自檢表',
      'safetyPatrolChecklist': '工安巡迴檢查表',
      'safetyIssueRecord': '安全缺失記錄單',
      'hazardNotice': '危害告知單',
      'training': '教育訓練'
    };

    const formTypeDisplay = formTypeMap[formItem.formType] || formItem.formType;
    const timestamp = new Date().toISOString().split('T')[0];
    const contractor = formItem.contractor ? `_${formItem.contractor}` : '';
    
    return `${formTypeDisplay}${contractor}_${timestamp}_${formItem.id.substring(0, 8)}`;
  }

  /**
   * 檢查表單類型是否支援新的PDF生成服務
   */
  private isFormTypeSupported(formType: string): boolean {
    const supportedTypes = ['sitePermit', 'toolboxMeeting'];
    return supportedTypes.includes(formType);
  }

  /**
   * 下載Blob檔案
   */
  private downloadBlob(blob: Blob, fileName: string): void {
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    link.style.display = 'none';
    
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    // 清理URL物件
    setTimeout(() => {
      window.URL.revokeObjectURL(url);
    }, 100);
  }
} 