export enum CertificationType {
  A = 'a',               // 高空作業車操作人員
  BOSH = 'bosh',         // 乙級職業安全管理員
  AOS = 'aos',           // 甲級職業安全管理員
  AOH = 'aoh',           // 甲級職業衛生管理師
  FR = 'fr',             // 急救人員
  O2 = 'o2',             // 缺氧(侷限)作業主管證照
  OS = 'os',             // 有機溶劑作業主管證照
  SA = 'sa',             // 施工架組配作業主管證照
  S = 's',               // 營造業職業安全衛生業務主管
  MA = 'ma',             // 一般業職業安全衛生業務主管
  SC = 'sc',             // 特定化學物質作業主管
  DW = 'dw',             // 粉塵作業主管
  OW = 'ow',             // 氧乙炔熔接裝置作業人員
  R = 'r',               // 屋頂作業主管
  SSA = 'ssa',           // 鋼構組配作業主管
  FS = 'fs',             // 模板支撐作業主管
  PE = 'pe',             // 露天開挖作業主管
  RS = 'rs'              // 擋土支撐作業主管
}

// 證照類型資料結構
export interface CertificationTypeInfo {
  code: string;
  name: string;
  fullLabel: string; // 包含代碼的完整標籤，例如: "高空作業車操作人員(a)"
}

// 證照類型管理器
export class CertificationTypeManager {
  private static readonly CERTIFICATION_DATA: Record<CertificationType, CertificationTypeInfo> = {
    [CertificationType.A]: { 
      code: 'a', 
      name: '高空作業車操作人員',
      fullLabel: '高空作業車操作人員(a)'
    },
    [CertificationType.BOSH]: { 
      code: 'bosh', 
      name: '乙級職業安全管理員',
      fullLabel: '乙級職業安全管理員(bosh)'
    },
    [CertificationType.AOS]: { 
      code: 'aos', 
      name: '甲級職業安全管理師',
      fullLabel: '甲級職業安全管理師(aos)'
    },
    [CertificationType.AOH]: { 
      code: 'aoh', 
      name: '甲級職業衛生管理師',
      fullLabel: '甲級職業衛生管理師(aoh)'
    },
    [CertificationType.FR]: { 
      code: 'fr', 
      name: '急救人員',
      fullLabel: '急救人員(fr)'
    },
    [CertificationType.O2]: { 
      code: 'o2', 
      name: '缺氧(侷限)作業主管',
      fullLabel: '缺氧(侷限)作業主管(o2)'
    },
    [CertificationType.OS]: { 
      code: 'os', 
      name: '有機溶劑作業主管',
      fullLabel: '有機溶劑作業主管(os)'
    },
    [CertificationType.SA]: { 
      code: 'sa', 
      name: '施工架組配作業主管',
      fullLabel: '施工架組配作業主管(sa)'
    },
    [CertificationType.S]: { 
      code: 's', 
      name: '營造業職業安全衛生業務主管',
      fullLabel: '營造業職業安全衛生業務主管(s)'
    },
    [CertificationType.MA]: { 
      code: 'ma', 
      name: '一般業職業安全衛生業務主管',
      fullLabel: '一般業職業安全衛生業務主管(ma)'
    },
    [CertificationType.SC]: { 
      code: 'sc', 
      name: '特定化學物質作業主管',
      fullLabel: '特定化學物質作業主管(sc)'
    },
    [CertificationType.DW]: { 
      code: 'dw', 
      name: '粉塵作業主管',
      fullLabel: '粉塵作業主管(dw)'
    },
    [CertificationType.OW]: { 
      code: 'ow', 
      name: '氧乙炔熔接裝置作業人員',
      fullLabel: '氧乙炔熔接裝置作業人員(ow)'
    },
    [CertificationType.R]: { 
      code: 'r', 
      name: '屋頂作業主管',
      fullLabel: '屋頂作業主管(r)'
    },
    [CertificationType.SSA]: { 
      code: 'ssa', 
      name: '鋼構組配作業主管',
      fullLabel: '鋼構組配作業主管(ssa)'
    },
    [CertificationType.FS]: { 
      code: 'fs', 
      name: '模板支撐作業主管',
      fullLabel: '模板支撐作業主管(fs)'
    },
    [CertificationType.PE]: { 
      code: 'pe', 
      name: '露天開挖作業主管',
      fullLabel: '露天開挖作業主管(pe)'
    },
    [CertificationType.RS]: { 
      code: 'rs', 
      name: '擋土支撐作業主管',
      fullLabel: '擋土支撐作業主管(rs)'
    }
  };

  // 取得所有證照類型選項（適用於下拉選單）
  static getAllCertificationOptions(): { value: CertificationType; label: string }[] {
    return Object.values(CertificationType).map(type => ({
      value: type,
      label: this.CERTIFICATION_DATA[type].fullLabel
    }));
  }

  // 取得證照類型對照表（適用於Excel匯入）
  static getCertificationMap(): { [key: string]: { code: string; name: string } } {
    const map: { [key: string]: { code: string; name: string } } = {};
    Object.values(CertificationType).forEach(type => {
      const data = this.CERTIFICATION_DATA[type];
      map[data.code] = { code: data.code, name: data.name };
    });
    return map;
  }

  // 根據證照類型獲取名稱
  static getName(type: CertificationType): string {
    return this.CERTIFICATION_DATA[type]?.name || '未知證照類型';
  }

  // 根據證照類型獲取代碼
  static getCode(type: CertificationType): string {
    return this.CERTIFICATION_DATA[type]?.code || '';
  }

  // 根據證照類型獲取完整標籤
  static getFullLabel(type: CertificationType): string {
    return this.CERTIFICATION_DATA[type]?.fullLabel || '未知證照類型';
  }

  // 根據代碼查找證照類型
  static getTypeByCode(code: string): CertificationType | undefined {
    return Object.values(CertificationType).find(type => 
      this.CERTIFICATION_DATA[type].code.toUpperCase() === code.toUpperCase()
    );
  }

  // 根據名稱查找證照類型
  static getTypeByName(name: string): CertificationType | undefined {
    return Object.values(CertificationType).find(type => 
      this.CERTIFICATION_DATA[type].name === name
    );
  }

  // 取得所有證照類型的資訊
  static getAllCertificationInfo(): CertificationTypeInfo[] {
    return Object.values(CertificationType).map(type => this.CERTIFICATION_DATA[type]);
  }
}

export interface Worker {
  _id?: string;
  // 姓名
  name: string;
  // 性別
  gender: string;
  // 生日 yyyy-mm-dd
  birthday: string;
  // 血型
  bloodType: string;
  // 電話
  tel: string;
  // 聯絡人
  liaison: string;
  // 緊急聯絡電話
  emergencyTel: string;
  // 聯絡地址
  address: string;
  // 大頭貼圖片 (base64 格式)
  profilePicture: string; // base64 圖片
  // 身份證正面圖片 (GridFS URL)
  idCardFrontPicture: string; // GridFS 檔案 URL
  // 身份證反面圖片 (GridFS URL)
  idCardBackPicture: string; // GridFS 檔案 URL

  // 危害告知日期 yyyy-mm-dd
  // hazardNotifyDate: string;
  // 供應商工安認證編號
  supplierIndustrialSafetyNumber: string;

  // 一般安全衛生教育訓練(6小時) 發證/回訓日期 yyyy-mm-dd
  generalSafetyTrainingDate: string;
  // 一般安全衛生教育訓練(6小時) 應回訓日期(三年減一天) yyyy-mm-dd
  generalSafetyTrainingDueDate: string;

  // 勞保申請日期 yyyy-mm-dd
  // laborInsuranceApplyDate: string;
  // 勞保證明圖片 (GridFS URL)
  // laborInsurancePicture: string; // GridFS 檔案 URL
  // 勞工團體入會日期 yyyy-mm-dd
  // laborAssociationDate: string;
  laborInsurance: {
    belongSite: string; // 屬於哪一個 site
    applyDate: string; // 申請日期 YYYY-MM-dd
    picture: string; // GridFS 檔案 URL
    associationDate: string; // 勞工團體入會日期 YYYY-MM-dd
  }[];

  // 6小時期效狀況
  // sixHourTrainingDate: string;
  // 六小時證明正面圖片 (GridFS URL)
  sixHourTrainingFrontPicture: string; // GridFS 檔案 URL
  // 六小時證明反面圖片 (GridFS URL)
  sixHourTrainingBackPicture: string; // GridFS 檔案 URL

  // 意外險
  accidentInsurances?: {
    belongSite: string; // 屬於哪一個 site
    start: string; // 開始日期 yyyy-mm-dd
    end: string; // 結束日期 yyyy-mm-dd
    amount: string; // 保額(萬元)
    signDate: string; // 簽約日期 yyyy-mm-dd
    companyName: string; // 保險公司
    picture?: string; // 意外險證明圖片 (GridFS URL) - 舊格式，向後相容
    pictures?: string[]; // 意外險證明圖片陣列 (GridFS URL) - 新格式
  }[];
  // 承攬公司
  contractingCompanyName: string;
  // 次承攬公司
  viceContractingCompanyName: string;
  // 證照
  certifications?: Certification[];
  // 審核人員
  reviewStaff: string;
  // 身分證字號
  idno: string;
  // 編號
  no: null;
  // 體檢報告圖片 (GridFS URL)
  medicalExamPictures: string[]; // GridFS 檔案 URL
  // 所屬工地
  belongSites?: {
    siteId: string;
    assignDate: Date; // 指派日期
    isVisitor?: boolean; // 是否為訪客
  }[];
  // 工安缺失紀錄
  safetyIssues?: {
    siteId: string; // 工地ID
    formId: string; // 工安缺失紀錄單ID
    issueDate: string; // 工安缺失紀錄日期
  }[];
}

export interface Certification {
  type: CertificationType; // 證照類型
  name: string; // 證照名稱
  issue: string; // 發證日期
  withdraw: string; // 到期日
  frontPicture: string; // 正面照片 (GridFS URL)
  backPicture: string; // 背面照片 (GridFS URL)
}
