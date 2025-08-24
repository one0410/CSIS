export interface Equipment {
  _id?: string;
  siteId: string; // 工地ID
  company?: string; // 承攬公司
  name: string; // 設備名稱
  model?: string; // 型號
  serialNumber?: string; // 序號
  purchaseDate?: Date; // 購買日期
  maintenanceDate?: Date; // 維修日期
  inspectionDate?: Date; // 檢查日期
  isQualified?: boolean; // 是否合格
  nextInspectionType?: 'weekly' | 'monthly' | 'quarterly' | 'biannual' | 'yearly' | 'custom'; // 下次檢查類型
  nextInspectionDate?: Date; // 下次檢查日期
  status: 'available' | 'inUse' | 'maintenance' | 'retired'; // 設備狀態
  location?: string; // 設備位置
  description?: string;
  photos?: EquipmentPhoto[];
  createdAt?: Date;
  updatedAt?: Date;
}

export interface EquipmentPhoto {
  _id?: string;
  siteId: string;
  equipmentId: string;
  filename: string;
  caption?: string;
  uploadDate: Date;
}
