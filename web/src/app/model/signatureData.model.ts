export interface SignatureData {
  name: string; // 姓名
  company?: string; // 公司
  signature: string; // 簽名
  signedAt?: Date; // 簽名時間
  idno?: string; // 身分證字號
  tel?: string; // 電話
  // 以下為教育訓練紙本表單欄位延伸（選填，維持相容性）
  employeeNo?: string; // 工號（選填）
  remarks?: string; // 備註（選填）
}
