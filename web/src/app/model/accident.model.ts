export interface Accident {
  _id?: string;
  // 基本資料
  title: string; // 事故標題
  description: string; // 事故內容描述 (必填)
  incidentDate: Date; // 事故發生日期 (必填)
  incidentTime: string; // 事故發生時間 (HH:MM格式，必填)
  
  // 回報人員資料
  reporterName: string; // 回報人員姓名 (必填)
  reporterTitle?: string; // 回報人員職稱
  reporterPhone?: string; // 回報人員電話
  
  // 事故分類
  severity: 'minor' | 'moderate' | 'serious' | 'critical'; // 事故嚴重程度
  category: 'event' | 'accident'; // 類別
  
  // 處理狀態
  status: 'reported' | 'investigating' | 'resolved' | 'closed'; // 處理狀態
  
  // 所屬工地
  siteId: string; // 工地ID
  
  // 附加資訊
  location?: string; // 事故發生地點
  witnessCount?: number; // 目擊者人數
  injuredCount?: number; // 受傷人數
  notes?: string; // 備註
  
  // 系統記錄
  createdAt?: Date;
  updatedAt?: Date;
  createdBy?: string; // 建立者ID
}

export interface AccidentStats {
  totalAccidents: number; // 總事故數
  accidentsByCategory: { [key: string]: number }; // 依類別統計
  accidentsBySeverity: { [key: string]: number }; // 依嚴重程度統計
  zeroAccidentHours: number; // 零事故時數
  lastAccidentDate?: Date; // 最後一次事故日期
} 