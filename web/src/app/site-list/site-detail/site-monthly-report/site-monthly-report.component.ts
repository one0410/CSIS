import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { MonthlyWorkerCountComponent } from './monthly-worker-count/monthly-worker-count.component';
import { MonthlyDefectSummaryComponent } from './monthly-defect-summary/monthly-defect-summary.component';
import { MonthlyExcellentContractorsComponent } from './monthly-excellent-contractors/monthly-excellent-contractors.component';
import dayjs from 'dayjs';

@Component({
  selector: 'app-site-monthly-report',
  standalone: true,
  imports: [CommonModule, FormsModule, MonthlyWorkerCountComponent, MonthlyDefectSummaryComponent, MonthlyExcellentContractorsComponent],
  templateUrl: './site-monthly-report.component.html',
  styleUrl: './site-monthly-report.component.scss'
})
export class SiteMonthlyReportComponent {
  siteId = signal<string>('');
  selectedMonth = signal<string>('');
  selectedMonthInput = signal<string>('');

  constructor(private route: ActivatedRoute) {
    this.siteId.set(this.route.snapshot.params['id']);
    
    // 初始化為當前月份
    const currentMonth = dayjs().format('YYYY-MM');
    this.selectedMonth.set(currentMonth + '-01'); // 月份第一天
    this.selectedMonthInput.set(currentMonth);
  }

  onMonthChange(): void {
    const monthInput = this.selectedMonthInput();
    if (monthInput) {
      // 轉換為該月第一天
      this.selectedMonth.set(monthInput + '-01');
    }
  }

  selectMonth(type: 'previous' | 'current'): void {
    let targetMonth: dayjs.Dayjs;
    
    if (type === 'previous') {
      targetMonth = dayjs().subtract(1, 'month');
    } else {
      targetMonth = dayjs();
    }
    
    const monthStr = targetMonth.format('YYYY-MM');
    this.selectedMonthInput.set(monthStr);
    this.selectedMonth.set(monthStr + '-01');
  }

  previousMonth(): void {
    const currentMonth = dayjs(this.selectedMonth());
    const prevMonth = currentMonth.subtract(1, 'month');
    const monthStr = prevMonth.format('YYYY-MM');
    this.selectedMonthInput.set(monthStr);
    this.selectedMonth.set(monthStr + '-01');
  }

  nextMonth(): void {
    const currentMonth = dayjs(this.selectedMonth());
    const nextMonth = currentMonth.add(1, 'month');
    const monthStr = nextMonth.format('YYYY-MM');
    this.selectedMonthInput.set(monthStr);
    this.selectedMonth.set(monthStr + '-01');
  }

  isCurrentMonth(): boolean {
    const selectedMonth = dayjs(this.selectedMonth());
    const currentMonth = dayjs();
    return selectedMonth.isSame(currentMonth, 'month');
  }

  isMonthSelected(type: 'previous' | 'current'): boolean {
    const selectedMonth = dayjs(this.selectedMonth());
    let compareMonth: dayjs.Dayjs;
    
    if (type === 'previous') {
      compareMonth = dayjs().subtract(1, 'month');
    } else {
      compareMonth = dayjs();
    }
    
    return selectedMonth.isSame(compareMonth, 'month');
  }

  getMonthDisplayString(monthStr: string): string {
    return dayjs(monthStr).format('YYYY年MM月');
  }
} 