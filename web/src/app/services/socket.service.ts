import { Injectable, signal, computed, inject, OnDestroy } from '@angular/core';
import { io, Socket } from 'socket.io-client';
import { AuthService } from './auth.service';

@Injectable({
  providedIn: 'root',
})
export class SocketService implements OnDestroy {
  private authService = inject(AuthService);
  private socket: Socket | null = null;
  private _isConnected = signal<boolean>(false);
  private _isInAdminRoom = signal<boolean>(false);

  // 公開的只讀信號
  public readonly isConnected = this._isConnected.asReadonly();
  public readonly isInAdminRoom = this._isInAdminRoom.asReadonly();

  // 計算當前使用者是否為管理員
  private readonly isAdmin = computed(() => {
    const user = this.authService.user();
    return user?.role === 'admin' || user?.role === 'manager';
  });

  constructor() {
    console.log('SocketService 初始化');
  }

  ngOnDestroy() {
    this.disconnect();
  }

  /**
   * 連接到 Socket.IO 伺服器
   */
  connect(): Promise<boolean> {
    return new Promise((resolve, reject) => {
      if (this.socket?.connected) {
        console.log('Socket 已經連接');
        resolve(true);
        return;
      }

      try {
        // 創建 Socket.IO 連接
        let url: string;
        
        if (window.location.port === '4200') {
          // 開發環境：使用 localhost:3000
          url = 'http://localhost:3000';
        } else {
          // 生產環境：使用當前 domain，透過 nginx 反向代理
          url = window.location.protocol + '//' + window.location.host;
        }

        this.socket = io(url, {
          autoConnect: true,
          transports: ['polling', 'websocket'],
          timeout: 20000,
          reconnection: true,
          reconnectionAttempts: 5,
          reconnectionDelay: 1000,
        });

        // 連接成功事件
        this.socket.on('connect', () => {
          console.log('Socket.IO 連接成功:', this.socket?.id);
          this._isConnected.set(true);

          // 如果是管理員，自動加入管理員房間
          if (this.isAdmin()) {
            this.joinAdminRoom();
          }

          resolve(true);
        });

        // 連接失敗事件
        this.socket.on('connect_error', (error) => {
          console.error('Socket.IO 連接失敗:', error);
          this._isConnected.set(false);
          reject(error);
        });

        // 斷線事件
        this.socket.on('disconnect', (reason) => {
          console.log('Socket.IO 連接斷開:', reason);
          this._isConnected.set(false);
          this._isInAdminRoom.set(false);
        });

        // 重連事件
        this.socket.on('reconnect', () => {
          console.log('Socket.IO 重新連接成功');
          this._isConnected.set(true);

          // 重新加入管理員房間
          if (this.isAdmin()) {
            this.joinAdminRoom();
          }
        });
      } catch (error) {
        console.error('Socket.IO 初始化失敗:', error);
        reject(error);
      }
    });
  }

  /**
   * 斷開 Socket.IO 連接
   */
  disconnect(): void {
    if (this.socket) {
      console.log('斷開 Socket.IO 連接');
      this.socket.disconnect();
      this.socket = null;
      this._isConnected.set(false);
      this._isInAdminRoom.set(false);
    }
  }

  /**
   * 加入管理員房間（僅管理員可用）
   */
  joinAdminRoom(): Promise<boolean> {
    return new Promise((resolve, reject) => {
      if (!this.socket?.connected) {
        reject(new Error('Socket 未連接'));
        return;
      }

      if (!this.isAdmin()) {
        reject(new Error('權限不足：僅管理員可加入管理員房間'));
        return;
      }

      const user = this.authService.user();
      if (!user) {
        reject(new Error('使用者未登入'));
        return;
      }

      // 監聽加入房間的回應
      this.socket.once('joined-admin-room', (response) => {
        if (response.success) {
          console.log('成功加入管理員 feedback 房間');
          this._isInAdminRoom.set(true);
          resolve(true);
        } else {
          console.error('加入管理員房間失敗:', response.message);
          this._isInAdminRoom.set(false);
          reject(new Error(response.message));
        }
      });

      // 發送加入房間請求
      this.socket.emit('join-admin-room', {
        userId: user._id,
        userRole: user.role,
      });
    });
  }

  /**
   * 離開管理員房間
   */
  leaveAdminRoom(): void {
    if (this.socket?.connected) {
      console.log('離開管理員 feedback 房間');
      this.socket.emit('leave-admin-room');
      this._isInAdminRoom.set(false);
    }
  }

  /**
   * 監聽 feedback 數量更新事件
   */
  onFeedbackCountUpdate(callback: (data: any) => void): void {
    if (this.socket) {
      this.socket.on('feedback-count-update', callback);
    }
  }

  /**
   * 移除 feedback 數量更新監聽器
   */
  offFeedbackCountUpdate(): void {
    if (this.socket) {
      this.socket.off('feedback-count-update');
    }
  }

  /**
   * 發送 feedback 提交事件
   */
  emitFeedbackSubmitted(data: any = {}): void {
    if (this.socket?.connected) {
      console.log('發送 feedback 提交事件');
      this.socket.emit('feedback-submitted', data);
    }
  }

  /**
   * 發送 feedback 狀態更新事件
   */
  emitFeedbackStatusUpdated(feedbackId: string, newStatus: string): void {
    if (this.socket?.connected) {
      console.log('發送 feedback 狀態更新事件');
      this.socket.emit('feedback-status-updated', {
        feedbackId,
        newStatus,
      });
    }
  }

  /**
   * 發送 feedback 刪除事件
   */
  emitFeedbackDeleted(feedbackId: string): void {
    if (this.socket?.connected) {
      console.log('發送 feedback 刪除事件');
      this.socket.emit('feedback-deleted', {
        feedbackId,
      });
    }
  }

  /**
   * 取得 Socket 實例（慎用）
   */
  getSocket(): Socket | null {
    return this.socket;
  }

  // === 機具管理相關事件 ===

  /**
   * 監聽機具更新事件
   */
  onEquipmentUpdate(callback: (data: any) => void): void {
    if (this.socket) {
      this.socket.on('equipment-update', callback);
    }
  }

  /**
   * 移除機具更新監聽器
   */
  offEquipmentUpdate(): void {
    if (this.socket) {
      this.socket.off('equipment-update');
    }
  }

  /**
   * 發送機具創建事件
   */
  emitEquipmentCreated(equipmentId: string, siteId: string): void {
    if (this.socket?.connected) {
      console.log('發送機具創建事件');
      this.socket.emit('equipment-created', { equipmentId, siteId });
    }
  }

  /**
   * 發送機具更新事件
   */
  emitEquipmentUpdated(equipmentId: string, siteId: string): void {
    if (this.socket?.connected) {
      console.log('發送機具更新事件');
      this.socket.emit('equipment-updated', { equipmentId, siteId });
    }
  }

  /**
   * 發送機具刪除事件
   */
  emitEquipmentDeleted(equipmentId: string, siteId: string): void {
    if (this.socket?.connected) {
      console.log('發送機具刪除事件');
      this.socket.emit('equipment-deleted', { equipmentId, siteId });
    }
  }

  // === 表單相關事件 ===

  /**
   * 監聽表單更新事件
   */
  onFormUpdate(callback: (data: any) => void): void {
    if (this.socket) {
      this.socket.on('form-update', callback);
    }
  }

  /**
   * 移除表單更新監聽器
   */
  offFormUpdate(): void {
    if (this.socket) {
      this.socket.off('form-update');
    }
  }

  /**
   * 發送表單創建事件
   */
  emitFormCreated(formId: string, formType: string, siteId: string): void {
    if (this.socket?.connected) {
      console.log('發送表單創建事件');
      this.socket.emit('form-created', { formId, formType, siteId });
    }
  }

  /**
   * 發送表單更新事件
   */
  emitFormUpdated(formId: string, formType: string, siteId: string): void {
    if (this.socket?.connected) {
      console.log('發送表單更新事件');
      this.socket.emit('form-updated', { formId, formType, siteId });
    }
  }

  /**
   * 發送表單刪除事件
   */
  emitFormDeleted(formId: string, formType: string, siteId: string): void {
    if (this.socket?.connected) {
      console.log('發送表單刪除事件');
      this.socket.emit('form-deleted', { formId, formType, siteId });
    }
  }

  // === 工人相關事件 ===

  /**
   * 監聽工人更新事件
   */
  onWorkerUpdate(callback: (data: any) => void): void {
    if (this.socket) {
      this.socket.on('worker-update', callback);
    }
  }

  /**
   * 移除工人更新監聽器
   */
  offWorkerUpdate(): void {
    if (this.socket) {
      this.socket.off('worker-update');
    }
  }

  /**
   * 發送工人創建事件
   */
  emitWorkerCreated(workerId: string, siteId: string): void {
    if (this.socket?.connected) {
      console.log('發送工人創建事件');
      this.socket.emit('worker-created', { workerId, siteId });
    }
  }

  /**
   * 發送工人更新事件
   */
  emitWorkerUpdated(workerId: string, siteId: string): void {
    if (this.socket?.connected) {
      console.log('發送工人更新事件');
      this.socket.emit('worker-updated', { workerId, siteId });
    }
  }

  /**
   * 發送工人刪除事件
   */
  emitWorkerDeleted(workerId: string, siteId: string): void {
    if (this.socket?.connected) {
      console.log('發送工人刪除事件');
      this.socket.emit('worker-deleted', { workerId, siteId });
    }
  }

  /**
   * 發送工人加入工地事件
   */
  emitWorkerAddedToSite(workerId: string, siteId: string): void {
    if (this.socket?.connected) {
      console.log('發送工人加入工地事件');
      this.socket.emit('worker-added-to-site', { workerId, siteId });
    }
  }

  /**
   * 發送工人移出工地事件
   */
  emitWorkerRemovedFromSite(workerId: string, siteId: string): void {
    if (this.socket?.connected) {
      console.log('發送工人移出工地事件');
      this.socket.emit('worker-removed-from-site', { workerId, siteId });
    }
  }
}
