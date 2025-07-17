export interface Visitor {
  _id?: string;
  // 基本資料
  name: string; // 姓名 (必填)
  tel?: string; // 電話 (選填)
  idno?: string; // 身份證號
  // 簽名資料
  signature?: string; // 簽名資料 (base64)
  signedAt?: Date; // 簽名時間
  // 危害告知狀態
  hazardNoticeCompleted: boolean; // 是否完成危害告知
  hazardNoticeCompletedAt?: Date; // 危害告知完成時間
  // 所屬工地
  siteId: string; // 工地ID
  // 進入日期
  entryDate: Date; // 進入工地日期
  // 設備識別
  deviceId?: string; // 設備唯一識別碼
  // 系統記錄
  createdAt?: Date;
  updatedAt?: Date;
}

export interface VisitorHazardNotice {
  _id?: string;
  visitorId: string; // 訪客ID
  siteId: string; // 工地ID
  visitorName: string; // 訪客姓名
  visitorTel?: string; // 訪客電話
  signature: string; // 簽名資料 (base64)
  signedAt: Date; // 簽名時間
  ipAddress?: string; // 簽名時的IP位址
  userAgent?: string; // 簽名時的瀏覽器資訊
  createdAt?: Date;
  updatedAt?: Date;
} 