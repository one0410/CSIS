import { Component, computed, OnInit, AfterViewInit } from '@angular/core';

import { FormsModule } from '@angular/forms';
import { SiteFormHeaderComponent } from '../site-form-header/site-form-header.component';
import { QRCodeComponent } from 'angularx-qrcode';
import { ActivatedRoute, Router } from '@angular/router';
import { MongodbService } from '../../../../services/mongodb.service';
import { SignatureDialogService } from '../../../../shared/signature-dialog.service';
import { DocxTemplateService } from '../../../../services/docx-template.service';
import { Site } from '../../../site-list.component';
import { CurrentSiteService } from '../../../../services/current-site.service';
import { SiteForm } from '../../../../model/siteForm.model';
import dayjs from 'dayjs';
import { AuthService } from '../../../../services/auth.service';
import { Worker } from '../../../../model/worker.model';
import { SignatureData } from '../../../../model/signatureData.model';
import { BulletinService } from '../../../../services/bulletin.service';
import { Bulletin } from '../../../../model/bulletin.model';

// 導入 Bootstrap Modal 相關類型
declare const bootstrap: {
  Modal: new (element: HTMLElement, options?: any) => {
    show: () => void;
    hide: () => void;
    dispose: () => void;
  };
};

// 專案工人介面，擴展自 Worker 添加簽名狀態
interface ProjectWorker extends Worker {
  hasSigned?: boolean;
}

export interface ToolboxMeetingForm extends SiteForm {
  formType: 'toolboxMeeting';
  projectNo: string;
  projectName: string;
  meetingLocation: string;
  meetingTime: string; // 會議時間
  hostCompany: string; // 主持人單位
  hostPerson: string; // 主持人
  contractors: Contractor[]; // 與會人員
  workItems: WorkItem[];
  hazards: Hazards; // 危害
  safetyPrecautions: SafetyPrecautions; // 安全防護措施
  healthWarnings: HealthWarnings; // 健康危害告知
  fieldCheckItems: FieldCheckItem[]; // 現場檢查項目
  communicationItems?: string; // 其他溝通/協議/宣導事項
  noRemarks: boolean; // 無其他及緊急情形
  hasRemarks: boolean; // 異常及緊急情形說明
  beforeWorkSignature: string; // 施工前巡檢簽名
  duringWorkSignature: string; // 施工中巡檢簽名
  afterWorkSignature: string; // 收工前巡檢簽名
  siteManagerSignature: string; // 監工單位簽名
  beforeWorkSignatureTime?: Date; // 施工前巡檢簽名時間
  duringWorkSignatureTime?: Date; // 施工中巡檢簽名時間
  afterWorkSignatureTime?: Date; // 收工前巡檢簽名時間
  siteManagerSignatureTime?: Date; // 監工單位簽名時間
  status: string;
  remarks?: string;
  createdAt: Date;
}

// 簽名類型
export enum SignatureType {
  SiteManager = 'siteManager', // 監工單位
  BeforeWork = 'beforeWork', // 施工前巡檢
  DuringWork = 'duringWork', // 施工中巡檢
  AfterWork = 'afterWork', // 收工前巡檢
}

interface Contractor {
  type: string; // '主承攬商' | '再承攬商' | '與會人員'
  name: string;
  company: string;
  title: string;
}

interface WorkItem {
  title: string;
  description: string;
}

interface Hazards {
  // 物理性危害
  physical: {
    fallDrop: TriStateValue; // 跌墜落
    physicalInjury: TriStateValue; // 擦、刺、扭、壓、夾、碰撞、割傷
    fallObject: TriStateValue; // 物體飛落
    foreignObjectInEye: TriStateValue; // 異物入眼
    highTempContact: TriStateValue; // 與高溫接觸
    lowTempContact: TriStateValue; // 與低溫接觸
    noise: TriStateValue; // 噪音
    electric: TriStateValue; // 感電
    collapse: TriStateValue; // 塌陷
    radiation: TriStateValue; // 游離輻射
  };
  // 化學性危害
  chemical: {
    burn: TriStateValue;
    inhalation: TriStateValue;
  };
  // 火災危害
  fire: {
    fire: TriStateValue; // 火災
    explosion: TriStateValue; // 爆炸
  };
  // 其他危害
  other: {
    none: TriStateValue; // 無
    oxygenDeficiency: TriStateValue; // 缺氧
    biological: TriStateValue; // 生物性危害
    outdoorHighTemp: TriStateValue; // 戶外高溫
    other: TriStateValue; // 其他
    otherContent: string; // 其他內容
  };
  // 作業區域包含以下化學品及其附屬設備管線
  chemicalArea: {
    hasChemicals: boolean;
    chemicalNames: string;
  };
  // 作業區域或包含以下氣體及其附屬設備管線
  gasArea: {
    hasGas: boolean;
    gasNames: string;
  };
}

// 三狀態 checkbox 類型定義
export type TriStateValue = null | true | false; // null=未選取, true=打勾, false=打叉

interface SafetyPrecautions {
  // 依作業性質穿戴之安全防護具
  personalProtection: {
    // 主類別 三狀態 checkbox
    headProtection: TriStateValue; // 01.頭部防護
    eyeProtection: TriStateValue; // 02.眼部防護
    earProtection: TriStateValue; // 03.耳部防護
    breathProtection: TriStateValue; // 04.呼吸防護
    handProtection: TriStateValue; // 05.手部防護
    footProtection: TriStateValue; // 06.足部防護
    bodyProtection: TriStateValue; // 07.身體防護
    fallPrevention: TriStateValue; // 08.墜落預防
    electricPrevention: TriStateValue; // 09.感電預防
    firePrevention: TriStateValue; // 10.火災預防
    oxygenPrevention: TriStateValue; // 11.缺氧預防
    otherPrevention: TriStateValue; // 12.其他預防
    
    // 詳細項目 - 三狀態
    // 01. 頭部防護詳細項目
    workSiteHead: TriStateValue; // 工地用
    electricianHead: TriStateValue; // 電工用
    helmetHead: TriStateValue; // 膠盔
    
    // 02. 眼部防護詳細項目
    mechanicalEyes: TriStateValue; // 防禦機械能傷害的安全眼鏡
    radiationEyes: TriStateValue; // 防禦輻射能傷害的安全眼鏡
    
    // 03. 耳部防護詳細項目
    earPlugs: TriStateValue; // 耳塞
    earMuffs: TriStateValue; // 耳罩
    
    // 04. 呼吸防護詳細項目
    dustMask: TriStateValue; // 防塵
    toxicMask: TriStateValue; // 濾毒
    scba: TriStateValue; // SCBA
    papr: TriStateValue; // PAPR
    airlineMask: TriStateValue; // 輸氣管面罩
    
    // 05. 手部防護詳細項目
    cutResistantGloves: TriStateValue; // 耐切割
    wearResistantGloves: TriStateValue; // 耐磨
    heatResistantGloves: TriStateValue; // 耐熱
    electricianGloves: TriStateValue; // 電工用
    chemicalGloves: TriStateValue; // 防化學
    
    // 06. 足部防護詳細項目
    safetyShoes: TriStateValue; // 一般安全鞋
    chemicalShoes: TriStateValue; // 防化學安全鞋
    
    // 07. 身體防護詳細項目
    backpackBelt: TriStateValue; // 背負式安全帶
    weldingMask: TriStateValue; // 電熲用防護面具
    chemicalProtection: TriStateValue; // 化學防護衣
    reflectiveVest: TriStateValue; // 反光背心
    
    // 08. 墜落預防詳細項目
    ladder: TriStateValue; // 合梯
    mobileLadder: TriStateValue; // 移動梯
    scaffold: TriStateValue; // 施工架
    highWorkVehicle: TriStateValue; // 高空工作車
    safetyLine: TriStateValue; // 安全母索
    protectionCage: TriStateValue; // 護籠
    guardrail: TriStateValue; // 護欄
    protectionCover: TriStateValue; // 護蓋
    safetyNet: TriStateValue; // 安全網
    warningBarrier: TriStateValue; // 警示圍籬
    fallPreventer: TriStateValue; // 墜落防止器
    
    // 09. 感電預防詳細項目
    leakageBreaker: TriStateValue; // 漏電斷路器
    autoElectricPreventer: TriStateValue; // 交流電熲機自動電擊防止裝置
    voltageDetector: TriStateValue; // 檢電器
    
    // 10. 火災預防詳細項目
    fireExtinguisher: TriStateValue; // 滅火器
    fireBlanket: TriStateValue; // 防火毯
    oxyacetyleneFireback: TriStateValue; // 氧乙烷防回火裝置
    
    // 11. 缺氧預防詳細項目
    ventilation: TriStateValue; // 通風設備
    lifeDetector: TriStateValue; // 生命偵測裝置
    gasDetector: TriStateValue; // 氣體偵測器
    liftingEquipment: TriStateValue; // 吓升設備
    rescueEquipment: TriStateValue; // 搶救設備
    
    // 舊有的詳細項目保留兼容性
    head: boolean; 
    eyes: boolean; 
    breath: boolean; 
    hand: boolean; 
    foot: boolean; 
    body: boolean; 
    hearing: boolean; 
    fall: boolean; 
    electric: boolean; 
    fire: boolean; 
    gas: boolean; 
    other: boolean; 
    otherContent: string;
  };
}

interface HealthWarnings {
  // 健康危害告知
  heartDisease: boolean; // 心血管疾病、聽力異常
  vibration: boolean; // 周邊神經系統疾病、周邊循環系統疾病
  radiation: boolean; // 血液疾病、內分泌系統疾病、神經系統異常、眼睛疾病
  internal: boolean; // 內分泌系統疾病、神經系統異常
  highAltitude: boolean; // 癲癇、精神或神經系統疾病、高血壓、心血管疾病
  diving: boolean; // 心血管疾病、慢性閉塞性肺疾病、慢性氣喘、無意識
  correctiveWork: boolean; // 周邊神經系統疾病、接觸性皮膚疾病等
  heavyWork: boolean; // 呼吸系統疾病、高血壓、心血管疾病、貧血、肝病、腎臟疾病、精神或神經系統疾病、無意識狀態糖尿病、接觸性皮膚疾病、骨骼肌肉

  // 出席人員簽名
  attendeeMainContractorSignatures: SignatureData[]; // 主承攬商
  attendeeSubcontractor1Signatures: SignatureData[]; // 再承攬商1
  attendeeSubcontractor2Signatures: SignatureData[]; // 再承攬商2
  attendeeSubcontractor3Signatures: SignatureData[]; // 再承攬商3
}

interface FieldCheckItem {
  id: number;
  content: string;
  checkBeforeStart: boolean;
  checkDuring: boolean;
  checkBeforeEnd: boolean;
  checkAfter: boolean;
}

@Component({
  selector: 'app-toolbox-meeting-form',
  templateUrl: './toolbox-meeting-form.component.html',
  styleUrls: ['./toolbox-meeting-form.component.scss'],
  standalone: true,
  imports: [FormsModule, SiteFormHeaderComponent, QRCodeComponent],
})
export class ToolboxMeetingFormComponent implements OnInit, AfterViewInit {
  siteId: string = '';
  site = computed(() => this.currentSiteService.currentSite());
  today = new Date();
  isGeneratingPdf: boolean = false; // 文檔生成狀態
  isLoggedIn: boolean = false;
  isWorkerSigningMode: boolean = false;
  formQrCodeUrl: string = '';
  qrCodeModal: any;

  // 模板驅動表單的數據模型
  meetingData: ToolboxMeetingForm = {
    siteId: '',
    formType: 'toolboxMeeting',
    applyDate: dayjs().format('YYYY-MM-DD'),
    meetingTime: '08:30',
    projectNo: '',
    projectName: '',
    meetingLocation: '',
    hostCompany: '',
    hostPerson: '',
    contractors: [
      { type: '主承攬商', name: '', company: '', title: '' },
      { type: '主承攬商', name: '', company: '', title: '' },
      { type: '再承攬商', name: '', company: '', title: '' },
      { type: '與會人員', name: '', company: '', title: '' },
    ],
    workItems: [
      { title: '本日工作項目', description: '' },
      { title: '本日工作地點', description: '' },
    ],
    hazards: {
      physical: {
        fallDrop: null, // 跌墜落 - 三狀態
        physicalInjury: null, // 擦、刺、扭、壓、夾、碰撞、割傷 - 三狀態
        fallObject: null, // 物體飛落 - 三狀態
        foreignObjectInEye: null, // 異物入眼 - 三狀態
        highTempContact: null, // 與高溫接觸 - 三狀態
        lowTempContact: null, // 與低溫接觸 - 三狀態
        noise: null, // 噪音 - 三狀態
        electric: null, // 感電 - 三狀態
        collapse: null, // 塌陷 - 三狀態
        radiation: null, // 游離輻射 - 三狀態
      },
      chemical: {
        burn: null, // 化學性燒灼傷 - 三狀態
        inhalation: null, // 化學物吸入 - 三狀態
      },
      fire: {
        fire: null, // 火災 - 三狀態
        explosion: null, // 爆炸 - 三狀態
      },
      other: {
        none: null, // 無 - 三狀態
        oxygenDeficiency: null, // 缺氧 - 三狀態
        biological: null, // 生物性危害 - 三狀態
        outdoorHighTemp: null, // 戶外高溫 - 三狀態
        other: null, // 其他 - 三狀態
        otherContent: '', // 其他內容
      },
      chemicalArea: {
        hasChemicals: false,
        chemicalNames: '',
      },
      gasArea: {
        hasGas: false,
        gasNames: '',
      },
    },
    safetyPrecautions: {
      personalProtection: {
        // 主類別 三狀態 checkbox
        headProtection: null, // 01.頭部防護
        eyeProtection: null, // 02.眼部防護
        earProtection: null, // 03.耳部防護
        breathProtection: null, // 04.呼吸防護
        handProtection: null, // 05.手部防護
        footProtection: null, // 06.足部防護
        bodyProtection: null, // 07.身體防護
        fallPrevention: null, // 08.墜落預防
        electricPrevention: null, // 09.感電預防
        firePrevention: null, // 10.火災預防
        oxygenPrevention: null, // 11.缺氧預防
        otherPrevention: null, // 12.其他預防
        
        // 詳細項目 - 三狀態
        // 01. 頭部防護詳細項目
        workSiteHead: null,
        electricianHead: null,
        helmetHead: null,
        
        // 02. 眼部防護詳細項目
        mechanicalEyes: null,
        radiationEyes: null,
        
        // 03. 耳部防護詳細項目
        earPlugs: null,
        earMuffs: null,
        
        // 04. 呼吸防護詳細項目
        dustMask: null,
        toxicMask: null,
        scba: null,
        papr: null,
        airlineMask: null,
        
        // 05. 手部防護詳細項目
        cutResistantGloves: null,
        wearResistantGloves: null,
        heatResistantGloves: null,
        electricianGloves: null,
        chemicalGloves: null,
        
        // 06. 足部防護詳細項目
        safetyShoes: null,
        chemicalShoes: null,
        
        // 07. 身體防護詳細項目
        backpackBelt: null,
        weldingMask: null,
        chemicalProtection: null,
        reflectiveVest: null,
        
        // 08. 墜落預防詳細項目
        ladder: null,
        mobileLadder: null,
        scaffold: null,
        highWorkVehicle: null,
        safetyLine: null,
        protectionCage: null,
        guardrail: null,
        protectionCover: null,
        safetyNet: null,
        warningBarrier: null,
        fallPreventer: null,
        
        // 09. 感電預防詳細項目
        leakageBreaker: null,
        autoElectricPreventer: null,
        voltageDetector: null,
        
        // 10. 火災預防詳細項目
        fireExtinguisher: null,
        fireBlanket: null,
        oxyacetyleneFireback: null,
        
        // 11. 缺氧預防詳細項目
        ventilation: null,
        lifeDetector: null,
        gasDetector: null,
        liftingEquipment: null,
        rescueEquipment: null,
        
        // 舊有的詳細項目保留兼容性
        head: false,
        eyes: false,
        breath: false,
        hand: false,
        foot: false,
        body: false,
        hearing: false,
        fall: false,
        electric: false,
        fire: false,
        gas: false,
        other: false,
        otherContent: '',
      },
    },
    healthWarnings: {
      heartDisease: false,
      vibration: false,
      radiation: false,
      internal: false,
      highAltitude: false,
      diving: false,
      correctiveWork: false,
      heavyWork: false,
      attendeeMainContractorSignatures: Array(10)
        .fill(0)
        .map((_, i) => ({
          name: '',
          company: '',
          signature: '',
          signedAt: undefined,
          idno: '',
          tel: ''
        })),
      attendeeSubcontractor1Signatures: Array(10)
        .fill(0)
        .map((_, i) => ({
          name: '',
          company: '',
          signature: '',
          signedAt: undefined,
          idno: '',
          tel: ''
        })),
      attendeeSubcontractor2Signatures: Array(10)
        .fill(0)
        .map((_, i) => ({
          name: '',
          company: '',
          signature: '',
          signedAt: undefined,
          idno: '',
          tel: ''
        })),
      attendeeSubcontractor3Signatures: Array(10)
        .fill(0)
        .map((_, i) => ({
          name: '',
          company: '',
          signature: '',
          signedAt: undefined,
          idno: '',
          tel: ''
        })),
    },
    fieldCheckItems: [
      {
        id: 1,
        content: '作業內容符合申請種類。',
        checkBeforeStart: false,
        checkDuring: false,
        checkBeforeEnd: false,
        checkAfter: false,
      },
      {
        id: 2,
        content: '確實執行相關作業施工及安全防護措施。',
        checkBeforeStart: false,
        checkDuring: false,
        checkBeforeEnd: false,
        checkAfter: false,
      },
      {
        id: 3,
        content: '作業人員確實配戴/使用安全防護具、精神狀況/身體狀況正常。',
        checkBeforeStart: false,
        checkDuring: false,
        checkBeforeEnd: false,
        checkAfter: false,
      },
      {
        id: 4,
        content: '作業主管確實管理現場監督。',
        checkBeforeStart: false,
        checkDuring: false,
        checkBeforeEnd: false,
        checkAfter: false,
      },
      {
        id: 5,
        content: '收工前/施工地點恢復安全、時水電氣設施及防護設備/排洩便房。',
        checkBeforeStart: false,
        checkDuring: false,
        checkBeforeEnd: false,
        checkAfter: false,
      },
    ],
    noRemarks: false, // 無其他及緊急情形
    hasRemarks: false, // 異常及緊急情形說明
    beforeWorkSignature: '', // 施工前巡檢簽名
    duringWorkSignature: '', // 施工中巡檢簽名
    afterWorkSignature: '', // 收工前巡檢簽名
    siteManagerSignature: '', // 監工單位簽名
    beforeWorkSignatureTime: undefined, // 施工前巡檢簽名時間
    duringWorkSignatureTime: undefined, // 施工中巡檢簽名時間
    afterWorkSignatureTime: undefined, // 收工前巡檢簽名時間
    siteManagerSignatureTime: undefined, // 監工單位簽名時間
    communicationItems: '', // 其他溝通/協議/宣導事項
    status: 'draft',
    createdAt: new Date(),
    createdBy: '',
  };

  noRemarks: boolean = false; // 無其他及緊急情形
  hasRemarks: boolean = false; // 異常及緊急情形說明

  // 簽名存儲
  siteManagerSignature: string | null = null; // 監工單位簽名
  beforeWorkSignature: string | null = null; // 施工前巡檢簽名
  duringWorkSignature: string | null = null; // 施工中巡檢簽名
  afterWorkSignature: string | null = null; // 收工前巡檢簽名

  // 專案工人和驗證相關屬性
  projectWorkers: ProjectWorker[] = [];
  verificationIdOrPhone: string = '';
  verificationError: string = '';
  currentWorker: ProjectWorker | null = null;
  workerVerificationModal: any;

  // 當前選擇的承攬商類型 (0:主承攬商, 1:再承攬商1, 2:再承攬商2, 3:再承攬商3)
  currentSignatureColumn: number = -1;

  // 公開 SignatureType 枚舉給模板
  SignatureType = SignatureType;

  // 三狀態 checkbox 處理方法（支援主類別、詳細項目和危害識別）
  toggleTriState(field: string): void {
    const currentValue = this.getFieldValue(field);
    let newValue: TriStateValue;
    
    // 循環三個狀態: null -> true -> false -> null
    if (currentValue === null) {
      newValue = true;  // 未選取 -> 打勾
    } else if (currentValue === true) {
      newValue = false; // 打勾 -> 打叉
    } else {
      newValue = null;  // 打叉 -> 未選取
    }
    
    this.setFieldValue(field, newValue);
  }

  // 取得欄位值（支援主類別、詳細項目和危害識別）
  getFieldValue(field: string): TriStateValue {
    // 檢查是否為 hazards 相關欄位
    if (this.isHazardField(field)) {
      return this.getHazardFieldValue(field);
    }
    // 否則為 safetyPrecautions.personalProtection 欄位
    return (this.meetingData.safetyPrecautions.personalProtection as any)[field];
  }

  // 設定欄位值（支援主類別、詳細項目和危害識別）
  private setFieldValue(field: string, value: TriStateValue): void {
    // 檢查是否為 hazards 相關欄位
    if (this.isHazardField(field)) {
      this.setHazardFieldValue(field, value);
    } else {
      // 否則為 safetyPrecautions.personalProtection 欄位
      (this.meetingData.safetyPrecautions.personalProtection as any)[field] = value;
    }
  }

  // 檢查是否為危害識別欄位
  private isHazardField(field: string): boolean {
    const hazardFields = [
      // 物理性危害
      'fallDrop', 'physicalInjury', 'fallObject', 'foreignObjectInEye', 
      'highTempContact', 'lowTempContact', 'noise', 'electric', 'collapse', 'radiation',
      // 化學性危害
      'burn', 'inhalation',
      // 火災危害
      'fire', 'explosion',
      // 其他危害
      'none', 'oxygenDeficiency', 'biological', 'outdoorHighTemp', 'other'
    ];
    return hazardFields.includes(field);
  }

  // 取得危害欄位值
  private getHazardFieldValue(field: string): TriStateValue {
    // 物理性危害
    if (['fallDrop', 'physicalInjury', 'fallObject', 'foreignObjectInEye', 
         'highTempContact', 'lowTempContact', 'noise', 'electric', 'collapse', 'radiation'].includes(field)) {
      return (this.meetingData.hazards.physical as any)[field];
    }
    // 化學性危害
    if (['burn', 'inhalation'].includes(field)) {
      return (this.meetingData.hazards.chemical as any)[field];
    }
    // 火災危害
    if (['fire', 'explosion'].includes(field)) {
      return (this.meetingData.hazards.fire as any)[field];
    }
    // 其他危害
    if (['none', 'oxygenDeficiency', 'biological', 'outdoorHighTemp', 'other'].includes(field)) {
      return (this.meetingData.hazards.other as any)[field];
    }
    return null;
  }

  // 設定危害欄位值
  private setHazardFieldValue(field: string, value: TriStateValue): void {
    // 物理性危害
    if (['fallDrop', 'physicalInjury', 'fallObject', 'foreignObjectInEye', 
         'highTempContact', 'lowTempContact', 'noise', 'electric', 'collapse', 'radiation'].includes(field)) {
      (this.meetingData.hazards.physical as any)[field] = value;
    }
    // 化學性危害
    else if (['burn', 'inhalation'].includes(field)) {
      (this.meetingData.hazards.chemical as any)[field] = value;
    }
    // 火災危害
    else if (['fire', 'explosion'].includes(field)) {
      (this.meetingData.hazards.fire as any)[field] = value;
    }
    // 其他危害
    else if (['none', 'oxygenDeficiency', 'biological', 'outdoorHighTemp', 'other'].includes(field)) {
      (this.meetingData.hazards.other as any)[field] = value;
    }
  }

  // 取得三狀態 checkbox 的圖示 class
  getTriStateIcon(field: string): string {
    const value = this.getFieldValue(field);
    if (value === true) {
      return 'fa-check text-success'; // 打勾 - 綠色
    } else if (value === false) {
      return 'fa-times text-danger'; // 打叉 - 紅色
    } else {
      return 'fa-square text-muted'; // 未選取 - 隱藏圖示，由 CSS 顯示外框
    }
  }

  // 取得三狀態 checkbox 容器的 CSS class
  getTriStateContainerClass(field: string): string {
    const value = this.getFieldValue(field);
    
    if (value === null || value === undefined) {
      return 'tristate-checkbox me-2 tristate-unselected'; // 未選取狀態
    } else {
      return 'tristate-checkbox me-2'; // 已選取狀態（打勾或打叉）
    }
  }

  // 取得三狀態 checkbox 的 title 提示
  getTriStateTitle(field: string): string {
    const value = this.getFieldValue(field);
    if (value === true) {
      return '已確認 (點擊切換為不適用)';
    } else if (value === false) {
      return '不適用 (點擊切換為未選取)';
    } else {
      return '未選取 (點擊切換為確認)';
    }
  }

  constructor(
    private mongodbService: MongodbService,
    private route: ActivatedRoute,
    private router: Router,
    private signatureDialog: SignatureDialogService,
    private currentSiteService: CurrentSiteService,
    private authService: AuthService,
    private docxTemplateService: DocxTemplateService,
    private bulletinService: BulletinService
  ) {}

  async ngOnInit(): Promise<void> {
    // 檢查是否登入
    this.isLoggedIn = !!this.authService.user();
    // 從路由參數獲取工地ID和表單ID
    this.route.paramMap.subscribe(async (params) => {
      const id = params.get('id');
      const formId = params.get('formId');

      if (id) {
        this.siteId = id;
        this.meetingData.siteId = id;
        await this.currentSiteService.setCurrentSiteById(id);
        this.meetingData.projectNo = this.site()?.projectNo || '';
        this.meetingData.projectName = this.site()?.projectName || '';

        // 載入專案工人列表
        await this.loadProjectWorkers(id);

        // 如果有表單ID，載入現有表單
        if (formId) {
          await this.loadFormData(formId);
          if (!this.isLoggedIn) {
            this.isWorkerSigningMode = true;
          }
          this.generateToolboxQr();
        } else {
          // 新表單：載入公佈欄內容
          await this.loadBulletinContent(id);
          
          // 檢查 URL 查詢參數中是否有日期
          this.route.queryParams.subscribe((queryParams) => {
            if (queryParams['date']) {
              // 從 URL 查詢參數獲取日期並設置為 applyDate
              const dateFromUrl = queryParams['date'];
              if (dateFromUrl && dateFromUrl.match(/^\d{4}-\d{2}-\d{2}$/)) {
                // 如果日期格式正確 (YYYY-MM-DD)，則設置為 applyDate
                this.meetingData.applyDate = dateFromUrl;
              } else {
                try {
                  // 嘗試使用 dayjs 解析日期
                  const parsedDate = dayjs(dateFromUrl).format('YYYY-MM-DD');
                  if (parsedDate !== 'Invalid Date') {
                    this.meetingData.applyDate = parsedDate;
                  }
                } catch (error) {
                  console.error('無法解析日期參數:', dateFromUrl, error);
                }
              }
            }
          });
        }
      }
    });
  }

  ngAfterViewInit(): void {
    // 初始化 Bootstrap Modal
    const workerVerificationModalElement = document.getElementById(
      'workerVerificationModal'
    );
    if (workerVerificationModalElement) {
      this.workerVerificationModal = new bootstrap.Modal(
        workerVerificationModalElement
      );
    }
    const qrCodeModalEl = document.getElementById('qrCodeModal');
    if (qrCodeModalEl) {
      this.qrCodeModal = new bootstrap.Modal(qrCodeModalEl);
    }
  }

  // 生成表單 QR Code URL（提供給工人掃碼簽名）
  private generateToolboxQr(): void {
    const anyData: any = this.meetingData as any;
    const formId = anyData._id;
    if (formId) {
      const baseUrl = window.location.origin;
      this.formQrCodeUrl = `${baseUrl}/toolbox-meeting/${formId}`;
    }
  }

  showQrCodeModal(): void {
    if (this.qrCodeModal) {
      this.qrCodeModal.show();
    }
  }

  copyUrl(inputElement: HTMLInputElement): void {
    inputElement.select();
    inputElement.setSelectionRange(0, 99999);
    navigator.clipboard.writeText(inputElement.value).then(() => {
      alert('網址已複製到剪貼簿');
    }).catch(() => {
      document.execCommand('copy');
      alert('網址已複製到剪貼簿');
    });
  }

  // 參與廠商管理
  addContractor(): void {
    this.meetingData.contractors.push({
      type: '再承攬商',
      name: '',
      company: '',
      title: '',
    });
  }

  removeContractor(index: number): void {
    if (this.meetingData.contractors.length > 1) {
      this.meetingData.contractors.splice(index, 1);
    }
  }

  // 工作項目管理
  addWorkItem(): void {
    this.meetingData.workItems.push({ title: '', description: '' });
  }

  removeWorkItem(index: number): void {
    if (this.meetingData.workItems.length > 1) {
      this.meetingData.workItems.splice(index, 1);
    }
  }

  // 打開簽名對話框
  async openSignatureDialog(type: SignatureType): Promise<void> {
    try {
      const signature = await this.signatureDialog.open();
      if (signature) {
        // 更新相應的簽名
        const currentTime = new Date();
        switch (type) {
          case SignatureType.SiteManager:
            this.siteManagerSignature = signature;
            this.meetingData.siteManagerSignature = signature;
            this.meetingData.siteManagerSignatureTime = currentTime;
            break;
          case SignatureType.BeforeWork:
            this.beforeWorkSignature = signature;
            this.meetingData.beforeWorkSignature = signature;
            this.meetingData.beforeWorkSignatureTime = currentTime;
            break;
          case SignatureType.DuringWork:
            this.duringWorkSignature = signature;
            this.meetingData.duringWorkSignature = signature;
            this.meetingData.duringWorkSignatureTime = currentTime;
            break;
          case SignatureType.AfterWork:
            this.afterWorkSignature = signature;
            this.meetingData.afterWorkSignature = signature;
            this.meetingData.afterWorkSignatureTime = currentTime;
            break;
        }
      }
    } catch (error) {
      console.error('簽名對話框操作失敗', error);
    }
  }

  // 載入現有表單資料
  async loadFormData(formId: string): Promise<void> {
    try {
      const form = await this.mongodbService.getById('siteForm', formId);
      if (form) {
        this.meetingData = { ...form };

        // 資料格式遷移：如果載入的是舊格式，轉換為新格式
        if (this.meetingData.healthWarnings && (this.meetingData.healthWarnings as any).attendeeSignatures) {
          const oldSignatures = (this.meetingData.healthWarnings as any).attendeeSignatures;
          
          // 初始化新的四個陣列
          this.meetingData.healthWarnings.attendeeMainContractorSignatures = Array(10)
            .fill(0)
            .map((_, i) => ({
              name: '',
              company: '',
              signature: '',
              signedAt: undefined,
              idno: '',
              tel: ''
            }));
          this.meetingData.healthWarnings.attendeeSubcontractor1Signatures = Array(10)
            .fill(0)
            .map((_, i) => ({
              name: '',
              company: '',
              signature: '',
              signedAt: undefined,
              idno: '',
              tel: ''
            }));
          this.meetingData.healthWarnings.attendeeSubcontractor2Signatures = Array(10)
            .fill(0)
            .map((_, i) => ({
              name: '',
              company: '',
              signature: '',
              signedAt: undefined,
              idno: '',
              tel: ''
            }));
          this.meetingData.healthWarnings.attendeeSubcontractor3Signatures = Array(10)
            .fill(0)
            .map((_, i) => ({
              name: '',
              company: '',
              signature: '',
              signedAt: undefined,
              idno: '',
              tel: ''
            }));
          
          // 轉換舊格式的簽名資料
          if (Array.isArray(oldSignatures)) {
            oldSignatures.forEach((oldSig: any, index: number) => {
              if (index < 10) {
                // 處理各種舊格式的可能性
                if (oldSig.contractorSignatures && Array.isArray(oldSig.contractorSignatures)) {
                  // 舊的陣列格式
                  oldSig.contractorSignatures.forEach((sig: any, sigIndex: number) => {
                    if (sigIndex < 10 && sig.signature) {
                      this.meetingData.healthWarnings.attendeeMainContractorSignatures[sigIndex] = {
                        name: sig.workerName || '',
                        company: sig.workerInfo?.company || '',
                        signature: sig.signature,
                        signedAt: sig.signedAt || new Date(),
                        idno: sig.idno || '',
                        tel: sig.tel || ''
                      };
                    }
                  });
                } else if (oldSig.contractorSignature) {
                  // 舊的單一簽名格式
                  this.meetingData.healthWarnings.attendeeMainContractorSignatures[index] = {
                    name: oldSig.workerInfo?.name || '',
                    company: oldSig.workerInfo?.company || '',
                    signature: oldSig.contractorSignature,
                    signedAt: oldSig.signedAt || new Date(),
                    idno: oldSig.idno || '',
                    tel: oldSig.tel || ''
                  };
                }
                
                // 類似地處理其他承攬商的簽名...
                if (oldSig.subcontractor1Signatures && Array.isArray(oldSig.subcontractor1Signatures)) {
                  oldSig.subcontractor1Signatures.forEach((sig: any, sigIndex: number) => {
                    if (sigIndex < 10 && sig.signature) {
                      this.meetingData.healthWarnings.attendeeSubcontractor1Signatures[sigIndex] = {
                        name: sig.workerName || '',
                        company: sig.workerInfo?.company || '',
                        signature: sig.signature,
                        signedAt: sig.signedAt || new Date(),
                        idno: sig.idno || '',
                        tel: sig.tel || ''
                      };
                    }
                  });
                } else if (oldSig.signature1) {
                  this.meetingData.healthWarnings.attendeeSubcontractor1Signatures[index] = {
                    name: oldSig.workerInfo?.name || '',
                    company: oldSig.workerInfo?.company || '',
                    signature: oldSig.signature1,
                    signedAt: oldSig.signedAt || new Date(),
                    idno: oldSig.idno || '',
                    tel: oldSig.tel || ''
                  };
                }
                
                if (oldSig.subcontractor2Signatures && Array.isArray(oldSig.subcontractor2Signatures)) {
                  oldSig.subcontractor2Signatures.forEach((sig: any, sigIndex: number) => {
                    if (sigIndex < 10 && sig.signature) {
                      this.meetingData.healthWarnings.attendeeSubcontractor2Signatures[sigIndex] = {
                        name: sig.workerName || '',
                        company: sig.workerInfo?.company || '',
                        signature: sig.signature,
                        signedAt: sig.signedAt || new Date(),
                        idno: sig.idno || '',
                        tel: sig.tel || ''
                      };
                    }
                  });
                } else if (oldSig.signature2) {
                  this.meetingData.healthWarnings.attendeeSubcontractor2Signatures[index] = {
                    name: oldSig.workerInfo?.name || '',
                    company: oldSig.workerInfo?.company || '',
                    signature: oldSig.signature2,
                    signedAt: oldSig.signedAt || new Date(),
                    idno: oldSig.idno || '',
                    tel: oldSig.tel || ''
                  };
                }
                
                if (oldSig.subcontractor3Signatures && Array.isArray(oldSig.subcontractor3Signatures)) {
                  oldSig.subcontractor3Signatures.forEach((sig: any, sigIndex: number) => {
                    if (sigIndex < 10 && sig.signature) {
                      this.meetingData.healthWarnings.attendeeSubcontractor3Signatures[sigIndex] = {
                        name: sig.workerName || '',
                        company: sig.workerInfo?.company || '',
                        signature: sig.signature,
                        signedAt: sig.signedAt || new Date(),
                        idno: sig.idno || '',
                        tel: sig.tel || ''
                      };
                    }
                  });
                } else if (oldSig.signature3) {
                  this.meetingData.healthWarnings.attendeeSubcontractor3Signatures[index] = {
                    name: oldSig.workerInfo?.name || '',
                    company: oldSig.workerInfo?.company || '',
                    signature: oldSig.signature3,
                    signedAt: oldSig.signedAt || new Date(),
                    idno: oldSig.idno || '',
                    tel: oldSig.tel || ''
                  };
                }
              }
            });
          }
          
          // 刪除舊的 attendeeSignatures 屬性
          delete (this.meetingData.healthWarnings as any).attendeeSignatures;
        }

        // 確保新格式的陣列存在
        if (!this.meetingData.healthWarnings.attendeeMainContractorSignatures) {
          this.meetingData.healthWarnings.attendeeMainContractorSignatures = Array(10)
            .fill(0)
            .map((_, i) => ({
              name: '',
              company: '',
              signature: '',
              signedAt: new Date(),
              idno: '',
              tel: ''
            }));
        }
        if (!this.meetingData.healthWarnings.attendeeSubcontractor1Signatures) {
          this.meetingData.healthWarnings.attendeeSubcontractor1Signatures = Array(10)
            .fill(0)
            .map((_, i) => ({
              name: '',
              company: '',
              signature: '',
              signedAt: new Date(),
              idno: '',
              tel: ''
            }));
        }
        if (!this.meetingData.healthWarnings.attendeeSubcontractor2Signatures) {
          this.meetingData.healthWarnings.attendeeSubcontractor2Signatures = Array(10)
            .fill(0)
            .map((_, i) => ({
              name: '',
              company: '',
              signature: '',
              signedAt: new Date(),
              idno: '',
              tel: ''
            }));
        }
        if (!this.meetingData.healthWarnings.attendeeSubcontractor3Signatures) {
          this.meetingData.healthWarnings.attendeeSubcontractor3Signatures = Array(10)
            .fill(0)
            .map((_, i) => ({
              name: '',
              company: '',
              signature: '',
              signedAt: new Date(),
              idno: '',
              tel: ''
            }));
        }

        // 更新簽名變數
        this.siteManagerSignature = form.siteManagerSignature || null;
        this.beforeWorkSignature = form.beforeWorkSignature || null;
        this.duringWorkSignature = form.duringWorkSignature || null;
        this.afterWorkSignature = form.afterWorkSignature || null;

        // 重新檢查工人簽名狀態
        this.updateWorkerSignedStatus();

        console.log('工具箱會議表單已載入:', formId);
      }
    } catch (error) {
      console.error('載入工具箱會議表單失敗', error);
      alert('載入表單失敗');
    }
  }

  // 更新工人簽名狀態
  private updateWorkerSignedStatus(): void {
    this.projectWorkers.forEach((worker) => {
      // 檢查當前表單中是否已有該工人的簽名
      const hasSignedInCurrentForm = this.checkWorkerHasSigned(worker);
      worker.hasSigned = hasSignedInCurrentForm;
    });
  }

  // 檢查工人是否已簽名
  private checkWorkerHasSigned(worker: ProjectWorker): boolean {
    const allSignatureArrays = [
      this.meetingData.healthWarnings?.attendeeMainContractorSignatures || [],
      this.meetingData.healthWarnings?.attendeeSubcontractor1Signatures || [],
      this.meetingData.healthWarnings?.attendeeSubcontractor2Signatures || [],
      this.meetingData.healthWarnings?.attendeeSubcontractor3Signatures || []
    ];

    return allSignatureArrays.some(signatures => 
      signatures.some(sig => {
        return (sig.idno && sig.idno === worker.idno) || 
               (sig.tel && worker.tel && sig.tel === worker.tel);
      })
    );
  }

  // 載入專案工人
  async loadProjectWorkers(siteId: string): Promise<void> {
    try {
      // 從資料庫獲取該專案的工人列表
      this.projectWorkers = await this.mongodbService.get('worker', {
        belongSites: { $elemMatch: { siteId: siteId } },
      });

      // 查詢該工地所有未作廢的工具箱會議表單
      const allActiveForms = await this.mongodbService.get('siteForm', {
        siteId: siteId,
        formType: 'toolboxMeeting',
        status: { $ne: 'revoked' },
      });

      // 標記已簽名的工人
      this.updateWorkerSignedStatus();
    } catch (error) {
      console.error('載入專案工人資料失敗', error);
    }
  }

  // 載入公佈欄內容
  async loadBulletinContent(siteId: string): Promise<void> {
    try {
      // 取得尚未過期的公佈欄內容
      const bulletins = await this.bulletinService.getBulletinsBySite(siteId);
      
      if (bulletins && bulletins.length > 0) {
        // 格式化公佈欄內容
        const bulletinContent = this.formatBulletinContent(bulletins);
        
        // 填入到其他溝通/協議/宣導事項欄位
        this.meetingData.communicationItems = bulletinContent;
        
        console.log('已載入公佈欄內容到工具箱會議表單');
      }
    } catch (error) {
      console.error('載入公佈欄內容失敗', error);
      // 載入失敗不影響表單正常運作，僅記錄錯誤
    }
  }

  // 格式化公佈欄內容
  private formatBulletinContent(bulletins: Bulletin[]): string {
    const formattedContent: string[] = [];
    
    bulletins.forEach((bulletin, index) => {
      // 格式化單筆公佈欄內容
      let bulletinText = `${index + 1}. ${bulletin.title}`;
      
      // 如果有內容且不是只有標題，則加入內容
      if (bulletin.content && bulletin.content.trim() !== bulletin.title.trim()) {
        bulletinText += `\n   ${bulletin.content}`;
      }
      
      // 如果是緊急或高優先級的公告，加上標記
      if (bulletin.priority === 'urgent') {
        bulletinText = `【緊急】${bulletinText}`;
      } else if (bulletin.priority === 'high') {
        bulletinText = `【重要】${bulletinText}`;
      }
      
      // 如果有過期日期，加上提醒
      if (bulletin.expiryDate) {
        const expiryDate = dayjs(bulletin.expiryDate).format('YYYY-MM-DD');
        bulletinText += `\n   (有效期限：${expiryDate})`;
      }
      
      formattedContent.push(bulletinText);
    });
    
    // 如果有內容，在開頭加上說明
    if (formattedContent.length > 0) {
      return `【工地公佈欄重要事項】\n${formattedContent.join('\n\n')}\n\n【其他事項】\n`;
    }
    
    return '';
  }

  // 工人身份驗證
  verifyWorker() {
    // 重設錯誤訊息
    this.verificationError = '';

    // 檢查是否有輸入身份證號碼或手機號碼
    if (!this.verificationIdOrPhone) {
      this.verificationError = '請輸入身份證號碼或手機號碼';
      return;
    }

    // 查找工人
    const worker = this.projectWorkers.find(
      (w) =>
        this.verificationIdOrPhone &&
        (w.idno === this.verificationIdOrPhone ||
          w.tel === this.verificationIdOrPhone)
    );

    // 檢查工人是否存在
    if (!worker) {
      this.verificationError = '找不到此工人，請確認輸入資訊是否正確';
      return;
    }

    // 檢查工人是否已簽名
    const alreadySigned = this.checkWorkerHasSigned(worker);

    if (alreadySigned) {
      this.verificationError = `此工人 (${worker.name}) 已經簽名過`;
      return;
    }

    // 將當前工人設為已驗證的工人
    this.currentWorker = worker;

    // 關閉驗證 Modal
    this.workerVerificationModal.hide();

    // 使用SignatureDialogService開啟簽名對話框
    this.openWorkerSignatureDialog();
  }

  // 開啟工人簽名對話框
  async openWorkerSignatureDialog(): Promise<void> {
    try {
      const signature = await this.signatureDialog.open();
      if (signature && this.currentWorker) {
        const targetColumn = this.currentSignatureColumn;
        
        // 找到第一個空的簽名位置
        const emptySignature = this.findEmptySignatureSlot(targetColumn);
        
        if (!emptySignature) {
          alert('此承攬商的簽名表已滿，無法再新增簽名');
          return;
        }

        // 建立簽名記錄
        emptySignature.signature = signature;
        emptySignature.name = this.currentWorker.name;
        emptySignature.company = this.currentWorker.contractingCompanyName || '';
        emptySignature.signedAt = new Date();
        emptySignature.idno = this.currentWorker.idno;
        emptySignature.tel = this.currentWorker.tel;
        
        // 標記此工人已簽名
        const workerIndex = this.projectWorkers.findIndex(
          (w) => w._id === this.currentWorker!._id
        );
        if (workerIndex !== -1) {
          this.projectWorkers[workerIndex].hasSigned = true;
        }

        try {
          // 自動保存表單（不跳轉頁面）
          await this.saveFormData();
          console.log('工人簽名已加入表格');
          alert(`${this.currentWorker.name} 簽名成功`);
        } catch (error) {
          console.error('保存工人簽名失敗', error);
          alert('保存簽名時發生錯誤，請稍後再試');
          // 如果保存失敗，回復簽名狀態
          emptySignature.signature = '';
          emptySignature.name = '';
          emptySignature.company = '';
          emptySignature.signedAt = new Date();
          emptySignature.idno = '';
          emptySignature.tel = '';
          if (workerIndex !== -1) {
            this.projectWorkers[workerIndex].hasSigned = false;
          }
        }
      }
    } catch (error) {
      console.error('簽名對話框操作失敗', error);
    }
  }

  // 找到空的簽名位置
  private findEmptySignatureSlot(contractorType: number): SignatureData | null {
    let targetSignatures: SignatureData[] = [];
    
    switch (contractorType) {
      case 0:
        targetSignatures = this.meetingData.healthWarnings.attendeeMainContractorSignatures;
        break;
      case 1:
        targetSignatures = this.meetingData.healthWarnings.attendeeSubcontractor1Signatures;
        break;
      case 2:
        targetSignatures = this.meetingData.healthWarnings.attendeeSubcontractor2Signatures;
        break;
      case 3:
        targetSignatures = this.meetingData.healthWarnings.attendeeSubcontractor3Signatures;
        break;
      default:
        return null;
    }
    
    return targetSignatures.find(sig => !sig.signature || sig.signature.trim() === '') || null;
  }

  // 移除不再需要的方法，直接簡化邏輯
  showWorkerVerificationModal(contractorType: number): void {
    this.currentSignatureColumn = contractorType;
    this.verificationIdOrPhone = '';
    this.verificationError = '';
    this.currentWorker = null;
    this.workerVerificationModal.show();
  }

  // 取得簽名提示文字（顯示簽名者資訊）
  getSignatureTooltip(signature: SignatureData): string {
    if (signature.name && signature.signedAt) {
      return `簽名者：${signature.name}\n簽名時間：${dayjs(signature.signedAt).format('YYYY-MM-DD HH:mm:ss')}`;
    }
    return '';
  }

  // 檢查簽名位置是否已有簽名
  isSignatureSlotSigned(signature: SignatureData): boolean {
    return !!(signature.signature && signature.signature.trim() !== '');
  }

  // 取得要顯示的簽名圖片
  getSignatureImage(signature: SignatureData): string {
    return signature.signature || '';
  }

  // 格式化編號
  formatNo(index: number): string {
    return (index + 1).toString().padStart(2, '0');
  }

  // 僅保存表單資料，不跳轉頁面
  async saveFormData(): Promise<void> {
    try {
      if (this.meetingData._id) {
        this.meetingData.updatedAt = new Date();
        this.meetingData.updatedBy = this.authService.user()?.name || '';
        await this.mongodbService.put(
          'siteForm',
          this.meetingData._id,
          this.meetingData
        );
      } else {
        this.meetingData.createdAt = new Date();
        this.meetingData.createdBy = this.authService.user()?.name || '';
        const response = await this.mongodbService.post(
          'siteForm',
          this.meetingData
        );
        // 更新表單 ID 以便後續的更新操作
        this.meetingData._id = response.insertedId;
      }
    } catch (error) {
      console.error('儲存工具箱會議失敗', error);
      throw error; // 重新拋出錯誤讓調用方處理
    }
  }

  async saveMeeting(): Promise<void> {
    try {
      await this.saveFormData();
      alert('工具箱會議表單已儲存');
      // 儲存成功，導航回工地表單列表
      this.router.navigate(['/site', this.siteId, 'forms']);
    } catch (error) {
      console.error('儲存工具箱會議失敗', error);
      alert('儲存工具箱會議失敗');
    }
  }

  cancel(): void {
    // 返回工地詳情頁面
    this.router.navigate(['/site', this.siteId, 'forms']);
  }

      // Word生成方法
  async generateDocx(): Promise<void> {
    if (!this.meetingData._id) {
      alert('無法生成Word：表單ID不存在');
      return;
    }

    this.isGeneratingPdf = true;
    try {
      await this.docxTemplateService.generateToolboxMeetingDocx(this.meetingData._id);
      
    } catch (error) {
      console.error('生成Word失敗:', error);
      const errorMessage = error instanceof Error ? error.message : '未知錯誤';
      alert(`Word生成失敗: ${errorMessage}`);
    } finally {
      this.isGeneratingPdf = false;
    }
  }
}
