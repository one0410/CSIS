import { Injectable, inject } from '@angular/core';
import Docxtemplater from 'docxtemplater';
import PizZip from 'pizzip';
import { saveAs } from 'file-saver';
import { MongodbService } from './mongodb.service';
import { CurrentSiteService } from './current-site.service';
import dayjs from 'dayjs';
import { IssueRecord } from '../site-list/site-detail/site-form-list/safety-issue-record/safety-issue-record.component';
import { SitePermitForm } from '../site-list/site-detail/site-form-list/site-permit-form/site-permit-form.component';
import { ToolboxMeetingForm } from '../site-list/site-detail/site-form-list/toolbox-meeting-form/toolbox-meeting-form.component';
import { TrainingForm } from '../site-list/site-detail/site-training/training-form/training-form.component';
import { SpecialWorkChecklistData } from '../site-list/site-detail/site-form-list/special-work-checklist/special-work-checklist.component';
import { EnvironmentChecklistData } from '../site-list/site-detail/site-form-list/environment-check-list/environment-check-list.component';
import { HazardNoticeForm } from '../site-list/site-detail/site-hazard-notice/hazard-notice-form/hazard-notice-form.component';
import { SafetyPatrolChecklistData } from '../site-list/site-detail/site-form-list/safety-patrol-checklist/safety-patrol-checklist.component';


@Injectable({
  providedIn: 'root'
})
export class DocxTemplateService {
  private mongodbService = inject(MongodbService);
  private currentSiteService = inject(CurrentSiteService);

  /**
   * 通用的文檔生成方法
   */
  private async generateDocumentBlob(
    formId: string,
    templatePath: string,
    prepareDataFn: (formData: any, currentSite: any) => any,
    generateFileNameFn: (formData: any, currentSite: any) => string,
    needsExpressionParser: boolean = false
  ): Promise<{ blob: Blob, fileName: string }> {
    try {
      // 獲取表單資料
      const formData = await this.mongodbService.getById('siteForm', formId);
      const currentSite = this.currentSiteService.currentSite();

      if (!formData || !currentSite) {
        throw new Error('無法獲取表單或專案資料');
      }

      // 載入模板檔案
      const response = await fetch(templatePath);
      if (!response.ok) {
        throw new Error(`無法載入模板檔案: ${response.status}`);
      }

      const arrayBuffer = await response.arrayBuffer();
      const zip = new PizZip(arrayBuffer);

      // 設定圖片模組
      const modules = [];
      try {
        const ImageModule = await import('docxtemplater-image-module-free');
        const imageOptions = {
          centered: true,
          getImage: (tagValue: string) => this.getImageData(tagValue),
          getSize: (img: ArrayBuffer, tagValue: string): [number, number] => [120, 60]
        };
        const ModuleConstructor = ImageModule.default || ImageModule;
        const imageModule = new ModuleConstructor(imageOptions);
        modules.push(imageModule);
      } catch (error) {
        console.error('ImageModule 載入失敗:', error);
      }

      // 創建 docxtemplater 實例
      const doc = new Docxtemplater().loadZip(zip);

      // 添加模組
      if (modules.length > 0) {
        modules.forEach(module => doc.attachModule(module));
      }

      // 設定選項
      if (needsExpressionParser) {
        const expressionParser = await import('angular-expressions');
        doc.setOptions({
          parser: (tag: string) => {
            const compiled = (expressionParser.default || expressionParser).compile(tag);
            return { get: (scope: any) => compiled(scope) };
          },
          nullGetter: (part: any) => ''
        });
      } else {
        doc.setOptions({
          paragraphLoop: true,
          linebreaks: true,
          nullGetter: (part: any) => '' // 當遇到未定義的屬性時返回空字串，避免顯示 "undefined"
        });
      }

      // 準備模板資料
      const templateData = prepareDataFn(formData, currentSite);

      // 填充模板
      doc.render(templateData);

      // 生成文檔
      const blob = doc.getZip().generate({
        type: 'blob',
        mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      });

      // 生成檔案名稱
      const fileName = generateFileNameFn(formData, currentSite);

      return { blob, fileName };

    } catch (error) {
      console.error('生成文檔失敗:', error);
      throw error;
    }
  }

  /**
   * 生成工作許可單 DOCX
   */
  async generateWorkPermitDocx(formId: string): Promise<void> {
    try {
      const result = await this.generateWorkPermitDocxBlob(formId);
      saveAs(result.blob, result.fileName);
    } catch (error) {
      console.error('生成工作許可單DOCX失敗:', error);
      throw error;
    }
  }

  /**
   * 生成工作許可單 DOCX Blob（用於批量下載）
   */
  async generateWorkPermitDocxBlob(formId: string): Promise<{ blob: Blob, fileName: string }> {
    return this.generateDocumentBlob(
      formId,
      '/template/帆宣-ee-4404-01工作許可單.docx',
      (formData, currentSite) => this.prepareWorkPermitData(formData, currentSite),
      (formData, currentSite) => `工作許可單_${formData.applyDate || dayjs().format('YYYY-MM-DD')}_${formData.projectNo || formId}.docx`
    );
  }

  /**
   * 準備工作許可單的模板數據
   */
  private prepareWorkPermitData(formData: SitePermitForm, currentSite: any): any {

    return {
      // 基本資料
      applyDate: dayjs(formData.applyDate).format('YYYY-MM-DD') || dayjs().format('YYYY-MM-DD'),
      applyDateYear: dayjs(formData.applyDate).year(),
      applyDateMonth: dayjs(formData.applyDate).month() + 1,
      applyDateDay: dayjs(formData.applyDate).date(),
      workContent: formData.workContent || '',
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

      // 一般作業 / 特殊作業
      isGeneralWork: formData.isGeneralWork || false,
      isSpecialWork: formData.isSpecialWork || false,

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
      applicantSignDate: formData.applicantSignature?.signedAt ? dayjs(formData.applicantSignature.signedAt).format('YYYY-MM-DD') : '',
      departmentManagerSignDate: formData.departmentManagerSignature?.signedAt ? dayjs(formData.departmentManagerSignature.signedAt).format('YYYY-MM-DD') : '',
      reviewSignDate: formData.reviewSignature?.signedAt ? dayjs(formData.reviewSignature.signedAt).format('YYYY-MM-DD') : '',
      approvalSignDate: formData.approvalSignature?.signedAt ? dayjs(formData.approvalSignature.signedAt).format('YYYY-MM-DD') : '',

      // 表單狀態
      status: formData.status || 'draft',

      // JSA 表單新增欄位
      workName: formData.workName || '',
      contractor: formData.contractor || '',
      maker: formData.maker || '',
      makerDate: formData.makerDate ? dayjs(formData.makerDate).format('YYYY-MM-DD') : '',
      step: formData.step || '',
      highRiskProject: formData.highRiskProject || '',
      possibleHazardFactor: formData.possibleHazardFactor || '',
      protectiveEquipment: formData.protectiveEquipment || '',
      safetyProtectionMeasures: formData.safetyProtectionMeasures || '',
      emergencyMeasures: formData.emergencyMeasures || '',
      workDate: formData.workDate ? dayjs(formData.workDate).format('YYYY-MM-DD') : '',
      workPersonCount: formData.workPersonCount ?? ''
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
      const result = await this.generateToolboxMeetingDocxBlob(formId);
      saveAs(result.blob, result.fileName);
    } catch (error) {
      console.error('無法生成工具箱會議記錄 DOCX:', error);
      throw error;
    }
  }

  /**
   * 生成工具箱會議記錄 DOCX Blob（用於批量下載）
   */
  async generateToolboxMeetingDocxBlob(formId: string): Promise<{ blob: Blob, fileName: string }> {
    return this.generateDocumentBlob(
      formId,
      '/template/帆宣-ee-4411-15工具箱會議及巡檢紀錄.docx',
      (formData, currentSite) => this.prepareToolboxMeetingData(formData, currentSite),
      (formData, currentSite) => `工具箱會議記錄_${currentSite.projectName}_${formData.applyDate}.docx`
    );
  }

  /**
   * 準備工具箱會議模板資料
   */
  private prepareToolboxMeetingData(formData: ToolboxMeetingForm, currentSite: any): any {

    return {
      // 基本資訊
      projectName: currentSite.projectName || '',
      meetingDate: formData.applyDate || '',
      meetingDateYear: dayjs(formData.applyDate).year(),
      meetingDateMonth: dayjs(formData.applyDate).month() + 1,
      meetingDateDay: dayjs(formData.applyDate).date(),
      meetingTime: formData.meetingTime || '',
      meetingLocation: formData.meetingLocation || '',
      hostCompany: formData.hostCompany || '',
      hostPerson: formData.hostPerson || '',
      contractorCompany0: formData.contractors?.[0]?.company || '',
      contractorCompany1: formData.contractors?.[1]?.company || '',
      contractorCompany2: formData.contractors?.[2]?.company || '',
      contractorCompany3: formData.contractors?.[3]?.company || '',
      contractorName0: formData.contractors?.[0]?.name || '',
      contractorName1: formData.contractors?.[1]?.name || '',
      contractorName2: formData.contractors?.[2]?.name || '',
      contractorName3: formData.contractors?.[3]?.name || '',
      workItem0: formData.workItems?.[0]?.description || '',
      workItem1: formData.workItems?.[1]?.description || '',

      // 物理性危害
      fallDrop: formData.hazards?.physical?.fallDrop ? '🗹' : '🗷', // 跌墜落
      physicalInjury: formData.hazards?.physical?.physicalInjury ? '🗹' : '🗷', // 擦、刺、扭、壓、夾、碰撞、割傷
      fallObject: formData.hazards?.physical?.fallObject ? '🗹' : '🗷', // 物體飛落
      foreignObjectInEye: formData.hazards?.physical?.foreignObjectInEye ? '🗹' : '🗷', // 異物入眼
      highTempContact: formData.hazards?.physical?.highTempContact ? '🗹' : '🗷', // 與高溫接觸
      lowTempContact: formData.hazards?.physical?.lowTempContact ? '🗹' : '🗷', // 與低溫接觸
      noise: formData.hazards?.physical?.noise ? '🗹' : '🗷', // 噪音
      electric: formData.hazards?.physical?.electric ? '🗹' : '🗷', // 感電
      collapse: formData.hazards?.physical?.collapse ? '🗹' : '🗷', // 塌陷
      radiation: formData.hazards?.physical?.radiation ? '🗹' : '🗷', // 游離輻射

      // 化學性危害
      burn: formData.hazards?.chemical?.burn ? '🗹' : '🗷', // 化學性燒灼傷
      inhalation: formData.hazards?.chemical?.inhalation ? '🗹' : '🗷', // 化學物吸入

      // 火災危害
      fire: formData.hazards?.fire?.fire ? '🗹' : '🗷', // 火災
      explosion: formData.hazards?.fire?.explosion ? '🗹' : '🗷', // 爆炸

      // 其他危害
      none: formData.hazards?.other?.none ? '🗹' : '🗷', // 無危害（模板使用 {none}）
      noHazard: formData.hazards?.other?.none ? '🗹' : '🗷', // 無危害（向後兼容）
      oxygenDeficiency: formData.hazards?.other?.oxygenDeficiency ? '🗹' : '🗷', // 缺氧
      biological: formData.hazards?.other?.biological ? '🗹' : '🗷', // 生物性危害
      outdoorHighTemp: formData.hazards?.other?.outdoorHighTemp ? '🗹' : '🗷', // 戶外高溫
      other: formData.hazards?.other?.other ? '🗹' : '🗷', // 其他危害
      otherContent: formData.hazards?.other?.otherContent || '', // 其他危害內容

      // 化學品及其附屬設備管線
      noChemical: formData.hazards?.chemicalArea?.hasChemicals ? '🗷' : '🗹', // 無化學品
      hasChemical: formData.hazards?.chemicalArea?.hasChemicals ? '🗹' : '🗷', // 有化學品
      chemicalNames: formData.hazards?.chemicalArea?.chemicalNames || '', // 化學品名稱

      // 氣體及其附屬設備管線
      noGas: formData.hazards?.gasArea?.hasGas ? '🗷' : '🗹', // 無氣體
      hasGas: formData.hazards?.gasArea?.hasGas ? '🗹' : '🗷', // 有氣體
      gasNames: formData.hazards?.gasArea?.gasNames || '', // 氣體名稱

      // 安全衛生措施-01頭部防護
      headProtection: formData.safetyPrecautions?.personalProtection?.headProtection ? '🗹' : '🗷', // 頭部防護
      workSiteHead: formData.safetyPrecautions?.personalProtection?.workSiteHead ? '🗹' : '🗷', // 工地用
      electricianHead: formData.safetyPrecautions?.personalProtection?.electricianHead ? '🗹' : '🗷', // 電工用
      helmetHead: formData.safetyPrecautions?.personalProtection?.helmetHead ? '🗹' : '🗷', // 膠盔

      // 安全衛生措施-02眼部防護
      eyeProtection: formData.safetyPrecautions?.personalProtection?.eyeProtection ? '🗹' : '🗷', // 眼部防護
      mechanicalEyes: formData.safetyPrecautions?.personalProtection?.mechanicalEyes ? '🗹' : '🗷', // 防禦機械能傷害的安全眼鏡
      radiationEyes: formData.safetyPrecautions?.personalProtection?.radiationEyes ? '🗹' : '🗷', // 防禦輻射能傷害的安全眼鏡

      // 安全衛生措施-03耳部防護
      earProtection: formData.safetyPrecautions?.personalProtection?.earProtection ? '🗹' : '🗷', // 耳部防護
      earPlugs: formData.safetyPrecautions?.personalProtection?.earPlugs ? '🗹' : '🗷', // 耳塞
      earMuffs: formData.safetyPrecautions?.personalProtection?.earMuffs ? '🗹' : '🗷', // 耳罩

      // 安全衛生措施-04呼吸防護
      breathProtection: formData.safetyPrecautions?.personalProtection?.breathProtection ? '🗹' : '🗷', // 呼吸防護
      dustMask: formData.safetyPrecautions?.personalProtection?.dustMask ? '🗹' : '🗷', // 防塵
      toxicMask: formData.safetyPrecautions?.personalProtection?.toxicMask ? '🗹' : '🗷', // 濾毒
      scba: formData.safetyPrecautions?.personalProtection?.scba ? '🗹' : '🗷', // SCBA
      papr: formData.safetyPrecautions?.personalProtection?.papr ? '🗹' : '🗷', // PAPR
      airlineMask: formData.safetyPrecautions?.personalProtection?.airlineMask ? '🗹' : '🗷', // 輸氣管面罩

      // 安全衛生措施-05手部防護
      handProtection: formData.safetyPrecautions?.personalProtection?.handProtection ? '🗹' : '🗷', // 手部防護
      cutResistantGloves: formData.safetyPrecautions?.personalProtection?.cutResistantGloves ? '🗹' : '🗷', // 耐切割
      wearResistantGloves: formData.safetyPrecautions?.personalProtection?.wearResistantGloves ? '🗹' : '🗷', // 耐磨
      heatResistantGloves: formData.safetyPrecautions?.personalProtection?.heatResistantGloves ? '🗹' : '🗷', // 耐熱
      electricianGloves: formData.safetyPrecautions?.personalProtection?.electricianGloves ? '🗹' : '🗷', // 電工用
      chemicalGloves: formData.safetyPrecautions?.personalProtection?.chemicalGloves ? '🗹' : '🗷', // 防化學

      // 安全衛生措施-06足部防護
      footProtection: formData.safetyPrecautions?.personalProtection?.footProtection ? '🗹' : '🗷', // 足部防護
      safetyShoes: formData.safetyPrecautions?.personalProtection?.safetyShoes ? '🗹' : '🗷', // 一般安全鞋
      chemicalShoes: formData.safetyPrecautions?.personalProtection?.chemicalShoes ? '🗹' : '🗷', // 防化學安全鞋

      // 安全衛生措施-07身體防護
      bodyProtection: formData.safetyPrecautions?.personalProtection?.bodyProtection ? '🗹' : '🗷', // 身體防護
      backpackBelt: formData.safetyPrecautions?.personalProtection?.backpackBelt ? '🗹' : '🗷', // 背負式安全帶
      weldingMask: formData.safetyPrecautions?.personalProtection?.weldingMask ? '🗹' : '🗷', // 電焊用防護面具
      chemicalProtection: formData.safetyPrecautions?.personalProtection?.chemicalProtection ? '🗹' : '🗷', // 化學防護衣
      reflectiveVest: formData.safetyPrecautions?.personalProtection?.reflectiveVest ? '🗹' : '🗷', // 反光背心

      // 安全衛生措施-08墜落預防
      fallPrevention: formData.safetyPrecautions?.personalProtection?.fallPrevention ? '🗹' : '🗷', // 墜落預防
      ladder: formData.safetyPrecautions?.personalProtection?.ladder ? '🗹' : '🗷', // 合梯
      mobileLadder: formData.safetyPrecautions?.personalProtection?.mobileLadder ? '🗹' : '🗷', // 移動式梯子
      scaffolding: formData.safetyPrecautions?.personalProtection?.scaffold ? '🗹' : '🗷', // 腳手架
      highWorkVehicle: formData.safetyPrecautions?.personalProtection?.highWorkVehicle ? '🗹' : '🗷', // 高空工作車
      safetyLine: formData.safetyPrecautions?.personalProtection?.safetyLine ? '🗹' : '🗷', // 安全線
      protectionCage: formData.safetyPrecautions?.personalProtection?.protectionCage ? '🗹' : '🗷', // 安全母索
      guardrail: formData.safetyPrecautions?.personalProtection?.guardrail ? '🗹' : '🗷', // 護欄
      protectionCover: formData.safetyPrecautions?.personalProtection?.protectionCover ? '🗹' : '🗷', // 護罩
      safetyNet: formData.safetyPrecautions?.personalProtection?.safetyNet ? '🗹' : '🗷', // 安全網
      warningBarrier: formData.safetyPrecautions?.personalProtection?.warningBarrier ? '🗹' : '🗷', // 警示圍籬
      fallPreventer: formData.safetyPrecautions?.personalProtection?.fallPreventer ? '🗹' : '🗷', // 墜落防護器

      // 安全衛生措施-09感電預防
      electricPrevention: formData.safetyPrecautions?.personalProtection?.electricPrevention ? '🗹' : '🗷', // 感電預防
      leakageBreaker: formData.safetyPrecautions?.personalProtection?.leakageBreaker ? '🗹' : '🗷', // 漏電斷路器
      autoElectricPreventer: formData.safetyPrecautions?.personalProtection?.autoElectricPreventer ? '🗹' : '🗷', // 交流電焊機自動電擊防止裝置
      voltageDetector: formData.safetyPrecautions?.personalProtection?.voltageDetector ? '🗹' : '🗷', // 檢電器

      // 安全衛生措施-10火災預防
      firePrevention: formData.safetyPrecautions?.personalProtection?.firePrevention ? '🗹' : '🗷', // 火災預防
      fireExtinguisher: formData.safetyPrecautions?.personalProtection?.fireExtinguisher ? '🗹' : '🗷', // 滅火器
      fireBlanket: formData.safetyPrecautions?.personalProtection?.fireBlanket ? '🗹' : '🗷', // 防火毯
      oxyacetyleneFireback: formData.safetyPrecautions?.personalProtection?.oxyacetyleneFireback ? '🗹' : '🗷', // 氧乙炔防回火裝置

      // 安全衛生措施-11缺氧預防
      oxygenPrevention: formData.safetyPrecautions?.personalProtection?.oxygenPrevention ? '🗹' : '🗷', // 缺氧預防
      ventilation: formData.safetyPrecautions?.personalProtection?.ventilation ? '🗹' : '🗷', // 通風
      lifeDetector: formData.safetyPrecautions?.personalProtection?.lifeDetector ? '🗹' : '🗷', // 生命探測器
      gasDetector: formData.safetyPrecautions?.personalProtection?.gasDetector ? '🗹' : '🗷', // 氣體探測器
      liftingEquipment: formData.safetyPrecautions?.personalProtection?.liftingEquipment ? '🗹' : '🗷', // 起重機
      rescueEquipment: formData.safetyPrecautions?.personalProtection?.rescueEquipment ? '🗹' : '🗷', // 搶救設備

      // 安全衛生措施-12其他預防
      otherPrevention: formData.safetyPrecautions?.personalProtection?.otherPrevention ? '🗹' : '🗷', // 其他預防
      otherPreventionContent: formData.safetyPrecautions?.personalProtection?.otherContent || '', // 其他預防內容

      // 其他溝通/協議/宣導事項
      communicationItems: formData.communicationItems || '',

      // 四十個簽名圖片 - 模板使用 {%...} 格式的圖像佔位符，需要傳遞 base64 字符串
      attendeeMainContractorSignatures0: this.getValidSignatureImage(formData.healthWarnings?.attendeeMainContractorSignatures?.[0]?.signature),
      attendeeMainContractorSignatures1: this.getValidSignatureImage(formData.healthWarnings?.attendeeMainContractorSignatures?.[1]?.signature),
      attendeeMainContractorSignatures2: this.getValidSignatureImage(formData.healthWarnings?.attendeeMainContractorSignatures?.[2]?.signature),
      attendeeMainContractorSignatures3: this.getValidSignatureImage(formData.healthWarnings?.attendeeMainContractorSignatures?.[3]?.signature),
      attendeeMainContractorSignatures4: this.getValidSignatureImage(formData.healthWarnings?.attendeeMainContractorSignatures?.[4]?.signature),
      attendeeMainContractorSignatures5: this.getValidSignatureImage(formData.healthWarnings?.attendeeMainContractorSignatures?.[5]?.signature),
      attendeeMainContractorSignatures6: this.getValidSignatureImage(formData.healthWarnings?.attendeeMainContractorSignatures?.[6]?.signature),
      attendeeMainContractorSignatures7: this.getValidSignatureImage(formData.healthWarnings?.attendeeMainContractorSignatures?.[7]?.signature),
      attendeeMainContractorSignatures8: this.getValidSignatureImage(formData.healthWarnings?.attendeeMainContractorSignatures?.[8]?.signature),
      attendeeMainContractorSignatures9: this.getValidSignatureImage(formData.healthWarnings?.attendeeMainContractorSignatures?.[9]?.signature),
      attendeeSubcontractor1Signatures0: this.getValidSignatureImage(formData.healthWarnings?.attendeeSubcontractor1Signatures?.[0]?.signature),
      attendeeSubcontractor1Signatures1: this.getValidSignatureImage(formData.healthWarnings?.attendeeSubcontractor1Signatures?.[1]?.signature),
      attendeeSubcontractor1Signatures2: this.getValidSignatureImage(formData.healthWarnings?.attendeeSubcontractor1Signatures?.[2]?.signature),
      attendeeSubcontractor1Signatures3: this.getValidSignatureImage(formData.healthWarnings?.attendeeSubcontractor1Signatures?.[3]?.signature),
      attendeeSubcontractor1Signatures4: this.getValidSignatureImage(formData.healthWarnings?.attendeeSubcontractor1Signatures?.[4]?.signature),
      attendeeSubcontractor1Signatures5: this.getValidSignatureImage(formData.healthWarnings?.attendeeSubcontractor1Signatures?.[5]?.signature),
      attendeeSubcontractor1Signatures6: this.getValidSignatureImage(formData.healthWarnings?.attendeeSubcontractor1Signatures?.[6]?.signature),
      attendeeSubcontractor1Signatures7: this.getValidSignatureImage(formData.healthWarnings?.attendeeSubcontractor1Signatures?.[7]?.signature),
      attendeeSubcontractor1Signatures8: this.getValidSignatureImage(formData.healthWarnings?.attendeeSubcontractor1Signatures?.[8]?.signature),
      attendeeSubcontractor1Signatures9: this.getValidSignatureImage(formData.healthWarnings?.attendeeSubcontractor1Signatures?.[9]?.signature),
      attendeeSubcontractor2Signatures0: this.getValidSignatureImage(formData.healthWarnings?.attendeeSubcontractor2Signatures?.[0]?.signature),
      attendeeSubcontractor2Signatures1: this.getValidSignatureImage(formData.healthWarnings?.attendeeSubcontractor2Signatures?.[1]?.signature),
      attendeeSubcontractor2Signatures2: this.getValidSignatureImage(formData.healthWarnings?.attendeeSubcontractor2Signatures?.[2]?.signature),
      attendeeSubcontractor2Signatures3: this.getValidSignatureImage(formData.healthWarnings?.attendeeSubcontractor2Signatures?.[3]?.signature),
      attendeeSubcontractor2Signatures4: this.getValidSignatureImage(formData.healthWarnings?.attendeeSubcontractor2Signatures?.[4]?.signature),
      attendeeSubcontractor2Signatures5: this.getValidSignatureImage(formData.healthWarnings?.attendeeSubcontractor2Signatures?.[5]?.signature),
      attendeeSubcontractor2Signatures6: this.getValidSignatureImage(formData.healthWarnings?.attendeeSubcontractor2Signatures?.[6]?.signature),
      attendeeSubcontractor2Signatures7: this.getValidSignatureImage(formData.healthWarnings?.attendeeSubcontractor2Signatures?.[7]?.signature),
      attendeeSubcontractor2Signatures8: this.getValidSignatureImage(formData.healthWarnings?.attendeeSubcontractor2Signatures?.[8]?.signature),
      attendeeSubcontractor2Signatures9: this.getValidSignatureImage(formData.healthWarnings?.attendeeSubcontractor2Signatures?.[9]?.signature),
      attendeeSubcontractor3Signatures0: this.getValidSignatureImage(formData.healthWarnings?.attendeeSubcontractor3Signatures?.[0]?.signature),
      attendeeSubcontractor3Signatures1: this.getValidSignatureImage(formData.healthWarnings?.attendeeSubcontractor3Signatures?.[1]?.signature),
      attendeeSubcontractor3Signatures2: this.getValidSignatureImage(formData.healthWarnings?.attendeeSubcontractor3Signatures?.[2]?.signature),
      attendeeSubcontractor3Signatures3: this.getValidSignatureImage(formData.healthWarnings?.attendeeSubcontractor3Signatures?.[3]?.signature),
      attendeeSubcontractor3Signatures4: this.getValidSignatureImage(formData.healthWarnings?.attendeeSubcontractor3Signatures?.[4]?.signature),
      attendeeSubcontractor3Signatures5: this.getValidSignatureImage(formData.healthWarnings?.attendeeSubcontractor3Signatures?.[5]?.signature),
      attendeeSubcontractor3Signatures6: this.getValidSignatureImage(formData.healthWarnings?.attendeeSubcontractor3Signatures?.[6]?.signature),
      attendeeSubcontractor3Signatures7: this.getValidSignatureImage(formData.healthWarnings?.attendeeSubcontractor3Signatures?.[7]?.signature),
      attendeeSubcontractor3Signatures8: this.getValidSignatureImage(formData.healthWarnings?.attendeeSubcontractor3Signatures?.[8]?.signature),
      attendeeSubcontractor3Signatures9: this.getValidSignatureImage(formData.healthWarnings?.attendeeSubcontractor3Signatures?.[9]?.signature),


      // 作業現場巡檢紀錄
      checkBeforeStart1: formData.fieldCheckItems?.[0]?.checkBeforeStart ? '🗹' : '🗷',
      checkBeforeStart2: formData.fieldCheckItems?.[1]?.checkBeforeStart ? '🗹' : '🗷',
      checkBeforeStart3: formData.fieldCheckItems?.[2]?.checkBeforeStart ? '🗹' : '🗷',
      checkBeforeStart4: formData.fieldCheckItems?.[3]?.checkBeforeStart ? '🗹' : '🗷',
      checkBeforeStart5: formData.fieldCheckItems?.[4]?.checkBeforeStart ? '🗹' : '🗷',
      checkDuring1: formData.fieldCheckItems?.[0]?.checkDuring ? '🗹' : '🗷',
      checkDuring2: formData.fieldCheckItems?.[1]?.checkDuring ? '🗹' : '🗷',
      checkDuring3: formData.fieldCheckItems?.[2]?.checkDuring ? '🗹' : '🗷',
      checkDuring4: formData.fieldCheckItems?.[3]?.checkDuring ? '🗹' : '🗷',
      checkDuring5: formData.fieldCheckItems?.[4]?.checkDuring ? '🗹' : '🗷',
      checkBeforeEnd1: formData.fieldCheckItems?.[0]?.checkBeforeEnd ? '🗹' : '🗷',
      checkBeforeEnd2: formData.fieldCheckItems?.[1]?.checkBeforeEnd ? '🗹' : '🗷',
      checkBeforeEnd3: formData.fieldCheckItems?.[2]?.checkBeforeEnd ? '🗹' : '🗷',
      checkBeforeEnd4: formData.fieldCheckItems?.[3]?.checkBeforeEnd ? '🗹' : '🗷',
      checkBeforeEnd5: formData.fieldCheckItems?.[4]?.checkBeforeEnd ? '🗹' : '🗷',
      checkAfter1: formData.fieldCheckItems?.[0]?.checkAfter ? '🗹' : '🗷',
      checkAfter2: formData.fieldCheckItems?.[1]?.checkAfter ? '🗹' : '🗷',
      checkAfter3: formData.fieldCheckItems?.[2]?.checkAfter ? '🗹' : '🗷',
      checkAfter4: formData.fieldCheckItems?.[3]?.checkAfter ? '🗹' : '🗷',
      checkAfter5: formData.fieldCheckItems?.[4]?.checkAfter ? '🗹' : '🗷',


      noRemarks: formData.noRemarks ? '🗹' : '☐',
      hasRemarks: formData.hasRemarks ? '🗹' : '☐',
      remarks: formData.remarks || '',

      // 簽名圖片 - 透過 getValidSignatureImage 處理以確保正確格式
      beforeWorkSignature: this.getValidSignatureImage(formData.beforeWorkSignature),
      duringWorkSignature: this.getValidSignatureImage(formData.duringWorkSignature),
      afterWorkSignature: this.getValidSignatureImage(formData.afterWorkSignature),
      siteManagerSignature: this.getValidSignatureImage(formData.siteManagerSignature),
      beforeWorkSignatureTime: formData.beforeWorkSignatureTime ? dayjs(formData.beforeWorkSignatureTime).format('YYYY/MM/DD HH:mm') : '',
      duringWorkSignatureTime: formData.duringWorkSignatureTime ? dayjs(formData.duringWorkSignatureTime).format('YYYY/MM/DD HH:mm') : '',
      afterWorkSignatureTime: formData.afterWorkSignatureTime ? dayjs(formData.afterWorkSignatureTime).format('YYYY/MM/DD HH:mm') : '',
      siteManagerSignatureTime: formData.siteManagerSignatureTime ? dayjs(formData.siteManagerSignatureTime).format('YYYY/MM/DD HH:mm') : '',
    };
  }

  /**
   * 生成教育訓練 DOCX
   */
  async generateTrainingDocx(formId: string): Promise<void> {
    try {
      const result = await this.generateTrainingDocxBlob(formId);
      saveAs(result.blob, result.fileName);
    } catch (error) {
      console.error('生成教育訓練DOCX失敗:', error);
      throw error;
    }
  }

  /**
   * 生成教育訓練 DOCX Blob
   */
  async generateTrainingDocxBlob(formId: string): Promise<{ blob: Blob, fileName: string }> {
    return this.generateDocumentBlob(
      formId,
      '/template/qp-6201-07_教育訓練簽到表.docx',
      (formData, currentSite) => this.prepareTrainingData(formData, currentSite),
      (formData, currentSite) => `教育訓練簽到表_${currentSite.projectName || ''}_${formData.trainingDate || ''}.docx`
    );
  }

  /**
   * 準備教育訓練模板資料
   */
  private prepareTrainingData(formData: TrainingForm, currentSite: any): any {
    const signatures = formData.workerSignatures || [];
    const pad = (n: number) => n.toString().padStart(2, '0');
    const rows = Array.from({ length: 25 }).map((_, i) => {
      const s = signatures[i];
      return {
        no: pad(i + 1),
        unit: s?.company || '',
        empNo: s?.employeeNo || '',
        name: s?.name || '',
        sign: s?.signature || '',
        remark: s?.remarks || ''
      };
    });

    const time1 = dayjs().format('YYYY-MM-DD') + ' ' + formData.trainingTime;
    const time2 = dayjs().format('YYYY-MM-DD') + ' ' + formData.trainingTimeEnd;
    const duration = dayjs(time2).diff(dayjs(time1), 'hour');

    return {
      companyName: currentSite.companyName || '帆宣系統科技股份有限公司',
      projectName: currentSite.projectName || '',
      courseName: formData.courseName || '',
      trainingDate: dayjs(formData.trainingDate).format('YYYY 年 MM 月 DD 日'),
      trainingTime: formData.trainingTime || '',
      trainingTimeEnd: formData.trainingTimeEnd || '',
      trainingDuration: duration.toString(),
      instructor: formData.instructor || '',
      remarks: formData.remarks || '',
      rows
    };
  }

  /**
   * 生成環安衛自主檢點表 DOCX
   */
  async generateEnvironmentChecklistDocx(formId: string): Promise<void> {
    try {
      const result = await this.generateEnvironmentChecklistDocxBlob(formId);
      saveAs(result.blob, result.fileName);
    } catch (error) {
      console.error('無法生成環安衛自主檢點表 DOCX:', error);
      throw error;
    }
  }

  /**
   * 生成環安衛自主檢點表 DOCX Blob（用於批量下載）
   */
  async generateEnvironmentChecklistDocxBlob(formId: string): Promise<{ blob: Blob, fileName: string }> {
    return this.generateDocumentBlob(
      formId,
      '/template/帆宣-ee-4404-02環安衛自主檢點表.docx',
      (formData, currentSite) => this.prepareEnvironmentChecklistData(formData, currentSite),
      (formData, currentSite) => `環安衛自主檢點表_${currentSite.projectName}_${formData.checkDate}.docx`
    );
  }

  /**
   * 準備環安衛自主檢點表模板資料
   */
  private prepareEnvironmentChecklistData(formData: EnvironmentChecklistData, currentSite: any): any {
    const applyDate = dayjs(formData.applyDate);

    // 確保 items 和 fixes 存在
    const items: Record<string, string> = formData.items || {};
    const fixes: Record<string, string> = formData.fixes || {};

    // 處理所有項目，確保三個選項都有值（避免 undefined）
    for (const key in items) {
      // 跳過已經處理過的後綴欄位
      if (key.endsWith('Normal') || key.endsWith('Abnormal') || key.endsWith('NotApplicable')) {
        continue;
      }

      // 為每個項目設置所有三個選項的值
      if (items[key] == '正常') {
        items[key + 'Normal'] = 'V';
        items[key + 'Abnormal'] = '';
        items[key + 'NotApplicable'] = '';
      } else if (items[key] == '異常') {
        items[key + 'Normal'] = '';
        items[key + 'Abnormal'] = 'V';
        items[key + 'NotApplicable'] = '';
      } else if (items[key] == '不適用') {
        items[key + 'Normal'] = '';
        items[key + 'Abnormal'] = '';
        items[key + 'NotApplicable'] = 'N/A';
      } else {
        // 如果沒有選擇，全部設為空字符串
        items[key + 'Normal'] = '';
        items[key + 'Abnormal'] = '';
        items[key + 'NotApplicable'] = '';
      }

      // 確保修正措施欄位存在
      if (!(key in fixes)) {
        fixes[key] = '';
      }
    }

    // 確保所有修正措施欄位都有值
    for (const key in fixes) {
      fixes[key] = fixes[key] || '';
    }

    return {
      // 基本資訊
      projectNo: formData.projectNo || currentSite.projectNo || '',
      factoryArea: formData.factoryArea || '',
      checkDate: formData.applyDate || '',
      checkDateYear: applyDate.format('YYYY'),
      checkDateMonth: applyDate.format('MM'),
      checkDateDay: applyDate.format('DD'),
      location: formData.location || '',

      // 檢點項目結果
      items: items,
      fixes: fixes,

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
      const result = await this.generateSpecialWorkChecklistDocxBlob(formId);
      saveAs(result.blob, result.fileName);
    } catch (error) {
      console.error('無法生成特殊作業工安自主檢點表 DOCX:', error);
      throw error;
    }
  }

  /**
   * 生成特殊作業工安自主檢點表 DOCX Blob（用於批量下載）
   */
  async generateSpecialWorkChecklistDocxBlob(formId: string): Promise<{ blob: Blob, fileName: string }> {
    return this.generateDocumentBlobWithDynamicTemplate(
      formId,
      (formData) => {
        if (!formData.workType) {
          throw new Error('表單缺少作業類型資訊');
        }
        return this.getSpecialWorkTemplateePath(formData.workType);
      },
      (formData, currentSite) => this.prepareSpecialWorkChecklistData(formData, currentSite),
      (formData, currentSite) => `特殊作業工安自主檢點表_${formData.workType}_${currentSite.projectName}_${formData.applyDate}.docx`,
      true // 需要 expression parser
    );
  }

  /**
   * 支援動態模板路徑的文檔生成方法
   */
  private async generateDocumentBlobWithDynamicTemplate(
    formId: string,
    getTemplatePathFn: (formData: any) => string,
    prepareDataFn: (formData: any, currentSite: any) => any,
    generateFileNameFn: (formData: any, currentSite: any) => string,
    needsExpressionParser: boolean = false
  ): Promise<{ blob: Blob, fileName: string }> {
    try {
      // 獲取表單資料
      const formData = await this.mongodbService.getById('siteForm', formId);
      const currentSite = this.currentSiteService.currentSite();

      if (!formData || !currentSite) {
        throw new Error('無法獲取表單或專案資料');
      }

      // 動態獲取模板路徑
      const templatePath = getTemplatePathFn(formData);

      // 載入模板檔案
      const response = await fetch(templatePath);
      if (!response.ok) {
        throw new Error(`無法載入模板檔案: ${response.status}`);
      }

      const arrayBuffer = await response.arrayBuffer();
      const zip = new PizZip(arrayBuffer);

      // 設定圖片模組
      const modules = [];
      try {
        const ImageModule = await import('docxtemplater-image-module-free');
        const imageOptions = {
          centered: true,
          getImage: (tagValue: string) => this.getImageData(tagValue),
          getSize: (img: ArrayBuffer, tagValue: string): [number, number] => [120, 60]
        };
        const ModuleConstructor = ImageModule.default || ImageModule;
        const imageModule = new ModuleConstructor(imageOptions);
        modules.push(imageModule);
      } catch (error) {
        console.error('ImageModule 載入失敗:', error);
      }

      // 創建 docxtemplater 實例
      const doc = new Docxtemplater().loadZip(zip);

      // 添加模組
      if (modules.length > 0) {
        modules.forEach(module => doc.attachModule(module));
      }

      // 設定選項
      if (needsExpressionParser) {
        const expressionParser = await import('angular-expressions');
        doc.setOptions({
          parser: (tag: string) => {
            const compiled = (expressionParser.default || expressionParser).compile(tag);
            return { get: (scope: any) => compiled(scope) };
          },
          nullGetter: (part: any) => ''
        });
      } else {
        doc.setOptions({
          paragraphLoop: true,
          linebreaks: true,
          nullGetter: (part: any) => '' // 當遇到未定義的屬性時返回空字串，避免顯示 "undefined"
        });
      }

      // 準備模板資料
      const templateData = prepareDataFn(formData, currentSite);

      // 填充模板
      doc.render(templateData);

      // 生成文檔
      const blob = doc.getZip().generate({
        type: 'blob',
        mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      });

      // 生成檔案名稱
      const fileName = generateFileNameFn(formData, currentSite);

      return { blob, fileName };

    } catch (error) {
      console.error('生成文檔失敗:', error);
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
  private prepareSpecialWorkChecklistData(formData: SpecialWorkChecklistData, currentSite: any): any {
    const applyDate = dayjs(formData.applyDate);

    // 確保 items, fixes 和 itemInputs 存在
    const items: Record<string, string> = formData.items || {};
    const fixes: Record<string, string> = formData.fixes || {};
    const itemInputs: Record<string, Record<string, string>> = formData.itemInputs || {};

    // 處理所有項目，確保三個選項都有值（避免 undefined）
    for (const key in items) {
      // 跳過已經處理過的後綴欄位
      if (key.endsWith('Normal') || key.endsWith('Abnormal') || key.endsWith('NotApplicable')) {
        continue;
      }

      // 為每個項目設置所有三個選項的值
      if (items[key] == '正常') {
        items[key + 'Normal'] = 'V';
        items[key + 'Abnormal'] = '';
        items[key + 'NotApplicable'] = '';
      } else if (items[key] == '異常') {
        items[key + 'Normal'] = '';
        items[key + 'Abnormal'] = 'V';
        items[key + 'NotApplicable'] = '';
      } else if (items[key] == '不適用') {
        items[key + 'Normal'] = '';
        items[key + 'Abnormal'] = '';
        items[key + 'NotApplicable'] = 'N/A';
      } else {
        // 如果沒有選擇，全部設為空字符串
        items[key + 'Normal'] = '';
        items[key + 'Abnormal'] = '';
        items[key + 'NotApplicable'] = '';
      }

      // 確保修正措施欄位存在
      if (!(key in fixes)) {
        fixes[key] = '';
      }
    }

    // 確保所有修正措施欄位都有值
    for (const key in fixes) {
      fixes[key] = fixes[key] || '';
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
      items: items,
      fixes: fixes,
      itemInputs: itemInputs,

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
   * 生成工安缺失紀錄表 DOCX
   */
  async generateSafetyIssueRecordDocx(formId: string): Promise<void> {
    try {
      const result = await this.generateSafetyIssueRecordDocxBlob(formId);
      // 下載檔案
      saveAs(result.blob, result.fileName);
    } catch (error) {
      console.error('無法生成工安缺失紀錄表 DOCX:', error);
      throw error;
    }
  }

  /**
   * 生成工安缺失紀錄表 DOCX Blob（用於批量下載）
   */
  async generateSafetyIssueRecordDocxBlob(formId: string): Promise<{ blob: Blob, fileName: string }> {
    return this.generateDocumentBlob(
      formId,
      '/template/ee-4411-06工安缺失紀錄表.docx',
      (formData, currentSite) => this.prepareSafetyIssueRecordData(formData, currentSite),
      (formData, currentSite) => `工安缺失紀錄表_${formData.recordNo || formData.establishDate}_${currentSite.projectNo || 'XXXX'}.docx`,
      true // 需要 expression parser
    );
  }

  /**
   * 生成危害告知單 DOCX
   */
  async generateHazardNoticeDocx(formId: string): Promise<void> {
    try {
      const result = await this.generateHazardNoticeDocxBlob(formId);
      saveAs(result.blob, result.fileName);
    } catch (error) {
      console.error('生成危害告知單DOCX失敗:', error);
      throw error;
    }
  }

  /**
   * 生成危害告知單 DOCX Blob（用於批量下載）
   */
  async generateHazardNoticeDocxBlob(formId: string): Promise<{ blob: Blob, fileName: string }> {
    return this.generateDocumentBlob(
      formId,
      '/template/帆宣-施工作業安全暨危害因素告知單.docx',
      (formData, currentSite) => this.prepareHazardNoticeData(formData, currentSite),
      (formData, currentSite) => `施工作業安全暨危害因素告知單_${currentSite.projectName || ''}_${formData.applyDate || ''}.docx`
    );
  }

  /**
   * 準備危害告知單的模板資料
   */
  private prepareHazardNoticeData(formData: HazardNoticeForm, currentSite: any): any {
    // 確保作業項目數組存在且有足夠的項目
    const workItems = formData.workItems || [];

    // 動態處理工人簽名，只處理實際存在的簽名
    const workerSignatures: any = {};
    if (formData.workerSignatures && formData.workerSignatures.length > 0) {
      formData.workerSignatures.forEach((signature, index) => {
        if (signature && signature.signature) {
          workerSignatures[`workerSignature${index + 1}`] = this.getValidSignatureImage(signature.signature);
          workerSignatures[`workerName${index + 1}`] = signature.name || '';
          workerSignatures[`workerCompany${index + 1}`] = signature.company || '';
          workerSignatures[`workerSignDate${index + 1}`] = signature.signedAt ?
            dayjs(signature.signedAt).format('YYYY-MM-DD HH:mm') : '';
        }
      });
    }

    return {
      // 基本資訊
      company: formData.company || '',
      area: formData.area || '',
      division: formData.division || '',
      projectNo: formData.projectNo || '',
      contractor: formData.contractor || '',
      workLocation: formData.workLocation || '',
      workName: formData.workName || '',
      applyDate: dayjs(formData.applyDate).format('YYYY-MM-DD') || '',
      siteSupervisor: formData.siteSupervisor || '',
      safetyOfficer: formData.safetyOfficer || '',

      // 作業項目勾選狀態（用於模板中的條件顯示）
      workItem1: workItems[0]?.selected ? '🗹' : '□', // 局限空間作業
      workItem2: workItems[1]?.selected ? '🗹' : '□', // 動火作業
      workItem3: workItems[2]?.selected ? '🗹' : '□', // 高架作業
      workItem4: workItems[3]?.selected ? '🗹' : '□', // 吊裝作業
      workItem5: workItems[4]?.selected ? '🗹' : '□', // 電氣作業
      workItem6: workItems[5]?.selected ? '🗹' : '□', // 管線拆離作業
      workItem7: workItems[6]?.selected ? '🗹' : '□', // 化學作業
      workItem8: workItems[7]?.selected ? '🗹' : '□', // 切割作業
      workItem9: workItems[8]?.selected ? '🗹' : '□', // 拆除作業
      workItem10: workItems[9]?.selected ? '🗹' : '□', // 裝修作業
      workItem11: workItems[10]?.selected ? '🗹' : '□', // 油漆作業
      workItem12: workItems[11]?.selected ? '🗹' : '□', // 垃圾清運作業
      workItem13: workItems[12]?.selected ? '🗹' : '□', // 地面清潔作業
      workItem14: workItems[13]?.selected ? '🗹' : '□', // 搬運作業
      workItem15: workItems[14]?.selected ? '🗹' : '□', // 環境消毒作業
      workItem16: workItems[15]?.selected ? '🗹' : '□', // 外牆修繕作業

      // 工人簽名數據（動態生成，只處理實際存在的簽名）
      ...workerSignatures,

      // 工地資訊
      siteName: currentSite?.projectName || '',
      siteLocation: currentSite ? `${currentSite.county || ''} ${currentSite.town || ''}`.trim() : '',
    };
  }

  /**
   * 準備工安缺失紀錄表的模板資料
   */
  private prepareSafetyIssueRecordData(formData: IssueRecord, currentSite: any): any {
    // 處置措施轉換
    const remedyMeasuresText = formData.remedyMeasures?.map((measure: string) => {
      switch (measure) {
        case 'immediateCorrection':
          return '立即完成改正';
        case 'improvementWithDeadline':
          return '限期改善完成';
        case 'correctivePreventionReport':
          return '須提出矯正預防措施報告';
        default:
          return measure;
      }
    }).join(', ') || '';

    return {
      // 基本資訊
      recordNo: formData.recordNo || '',
      establishPerson: formData.establishPerson || '',
      establishUnit: formData.establishUnit || '',
      projectNo: currentSite.projectNo || '',
      applyDate: dayjs(formData.applyDate).format('YYYY 年 MM 月 DD 日') || '',
      responsibleUnitMIC: formData.responsibleUnit === 'MIC' ? '■' : '□',
      responsibleUnitSupplier: formData.responsibleUnit === 'supplier' ? '■' : '□',
      issueDate: dayjs(formData.issueDate).format('YYYY 年 MM 月 DD 日') || '',
      factoryArea: formData.factoryArea || '',
      responsibleUnitName: formData.responsibleUnit === 'MIC' ? (formData.responsibleUnitName || '') : (formData.supplierName || ''),
      supplierName: formData.supplierName || '',

      // 缺失說明
      issueDescription: formData.issueDescription || '',

      // 缺失處置
      remedyMeasuresText: remedyMeasuresText,
      remedyMeasuresImmediate: formData.remedyMeasures.includes('immediate') ? '■' : '□',
      remedyMeasuresImprovementWithDeadline: formData.remedyMeasures.includes('improvementWithDeadline') ? '■' : '□',
      remedyMeasuresCorrectivePreventionReport: formData.remedyMeasures.includes('correctivePreventionReport') ? '■' : '□',
      improvementDeadline: dayjs(formData.improvementDeadline).format('YYYY 年 MM 月 DD 日') || '  年  月  日',

      // 缺失評核
      deductionCode: formData.deductionCode || '',
      recordPoints: formData.recordPoints || '',

      // 複查資訊
      reviewDate: dayjs(formData.reviewDate).format('YYYY 年 MM 月 DD 日') || '  年  月  日',
      reviewer: formData.reviewer || '',
      reviewResult: formData.reviewResult === 'completed' ? '已完成改正' :
        formData.reviewResult === 'incomplete' ? '未完成改正(要求改善，再次開立工安缺失紀錄表)' : '',
      reviewResultCompleted: formData.reviewResult === 'completed' ? '■' : '□',
      reviewResultIncomplete: formData.reviewResult === 'incomplete' ? '■' : '□',

      // 簽名圖片
      supervisorSignatureImage: formData.supervisorSignature || '',
      workerSignatureImage: formData.workerSignature || '',

      // 工地資訊
      siteName: currentSite.projectName || '',
      siteLocation: `${currentSite.county || ''} ${currentSite.town || ''}`.trim(),

      // 當前日期
      currentDate: dayjs().format('YYYY年MM月DD日')
    };
  }

  /**
   * 生成工安巡迴檢查表 DOCX
   */
  async generateSafetyPatrolChecklistDocx(formId: string): Promise<void> {
    try {
      const result = await this.generateSafetyPatrolChecklistDocxBlob(formId);
      saveAs(result.blob, result.fileName);
    } catch (error) {
      console.error('無法生成工安巡迴檢查表 DOCX:', error);
      throw error;
    }
  }

  /**
   * 生成工安巡迴檢查表 DOCX Blob（用於批量下載）
   */
  async generateSafetyPatrolChecklistDocxBlob(formId: string): Promise<{ blob: Blob, fileName: string }> {
    return this.generateDocumentBlobWithDynamicTemplate(
      formId,
      (formData) => {
        if (!formData.checkType) {
          throw new Error('表單缺少檢查類型資訊');
        }
        return this.getSafetyPatrolChecklistTemplatePath(formData.checkType);
      },
      (formData, currentSite) => this.prepareSafetyPatrolChecklistData(formData, currentSite),
      (formData, currentSite) => `工安巡迴檢查表_${formData.checkType}_${currentSite.projectName || ''}_${formData.applyDate || ''}.docx`,
      true // 啟用 angular-expressions parser 以處理被 XML 分割的佔位符
    );
  }

  /**
   * 根據檢查類型獲取對應的工安巡迴檢查表模板路徑
   */
  private getSafetyPatrolChecklistTemplatePath(checkType: string): string {
    const templateMap: { [key: string]: string } = {
      '工地管理': '/template/ee-4411-05工安巡迴檢查表(工地管理).docx',
      '一般作業': '/template/ee-4411-05工安巡迴檢查表(一般作業).docx',
      '特殊作業': '/template/ee-4411-05工安巡迴檢查表(特殊作業).docx'
    };

    const templatePath = templateMap[checkType];
    if (!templatePath) {
      throw new Error(`不支援的檢查類型: ${checkType}`);
    }

    return templatePath;
  }

  /**
   * 準備工安巡迴檢查表模板資料
   */
  private prepareSafetyPatrolChecklistData(formData: SafetyPatrolChecklistData, currentSite: any): any {
    const applyDate = dayjs(formData.applyDate);

    // 調試：輸出原始備註數據
    console.log('原始 itemRemarks:', formData.itemRemarks);

    // 確保 items 和 itemRemarks 存在
    const items: Record<string, string> = { ...(formData.items || {}) };
    const itemRemarks: Record<string, string> = { ...(formData.itemRemarks || {}) };

    // 預先初始化所有預期的項目代碼（模板期望這些代碼存在）
    const expectedItemCodes = [
      // AA: 一般事項 (22項)
      'AA01', 'AA02', 'AA03', 'AA04', 'AA05', 'AA06', 'AA07', 'AA08', 'AA09', 'AA10',
      'AA11', 'AA12', 'AA13', 'AA14', 'AA15', 'AA16', 'AA17', 'AA18', 'AA19', 'AA20',
      'AA21', 'AA22',
      // AB: 施工機械 (6項)
      'AB01', 'AB02', 'AB03', 'AB04', 'AB05', 'AB06',
      // AC: 電氣設備 (3項)
      'AC01', 'AC02', 'AC03',
      // AD: 墜落防止 (8項)
      'AD01', 'AD02', 'AD03', 'AD04', 'AD05', 'AD06', 'AD07', 'AD08',
      // AE: 物料搬運 (7項)
      'AE01', 'AE02', 'AE03', 'AE04', 'AE05', 'AE06', 'AE07',
      // AF: 其他 (4項)
      'AF01', 'AF02', 'AF03', 'AF04'
    ];

    // 確保所有預期的項目代碼都存在
    for (const code of expectedItemCodes) {
      if (!(code in items)) {
        items[code] = ''; // 預設為空（未選擇）
      }
      if (!(code in itemRemarks)) {
        itemRemarks[code] = ''; // 預設備註為空
      }
    }

    // 處理所有項目，確保三個選項都有值（避免 undefined）
    for (const key of expectedItemCodes) {
      // 為每個項目設置所有三個選項的值
      if (items[key] === '正常') {
        items[key + 'Normal'] = 'V';
        items[key + 'Abnormal'] = '';
        items[key + 'NotApplicable'] = '';
      } else if (items[key] === '異常') {
        items[key + 'Normal'] = '';
        items[key + 'Abnormal'] = 'V';
        items[key + 'NotApplicable'] = '';
      } else if (items[key] === '不適用') {
        items[key + 'Normal'] = '';
        items[key + 'Abnormal'] = '';
        items[key + 'NotApplicable'] = 'N/A';
      } else {
        // 如果沒有選擇，全部設為空字符串
        items[key + 'Normal'] = '';
        items[key + 'Abnormal'] = '';
        items[key + 'NotApplicable'] = '';
      }
    }

    // 確保所有備註欄位都有值
    for (const key in itemRemarks) {
      itemRemarks[key] = itemRemarks[key] || '';
    }

    return {
      // 基本資訊
      checkType: formData.checkType || '',
      applyDate: formData.applyDate || '',
      applyDateYear: applyDate.year().toString(),
      applyDateMonth: (applyDate.month() + 1).toString().padStart(2, '0'),
      applyDateDay: applyDate.date().toString().padStart(2, '0'),
      projectNo: formData.projectNo || '',
      factoryArea: `${currentSite?.county || ''}${currentSite?.town || ''}`,
      inspectionUnit: formData.inspectionUnit || '',
      inspector: formData.inspector || '',
      inspectee: formData.inspectee || '',

      // 檢查項目結果
      items: items,
      itemRemarks: itemRemarks,

      // 簽名圖片
      faultyUnitSignature: this.getValidSignatureImage(formData.faultyUnitSignature),
      micSupervisorSignature: this.getValidSignatureImage(formData.micSupervisorSignature),

      // 備註
      remarks: formData.remarks || '',

      // 工地資訊
      siteName: currentSite?.projectName || '',
      siteLocation: `${currentSite?.county || ''} ${currentSite?.town || ''}`.trim(),
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
      case 'training':
        return this.generateTrainingDocx(formId);
      case 'hazardNotice':
        return this.generateHazardNoticeDocx(formId);
      case 'specialWorkChecklist':
        return this.generateSpecialWorkChecklistDocx(formId);
      case 'safetyIssueRecord':
        return this.generateSafetyIssueRecordDocx(formId);
      case 'safetyPatrolChecklist':
        return this.generateSafetyPatrolChecklistDocx(formId);
      default:
        throw new Error(`不支援的表單類型: ${formType}`);
    }
  }

  /**
   * 根據表單類型生成對應的DOCX Blob（用於批量下載）
   */
  async generateFormDocxBlob(formId: string, formType: string): Promise<{ blob: Blob, fileName: string }> {
    switch (formType) {
      case 'sitePermit':
        return this.generateWorkPermitDocxBlob(formId);
      case 'toolboxMeeting':
        return this.generateToolboxMeetingDocxBlob(formId);
      case 'environmentChecklist':
        return this.generateEnvironmentChecklistDocxBlob(formId);
      case 'training':
        return this.generateTrainingDocxBlob(formId);
      case 'hazardNotice':
        return this.generateHazardNoticeDocxBlob(formId);
      case 'specialWorkChecklist':
        return this.generateSpecialWorkChecklistDocxBlob(formId);
      case 'safetyIssueRecord':
        return this.generateSafetyIssueRecordDocxBlob(formId);
      case 'safetyPatrolChecklist':
        return this.generateSafetyPatrolChecklistDocxBlob(formId);
      default:
        throw new Error(`表單類型 ${formType} 尚未支援批量下載，請使用單個下載功能`);
    }
  }
} 