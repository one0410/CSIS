import { Injectable, signal, computed, inject, OnDestroy, effect } from '@angular/core';
import { MongodbService } from './mongodb.service';
import { AuthService } from './auth.service';
import { SocketService } from './socket.service';
import { CurrentSiteService } from './current-site.service';

@Injectable({
  providedIn: 'root'
})
export class FeedbackService implements OnDestroy {
  private mongodbService = inject(MongodbService);
  private authService = inject(AuthService);
  private socketService = inject(SocketService);
  private currentSiteService = inject(CurrentSiteService);
  
  // 私有信號
  private _pendingFeedbackCount = signal<number>(0);
  private _isWebSocketActive = signal<boolean>(false);
  private _isInitialized = signal<boolean>(false);
  
  // 公開的只讀信號
  public readonly pendingFeedbackCount = this._pendingFeedbackCount.asReadonly();
  public readonly isWebSocketActive = this._isWebSocketActive.asReadonly();
  public readonly isInitialized = this._isInitialized.asReadonly();
  
  // 計算當前使用者是否為管理員
  private readonly isAdmin = computed(() => {
    const user = this.authService.user();
    return user?.role === 'admin' || user?.role === 'manager';
  });

  constructor() {
    console.log('FeedbackService 初始化');
    
    // 監聽使用者變化，自動連接或斷開 WebSocket
    effect(() => {
      const user = this.authService.user();
      if (user) {
        // 所有登入的使用者都連接 WebSocket
        console.log(`使用者 ${user.role} 登入，初始化 WebSocket 連接`);
        this.initializeWebSocket();
      } else {
        console.log('使用者已登出，斷開 WebSocket');
        this.disconnectWebSocket();
      }
    });
  }

  ngOnDestroy() {
    this.disconnectWebSocket();
  }

  /**
   * 初始化 WebSocket 連接
   */
  private async initializeWebSocket(): Promise<void> {
    if (this._isInitialized()) {
      console.log('WebSocket 已初始化');
      return;
    }

    try {
      // 連接到 Socket.IO
      await this.socketService.connect();
      
      // 只有管理員才設定 feedback 更新監聽器和載入初始數量
      if (this.isAdmin()) {
        console.log('管理員權限：設定 feedback 監聽器');
        this.setupFeedbackListeners();
        await this.loadPendingFeedbackCount();
      } else {
        console.log('一般使用者：僅連接 WebSocket，不監聽更新');
        this._pendingFeedbackCount.set(0);
      }
      
      this._isWebSocketActive.set(true);
      this._isInitialized.set(true);
      
      // 啟用 CurrentSiteService 的 WebSocket 監聽
      this.currentSiteService.enableWebSocketListening();
      
      console.log('WebSocket 初始化完成');
    } catch (error) {
      console.error('WebSocket 初始化失敗:', error);
      this._isWebSocketActive.set(false);
    }
  }

  /**
   * 設定 feedback 事件監聽器
   */
  private setupFeedbackListeners(): void {
    this.socketService.onFeedbackCountUpdate((data) => {
      console.log('收到 feedback 更新事件:', data);
      
      // 重新載入待處理數量
      this.loadPendingFeedbackCount();
      
      // 可選：顯示通知
      if (data.message) {
        console.log('Feedback 通知:', data.message);
      }
    });
  }

  /**
   * 斷開 WebSocket 連接
   */
  private disconnectWebSocket(): void {
    if (this._isInitialized()) {
      console.log('斷開 WebSocket 連接');
      
      // 只有管理員才需要移除 feedback 監聽器
      if (this.isAdmin()) {
        this.socketService.offFeedbackCountUpdate();
      }
      
      // 斷開 Socket 連接
      this.socketService.disconnect();
      
      this._isWebSocketActive.set(false);
      this._isInitialized.set(false);
      this._pendingFeedbackCount.set(0);
    }
  }

  /**
   * 載入待處理意見數量
   */
  async loadPendingFeedbackCount(): Promise<void> {
    if (!this.isAdmin()) {
      this._pendingFeedbackCount.set(0);
      return;
    }

    try {
      console.log('FeedbackService: 開始載入待處理意見數量...');
      const query = { status: { $in: ['open', 'in-progress'] } };
      const count = await this.mongodbService.count('feedback', query);
      console.log('FeedbackService: 取得的數量:', count);
      this._pendingFeedbackCount.set(count);
    } catch (error) {
      console.error('FeedbackService: 讀取待處理意見數量時發生錯誤:', error);
      this._pendingFeedbackCount.set(0);
    }
  }

  /**
   * 手動重新整理待處理數量（用於操作後立即更新）
   */
  async refreshPendingCount(): Promise<void> {
    await this.loadPendingFeedbackCount();
  }

  /**
   * 意見提交後的回調（增加數量）
   */
  async onFeedbackSubmitted(): Promise<void> {
    console.log('FeedbackService: 意見已提交，發送 WebSocket 事件');
    
    // 所有使用者都可以發送 WebSocket 事件
    if (this._isWebSocketActive()) {
      this.socketService.emitFeedbackSubmitted();
    } else {
      console.warn('WebSocket 未連接，無法發送事件');
    }
    
    // 只有管理員才重新整理本地數量
    if (this.isAdmin()) {
      await this.refreshPendingCount();
    }
  }

  /**
   * 意見狀態更新後的回調
   */
  async onFeedbackStatusUpdated(feedbackId: string, newStatus: string): Promise<void> {
    console.log('FeedbackService: 意見狀態已更新，發送 WebSocket 事件');
    
    // 發送 WebSocket 事件通知其他管理員
    this.socketService.emitFeedbackStatusUpdated(feedbackId, newStatus);
    
    // 立即重新整理本地數量
    await this.refreshPendingCount();
  }

  /**
   * 意見刪除後的回調
   */
  async onFeedbackDeleted(feedbackId: string): Promise<void> {
    console.log('FeedbackService: 意見已刪除，發送 WebSocket 事件');
    
    // 發送 WebSocket 事件通知其他管理員
    this.socketService.emitFeedbackDeleted(feedbackId);
    
    // 立即重新整理本地數量
    await this.refreshPendingCount();
  }

  /**
   * 檢查是否應該顯示待處理數量
   */
  shouldShowPendingCount(): boolean {
    return this.isAdmin() && this._pendingFeedbackCount() > 0;
  }

  /**
   * 取得格式化的數量顯示
   */
  getFormattedCount(): string {
    const count = this._pendingFeedbackCount();
    return count > 99 ? '99+' : count.toString();
  }

  /**
   * 手動連接 WebSocket（測試用）
   */
  async connectWebSocket(): Promise<void> {
    if (this.isAdmin()) {
      await this.initializeWebSocket();
    } else {
      throw new Error('權限不足：僅管理員可連接 WebSocket');
    }
  }

  /**
   * 取得連接狀態
   */
  getConnectionStatus(): {
    isConnected: boolean;
    isInAdminRoom: boolean;
    isWebSocketActive: boolean;
  } {
    return {
      isConnected: this.socketService.isConnected(),
      isInAdminRoom: this.socketService.isInAdminRoom(),
      isWebSocketActive: this._isWebSocketActive()
    };
  }
} 