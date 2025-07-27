export interface Bulletin {
  _id?: string;
  // 基本資料
  title: string; // 公告標題 (必填)
  content: string; // 公告內容 (必填)
  
  // 分類與重要性
  category: 'general' | 'safety' | 'schedule' | 'urgent'; // 公告類別
  priority: 'low' | 'normal' | 'high' | 'urgent'; // 重要程度
  
  // 作者資訊
  authorId: string; // 發布者ID
  authorName: string; // 發布者姓名
  
  // 工地關聯
  siteId: string; // 工地ID
  
  // 狀態
  isActive: boolean; // 是否啟用
  isPinned: boolean; // 是否置頂
  
  // 時間戳記
  publishDate: Date; // 發布日期
  expiryDate?: Date; // 過期日期 (可選)
  createdAt?: Date;
  updatedAt?: Date;
  
  // 附加欄位
  tags?: string[]; // 標籤
  attachments?: string[]; // 附件URL
  viewCount?: number; // 查看次數
} 