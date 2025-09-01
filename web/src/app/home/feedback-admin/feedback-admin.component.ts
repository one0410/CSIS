import { Component, computed, OnInit, signal } from '@angular/core';

import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { MongodbService } from '../../services/mongodb.service';
import { AuthService } from '../../services/auth.service';
import { FeedbackService } from '../../services/feedback.service';
import { Feedback, FeedbackReply } from '../../model/feedback.model';
import dayjs from 'dayjs';

@Component({
  selector: 'app-feedback-admin',
  templateUrl: './feedback-admin.component.html',
  styleUrls: ['./feedback-admin.component.scss'],
  imports: [FormsModule],
  standalone: true
})
export class FeedbackAdminComponent implements OnInit {
  // 信號
  feedbacks = signal<Feedback[]>([]);
  loading = signal<boolean>(false);
  selectedFeedback = signal<Feedback | null>(null);
  openDropdownId = signal<string | null>(null);
  
  // 當前使用者信息
  currentUser = computed(() => this.authService.user());
  isAdmin = computed(() => {
    const user = this.currentUser();
    return user?.role === 'admin' || user?.role === 'manager';
  });

  // 回覆表單
  newReply = {
    message: '',
    isInternal: false
  };

  // 篩選條件
  filterStatus = 'all';
  filterCategory = 'all';
  filterPriority = 'all';

  // 分類選項
  categories = [
    '系統問題',
    '功能建議',
    '介面問題',
    '效能問題',
    '安全問題',
    '其他'
  ];

  // 狀態選項
  statusOptions = [
    { value: 'open', label: '開放中', class: 'bg-danger' },
    { value: 'in-progress', label: '處理中', class: 'bg-warning' },
    { value: 'resolved', label: '已解決', class: 'bg-success' },
    { value: 'closed', label: '已關閉', class: 'bg-secondary' }
  ];

  // 優先級選項
  priorityOptions = [
    { value: 'low', label: '低', class: 'bg-success' },
    { value: 'medium', label: '中', class: 'bg-warning' },
    { value: 'high', label: '高', class: 'bg-danger' }
  ];

  // 過濾後的意見反饋
  filteredFeedbacks = computed(() => {
    let feedbacks = this.feedbacks();

    // 狀態篩選
    if (this.filterStatus !== 'all') {
      feedbacks = feedbacks.filter(feedback => feedback.status === this.filterStatus);
    }

    // 分類篩選
    if (this.filterCategory !== 'all') {
      feedbacks = feedbacks.filter(feedback => feedback.category === this.filterCategory);
    }

    // 優先級篩選
    if (this.filterPriority !== 'all') {
      feedbacks = feedbacks.filter(feedback => feedback.priority === this.filterPriority);
    }

    return feedbacks.sort((a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime());
  });

  // 統計信息
  statistics = computed(() => {
    const feedbacks = this.feedbacks();
    return {
      total: feedbacks.length,
      open: feedbacks.filter(f => f.status === 'open').length,
      inProgress: feedbacks.filter(f => f.status === 'in-progress').length,
      resolved: feedbacks.filter(f => f.status === 'resolved').length,
      closed: feedbacks.filter(f => f.status === 'closed').length,
      high: feedbacks.filter(f => f.priority === 'high').length,
      medium: feedbacks.filter(f => f.priority === 'medium').length,
      low: feedbacks.filter(f => f.priority === 'low').length
    };
  });

  constructor(
    private mongodbService: MongodbService,
    private authService: AuthService,
    private feedbackService: FeedbackService,
    private router: Router
  ) {}

  ngOnInit(): void {
    // 檢查權限
    if (!this.isAdmin()) {
      alert('權限不足，將重定向到首頁');
      this.router.navigate(['/dashboard']);
      return;
    }
    this.loadFeedbacks();
  }

  // 載入反饋列表
  async loadFeedbacks(): Promise<void> {
    this.loading.set(true);
    try {
      const feedbacks = await this.mongodbService.getArray('feedback', {});
      
      // 載入每個反饋的回覆
      for (const feedback of feedbacks) {
        try {
          const replies = await this.mongodbService.getArray('feedbackReply', { feedbackId: feedback._id });
          feedback.replies = replies || [];
        } catch (error) {
          console.error(`載入回覆失敗 for feedback ${feedback._id}`, error);
          feedback.replies = [];
        }
      }
      
      this.feedbacks.set(feedbacks);
    } catch (error) {
      console.error('載入反饋失敗', error);
      alert('載入反饋失敗，請稍後重試');
    } finally {
      this.loading.set(false);
    }
  }

  // 回覆反饋
  async replyToFeedback(feedbackId: string): Promise<void> {
    const user = this.currentUser();
    if (!user || !this.isAdmin()) {
      alert('權限不足');
      return;
    }

    if (!this.newReply.message.trim()) {
      alert('請填寫回覆內容');
      return;
    }

    this.loading.set(true);
    try {
      const reply: FeedbackReply = {
        feedbackId,
        message: this.newReply.message,
        repliedBy: user._id || '',
        replierName: user.name,
        repliedAt: new Date(),
        isInternal: this.newReply.isInternal
      };

      await this.mongodbService.post('feedbackReply', reply);
      
      // 重設回覆表單
      this.newReply = { message: '', isInternal: false };
      
      await this.loadFeedbacks();
      
      // 重新設置 selectedFeedback 為更新後的對象
      const updatedFeedback = this.feedbacks().find(f => f._id === feedbackId);
      if (updatedFeedback) {
        this.selectedFeedback.set(updatedFeedback);
      }
      
      alert('回覆提交成功');
    } catch (error) {
      console.error('提交回覆失敗', error);
      alert('提交回覆失敗，請稍後重試');
    } finally {
      this.loading.set(false);
    }
  }

  // 更新反饋狀態
  async updateFeedbackStatus(feedbackId: string, status: string): Promise<void> {
    if (!this.isAdmin()) {
      alert('權限不足');
      return;
    }

    this.loading.set(true);
    try {
      await this.mongodbService.patch('feedback', feedbackId, { 
        status, 
        updatedAt: new Date() 
      });
      
      // 通知 FeedbackService 狀態已更新
      await this.feedbackService.onFeedbackStatusUpdated(feedbackId, status);
      
      await this.loadFeedbacks();
      
      // 如果當前選中的是被更新的反饋，重新設置為更新後的對象
      if (this.selectedFeedback()?._id === feedbackId) {
        const updatedFeedback = this.feedbacks().find(f => f._id === feedbackId);
        if (updatedFeedback) {
          this.selectedFeedback.set(updatedFeedback);
        }
      }
    } catch (error) {
      console.error('更新狀態失敗', error);
      alert('更新狀態失敗，請稍後重試');
    } finally {
      this.loading.set(false);
    }
  }

  // 刪除反饋
  async deleteFeedback(feedbackId: string): Promise<void> {
    if (!this.isAdmin()) {
      alert('權限不足');
      return;
    }

    if (!confirm('確定要刪除此反饋嗎？此操作無法撤銷。')) {
      return;
    }

    this.loading.set(true);
    try {
      // 先刪除相關回覆
      await this.mongodbService.deleteMany('feedbackReply', { feedbackId });
      // 再刪除反饋
      await this.mongodbService.delete('feedback', feedbackId);
      
      // 通知 FeedbackService 反饋已刪除
      await this.feedbackService.onFeedbackDeleted(feedbackId);
      
      await this.loadFeedbacks();
      this.selectedFeedback.set(null);
      alert('反饋已刪除');
    } catch (error) {
      console.error('刪除反饋失敗', error);
      alert('刪除反饋失敗，請稍後重試');
    } finally {
      this.loading.set(false);
    }
  }

  // 刪除回覆
  async deleteReply(replyId: string): Promise<void> {
    if (!this.isAdmin()) {
      alert('權限不足');
      return;
    }

    if (!confirm('確定要刪除此回覆嗎？')) {
      return;
    }

    const currentSelectedId = this.selectedFeedback()?._id;
    
    this.loading.set(true);
    try {
      await this.mongodbService.delete('feedbackReply', replyId);
      await this.loadFeedbacks();
      
      // 重新設置 selectedFeedback 為更新後的對象
      if (currentSelectedId) {
        const updatedFeedback = this.feedbacks().find(f => f._id === currentSelectedId);
        if (updatedFeedback) {
          this.selectedFeedback.set(updatedFeedback);
        }
      }
      
      alert('回覆已刪除');
    } catch (error) {
      console.error('刪除回覆失敗', error);
      alert('刪除回覆失敗，請稍後重試');
    } finally {
      this.loading.set(false);
    }
  }

  // 選擇反饋項目
  selectFeedback(feedback: Feedback): void {
    this.selectedFeedback.set(feedback);
    // 清空回覆表單
    this.newReply = { message: '', isInternal: false };
  }

  // 關閉反饋詳情
  closeFeedbackDetail(): void {
    this.selectedFeedback.set(null);
    this.newReply = { message: '', isInternal: false };
  }

  // 格式化日期
  formatDate(date: Date): string {
    return dayjs(date).format('YYYY-MM-DD HH:mm');
  }

  // 獲取狀態樣式類別
  getStatusClass(status: string): string {
    const option = this.statusOptions.find(opt => opt.value === status);
    return option?.class || '';
  }

  // 獲取狀態標籤
  getStatusLabel(status: string): string {
    const option = this.statusOptions.find(opt => opt.value === status);
    return option?.label || status;
  }

  // 獲取優先級樣式類別
  getPriorityClass(priority: string): string {
    const option = this.priorityOptions.find(opt => opt.value === priority);
    return option?.class || '';
  }

  // 獲取優先級標籤
  getPriorityLabel(priority: string): string {
    const option = this.priorityOptions.find(opt => opt.value === priority);
    return option?.label || priority;
  }

  // 切換下拉選單
  toggleDropdown(feedbackId: string): void {
    const currentOpenId = this.openDropdownId();
    if (currentOpenId === feedbackId) {
      this.openDropdownId.set(null);
    } else {
      this.openDropdownId.set(feedbackId);
    }
  }

  // 關閉下拉選單
  closeDropdown(): void {
    this.openDropdownId.set(null);
  }

  // 檢查下拉選單是否開啟
  isDropdownOpen(feedbackId: string): boolean {
    return this.openDropdownId() === feedbackId;
  }
} 