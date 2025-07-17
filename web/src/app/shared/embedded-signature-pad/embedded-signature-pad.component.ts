import { Component, ElementRef, EventEmitter, HostListener, Input, OnInit, Output, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import SignaturePad from 'signature_pad';

@Component({
  selector: 'app-embedded-signature-pad',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="signature-container" [class.disabled]="disabled">
      <canvas #signatureCanvas [class.disabled]="disabled"></canvas>
      <div class="text-center mt-2">
        <small class="text-muted">
          @if (disabled) {
            簽名功能已停用
          } @else {
            請使用滑鼠或手指進行簽名
          }
        </small>
      </div>
    </div>
  `,
  styles: [`
    .signature-container {
      width: 100%;
      border: 1px solid #ccc;
      border-radius: 4px;
      padding: 10px;
      background: white;
    }
    .signature-container.disabled {
      background: #f8f9fa;
      border-color: #dee2e6;
      opacity: 0.6;
    }
    canvas {
      display: block;
      width: 100%;
      height: 150px;
      border: 1px solid #e0e0e0;
      border-radius: 4px;
      touch-action: none;
      cursor: crosshair;
    }
    canvas.disabled {
      cursor: not-allowed;
      pointer-events: none;
    }
  `]
})
export class EmbeddedSignaturePadComponent implements OnInit {
  @ViewChild('signatureCanvas') signatureCanvas!: ElementRef<HTMLCanvasElement>;
  @Output() signatureComplete = new EventEmitter<string>();
  @Input() disabled = false;
  
  signaturePad!: SignaturePad;

  @HostListener('window:resize')
  onResize() {
    this.resizeCanvas();
  }

  ngOnInit(): void {
  }

  ngAfterViewInit(): void {
    this.initializeSignaturePad();
  }
  
  private initializeSignaturePad(): void {
    const canvas = this.signatureCanvas.nativeElement;
    const context = canvas.getContext('2d');
    
    // 計算設備的像素比例
    const devicePixelRatio = window.devicePixelRatio || 1;
    
    // 設置畫布尺寸
    const containerWidth = canvas.clientWidth;
    const containerHeight = 150;
    
    canvas.width = containerWidth * devicePixelRatio;
    canvas.height = containerHeight * devicePixelRatio;
    
    canvas.style.width = `${containerWidth}px`;
    canvas.style.height = `${containerHeight}px`;
    
    if (context) {
      context.scale(devicePixelRatio, devicePixelRatio);
    }
    
    // 創建簽名板實例
    this.signaturePad = new SignaturePad(canvas, {
      backgroundColor: 'rgb(255, 255, 255)',
      penColor: 'rgb(0, 0, 0)',
      velocityFilterWeight: 0.7,
      minWidth: 0.5,
      maxWidth: 2.5,
      throttle: 16
    });

    // 監聽簽名完成事件
    this.signaturePad.addEventListener('endStroke', () => {
      if (!this.disabled && !this.signaturePad.isEmpty()) {
        const dataURL = this.signaturePad.toDataURL('image/png');
        this.signatureComplete.emit(dataURL);
      }
    });
  }
  
  private resizeCanvas(): void {
    if (!this.signatureCanvas || !this.signaturePad) return;
    
    const canvas = this.signatureCanvas.nativeElement;
    const context = canvas.getContext('2d');
    
    // 保存當前簽名數據
    const data = this.signaturePad.toData();
    
    // 計算設備的像素比例
    const devicePixelRatio = window.devicePixelRatio || 1;
    
    // 設置新的畫布尺寸
    const containerWidth = canvas.clientWidth;
    const containerHeight = 150;
    
    canvas.width = containerWidth * devicePixelRatio;
    canvas.height = containerHeight * devicePixelRatio;
    
    canvas.style.width = `${containerWidth}px`;
    canvas.style.height = `${containerHeight}px`;
    
    if (context) {
      context.scale(devicePixelRatio, devicePixelRatio);
    }
    
    // 恢復簽名數據
    this.signaturePad.fromData(data);
  }

  clear(): void {
    if (!this.disabled && this.signaturePad) {
      this.signaturePad.clear();
      this.signatureComplete.emit('');
    }
  }

  isEmpty(): boolean {
    return this.signaturePad ? this.signaturePad.isEmpty() : true;
  }

  getSignatureData(): string {
    return this.signaturePad && !this.signaturePad.isEmpty() 
      ? this.signaturePad.toDataURL('image/png') 
      : '';
  }
} 