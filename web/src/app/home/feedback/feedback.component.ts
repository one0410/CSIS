import { Component, computed, OnInit, signal } from '@angular/core';

import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { MongodbService } from '../../services/mongodb.service';
import { AuthService } from '../../services/auth.service';
import { FeedbackService } from '../../services/feedback.service';
import { Feedback, FeedbackReply } from '../../model/feedback.model';
import dayjs from 'dayjs';

@Component({
  selector: 'app-feedback',
  templateUrl: './feedback.component.html',
  styleUrls: ['./feedback.component.scss'],
  imports: [FormsModule],
  standalone: true
})
export class FeedbackComponent implements OnInit {
  // 信號
  feedbacks = signal<Feedback[]>([]);
  loading = signal<boolean>(false);
  showForm = signal<boolean>(false);
  
  // 當前使用者信息
  currentUser = computed(() => this.authService.user());

  // 表單數據
  newFeedback = {
    title: '',
    description: '',
    category: '系統問題',
    priority: 'medium' as 'low' | 'medium' | 'high'
  };



  // 篩選條件
  filterStatus = 'all';
  filterCategory = 'all';

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
    { value: 'open', label: '開放中', class: 'text-danger' },
    { value: 'in-progress', label: '處理中', class: 'text-warning' },
    { value: 'resolved', label: '已解決', class: 'text-success' },
    { value: 'closed', label: '已關閉', class: 'text-secondary' }
  ];

  // 優先級選項
  priorityOptions = [
    { value: 'low', label: '低', class: 'text-success' },
    { value: 'medium', label: '中', class: 'text-warning' },
    { value: 'high', label: '高', class: 'text-danger' }
  ];

  // 過濾後的意見反饋 - 使用者只能看到自己提交的反饋
  filteredFeedbacks = computed(() => {
    let feedbacks = this.feedbacks();
    
    // 只顯示自己提交的反饋
    const userId = this.currentUser()?._id;
    feedbacks = feedbacks.filter(feedback => feedback.submittedBy === userId);

    // 狀態篩選
    if (this.filterStatus !== 'all') {
      feedbacks = feedbacks.filter(feedback => feedback.status === this.filterStatus);
    }

    // 分類篩選
    if (this.filterCategory !== 'all') {
      feedbacks = feedbacks.filter(feedback => feedback.category === this.filterCategory);
    }

    return feedbacks.sort((a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime());
  });

  constructor(
    private mongodbService: MongodbService,
    private authService: AuthService,
    private feedbackService: FeedbackService,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.loadFeedbacks();
  }

  // 載入反饋列表
  async loadFeedbacks(): Promise<void> {
    this.loading.set(true);
    try {
      const feedbackData = await this.mongodbService.get('feedback', {});
      const feedbacks = feedbackData || [];
      
      // 載入每個反饋的回覆
      for (const feedback of feedbacks) {
        try {
          const replies = await this.mongodbService.get('feedbackReply', { feedbackId: feedback._id });
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

  // 提交新反饋
  async submitFeedback(): Promise<void> {
    const user = this.currentUser();
    if (!user) {
      alert('請先登入');
      return;
    }

    if (!this.newFeedback.title.trim() || !this.newFeedback.description.trim()) {
      alert('請填寫標題和說明');
      return;
    }

    this.loading.set(true);
    try {
      const feedback: Feedback = {
        ...this.newFeedback,
        submittedBy: user._id || '',
        submitterName: user.name,
        submitterEmail: user.email,
        submittedAt: new Date(),
        status: 'open',
        replies: []
      };

      await this.mongodbService.post('feedback', feedback);
      
      // 通知 FeedbackService 有新的意見提交
      await this.feedbackService.onFeedbackSubmitted();
      
      // 重設表單
      this.newFeedback = {
        title: '',
        description: '',
        category: '系統問題',
        priority: 'medium'
      };
      
      this.showForm.set(false);
      await this.loadFeedbacks();
      alert('反饋提交成功');
    } catch (error) {
      console.error('提交反饋失敗', error);
      alert('提交反饋失敗，請稍後重試');
    } finally {
      this.loading.set(false);
    }
  }





  // 切換表單顯示
  toggleForm(): void {
    this.showForm.set(!this.showForm());
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
} 