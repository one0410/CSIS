import { Component, Input, OnChanges, OnInit, SimpleChanges } from '@angular/core';
import { CommonModule, DecimalPipe } from '@angular/common';

interface HeatLevel {
  label: string;
  minValue: number;
  maxValue: number;
  color: string;
  description: string;
}

@Component({
  selector: 'app-heat-index-gauge',
  standalone: true,
  imports: [CommonModule, DecimalPipe],
  templateUrl: './heat-index-gauge.component.html',
  styleUrl: './heat-index-gauge.component.scss'
})
export class HeatIndexGaugeComponent implements OnInit, OnChanges {
  @Input() temperature: number = 0;
  @Input() humidity: number = 0;

  heatIndex: number | null = null;
  displayHeatIndex: number = 26.7; // 顯示用的熱指數（已限制範圍）
  currentLevel: HeatLevel | null = null;
  needleRotation: number = -90; // 起始角度（左邊）

  // 熱指數範圍
  readonly MIN_HEAT_INDEX = 26.7;
  readonly MAX_HEAT_INDEX = 58.9;

  // 刻度值（調整為熱指數範圍，含小數點一位）
  readonly ticks = [26.7, 32.2, 40.6, 54.4, 58.9];

  // 預計算的刻度位置
  tickPositions: { value: number; x1: number; y1: number; x2: number; y2: number; textX: number; textY: number }[] = [];

  // 熱危害等級定義 (依據台灣勞動部標準，調整範圍)
  readonly levels: HeatLevel[] = [
    { label: '安全', minValue: 26.7, maxValue: 32.2, color: '#22c55e', description: '正常作業' },
    { label: '注意', minValue: 32.2, maxValue: 40.6, color: '#eab308', description: '注意補充水分' },
    { label: '警戒', minValue: 40.6, maxValue: 54.4, color: '#f97316', description: '減少戶外作業' },
    { label: '危險', minValue: 54.4, maxValue: 58.9, color: '#ef4444', description: '停止戶外作業' }
  ];

  ngOnInit(): void {
    this.calculateTickPositions();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['temperature'] || changes['humidity']) {
      this.calculateHeatIndex();
    }
  }

  private calculateTickPositions(): void {
    this.tickPositions = this.ticks.map(tick => {
      // 將刻度值映射到角度（26.7-58.9 對應 -90 到 90 度）
      const normalizedValue = (tick - this.MIN_HEAT_INDEX) / (this.MAX_HEAT_INDEX - this.MIN_HEAT_INDEX);
      const angleDegrees = -90 + normalizedValue * 180;
      const angle = (angleDegrees - 90) * Math.PI / 180;
      return {
        value: tick,
        x1: 100 + 65 * Math.cos(angle),
        y1: 100 + 65 * Math.sin(angle),
        x2: 100 + 75 * Math.cos(angle),
        y2: 100 + 75 * Math.sin(angle),
        // 文字放在弧形外側，距離更遠以避免與背景混淆
        textX: 100 + 95 * Math.cos(angle),
        textY: 100 + 95 * Math.sin(angle)
      };
    });
  }

  /**
   * 計算熱指數 (Heat Index) - 攝氏度版本
   * 基於 NOAA / Rothfusz 回歸公式轉換後的係數
   */
  private calculateHeatIndex(): void {
    const temp = this.temperature;
    const rh = this.humidity;

    // 基本有效性檢查
    if (rh < 0 || rh > 100) {
      this.heatIndex = null;
      this.displayHeatIndex = this.MIN_HEAT_INDEX;
      this.currentLevel = this.levels[0];
      this.needleRotation = -90;
      return;
    }

    let calculatedHI: number;

    // 當溫度低於約26.7°C 時，熱指數使用最低值
    if (temp < 26.7) {
      calculatedHI = this.MIN_HEAT_INDEX;
    } else {
      // NOAA 攝氏度近似公式係數
      const c1 = -8.784695;
      const c2 = 1.61139411;
      const c3 = 2.33854889;
      const c4 = -0.14611605;
      const c5 = -1.2308094e-2;
      const c6 = -1.6424828e-2;
      const c7 = 2.211732e-3;
      const c8 = 7.2546e-4;
      const c9 = -3.582e-6;

      calculatedHI =
        c1 +
        c2 * temp +
        c3 * rh +
        c4 * temp * rh +
        c5 * temp * temp +
        c6 * rh * rh +
        c7 * temp * temp * rh +
        c8 * temp * rh * rh +
        c9 * temp * temp * rh * rh;
    }

    // 保存原始計算值
    this.heatIndex = Math.round(calculatedHI * 10) / 10;

    // 限制顯示範圍在 26.7 到 58.9 之間
    this.displayHeatIndex = Math.max(this.MIN_HEAT_INDEX, Math.min(this.MAX_HEAT_INDEX, this.heatIndex));
    this.displayHeatIndex = Math.round(this.displayHeatIndex * 10) / 10;

    // 判斷等級
    this.currentLevel = this.getLevelForValue(this.displayHeatIndex);

    // 計算指針角度 (-90度到90度，對應26.7到58.9)
    this.needleRotation = this.calculateNeedleRotation(this.displayHeatIndex);
  }

  private getLevelForValue(value: number): HeatLevel {
    for (const level of this.levels) {
      if (value >= level.minValue && value < level.maxValue) {
        return level;
      }
    }
    return this.levels[this.levels.length - 1];
  }

  private calculateNeedleRotation(value: number): number {
    // 將值映射到 -90 到 90 度
    // 26.7 = -90度, 58.9 = 90度
    const minAngle = -90;
    const maxAngle = 90;

    const clampedValue = Math.max(this.MIN_HEAT_INDEX, Math.min(this.MAX_HEAT_INDEX, value));
    const percentage = (clampedValue - this.MIN_HEAT_INDEX) / (this.MAX_HEAT_INDEX - this.MIN_HEAT_INDEX);
    return minAngle + percentage * (maxAngle - minAngle);
  }

  // 計算每個等級的弧形路徑
  getArcPath(level: HeatLevel, index: number): string {
    const radius = 80;
    const centerX = 100;
    const centerY = 100;

    // 將值轉換為角度 (0-60°C 對應 -90 到 90 度)
    const startAngle = this.valueToAngle(level.minValue);
    const endAngle = this.valueToAngle(level.maxValue);

    return this.describeArc(centerX, centerY, radius, startAngle, endAngle);
  }

  private valueToAngle(value: number): number {
    // 26.7 = -90度, 58.9 = 90度
    const percentage = (value - this.MIN_HEAT_INDEX) / (this.MAX_HEAT_INDEX - this.MIN_HEAT_INDEX);
    return -90 + percentage * 180;
  }

  private describeArc(x: number, y: number, radius: number, startAngle: number, endAngle: number): string {
    const start = this.polarToCartesian(x, y, radius, endAngle);
    const end = this.polarToCartesian(x, y, radius, startAngle);
    const largeArcFlag = endAngle - startAngle <= 180 ? '0' : '1';

    return [
      'M', start.x, start.y,
      'A', radius, radius, 0, largeArcFlag, 0, end.x, end.y
    ].join(' ');
  }

  private polarToCartesian(centerX: number, centerY: number, radius: number, angleInDegrees: number): { x: number; y: number } {
    const angleInRadians = (angleInDegrees - 90) * Math.PI / 180;
    return {
      x: centerX + radius * Math.cos(angleInRadians),
      y: centerY + radius * Math.sin(angleInRadians)
    };
  }
}
