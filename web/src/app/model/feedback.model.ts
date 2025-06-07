export interface Feedback {
  _id?: string;
  title: string;
  description: string;
  category: string;
  priority: 'low' | 'medium' | 'high';
  status: 'open' | 'in-progress' | 'resolved' | 'closed';
  submittedBy: string; // 使用者ID
  submitterName: string; // 使用者名稱
  submitterEmail?: string;
  submittedAt: Date;
  updatedAt?: Date;
  replies: FeedbackReply[];
}

export interface FeedbackReply {
  _id?: string;
  feedbackId: string;
  message: string;
  repliedBy: string; // 管理員ID
  replierName: string; // 管理員名稱
  repliedAt: Date;
  isInternal?: boolean; // 是否為內部註記
}

export interface FeedbackSummary {
  total: number;
  open: number;
  inProgress: number;
  resolved: number;
  closed: number;
} 