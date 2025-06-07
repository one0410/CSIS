import { ApplicationRef, ComponentRef, ElementRef, Injectable, createComponent } from '@angular/core';
import { SignaturePadComponent } from './signature-pad/signature-pad.component';

@Injectable({
  providedIn: 'root'
})
export class SignatureDialogService {
  private dialogComponentRef: ComponentRef<SignaturePadComponent> | null = null;
  private dialogContainer: HTMLElement | null = null;
  
  constructor(private appRef: ApplicationRef) {}
  
  open(): Promise<string | null> {
    // 如果已經有對話框打開，就直接返回
    if (this.dialogComponentRef) {
      return Promise.reject('對話框已經打開');
    }
    
    // 創建一個容器
    this.dialogContainer = document.createElement('div');
    this.dialogContainer.classList.add('modal');
    this.dialogContainer.classList.add('fade');
    this.dialogContainer.classList.add('show');
    this.dialogContainer.style.display = 'block';
    this.dialogContainer.style.backgroundColor = 'rgba(0, 0, 0, 0.5)';
    document.body.appendChild(this.dialogContainer);
    
    // 創建組件
    this.dialogComponentRef = createComponent(SignaturePadComponent, {
      environmentInjector: this.appRef.injector,
      hostElement: this.dialogContainer
    });
    
    // 附加到 ApplicationRef
    this.appRef.attachView(this.dialogComponentRef.hostView);
    
    return new Promise<string | null>((resolve) => {
      if (this.dialogComponentRef) {
        // 監聽保存事件
        this.dialogComponentRef.instance.saved.subscribe((base64Data: string) => {
          this.close();
          resolve(base64Data);
        });
        
        // 監聽關閉事件
        this.dialogComponentRef.instance.closed.subscribe(() => {
          this.close();
          resolve(null);
        });
      }
    });
  }
  
  private close(): void {
    if (this.dialogComponentRef) {
      // 分離視圖並銷毀組件
      this.appRef.detachView(this.dialogComponentRef.hostView);
      this.dialogComponentRef.destroy();
      
      // 移除容器
      if (this.dialogContainer && this.dialogContainer.parentNode) {
        this.dialogContainer.parentNode.removeChild(this.dialogContainer);
        this.dialogContainer = null;
      }
      
      this.dialogComponentRef = null;
    }
  }
} 