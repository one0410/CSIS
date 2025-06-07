import { Injectable } from '@angular/core';
import * as bootstrap from 'bootstrap';

@Injectable({
  providedIn: 'root',
})
export class ToastService {
  private toastContainer: HTMLElement | null = null;

  constructor() {
    // 創建 toast 容器
    this.initToastContainer();
  }

  private initToastContainer() {
    // 檢查是否已存在容器
    let container = document.getElementById('toast-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'toast-container';
      container.style.position = 'fixed';
      container.style.bottom = '1rem';
      container.style.right = '1rem';
      container.style.zIndex = '9999';
      document.body.appendChild(container);
    }
    this.toastContainer = container;
  }

  private showToast(
    message: string,
    type: 'primary' | 'danger' | 'success' | 'warning' | 'info',
    args: any[]
  ) {
    if (args.length > 0) {
      message += ' ' + args.join(' ');
    }

    // 確保容器存在
    if (!this.toastContainer) {
      this.initToastContainer();
    }

    // 先移除所有現有的 toast 元素
    this.hide();
    const existingToasts = this.toastContainer!.querySelectorAll('.toast');
    existingToasts.forEach(toast => {
      toast.remove();
    });

    const toastHtml = `
        <div class="toast align-items-center text-white bg-${type} border-0" role="alert" aria-live="assertive" aria-atomic="true">
          <div class="d-flex">
            <div class="toast-body"></div>
            <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast" aria-label="Close"></button>
          </div>
        </div>
      `;
    const template = document.createElement('template');
    template.innerHTML = toastHtml.trim();
    const toastElement = template.content.firstChild as HTMLElement;
    this.toastContainer!.appendChild(toastElement);
    const toastBody = toastElement.querySelector('.toast-body');
    toastBody!.innerHTML = message;

    // 顯示新的 toast
    const toast = new bootstrap.Toast(toastElement, {
      autohide: true,
      delay: 3000
    });
    toast.show();
  }

  show(message: string, ...args: any[]) {
    this.showToast(message, 'primary', args);
  }

  info(message: string, ...args: any[]) {
    this.showToast(message, 'info', args);
  }

  warning(message: string, ...args: any[]) {
    this.showToast(message, 'warning', args);
  }

  success(message: string, ...args: any[]) {
    this.showToast(message, 'success', args);
  }

  error(message: string, ...args: any[]) {
    this.showToast(message, 'danger', args);
  }

  hide() {
    if (this.toastContainer) {
      let toastElList = [].slice.call(this.toastContainer.querySelectorAll('.toast'));
      toastElList.forEach((toastEl) => {
        new bootstrap.Toast(toastEl).hide();
      });
    }
  }
}
