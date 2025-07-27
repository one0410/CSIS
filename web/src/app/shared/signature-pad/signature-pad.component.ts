import { Component, ElementRef, EventEmitter, HostListener, OnInit, Output, ViewChild, inject } from '@angular/core';

import SignaturePad from 'signature_pad';

@Component({
  selector: 'app-signature-pad',
  standalone: true,
  imports: [],
  template: `
    <div class="modal-dialog modal-dialog-centered">
      <div class="modal-content">
        <div class="modal-header">
          <h5 class="modal-title">請仔細閱讀後簽名</h5>
          <button type="button" class="btn-close" (click)="close()"></button>
        </div>
        <div class="modal-body">
          <div class="signature-container">
            <canvas #signatureCanvas></canvas>
          </div>
          <div class="text-muted small mt-2">
            <span>* 可使用滑鼠或手指進行簽名</span>
          </div>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-secondary" (click)="clear()">清除</button>
          <button type="button" class="btn btn-primary" (click)="save()" [disabled]="!signaturePad || signaturePad.isEmpty()">確認</button>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .signature-container {
      width: 100%;
      border: 1px solid #ccc;
      border-radius: 4px;
      margin-bottom: 10px;
      touch-action: none; /* 防止移動設備上的滾動干擾 */
    }
    canvas {
      display: block;
      border-radius: 4px;
      touch-action: none;
    }
  `]
})
export class SignaturePadComponent implements OnInit {
  @ViewChild('signatureCanvas') signatureCanvas!: ElementRef<HTMLCanvasElement>;
  @Output() saved = new EventEmitter<string>();
  @Output() closed = new EventEmitter<void>();
  
  signaturePad!: SignaturePad;

  // 監聽窗口大小變化
  @HostListener('window:resize')
  onResize() {
    this.resizeCanvas();
  }
  
  // 監聽 ESC 鍵關閉對話框
  @HostListener('document:keydown.escape')
  onEscapeKey() {
    this.close();
  }

  ngOnInit(): void {
  }

  ngAfterViewInit(): void {
    this.initializeSignaturePad();
  }
  
  private initializeSignaturePad(): void {
    // 初始化簽名板
    const canvas = this.signatureCanvas.nativeElement;
    const context = canvas.getContext('2d');
    
    // 獲取容器寬高
    const containerWidth = canvas.parentElement?.clientWidth || canvas.clientWidth;
    const containerHeight = 200; // 固定高度
    
    // 計算設備的像素比例
    const devicePixelRatio = window.devicePixelRatio || 1;
    
    // 設置畫布尺寸（實際尺寸）
    canvas.width = containerWidth * devicePixelRatio;
    canvas.height = containerHeight * devicePixelRatio;
    
    // 設置顯示尺寸（CSS 尺寸）
    canvas.style.width = `${containerWidth}px`;
    canvas.style.height = `${containerHeight}px`;
    
    // 縮放上下文以匹配設備像素比例
    if (context) {
      context.scale(devicePixelRatio, devicePixelRatio);
    }
    
    // 創建簽名板實例
    this.signaturePad = new SignaturePad(canvas, {
      backgroundColor: 'rgb(255, 255, 255)',
      penColor: 'rgb(0, 0, 0)',
      velocityFilterWeight: 0.7, // 調整筆劃平滑度
      minWidth: 0.5, // 最小筆劃寬度
      maxWidth: 2.5, // 最大筆劃寬度
      throttle: 16 // 控制繪製頻率，提高性能
    });
  }
  
  private resizeCanvas(): void {
    if (!this.signatureCanvas) return;
    
    const canvas = this.signatureCanvas.nativeElement;
    const context = canvas.getContext('2d');
    
    // 保存當前簽名數據
    const data = this.signaturePad.toData();
    
    // 獲取新的容器寬高
    const containerWidth = canvas.parentElement?.clientWidth || canvas.clientWidth;
    const containerHeight = 200; // 固定高度
    
    // 計算設備的像素比例
    const devicePixelRatio = window.devicePixelRatio || 1;
    
    // 設置新的畫布尺寸
    canvas.width = containerWidth * devicePixelRatio;
    canvas.height = containerHeight * devicePixelRatio;
    
    // 設置顯示尺寸
    canvas.style.width = `${containerWidth}px`;
    canvas.style.height = `${containerHeight}px`;
    
    // 縮放上下文
    if (context) {
      context.scale(devicePixelRatio, devicePixelRatio);
    }
    
    // 恢復簽名數據
    this.signaturePad.fromData(data);
  }

  clear(): void {
    this.signaturePad.clear();
  }

  save(): void {
    if (!this.signaturePad.isEmpty()) {
      const dataURL = this.signaturePad.toDataURL('image/png');
      this.saved.emit(dataURL);
    }
  }

  close(): void {
    this.closed.emit();
  }
} 