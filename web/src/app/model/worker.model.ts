export enum CertificationType {
  A = 'a',               // 高空作業車操作人員
  BOSH = 'bosh',         // 乙級職業安全管理員
  AOS = 'aos',           // 甲級職業安全管理員
  AOH = 'aoh',           // 甲級職業衛生管理師
  FR = 'fr',             // 急救人員
  O2 = 'o2',             // 缺氧(侷限)作業主管證照
  OS = 'os',             // 有機溶劑作業主管證照
  SA = 'sa',             // 施工架組配作業主管證照
  S = 's',               // 營造作業主管證照
  MA = 'ma',             // 作業主管證照
  SC = 'sc',             // 特定化學物質作業主管
  DW = 'dw',             // 粉塵作業主管
  OW = 'ow',             // 氧乙炔熔接裝置作業人員
  R = 'r',               // 屋頂作業主管
  SSA = 'ssa',           // 鋼構組配作業主管
  FS = 'fs',             // 模板支撐作業主管
  PE = 'pe',             // 露天開挖作業主管
  RS = 'rs'              // 擋土支撐作業主管
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
  laborInsuranceApplyDate: string;
  // 勞保證明圖片 (GridFS URL)
  laborInsurancePicture: string; // GridFS 檔案 URL
  // 勞工團體入會日期 yyyy-mm-dd
  laborAssociationDate: string;

  // 6小時期效狀況
  sixHourTrainingDate: string;
  // 六小時證明正面圖片 (GridFS URL)
  sixHourTrainingFrontPicture: string; // GridFS 檔案 URL
  // 六小時證明反面圖片 (GridFS URL)
  sixHourTrainingBackPicture: string; // GridFS 檔案 URL

  // 意外險
  accidentInsurances: {
    start: string; // 開始日期 yyyy-mm-dd
    end: string; // 結束日期 yyyy-mm-dd
    amount: string; // 保額(萬元)
    signDate: string; // 簽約日期 yyyy-mm-dd
    companyName: string; // 保險公司
  }[];
  // 承攬公司
  contractingCompanyName: string;
  // 次承攬公司
  viceContractingCompanyName: string;
  // 證照
  certifications: Certification[];
  // 審核人員
  reviewStaff: string;
  // 身分證字號
  idno: string;
  // 編號
  no: null;
  // 體檢報告圖片 (GridFS URL)
  medicalExamPicture: string; // GridFS 檔案 URL
  // 所屬工地
  belongSites?: {
    siteId: string;
    assignDate: Date; // 指派日期
  }[];
}

// 證照列表:
// 高空作業車操作人員(a)
// 乙級職業安全管理員(bosh)
// 甲級職業安全管理員(aos)
// 甲級職業衛生管理師(aoh)
// 急救人員(fr)
// 缺氧(侷限)作業主管證照(o2)
// 有機溶劑作業主管證照(os)
// 施工架組配作業主管證照(sa)
// 營造作業主管證照(s)
// 作業主管證照(ma)
// 特定化學物質作業主管(sc)
// 粉塵作業主管(dw)
// 氧乙炔熔接裝置作業人員(ow)
// 屋頂作業主管(r)
// 鋼構組配作業主管(ssa)
// 模板支撐作業主管(fs)
// 露天開挖作業主管(pe)
// 擋土支撐作業主管(rs)

export interface Certification {
  type: CertificationType; // 證照類型
  name: string; // 證照名稱
  issue: string; // 發證日期
  withdraw: string; // 撤銷日期
  frontPicture: string; // 正面照片 (GridFS URL)
  backPicture: string; // 背面照片 (GridFS URL)
}
