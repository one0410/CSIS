import { Component, OnInit, computed, ElementRef, ViewChild, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { CurrentSiteService } from '../../../services/current-site.service';
import { MongodbService } from '../../../services/mongodb.service';
import dayjs from 'dayjs';
import weekOfYear from 'dayjs/plugin/weekOfYear';
import isoWeek from 'dayjs/plugin/isoWeek';
import * as ExcelJS from 'exceljs';
import { ProjectTask } from '../site-progress/site-progress.component';

// 擴展 Day.js 功能
dayjs.extend(weekOfYear);
dayjs.extend(isoWeek);

interface ScheduleTask {
  _id?: string;
  wbs: string;
  name: string;
  days: number;
  startDate: string;
  endDate: string;
  weight: number; // 權重
  children?: ScheduleTask[];
  parent?: string;
  level: number;
  isExpanded?: boolean;
  dailyProgress?: { [date: string]: number };
}

type ViewMode = 'day' | 'week' | 'month';

interface ImportResult {
  success: boolean;
  message: string;
  details: string[];
  formattedErrors?: { wbs: string; name: string; errorType: string }[];
  moreErrors?: number;
  parsedTasks?: ScheduleTask[];
}

@Component({
  selector: 'app-new-schedule',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './new-schedule.component.html',
  styleUrl: './new-schedule.component.scss'
})
export class NewScheduleComponent implements OnInit {
  @ViewChild('fileInput') fileInput!: ElementRef<HTMLInputElement>;
  @ViewChild('tableContainer') tableContainer!: ElementRef<HTMLDivElement>;
  
  siteId: string = '';
  site = computed(() => this.currentSiteService.currentSite());
  
  tasks: ScheduleTask[] = [];
  flatTasks: ScheduleTask[] = []; // 扁平化的任務列表，用於顯示
  viewMode: ViewMode = 'month';
  
  // 日期相關
  startDate: Date = new Date();
  endDate: Date = new Date();
  dateColumns: string[] = [];
  monthGroups: { month: string; span: number }[] = [];
  
  // 編輯相關
  isEditing = false;
  editingTask: ScheduleTask | null = null;
  
  // 載入狀態 - 預設為 true，確保頁面載入時就顯示載入動畫
  isLoadingData = true;
  
  // 效能優化相關
  private refreshTimeout: any = null;
  
  // 進度編輯狀態追蹤
  private editingProgress = new Map<string, boolean>();
  
  // 匯入相關
  isProcessing = false;
  isCompleted = false;
  processProgress = 0;
  processStatus = '';
  importResult: ImportResult | null = null;
  selectedFile: File | null = null;
  importFileType: 'xml' | 'excel' = 'xml';

  // 向後相容
  selectedXmlFile: File | null = null;
  
  private mongodbService = inject(MongodbService);

  constructor(
    private route: ActivatedRoute,
    private currentSiteService: CurrentSiteService
  ) {}

  ngOnInit() {
    // 載入保存的檢視模式
    this.loadViewModeFromStorage();
    
    this.route.parent?.paramMap.subscribe(params => {
      this.siteId = params.get('id') || '';
      this.loadScheduleData();
    });
    
    // 初始化日期範圍
    this.initializeDateRange();
  }

  private initializeDateRange() {
    // 先設定預設日期範圍 - 使用 Day.js
    const now = dayjs();
    this.startDate = now.startOf('month').toDate();
    this.endDate = now.add(3, 'month').endOf('month').toDate();
    
    // 如果有任務資料，根據任務調整日期範圍
    if (this.flatTasks.length > 0) {
      this.calculateDateRangeFromTasks();
    }
    
    this.generateDateColumns();
  }

  // 根據任務計算日期範圍
  private calculateDateRangeFromTasks() {
    if (this.flatTasks.length === 0) return;
    
    let earliestStart: dayjs.Dayjs | null = null;
    let latestEnd: dayjs.Dayjs | null = null;
    
    // 找出所有任務的最早開始日和最晚結束日
    this.flatTasks.forEach(task => {
      if (task.startDate) {
        const taskStart = dayjs(task.startDate);
        if (!earliestStart || taskStart.isBefore(earliestStart)) {
          earliestStart = taskStart;
        }
      }
      
      if (task.endDate) {
        const taskEnd = dayjs(task.endDate);
        if (!latestEnd || taskEnd.isAfter(latestEnd)) {
          latestEnd = taskEnd;
        }
      }
    });
    
    // 設定日期範圍，並加上一些緩衝時間
    if (earliestStart) {
      // 從最早開始日的前7天開始
      this.startDate = (earliestStart as dayjs.Dayjs).subtract(7, 'day').toDate();
    }
    
    if (latestEnd) {
      // 到最晚結束日的後7天結束
      this.endDate = (latestEnd as dayjs.Dayjs).add(7, 'day').toDate();
    }
    
    console.log('根據任務計算的日期範圍:', {
      earliestStart: earliestStart ? (earliestStart as dayjs.Dayjs).format('YYYY-MM-DD') : null,
      latestEnd: latestEnd ? (latestEnd as dayjs.Dayjs).format('YYYY-MM-DD') : null,
      startDate: dayjs(this.startDate).format('YYYY-MM-DD'),
      endDate: dayjs(this.endDate).format('YYYY-MM-DD')
    });
  }

  private generateDateColumns() {
    this.dateColumns = [];
    let current = dayjs(this.startDate);
    const endDate = dayjs(this.endDate);
    
    while (current.isSameOrBefore(endDate)) {
      switch (this.viewMode) {
        case 'day':
          // 使用完整的年/月/日格式以避免跨年問題
          this.dateColumns.push(current.format('YYYY/M/D'));
          current = current.add(1, 'day');
          break;
        case 'week':
          // 使用 ISO 週數格式
          this.dateColumns.push(`W${current.isoWeek()}`);
          current = current.add(1, 'week');
          break;
        case 'month':
          this.dateColumns.push(current.format('YYYY/MM'));
          current = current.add(1, 'month');
          break;
      }
    }
    
    // 生成月份分組
    this.generateMonthGroups();
  }

  // 生成月份分組標題
  private generateMonthGroups() {
    this.monthGroups = [];
    const monthMap = new Map<string, number>();
    
    this.dateColumns.forEach(dateCol => {
      const monthKey = this.getMonthFromDateColumn(dateCol);
      monthMap.set(monthKey, (monthMap.get(monthKey) || 0) + 1);
    });
    
    monthMap.forEach((span, month) => {
      this.monthGroups.push({ month, span });
    });
  }

  // 從日期欄位獲取月份
  private getMonthFromDateColumn(dateCol: string): string {
    switch (this.viewMode) {
      case 'day': {
        const date = dayjs(dateCol, 'YYYY/M/D');
        return date.format('YYYY/MM');
      }
      case 'week': {
        // 週檢視需要根據週數推算月份
        const weekNum = parseInt(dateCol.replace('W', ''));
        const currentYear = dayjs().year();
        const weekDate = dayjs().year(currentYear).isoWeek(weekNum);
        return weekDate.format('YYYY/MM');
      }
      case 'month':
        return dateCol; // 月檢視直接返回年/月
      default:
        return '';
    }
  }

  // 獲取日期副標題
  getDateSubtitle(dateCol: string): string {
    switch (this.viewMode) {
      case 'day':
        const [, , day] = dateCol.split('/');
        return day;
      case 'week':
        return dateCol; // 顯示週數
      case 'month':
        // 顯示月份的起始和結束日
        const [year, month] = dateCol.split('/');
        const monthStart = new Date(parseInt(year), parseInt(month) - 1, 1);
        const monthEnd = new Date(parseInt(year), parseInt(month), 0);
        return `${monthStart.getDate()}-${monthEnd.getDate()}`;
      default:
        return dateCol;
    }
  }

  // 獲取週檢視的日期範圍
  getWeekDateRange(dateCol: string): string {
    if (this.viewMode !== 'week') return '';
    
    const weekNum = parseInt(dateCol.replace('W', ''));
    const currentYear = dayjs().year();
    const weekStart = dayjs().year(currentYear).isoWeek(weekNum).startOf('isoWeek');
    const weekEnd = weekStart.endOf('isoWeek');
    
    return `${weekStart.format('M/D')}-${weekEnd.format('M/D')}`;
  }

  // 獲取日期欄位的寬度
  getDateColumnWidth(): string {
    switch (this.viewMode) {
      case 'day':
        return '24px'; // 日檢視縮小
      case 'week':
        return '50px'; // 週檢視中等
      case 'month':
        return '80px'; // 月檢視較寬
      default:
        return '60px';
    }
  }

  // 計算表格總寬度
  getTableMinWidth(): string {
    const fixedColumnsWidth = 570; // WBS(90) + 內容(180) + 天數(50) + 開始日(100) + 結束日(100) + 權重(50)
    const dateColumnCount = this.dateColumns.length;
    
    let dateColumnWidth: number;
    switch (this.viewMode) {
      case 'day':
        dateColumnWidth = 24; // 日檢視
        break;
      case 'week':
        dateColumnWidth = 50; // 週檢視
        break;
      case 'month':
        dateColumnWidth = 80; // 月檢視
        break;
      default:
        dateColumnWidth = 60;
    }
    
    const totalDateColumnsWidth = dateColumnCount * dateColumnWidth;
    const totalWidth = fixedColumnsWidth + totalDateColumnsWidth;
    
    // 確保最小寬度不小於 800px
    return `${Math.max(totalWidth, 800)}px`;
  }

  // 移除了舊的 formatDate 和 getWeekNumber 方法，使用 Day.js 替代

  changeViewMode(mode: ViewMode) {
    // 清理編輯狀態
    this.editingProgress.clear();
    
    this.viewMode = mode;
    // 儲存檢視模式到 localStorage
    this.saveViewModeToStorage(mode);
    
    // 使用 setTimeout 避免阻塞 UI
    setTimeout(() => {
      // 重新計算日期範圍以適應新的檢視模式
      if (this.flatTasks.length > 0) {
        this.calculateDateRangeFromTasks();
      }
      this.generateDateColumns();
    }, 0);
  }

  // 載入檢視模式從 localStorage
  private loadViewModeFromStorage() {
    try {
      const savedViewMode = localStorage.getItem('schedule-view-mode');
      if (savedViewMode && ['day', 'week', 'month'].includes(savedViewMode)) {
        this.viewMode = savedViewMode as ViewMode;
      }
    } catch (error) {
      console.warn('無法載入檢視模式設定:', error);
      // 如果出錯，使用預設值
      this.viewMode = 'month';
    }
  }

  // 儲存檢視模式到 localStorage
  private saveViewModeToStorage(mode: ViewMode) {
    try {
      localStorage.setItem('schedule-view-mode', mode);
    } catch (error) {
      console.warn('無法儲存檢視模式設定:', error);
    }
  }

  // =============================================
  // 通用檔案匯入方法 (支援 XML 和 Excel)
  // =============================================

  // 通用檔案選擇方法
  onFileSelected(event: any) {
    const file = event.target.files[0];
    if (!file) return;

    if (this.importFileType === 'xml' && file.name.endsWith('.xml')) {
      this.selectedFile = file;
      this.selectedXmlFile = file;
      this.parseXmlFile(file);
    } else if (this.importFileType === 'excel' && (file.name.endsWith('.xlsx') || file.name.endsWith('.xls'))) {
      this.selectedFile = file;
      this.parseExcelFile(file);
    } else {
      alert(this.importFileType === 'xml' ? '請選擇 XML 檔案' : '請選擇 Excel 檔案 (.xlsx 或 .xls)');
    }
  }

  // 通用拖放方法
  onFileDragOver(event: DragEvent) {
    event.preventDefault();
    event.stopPropagation();
    const dropZone = event.target as HTMLElement;
    dropZone.classList.add('drag-over');
  }

  onFileDragLeave(event: DragEvent) {
    event.preventDefault();
    event.stopPropagation();
    const dropZone = event.target as HTMLElement;
    dropZone.classList.remove('drag-over');
  }

  onFileDrop(event: DragEvent) {
    event.preventDefault();
    event.stopPropagation();
    const dropZone = event.target as HTMLElement;
    dropZone.classList.remove('drag-over');

    const files = event.dataTransfer?.files;
    if (files && files.length > 0) {
      const file = files[0];
      if (this.importFileType === 'xml' && file.name.endsWith('.xml')) {
        this.selectedFile = file;
        this.selectedXmlFile = file;
        this.parseXmlFile(file);
      } else if (this.importFileType === 'excel' && (file.name.endsWith('.xlsx') || file.name.endsWith('.xls'))) {
        this.selectedFile = file;
        this.parseExcelFile(file);
      } else {
        alert(this.importFileType === 'xml' ? '請選擇 XML 檔案' : '請選擇 Excel 檔案 (.xlsx 或 .xls)');
      }
    }
  }

  // 通用執行匯入方法
  async executeImport() {
    if (this.importFileType === 'xml') {
      await this.executeXmlImport();
    } else {
      await this.executeExcelImport();
    }
  }

  // 關閉匯入 Modal
  closeImportModal() {
    this.isProcessing = false;
    this.isCompleted = false;
    this.processProgress = 0;
    this.processStatus = '';
    this.importResult = null;
    this.selectedFile = null;
    this.selectedXmlFile = null;
  }

  // =============================================
  // Excel 匯入相關方法
  // =============================================

  // 解析 Excel 檔案
  private async parseExcelFile(file: File) {
    try {
      this.isProcessing = true;
      this.processProgress = 10;
      this.processStatus = '正在讀取 Excel 檔案...';

      const arrayBuffer = await file.arrayBuffer();
      this.processProgress = 30;
      this.processStatus = '正在解析 Excel 內容...';

      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(arrayBuffer);

      const worksheet = workbook.worksheets[0];
      if (!worksheet) {
        throw new Error('找不到工作表');
      }

      this.processProgress = 50;
      this.processStatus = '正在分析任務資料...';

      // 找出欄位對應
      const headerRow = worksheet.getRow(1);
      const columnMap: { [key: string]: number } = {};

      headerRow.eachCell((cell, colNumber) => {
        const value = cell.value?.toString().trim() || '';
        if (value === 'WBS' || value === 'wbs') {
          columnMap['wbs'] = colNumber;
        } else if (value === '工作名稱' || value === '名稱' || value === 'Name' || value === 'name') {
          columnMap['name'] = colNumber;
        } else if (value === '開始日期' || value === '開始日' || value === 'Start' || value === 'start') {
          columnMap['start'] = colNumber;
        } else if (value === '結束日期' || value === '結束日' || value === 'End' || value === 'end' || value === 'Finish' || value === 'finish') {
          columnMap['end'] = colNumber;
        }
      });

      // 檢查必要欄位
      if (!columnMap['wbs'] || !columnMap['name'] || !columnMap['start'] || !columnMap['end']) {
        const missingCols = [];
        if (!columnMap['wbs']) missingCols.push('WBS');
        if (!columnMap['name']) missingCols.push('工作名稱');
        if (!columnMap['start']) missingCols.push('開始日期');
        if (!columnMap['end']) missingCols.push('結束日期');
        throw new Error(`Excel 檔案缺少必要欄位：${missingCols.join('、')}`);
      }

      this.processProgress = 70;
      this.processStatus = '正在處理任務項目...';

      const parsedTasks: ScheduleTask[] = [];
      const rowCount = worksheet.rowCount;

      // 從第二行開始讀取資料（跳過標題行）
      for (let rowNum = 2; rowNum <= rowCount; rowNum++) {
        const row = worksheet.getRow(rowNum);
        const wbs = this.getCellValue(row.getCell(columnMap['wbs']));
        const name = this.getCellValue(row.getCell(columnMap['name']));
        const startValue = row.getCell(columnMap['start']).value;
        const endValue = row.getCell(columnMap['end']).value;

        // 跳過空行
        if (!wbs || !name) continue;

        // 解析日期
        const startDate = this.parseExcelDate(startValue);
        const endDate = this.parseExcelDate(endValue);

        if (!startDate || !endDate) {
          console.warn(`行 ${rowNum} 的日期格式不正確，已跳過: WBS=${wbs}, start=${startValue}, end=${endValue}`);
          continue;
        }

        // 計算層級（根據 WBS 中的點號數量）
        const level = (wbs.match(/\./g) || []).length;

        // 計算天數
        const days = Math.max(1, dayjs(endDate).diff(dayjs(startDate), 'day') + 1);

        const scheduleTask: ScheduleTask = {
          wbs,
          name,
          days,
          startDate,
          endDate,
          weight: 1,
          level,
          dailyProgress: {}
        };

        parsedTasks.push(scheduleTask);
      }

      if (parsedTasks.length === 0) {
        throw new Error('Excel 檔案中沒有找到有效的任務資料');
      }

      this.processProgress = 90;
      this.processStatus = '完成解析';

      // 統計結果
      let updateTasks = 0;
      let newTasks = 0;
      let unchangedTasks = 0;

      parsedTasks.forEach(task => {
        const existingTasks = this.findAllTasksByWbs(task.wbs);

        if (existingTasks.length > 0) {
          const existingTask = existingTasks[0];
          const nameChanged = existingTask.name !== task.name;
          const startChanged = existingTask.startDate !== task.startDate;
          const endChanged = existingTask.endDate !== task.endDate;

          if (nameChanged || startChanged || endChanged || existingTasks.length > 1) {
            updateTasks++;
          } else {
            unchangedTasks++;
          }
        } else {
          newTasks++;
        }
      });

      const details: string[] = [];
      details.push(`總共解析 ${parsedTasks.length} 個任務`);
      details.push(`需要更新: ${updateTasks} 個`);
      details.push(`新增任務: ${newTasks} 個`);
      details.push(`無變更: ${unchangedTasks} 個 (將跳過)`);

      this.processProgress = 100;
      this.processStatus = '解析完成';

      this.importResult = {
        success: true,
        message: `Excel 檔案解析成功！發現 ${parsedTasks.length} 個任務項目。`,
        details,
        parsedTasks
      };

    } catch (error) {
      console.error('Excel 解析失敗:', error);
      this.importResult = {
        success: false,
        message: 'Excel 檔案解析失敗',
        details: [error instanceof Error ? error.message : '未知錯誤']
      };
    } finally {
      this.isProcessing = false;
    }
  }

  // 取得儲存格值
  private getCellValue(cell: ExcelJS.Cell): string {
    if (cell.value === null || cell.value === undefined) {
      return '';
    }
    return cell.value.toString().trim();
  }

  // 解析 Excel 日期
  private parseExcelDate(value: any): string | null {
    if (!value) return null;

    // 如果是 Date 物件
    if (value instanceof Date) {
      return dayjs(value).format('YYYY-MM-DD');
    }

    // 如果是數字（Excel 序列日期）
    if (typeof value === 'number') {
      // Excel 日期從 1900-01-01 開始，但有一個 bug：將 1900 當作閏年
      const excelEpoch = new Date(1899, 11, 30);
      const date = new Date(excelEpoch.getTime() + value * 24 * 60 * 60 * 1000);
      return dayjs(date).format('YYYY-MM-DD');
    }

    // 如果是字串，嘗試解析
    if (typeof value === 'string') {
      const parsed = dayjs(value);
      if (parsed.isValid()) {
        return parsed.format('YYYY-MM-DD');
      }
    }

    // 如果是 ExcelJS 的 richText 或其他物件
    if (typeof value === 'object' && value.text) {
      const parsed = dayjs(value.text);
      if (parsed.isValid()) {
        return parsed.format('YYYY-MM-DD');
      }
    }

    return null;
  }

  // 執行 Excel 匯入
  async executeExcelImport() {
    if (!this.importResult?.parsedTasks) {
      return;
    }

    try {
      this.isProcessing = true;
      this.processProgress = 0;
      this.processStatus = '開始匯入任務...';

      const parsedTasks = this.importResult.parsedTasks;
      let removedCount = 0;
      let newCount = 0;
      let skippedCount = 0;

      this.processProgress = 5;
      this.processStatus = `清理重複 WBS...`;

      // 先清理現有的重複 WBS
      const cleanedDuplicates = await this.cleanupDuplicateWbs();
      if (cleanedDuplicates > 0) {
        console.log(`清理了 ${cleanedDuplicates} 個重複的 WBS，已從資料庫中刪除`);
      }

      this.processProgress = 10;
      this.processStatus = `檢查任務差異...`;

      // 分析需要處理的任務
      const tasksToRemove: string[] = [];
      const tasksToAdd: ScheduleTask[] = [];
      const modifiedTaskIds: string[] = [];

      for (const task of parsedTasks) {
        const existingTasks = this.findAllTasksByWbs(task.wbs);

        if (existingTasks.length > 0) {
          if (existingTasks.length > 1) {
            console.log(`發現重複 WBS ${task.wbs}，共 ${existingTasks.length} 個，將全部移除`);
          }

          const existingTask = existingTasks[0];
          const nameChanged = existingTask.name !== task.name;
          const startChanged = existingTask.startDate !== task.startDate;
          const endChanged = existingTask.endDate !== task.endDate;

          if (nameChanged || startChanged || endChanged || existingTasks.length > 1) {
            tasksToRemove.push(task.wbs);
            tasksToAdd.push(task);
            modifiedTaskIds.push(task.wbs);
          } else {
            skippedCount++;
          }
        } else {
          tasksToAdd.push(task);
          modifiedTaskIds.push(task.wbs);
        }
      }

      this.processProgress = 20;
      this.processStatus = `移除需要更新的任務...`;

      // 移除需要更新的任務
      if (tasksToRemove.length > 0) {
        this.removeTasksByWbs(tasksToRemove);
        removedCount = tasksToRemove.length;

        this.rebuildTaskTree();
        this.flattenTasks();
      }

      this.processProgress = 40;
      this.processStatus = `開始匯入任務...`;

      // 新增需要處理的任務
      for (let i = 0; i < tasksToAdd.length; i++) {
        const task = tasksToAdd[i];
        const progress = 40 + Math.round(((i + 1) / tasksToAdd.length) * 30);
        this.processProgress = progress;
        this.processStatus = `正在匯入任務: ${task.name} (${i + 1}/${tasksToAdd.length})`;

        this.insertTaskInOrder(task);
        newCount++;

        await new Promise(resolve => setTimeout(resolve, 10));
      }

      // 只有在真的有變更時才進行後續處理和儲存
      if (tasksToAdd.length > 0) {
        this.processProgress = 75;
        this.processStatus = '重新建立任務結構...';

        // 重新建立樹狀結構
        this.rebuildTaskTree();

        this.processProgress = 80;
        this.processStatus = '重新計算父層任務日期（根據子任務）...';

        // 重新計算父層任務的日期和權重（關鍵步驟）
        this.recalculateParentTasks();

        this.flattenTasks();

        this.processProgress = 90;
        this.processStatus = '更新日期範圍...';

        this.calculateDateRangeFromTasks();
        this.generateDateColumns();

        this.processProgress = 95;
        this.processStatus = '儲存資料...';

        // 儲存所有任務（包含重新計算過日期的父任務）
        await this.saveAllTasks();
      } else {
        this.processProgress = 95;
        this.processStatus = '無需儲存（沒有變更）...';
      }

      this.processProgress = 100;
      this.processStatus = '匯入完成！';

      this.importResult = {
        success: true,
        message: `Excel 匯入完成！更新任務：${removedCount} 個，新增任務：${newCount - removedCount} 個，跳過未變更：${skippedCount} 個\n父層任務的日期已根據子任務自動重新計算。`,
        details: [
          `總處理任務: ${parsedTasks.length} 個`,
          `更新任務: ${removedCount} 個`,
          `新增任務: ${newCount - removedCount} 個`,
          `跳過未變更: ${skippedCount} 個`,
          `父層任務日期已自動重新計算`
        ]
      };

      this.isCompleted = true;

    } catch (error) {
      console.error('Excel 匯入失敗:', error);
      this.importResult = {
        success: false,
        message: 'Excel 匯入過程中發生錯誤',
        details: [error instanceof Error ? error.message : '未知錯誤']
      };
    } finally {
      this.isProcessing = false;
    }
  }

  // 儲存所有任務（用於 Excel 匯入後儲存重新計算過的父任務日期）
  private async saveAllTasks() {
    try {
      console.log('儲存所有任務...');

      for (const task of this.flatTasks) {
        if (task._id) {
          // 更新現有任務
          const updateData = {
            name: task.name,
            wbs: task.wbs,
            start: task.startDate,
            end: task.endDate,
            weight: task.weight,
            progressHistory: this.convertDailyProgressToHistory(task.dailyProgress || {})
          };

          await this.mongodbService.patch('task', task._id, updateData);
        } else {
          // 新增任務
          const newTaskData = {
            name: task.name,
            wbs: task.wbs,
            start: task.startDate,
            end: task.endDate,
            weight: task.weight,
            siteId: this.siteId,
            dependencies: '',
            progressHistory: this.convertDailyProgressToHistory(task.dailyProgress || {})
          };

          const result = await this.mongodbService.post('task', newTaskData);
          if (result && result._id) {
            task._id = result._id;
          }
        }
      }

      console.log(`已儲存 ${this.flatTasks.length} 個任務`);
    } catch (error) {
      console.error('儲存任務失敗:', error);
      throw error;
    }
  }

  // =============================================
  // XML 匯入相關方法 (原有方法保留)
  // =============================================

  // 新的檔案選擇方法 - 用於 Modal
  onXmlFileSelected(event: any) {
    const file = event.target.files[0];
    if (file && file.name.endsWith('.xml')) {
      this.selectedXmlFile = file;
      this.parseXmlFile(file);
    }
  }

  // 拖放相關方法
  onXmlDragOver(event: DragEvent) {
    event.preventDefault();
    event.stopPropagation();
    const dropZone = event.target as HTMLElement;
    dropZone.classList.add('drag-over');
  }

  onXmlDragLeave(event: DragEvent) {
    event.preventDefault();
    event.stopPropagation();
    const dropZone = event.target as HTMLElement;
    dropZone.classList.remove('drag-over');
  }

  onXmlDrop(event: DragEvent) {
    event.preventDefault();
    event.stopPropagation();
    const dropZone = event.target as HTMLElement;
    dropZone.classList.remove('drag-over');
    
    const files = event.dataTransfer?.files;
    if (files && files.length > 0) {
      const file = files[0];
      if (file.name.endsWith('.xml')) {
        this.selectedXmlFile = file;
        this.parseXmlFile(file);
      } else {
        alert('請選擇 XML 檔案');
      }
    }
  }

  // 初步解析 XML 檔案
  private async parseXmlFile(file: File) {
    try {
      this.isProcessing = true;
      this.processProgress = 10;
      this.processStatus = '正在讀取檔案...';
      
      const text = await file.text();
      this.processProgress = 30;
      this.processStatus = '正在解析 XML 結構...';
      
      const parser = new DOMParser();
      const xmlDoc = parser.parseFromString(text, 'text/xml');
      
      // 檢查是否有解析錯誤
      const parseError = xmlDoc.querySelector('parsererror');
      if (parseError) {
        throw new Error('XML 檔案格式不正確');
      }
      
      this.processProgress = 50;
      this.processStatus = '正在分析任務資料...';
      
      const tasks = xmlDoc.getElementsByTagName('Task');
      const parsedTasks: ScheduleTask[] = [];
      const details: string[] = [];
      
      this.processProgress = 70;
      this.processStatus = '正在處理任務項目...';
      
      for (let i = 0; i < tasks.length; i++) {
        const task = tasks[i];
        const wbs = task.getElementsByTagName('WBS')[0]?.textContent || '';
        const name = task.getElementsByTagName('Name')[0]?.textContent || '';
        const start = task.getElementsByTagName('Start')[0]?.textContent || '';
        const finish = task.getElementsByTagName('Finish')[0]?.textContent || '';
        const outlineLevel = parseInt(task.getElementsByTagName('OutlineLevel')[0]?.textContent || '0');
        
        if (name && wbs) {
          const startDate = dayjs(start);
          const endDate = dayjs(finish);
          const days = Math.floor(endDate.diff(startDate, 'day')) + 1;
          
          const scheduleTask: ScheduleTask = {
            wbs,
            name,
            days: days > 0 ? days : 1,
            startDate: startDate.format('YYYY-MM-DD'),
            endDate: endDate.format('YYYY-MM-DD'),
            weight: 1,
            level: outlineLevel,
            dailyProgress: {}
          };
          
          parsedTasks.push(scheduleTask);
        }
      }
      
      this.processProgress = 90;
      this.processStatus = '完成解析';
      
      // 統計結果 - 分析任務變更狀態
      let updateTasks = 0;
      let newTasks = 0;
      let unchangedTasks = 0;
      
      parsedTasks.forEach(task => {
        const existingTasks = this.findAllTasksByWbs(task.wbs);
        
        if (existingTasks.length > 0) {
          // 與第一個現有任務比較
          const existingTask = existingTasks[0];
          const nameChanged = existingTask.name !== task.name;
          const startChanged = existingTask.startDate !== task.startDate;
          const endChanged = existingTask.endDate !== task.endDate;
          
          if (nameChanged || startChanged || endChanged || existingTasks.length > 1) {
            updateTasks++;
          } else {
            unchangedTasks++;
          }
        } else {
          newTasks++;
        }
      });
      
      details.push(`總共解析 ${parsedTasks.length} 個任務`);
      details.push(`需要更新: ${updateTasks} 個`);
      details.push(`新增任務: ${newTasks} 個`);
      details.push(`無變更: ${unchangedTasks} 個 (將跳過)`);
      
      this.processProgress = 100;
      this.processStatus = '解析完成';
      
      this.importResult = {
        success: true,
        message: `XML 檔案解析成功！發現 ${parsedTasks.length} 個任務項目。`,
        details,
        parsedTasks
      };
      
    } catch (error) {
      console.error('XML 解析失敗:', error);
      this.importResult = {
        success: false,
        message: 'XML 檔案解析失敗',
        details: [error instanceof Error ? error.message : '未知錯誤']
      };
    } finally {
      this.isProcessing = false;
    }
  }

  // 執行實際匯入
  async executeXmlImport() {
    if (!this.importResult?.parsedTasks) {
      return;
    }
    
    try {
      this.isProcessing = true;
      this.processProgress = 0;
      this.processStatus = '開始匯入任務...';
      
      const parsedTasks = this.importResult.parsedTasks;
      let removedCount = 0;
      let newCount = 0;
      let skippedCount = 0;
      
      this.processProgress = 5;
      this.processStatus = `清理重複 WBS...`;
      
      // 先清理現有的重複 WBS
      const cleanedDuplicates = await this.cleanupDuplicateWbs();
      if (cleanedDuplicates > 0) {
        console.log(`清理了 ${cleanedDuplicates} 個重複的 WBS，已從資料庫中刪除`);
      }
      
      this.processProgress = 10;
      this.processStatus = `檢查任務差異...`;
      
      // 分析需要處理的任務
      const tasksToRemove: string[] = [];
      const tasksToAdd: ScheduleTask[] = [];
      const modifiedTaskIds: string[] = []; // 追蹤修改過的任務 ID
      
      for (const task of parsedTasks) {
        const existingTasks = this.findAllTasksByWbs(task.wbs);
        
        if (existingTasks.length > 0) {
          // 如果有多個相同 WBS，先全部移除
          if (existingTasks.length > 1) {
            console.log(`發現重複 WBS ${task.wbs}，共 ${existingTasks.length} 個，將全部移除`);
          }
          
          // 與第一個現有任務比較（如果有多個重複的話）
          const existingTask = existingTasks[0];
          const nameChanged = existingTask.name !== task.name;
          const startChanged = existingTask.startDate !== task.startDate;
          const endChanged = existingTask.endDate !== task.endDate;
          
          if (nameChanged || startChanged || endChanged || existingTasks.length > 1) {
            // 有變更或有重複，需要移除所有舊的並新增新的
            tasksToRemove.push(task.wbs);
            tasksToAdd.push(task);
            // 記錄將要新增的任務（用 WBS 標識）
            modifiedTaskIds.push(task.wbs);
          } else {
            // 沒有變更且只有一個，跳過
            skippedCount++;
          }
        } else {
          // 新任務，直接新增
          tasksToAdd.push(task);
          // 記錄新任務（用 WBS 標識）
          modifiedTaskIds.push(task.wbs);
        }
      }
      
      this.processProgress = 20;
      this.processStatus = `移除需要更新的任務...`;
      
      // 移除需要更新的任務
      if (tasksToRemove.length > 0) {
        this.removeTasksByWbs(tasksToRemove);
        removedCount = tasksToRemove.length;
        
        // 重新建立樹狀結構和扁平化，確保移除操作生效
        this.rebuildTaskTree();
        this.flattenTasks();
      }
      
      this.processProgress = 40;
      this.processStatus = `開始匯入任務...`;
      
      // 新增需要處理的任務
      for (let i = 0; i < tasksToAdd.length; i++) {
        const task = tasksToAdd[i];
        const progress = 40 + Math.round(((i + 1) / tasksToAdd.length) * 40); // 40-80% 用於處理任務
        this.processProgress = progress;
        this.processStatus = `正在匯入任務: ${task.name} (${i + 1}/${tasksToAdd.length})`;
        
        this.insertTaskInOrder(task);
        newCount++;
        
        // 模擬處理時間
        await new Promise(resolve => setTimeout(resolve, 10));
      }
      
      // 只有在真的有變更時才進行後續處理和儲存
      if (tasksToAdd.length > 0) {
        this.processProgress = 85;
        this.processStatus = '重新計算任務關係...';
        
        // 重新建立樹狀結構
        this.rebuildTaskTree();
        
        // 重新計算父層任務的日期和權重
        this.recalculateParentTasks();
        
        this.flattenTasks();
        
        this.processProgress = 90;
        this.processStatus = '更新日期範圍...';
        
        // 重新計算日期範圍
        this.calculateDateRangeFromTasks();
        this.generateDateColumns();
        
        this.processProgress = 95;
        this.processStatus = '儲存資料...';
        
        // 只儲存修改過的任務
        await this.saveModifiedTasks(modifiedTaskIds);
      } else {
        // 沒有變更，直接跳到完成
        this.processProgress = 95;
        this.processStatus = '無需儲存（沒有變更）...';
      }
      
      this.processProgress = 100;
      this.processStatus = '匯入完成！';
      
      // 更新結果
      this.importResult = {
        success: true,
        message: `XML 匯入完成！更新任務：${removedCount} 個，新增任務：${newCount - removedCount} 個，跳過未變更：${skippedCount} 個`,
        details: [
          `總處理任務: ${parsedTasks.length} 個`,
          `更新任務: ${removedCount} 個`,
          `新增任務: ${newCount - removedCount} 個`,
          `跳過未變更: ${skippedCount} 個`
        ]
      };
      
      this.isCompleted = true;
      
    } catch (error) {
      console.error('XML 匯入失敗:', error);
      this.importResult = {
        success: false,
        message: 'XML 匯入過程中發生錯誤',
        details: [error instanceof Error ? error.message : '未知錯誤']
      };
    } finally {
      this.isProcessing = false;
    }
  }

  // 關閉 Modal
  closeXmlModal() {
    // 重置狀態
    this.isProcessing = false;
    this.isCompleted = false;
    this.processProgress = 0;
    this.processStatus = '';
    this.importResult = null;
    this.selectedXmlFile = null;
  }

  /** @deprecated 已棄用，請使用新的智能匯入流程：parseXmlFile() → executeXmlImport() */
  private async importXmlFile(file: File) {
    try {
      const text = await file.text();
      const parser = new DOMParser();
      const xmlDoc = parser.parseFromString(text, 'text/xml');
      
      const tasks = xmlDoc.getElementsByTagName('Task');
      let updatedCount = 0;
      let newCount = 0;
      
      for (let i = 0; i < tasks.length; i++) {
        const task = tasks[i];
        const wbs = task.getElementsByTagName('WBS')[0]?.textContent || '';
        const name = task.getElementsByTagName('Name')[0]?.textContent || '';
        const start = task.getElementsByTagName('Start')[0]?.textContent || '';
        const finish = task.getElementsByTagName('Finish')[0]?.textContent || '';
        const outlineLevel = parseInt(task.getElementsByTagName('OutlineLevel')[0]?.textContent || '0');
        
        if (name && wbs) {
          const startDate = dayjs(start);
          const endDate = dayjs(finish);
          const days = Math.floor(endDate.diff(startDate, 'day')) + 1; // 包含開始日當天，確保為整數
          
          // 尋找現有的任務（以WBS為ID）
          const existingTask = this.findTaskByWbs(wbs);
          
          if (existingTask) {
            // 更新現有任務的內容、開始日期和結束日期
            existingTask.name = name;
            existingTask.startDate = startDate.format('YYYY-MM-DD');
            existingTask.endDate = endDate.format('YYYY-MM-DD');
            existingTask.days = days > 0 ? days : 1;
            // 保持原有的權重值，不更新
            updatedCount++;
          } else {
            // 如果找不到對應的WBS，創建新任務
            const newTask: ScheduleTask = {
              wbs,
              name,
              days: days > 0 ? days : 1,
              startDate: startDate.format('YYYY-MM-DD'),
              endDate: endDate.format('YYYY-MM-DD'),
              weight: 1, // 新任務權重設為1（預設值）
              level: outlineLevel,
              dailyProgress: {}
            };
            
            // 將新任務加入到適當的位置
            this.insertTaskInOrder(newTask);
            newCount++;
          }
        }
      }
      
      // 重新建立樹狀結構
      this.rebuildTaskTree();
      
      // 重新計算父層任務的日期和權重
      this.recalculateParentTasks();
      
      this.flattenTasks();
      
      // 重新計算日期範圍
      this.calculateDateRangeFromTasks();
      this.generateDateColumns();
      
      // 儲存更新後的資料
      await this.saveScheduleData();
      
      // 顯示匯入結果
      alert(`XML 匯入完成！\n更新任務：${updatedCount} 個\n新增任務：${newCount} 個`);
      
    } catch (error) {
      console.error('XML 匯入失敗:', error);
      alert('XML 檔案匯入失敗，請檢查檔案格式');
    }
  }

  private buildTaskTree(tasks: ScheduleTask[]): ScheduleTask[] {
    const tree: ScheduleTask[] = [];
    const taskMap = new Map<string, ScheduleTask>();
    
    // 先將所有任務加入 map
    tasks.forEach(task => {
      taskMap.set(task.wbs, { ...task, children: [], isExpanded: true });
    });
    
    // 建立親子關係
    tasks.forEach(task => {
      const currentTask = taskMap.get(task.wbs)!;
      
      if (task.level === 0) {
        tree.push(currentTask);
      } else {
        // 找到父任務
        const parentWbs = this.findParentWbs(task.wbs, tasks);
        const parent = taskMap.get(parentWbs);
        if (parent) {
          parent.children = parent.children || [];
          parent.children.push(currentTask);
          currentTask.parent = parentWbs;
        }
      }
    });
    
    return tree;
  }

  private findParentWbs(currentWbs: string, tasks: ScheduleTask[]): string {
    const currentLevel = tasks.find(t => t.wbs === currentWbs)?.level || 0;
    const parentLevel = currentLevel - 1;
    
    // 在任務列表中往前找到同等級或更高等級的任務
    const currentIndex = tasks.findIndex(t => t.wbs === currentWbs);
    for (let i = currentIndex - 1; i >= 0; i--) {
      if (tasks[i].level === parentLevel) {
        return tasks[i].wbs;
      }
    }
    return '';
  }

  private flattenTasks() {
    this.flatTasks = [];
    this.flattenTasksRecursive(this.tasks);
    
    // 去除重複的 WBS，保留最後一個
    const uniqueTasks: ScheduleTask[] = [];
    const seenWbs = new Set<string>();
    
    // 從後往前遍歷，確保保留最後出現的任務
    for (let i = this.flatTasks.length - 1; i >= 0; i--) {
      const task = this.flatTasks[i];
      if (!seenWbs.has(task.wbs)) {
        seenWbs.add(task.wbs);
        uniqueTasks.unshift(task); // 插入到前面，保持原有順序
      }
    }
    
    this.flatTasks = uniqueTasks;
  }

  private flattenTasksRecursive(tasks: ScheduleTask[]) {
    tasks.forEach(task => {
      this.flatTasks.push(task);
      if (task.children && task.children.length > 0 && task.isExpanded) {
        this.flattenTasksRecursive(task.children);
      }
    });
  }

  toggleTaskExpansion(task: ScheduleTask) {
    task.isExpanded = !task.isExpanded;
    
    // 使用 requestAnimationFrame 確保在下一個渲染週期執行
    requestAnimationFrame(() => {
      this.fastRefreshDisplayedTasks();
    });
  }

  // 快速刷新顯示的任務列表，避免重新計算所有任務
  private fastRefreshDisplayedTasks() {
    // 清除之前的 timeout
    if (this.refreshTimeout) {
      clearTimeout(this.refreshTimeout);
    }
    
    // 使用 setTimeout 避免頻繁的重新計算
    this.refreshTimeout = setTimeout(() => {
      // 只重新計算 flatTasks，不觸發其他耗時操作
      this.flatTasks = [];
      this.flattenTasksRecursive(this.tasks);
      
      this.refreshTimeout = null;
    }, 0); // 立即執行但不阻塞 UI
  }

  isDateInRange(task: ScheduleTask, dateColumn: string): boolean {
    // 將任務日期轉換為 Day.js 物件
    const taskStart = dayjs(task.startDate).startOf('day');
    const taskEnd = dayjs(task.endDate).endOf('day');
    
    switch (this.viewMode) {
      case 'day': {
        const checkDate = dayjs(dateColumn, 'YYYY/M/D');
        return checkDate.isSameOrAfter(taskStart, 'day') && checkDate.isSameOrBefore(taskEnd, 'day');
      }
        
      case 'week': {
        const weekNum = parseInt(dateColumn.replace('W', ''));
        const currentYear = taskStart.year();
        const weekStart = dayjs().year(currentYear).isoWeek(weekNum).startOf('isoWeek');
        const weekEnd = weekStart.endOf('isoWeek');
        return !(taskEnd.isBefore(weekStart, 'day') || taskStart.isAfter(weekEnd, 'day'));
      }
        
      case 'month': {
        const monthDate = dayjs(dateColumn, 'YYYY/MM');
        const monthStart = monthDate.startOf('month');
        const monthEnd = monthDate.endOf('month');
        return !(taskEnd.isBefore(monthStart, 'day') || taskStart.isAfter(monthEnd, 'day'));
      }
        
      default:
        return false;
    }
  }

  getProgressForDate(task: ScheduleTask, dateColumn: string): number {
    if (!task.dailyProgress) return 0;
    
    // 根據檢視模式轉換日期格式
    let dateKey = '';
    switch (this.viewMode) {
      case 'day':
        const date = dayjs(dateColumn, 'YYYY/M/D');
        dateKey = date.format('YYYY-MM-DD');
        break;
      case 'month':
        dateKey = dateColumn; // 直接使用月份字符串
        break;
    }
    
    return task.dailyProgress[dateKey] || 0;
  }

  // 獲取顯示用的進度值（工作期間外且為0時返回空字符串）
  getDisplayProgressForDate(task: ScheduleTask, dateColumn: string): string {
    const progress = this.getProgressForDate(task, dateColumn);
    const isInRange = this.isDateInRange(task, dateColumn);
    
    // 如果是工作期間外且進度為0，則返回空字符串
    if (!isInRange && progress === 0) {
      return '';
    }
    
    return progress.toString();
  }

  // 判斷是否為當前日期/週/月
  isCurrentDate(dateColumn: string): boolean {
    const today = dayjs();
    
    switch (this.viewMode) {
      case 'day': {
        const checkDate = dayjs(dateColumn, 'YYYY/M/D');
        return checkDate.isSame(today, 'day');
      }
      case 'week': {
        const weekNum = parseInt(dateColumn.replace('W', ''));
        const currentWeek = today.isoWeek();
        return weekNum === currentWeek;
      }
      case 'month': {
        const monthDate = dayjs(dateColumn, 'YYYY/MM');
        return monthDate.isSame(today, 'month');
      }
      default:
        return false;
    }
  }

  async updateProgress(task: ScheduleTask, dateColumn: string, progress: number) {
    if (!task.dailyProgress) {
      task.dailyProgress = {};
    }
    
    let dateKey = '';
    switch (this.viewMode) {
      case 'day':
        const date = dayjs(dateColumn, 'YYYY/M/D');
        dateKey = date.format('YYYY-MM-DD');
        break;
      case 'month':
        dateKey = dateColumn;
        break;
    }
    
    task.dailyProgress[dateKey] = Math.max(0, Math.min(100, progress));
    
    // 只儲存當前任務和其父任務
    await this.saveTaskAndParents(task);
  }

  addNewTask(parentTask?: ScheduleTask) {
    const today = dayjs();
    let newWbs: string;
    let newLevel: number;
    
    if (parentTask) {
      // 新增子任務
      newWbs = this.generateChildWbs(parentTask.wbs);
      newLevel = parentTask.level + 1;
    } else {
      // 新增頂層任務
      newWbs = this.generateNewWbs();
      newLevel = 0;
    }
    
    const newTask: ScheduleTask = {
      wbs: newWbs,
      name: '新工作項目',
      days: 1,
      startDate: today.format('YYYY-MM-DD'),
      endDate: today.format('YYYY-MM-DD'),
      weight: 1,
      level: newLevel,
      dailyProgress: {}
    };
    
    if (parentTask) {
      // 將新任務加入父任務的子任務列表
      if (!parentTask.children) {
        parentTask.children = [];
      }
      parentTask.children.push(newTask);
      newTask.parent = parentTask.wbs;
      
      // 確保父任務是展開狀態，這樣新任務才會顯示
      parentTask.isExpanded = true;
    } else {
      // 加入頂層任務列表
      this.tasks.push(newTask);
    }
    
    // 重新計算父層任務的日期和權重
    this.recalculateParentTasks();
    
    this.flattenTasks();
    
    // 重新計算日期範圍
    this.calculateDateRangeFromTasks();
    this.generateDateColumns();
    
    // 如果是新增頂層任務，滾動到表格底部
    if (!parentTask) {
      this.scrollToBottom();
    }
  }

  private generateNewWbs(): string {
    const maxWbs = this.flatTasks.reduce((max, task) => {
      const num = parseInt(task.wbs) || 0;
      return Math.max(max, num);
    }, 0);
    return (maxWbs + 1).toString();
  }

  private generateChildWbs(parentWbs: string): string {
    // 找出所有以 parentWbs 開頭的直接子任務（只差一層）
    const directChildTasks = this.flatTasks.filter(task => {
      const taskWbs = task.wbs;
      if (!taskWbs.startsWith(parentWbs + '.')) {
        return false;
      }
      
      // 檢查是否為直接子任務（只有一個點號分隔）
      const remainingPart = taskWbs.substring(parentWbs.length + 1);
      return !remainingPart.includes('.');
    });
    
    if (directChildTasks.length === 0) {
      // 如果沒有子任務，生成第一個子任務的 WBS
      return `${parentWbs}.1`;
    }
    
    // 找出最大的子任務編號
    const maxChildNum = directChildTasks.reduce((max, task) => {
      const childWbs = task.wbs;
      const childNumStr = childWbs.substring(parentWbs.length + 1); // 移除父 WBS 和點號
      const childNum = parseInt(childNumStr) || 0;
      return Math.max(max, childNum);
    }, 0);
    
    return `${parentWbs}.${maxChildNum + 1}`;
  }

  // 滾動到表格底部
  private scrollToBottom(): void {
    // 使用 setTimeout 確保 DOM 更新完成後再滾動
    setTimeout(() => {
      if (this.tableContainer && this.tableContainer.nativeElement) {
        const container = this.tableContainer.nativeElement;
        container.scrollTop = container.scrollHeight;
        
        // 添加視覺反饋，讓使用者知道新增了任務
        this.highlightNewTask();
      }
    }, 100);
  }

  // 高亮新任務（視覺反饋）
  private highlightNewTask(): void {
    // 找到最後一個任務（新新增的任務）
    const lastTask = this.flatTasks[this.flatTasks.length - 1];
    if (lastTask) {
      // 可以添加一些視覺效果，比如臨時改變背景色
      // 這裡我們使用 CSS 動畫來實現
      const taskElement = document.querySelector(`[data-task-wbs="${lastTask.wbs}"]`);
      if (taskElement) {
        taskElement.classList.add('new-task-highlight');
        setTimeout(() => {
          taskElement.classList.remove('new-task-highlight');
        }, 2000);
      }
    }
  }

  deleteTask(task: ScheduleTask) {
    if (confirm(`確定要刪除工作項目「${task.name}」嗎？`)) {
      this.removeTaskFromTree(this.tasks, task);
      this.flattenTasks();
      this.saveScheduleData();
      
      // 如果在編輯模式中刪除，關閉編輯對話框
      if (this.isEditing && this.editingTask?.wbs === task.wbs) {
        this.cancelEdit();
      }
    }
  }

  private removeTaskFromTree(tasks: ScheduleTask[], taskToRemove: ScheduleTask): boolean {
    const index = tasks.findIndex(t => t.wbs === taskToRemove.wbs);
    if (index !== -1) {
      tasks.splice(index, 1);
      return true;
    }
    
    for (const task of tasks) {
      if (task.children && this.removeTaskFromTree(task.children, taskToRemove)) {
        return true;
      }
    }
    return false;
  }

  editTask(task: ScheduleTask) {
    this.editingTask = { ...task };
    this.isEditing = true;
  }

  saveEdit() {
    if (this.editingTask) {
      const original = this.findTaskByWbs(this.editingTask.wbs);
      if (original) {
        Object.assign(original, this.editingTask);
        this.flattenTasks();
        this.saveScheduleData();
      }
    }
    this.cancelEdit();
  }

  cancelEdit() {
    this.isEditing = false;
    this.editingTask = null;
  }

  // 儲存單一欄位變更（帶欄位類型）
  saveTaskFieldWithType(task: ScheduleTask, fieldType: 'days' | 'startDate' | 'endDate' | 'content' | 'weight') {
    if (fieldType === 'days') {
      // 如果修改天數，重新計算結束日期
      if (task.startDate && task.days && task.days > 0) {
        const startDate = dayjs(task.startDate);
        const endDate = startDate.add(task.days - 1, 'day'); // 減1因為包含開始日當天
        task.endDate = endDate.format('YYYY-MM-DD');
      }
    } else if (fieldType === 'startDate' || fieldType === 'endDate') {
      // 如果修改開始日或結束日，重新計算天數
      if (task.startDate && task.endDate) {
        const startDate = dayjs(task.startDate);
        const endDate = dayjs(task.endDate);
        const days = Math.floor(endDate.diff(startDate, 'day')) + 1; // 包含開始日當天，確保為整數
        if (days > 0) {
          task.days = days;
        } else {
          // 如果結束日早於開始日，自動調整結束日
          task.endDate = task.startDate;
          task.days = 1;
        }
      }
    }
    
    // 重新計算所有父層任務的日期和權重
    this.recalculateParentTasks();
    
    // 重新扁平化任務以更新顯示
    this.flattenTasks();
    
    // 重新計算日期範圍
    this.calculateDateRangeFromTasks();
    this.generateDateColumns();
    
    // 即時儲存到資料庫
    this.saveScheduleData();
  }

  // 儲存單一欄位變更（保留原方法以兼容其他調用）
  saveTaskField(task: ScheduleTask) {
    this.saveTaskFieldWithType(task, 'content');
  }

  private findTaskByWbs(wbs: string): ScheduleTask | null {
    return this.flatTasks.find(task => task.wbs === wbs) || null;
  }

  // 找到所有相同 WBS 的任務
  private findAllTasksByWbs(wbs: string): ScheduleTask[] {
    return this.flatTasks.filter(task => task.wbs === wbs);
  }

  // 清理重複的 WBS（保留第一個，移除其餘的）
  private async cleanupDuplicateWbs(): Promise<number> {
    // 建立 WBS 分組對應表
    const wbsGroups = new Map<string, ScheduleTask[]>();
    
    // 將任務按 WBS 分組
    this.flatTasks.forEach(task => {
      if (!wbsGroups.has(task.wbs)) {
        wbsGroups.set(task.wbs, []);
      }
      wbsGroups.get(task.wbs)!.push(task);
    });

    let totalDeletedCount = 0;
    const duplicateWbsList: string[] = [];

    // 找出有重複的 WBS
    for (const [wbs, tasks] of wbsGroups.entries()) {
      if (tasks.length > 1) {
        duplicateWbsList.push(wbs);
        console.log(`發現重複 WBS "${wbs}": 共 ${tasks.length} 個任務`);
        
        // 保留第一個，刪除其餘的
        for (let i = 1; i < tasks.length; i++) {
          const taskToDelete = tasks[i];
          
          try {
            console.log(`刪除重複任務: ${taskToDelete.name} (WBS: ${taskToDelete.wbs}, ID: ${taskToDelete._id})`);
            
            // 從資料庫中刪除任務
            if (taskToDelete._id) {
              await this.mongodbService.delete('task', taskToDelete._id);
              console.log(`✅ 已從資料庫刪除: ${taskToDelete.name}`);
            }
            
            // 從記憶體中移除
            this.removeTaskFromTree(this.tasks, taskToDelete);
            totalDeletedCount++;
            
          } catch (error) {
            console.error(`❌ 刪除任務失敗: ${taskToDelete.name}`, error);
          }
        }
        
        console.log(`WBS "${wbs}" 清理完成，保留: ${tasks[0].name}，刪除: ${tasks.length - 1} 個`);
      }
    }

    // 如果有刪除任務，重新建立結構
    if (totalDeletedCount > 0) {
      console.log(`=== 重複 WBS 清理完成 ===`);
      console.log(`重複的 WBS: ${duplicateWbsList.join(', ')}`);
      console.log(`總共刪除: ${totalDeletedCount} 個重複任務`);
      
      // 重新建立結構
      this.rebuildTaskTree();
      this.flattenTasks();
      
      console.log(`清理後剩餘任務數量: ${this.flatTasks.length}`);
    } else {
      console.log('沒有發現重複的 WBS');
    }

    return totalDeletedCount;
  }

  // 從原始資料清理重複 WBS（用於載入階段）
  private async cleanupDuplicateWbsFromRawData(tasks: ScheduleTask[]): Promise<number> {
    // 建立 WBS 分組對應表
    const wbsGroups = new Map<string, ScheduleTask[]>();
    
    // 將任務按 WBS 分組
    tasks.forEach(task => {
      if (!wbsGroups.has(task.wbs)) {
        wbsGroups.set(task.wbs, []);
      }
      wbsGroups.get(task.wbs)!.push(task);
    });

    let totalDeletedCount = 0;
    const duplicateWbsList: string[] = [];
    const tasksToDeleteFromArray: ScheduleTask[] = [];

    // 找出有重複的 WBS
    for (const [wbs, tasksWithSameWbs] of wbsGroups.entries()) {
      if (tasksWithSameWbs.length > 1) {
        duplicateWbsList.push(wbs);
        console.log(`發現重複 WBS "${wbs}": 共 ${tasksWithSameWbs.length} 個任務`);
        
        // 保留第一個，刪除其餘的
        for (let i = 1; i < tasksWithSameWbs.length; i++) {
          const taskToDelete = tasksWithSameWbs[i];
          
          try {
            console.log(`刪除重複任務: ${taskToDelete.name} (WBS: ${taskToDelete.wbs}, ID: ${taskToDelete._id})`);
            
            // 從資料庫中刪除任務
            if (taskToDelete._id) {
              await this.mongodbService.delete('task', taskToDelete._id);
              console.log(`✅ 已從資料庫刪除: ${taskToDelete.name}`);
            }
            
            // 記錄需要從陣列中移除的任務
            tasksToDeleteFromArray.push(taskToDelete);
            totalDeletedCount++;
            
          } catch (error) {
            console.error(`❌ 刪除任務失敗: ${taskToDelete.name}`, error);
          }
        }
        
        console.log(`WBS "${wbs}" 清理完成，保留: ${tasksWithSameWbs[0].name}，刪除: ${tasksWithSameWbs.length - 1} 個`);
      }
    }

    // 從 tasks 陣列中移除已刪除的任務
    tasksToDeleteFromArray.forEach(taskToDelete => {
      const index = tasks.findIndex(t => t._id === taskToDelete._id);
      if (index !== -1) {
        tasks.splice(index, 1);
      }
    });

    // 顯示清理結果
    if (totalDeletedCount > 0) {
      console.log(`=== 原始資料重複 WBS 清理完成 ===`);
      console.log(`重複的 WBS: ${duplicateWbsList.join(', ')}`);
      console.log(`總共刪除: ${totalDeletedCount} 個重複任務`);
      console.log(`清理後原始資料數量: ${tasks.length}`);
    } else {
      console.log('原始資料中沒有發現重複的 WBS');
    }

    return totalDeletedCount;
  }

  // 手動清理重複 WBS 的公開方法
  async manualCleanupDuplicateWbs() {
    if (this.isProcessing) {
      return;
    }

    try {
      this.isProcessing = true;
      this.processProgress = 0;
      this.processStatus = '正在清理重複 WBS...';

      const duplicatesRemoved = await this.cleanupDuplicateWbs();

      this.processProgress = 100;
      
      if (duplicatesRemoved > 0) {
        this.processStatus = `清理完成！移除了 ${duplicatesRemoved} 個重複項目`;
        
        // 重新計算日期範圍
        this.calculateDateRangeFromTasks();
        this.generateDateColumns();
        
        // 顯示成功訊息
        alert(`清理完成！成功移除了 ${duplicatesRemoved} 個重複的 WBS 項目。`);
      } else {
        this.processStatus = '沒有發現重複的 WBS';
        alert('沒有發現重複的 WBS 項目。');
      }

      // 清除狀態
      setTimeout(() => {
        this.processStatus = '';
        this.processProgress = 0;
      }, 2000);

    } catch (error) {
      console.error('清理重複 WBS 失敗:', error);
      alert('清理重複 WBS 時發生錯誤，請檢查控制台了解詳情。');
    } finally {
      this.isProcessing = false;
    }
  }

  // 將新任務插入到適當的位置（按WBS排序）
  private insertTaskInOrder(newTask: ScheduleTask) {
    // 如果是頂層任務，直接加入
    if (!newTask.wbs.includes('.')) {
      this.tasks.push(newTask);
      return;
    }
    
    // 尋找父任務
    const parentWbs = this.findParentWbsByLevel(newTask.wbs, this.flatTasks, newTask.level);
    if (parentWbs) {
      const parentTask = this.findTaskByWbs(parentWbs);
      if (parentTask) {
        if (!parentTask.children) {
          parentTask.children = [];
        }
        parentTask.children.push(newTask);
        newTask.parent = parentWbs; // 修正：應該是WBS字符串
        return;
      }
    }
    
    // 如果找不到父任務，加入到頂層
    this.tasks.push(newTask);
  }

  // 重新建立樹狀結構
  private rebuildTaskTree() {
    // 重新扁平化所有任務
    this.flattenTasks();
    
    // 重新建立樹狀結構
    const allTasks = [...this.flatTasks];
    this.tasks = this.buildTaskTreeFromExisting(allTasks);
  }

  private async loadScheduleData() {
    try {
      this.isLoadingData = true;
      console.log('開始載入進度表資料，siteId:', this.siteId);
      
      if (!this.siteId) {
        console.error('siteId 為空，無法載入資料');
        this.isLoadingData = false;
        return;
      }

      // 使用與舊進度表相同的方式載入任務資料
      const rawData = await this.mongodbService.getArray('task', {
        siteId: this.siteId,
      }) as ProjectTask[];
      
      console.log('從資料庫載入的原始資料:', rawData);

      if (!Array.isArray(rawData)) {
        console.error('從資料庫獲取的資料不是陣列格式');
        return;
      }

      if (rawData.length === 0) {
        console.warn('從資料庫獲取的任務清單為空');
        return;
      }

      // 將MongoDB資料轉換為新進度表格式
      const convertedTasks: ScheduleTask[] = rawData.map((task) => {
        const startDate = task.start ? dayjs(task.start) : dayjs();
        const endDate = task.end ? dayjs(task.end) : dayjs();
        const days = Math.floor(endDate.diff(startDate, 'day')) + 1 || 1; // 確保為整數

        return {
          _id: task._id ? task._id.toString() : '',
          wbs: task.wbs || '',
          name: task.name || '未命名任務',
          days: days,
          startDate: startDate.format('YYYY-MM-DD'),
          endDate: endDate.format('YYYY-MM-DD'),
          weight: task.weight ?? task.progress ?? 1, // 優先使用weight，沒有則使用progress，都沒有則為1
          level: this.calculateTaskLevel(task.wbs || ''),
          dailyProgress: task.progressHistory ? this.convertProgressHistory(task.progressHistory) : {}
        };
      });

      // 載入後立即清理重複的 WBS（在建立樹狀結構之前）
      console.log(`載入了 ${convertedTasks.length} 個任務，檢查重複 WBS...`);
      const cleanedCount = await this.cleanupDuplicateWbsFromRawData(convertedTasks);
      if (cleanedCount > 0) {
        console.log(`載入階段從資料庫清理了 ${cleanedCount} 個重複的 WBS`);
      }
      
      // 建立樹狀結構
      this.tasks = this.buildTaskTreeFromExisting(convertedTasks);
      
      // 重新計算父層任務的日期和權重
      this.recalculateParentTasks();
      
      this.flattenTasks();
      
      console.log(`最終顯示 ${this.flatTasks.length} 個任務`);
      
      // 重新計算日期範圍
      this.calculateDateRangeFromTasks();
      this.generateDateColumns();
      
      console.log('成功載入並轉換任務資料，數量:', this.tasks.length);
      
    } catch (error) {
      console.error('載入進度表資料失敗:', error);
    } finally {
      this.isLoadingData = false;
    }
  }

  // 只儲存修改過的任務
  private async saveModifiedTasks(modifiedWbsList: string[]) {
    try {
      console.log(`只儲存修改的任務: ${modifiedWbsList.join(', ')}`);
      
      for (const wbs of modifiedWbsList) {
        const task = this.findTaskByWbs(wbs);
        if (task) {
          if (task._id) {
            // 更新現有任務
            const updateData = {
              name: task.name,
              wbs: task.wbs,
              start: task.startDate,
              end: task.endDate,
              weight: task.weight,
              progressHistory: this.convertDailyProgressToHistory(task.dailyProgress || {})
            };
            
            await this.mongodbService.patch('task', task._id, updateData);
            console.log(`更新任務: ${task.name} (WBS: ${task.wbs})`);
          } else {
            // 新增任務
            const newTaskData = {
              name: task.name,
              wbs: task.wbs,
              start: task.startDate,
              end: task.endDate,
              weight: task.weight,
              siteId: this.siteId,
              dependencies: '',
              progressHistory: this.convertDailyProgressToHistory(task.dailyProgress || {})
            };
            
            const result = await this.mongodbService.post('task', newTaskData);
            console.log(`新增任務: ${task.name} (WBS: ${task.wbs})`);
            
            // 更新本地任務的 _id
            if (result && result._id) {
              task._id = result._id.toString();
            }
          }
        }
      }
      
      console.log(`修改的任務儲存完成，共 ${modifiedWbsList.length} 個任務`);
    } catch (error) {
      console.error('儲存修改的任務失敗:', error);
      throw error;
    }
  }

  // 儲存特定任務和其所有父任務
  private async saveTaskAndParents(task: ScheduleTask) {
    try {
      const tasksToSave: ScheduleTask[] = [];
      
      // 1. 加入當前任務
      tasksToSave.push(task);
      console.log(`準備儲存任務: ${task.name} (WBS: ${task.wbs})`);
      
      // 2. 找出所有父任務並重新計算它們的進度
      const parentTasks = this.findAllParentTasks(task);
      parentTasks.forEach(parentTask => {
        // 重新計算父任務的進度（基於子任務的加權平均）
        this.recalculateParentTaskProgress(parentTask);
        tasksToSave.push(parentTask);
        console.log(`準備儲存父任務: ${parentTask.name} (WBS: ${parentTask.wbs})`);
      });
      
      // 3. 只儲存這些任務
      for (const taskToSave of tasksToSave) {
        if (taskToSave._id) {
          const updateData = {
            name: taskToSave.name,
            wbs: taskToSave.wbs,
            start: taskToSave.startDate,
            end: taskToSave.endDate,
            weight: taskToSave.weight,
            progressHistory: this.convertDailyProgressToHistory(taskToSave.dailyProgress || {})
          };
          
          await this.mongodbService.patch('task', taskToSave._id, updateData);
          console.log(`✅ 已儲存: ${taskToSave.name} (WBS: ${taskToSave.wbs})`);
        }
      }
      
      console.log(`進度更新完成，共儲存 ${tasksToSave.length} 個任務（1個子任務 + ${parentTasks.length}個父任務）`);
    } catch (error) {
      console.error('儲存任務和父任務失敗:', error);
      throw error;
    }
  }

  // 找出所有父任務
  private findAllParentTasks(task: ScheduleTask): ScheduleTask[] {
    const parentTasks: ScheduleTask[] = [];
    let currentWbs = task.wbs;
    
    // 從當前任務往上找所有父任務
    while (currentWbs.includes('.')) {
      // 移除最後一段得到父任務的 WBS
      const lastDotIndex = currentWbs.lastIndexOf('.');
      const parentWbs = currentWbs.substring(0, lastDotIndex);
      
      const parentTask = this.findTaskByWbs(parentWbs);
      if (parentTask) {
        parentTasks.push(parentTask);
        currentWbs = parentWbs;
      } else {
        break;
      }
    }
    
    return parentTasks;
  }

  // 重新計算父任務的進度（基於子任務的加權平均）
  private recalculateParentTaskProgress(parentTask: ScheduleTask) {
    if (!this.hasChildren(parentTask) || !parentTask.children) {
      return;
    }

    // 為父任務建立進度記錄
    if (!parentTask.dailyProgress) {
      parentTask.dailyProgress = {};
    }

    // 收集所有子任務的進度記錄日期
    const allDates = new Set<string>();
    parentTask.children.forEach(child => {
      if (child.dailyProgress) {
        Object.keys(child.dailyProgress).forEach(date => allDates.add(date));
      }
    });

    // 為每個日期計算加權平均進度
    allDates.forEach(date => {
      let totalWeightedProgress = 0;
      let totalWeight = 0;
      
      parentTask.children!.forEach(child => {
        const childProgress = child.dailyProgress?.[date] || 0;
        const childWeight = child.weight || 1;
        
        totalWeightedProgress += childProgress * childWeight;
        totalWeight += childWeight;
      });
      
      if (totalWeight > 0) {
        const avgProgress = totalWeightedProgress / totalWeight;
        parentTask.dailyProgress![date] = Math.round(avgProgress);
      }
    });

    console.log(`重新計算父任務 ${parentTask.name} 的進度`);
  }

  private async saveScheduleData() {
    try {
      // 將新進度表格式轉換回舊格式並儲存到 task collection
      for (const task of this.flatTasks) {
        if (task._id) {
          // 更新現有任務
          const updateData = {
            name: task.name,
            wbs: task.wbs,
            start: task.startDate,
            end: task.endDate,
            weight: task.weight, // 將權重保存到weight欄位
            progressHistory: this.convertDailyProgressToHistory(task.dailyProgress || {})
          };
          
          await this.mongodbService.patch('task', task._id, updateData);
        } else {
          // 新增任務
          const newTaskData = {
            name: task.name,
            wbs: task.wbs,
            start: task.startDate,
            end: task.endDate,
            weight: task.weight, // 將權重保存到weight欄位
            siteId: this.siteId,
            dependencies: '',
            progressHistory: this.convertDailyProgressToHistory(task.dailyProgress || {})
          };
          
          const result = await this.mongodbService.post('task', newTaskData);
          if (result && result._id) {
            task._id = result._id.toString();
          }
        }
      }
      
      console.log('進度表資料儲存成功');
    } catch (error) {
      console.error('儲存進度表資料失敗:', error);
    }
  }

  // 轉換每日進度為歷史記錄格式
  private convertDailyProgressToHistory(dailyProgress: { [date: string]: number }): any[] {
    const progressHistory: any[] = [];
    Object.entries(dailyProgress).forEach(([date, progress]) => {
      if (progress > 0) {
        progressHistory.push({
          date: date,
          progress: progress,
          timestamp: new Date().toISOString()
        });
      }
    });
    return progressHistory;
  }

  getIndentClass(level: number): string {
    return `ps-${Math.min(level * 2, 5)}`;
  }

  hasChildren(task: ScheduleTask): boolean {
    return !!(task.children && task.children.length > 0);
  }

  // 獲取任務日期格子的背景顏色
  getTaskDateCellBackgroundColor(task: ScheduleTask, dateCol: string): string {
    const isInRange = this.isDateInRange(task, dateCol);
    
    if (!isInRange) {
      return 'transparent'; // 不在範圍內的TD保持透明
    }
    
    if (this.hasChildren(task)) {
      return '#003d7a'; // 父任務：深藍色
    } else {
      return '#007bff'; // 子任務：藍色
    }
  }

  // 獲取任務日期格子的CSS class (保留作為備用)
  getTaskDateCellClass(task: ScheduleTask, dateCol: string): any {
    return {};
  }

  // 計算任務層級（根據WBS結構）
  private calculateTaskLevel(wbs: string): number {
    if (!wbs) return 0;
    // 計算WBS中點號的數量來判斷層級
    return (wbs.match(/\./g) || []).length;
  }

  // 轉換進度歷史記錄格式
  private convertProgressHistory(progressHistory: any[]): { [date: string]: number } {
    const dailyProgress: { [date: string]: number } = {};
    if (Array.isArray(progressHistory)) {
      progressHistory.forEach(record => {
        if (record.date && record.progress !== undefined) {
          dailyProgress[record.date] = record.progress;
        }
      });
    }
    return dailyProgress;
  }

  // 從現有任務建立樹狀結構
  private buildTaskTreeFromExisting(tasks: ScheduleTask[]): ScheduleTask[] {
    const tree: ScheduleTask[] = [];
    const taskMap = new Map<string, ScheduleTask>();
    
    // 按WBS自然排序
    tasks.sort((a, b) => this.naturalSort(a.wbs || '', b.wbs || ''));
    
    // 先將所有任務加入 map
    tasks.forEach(task => {
      taskMap.set(task.wbs, { ...task, children: [], isExpanded: true });
    });
    
    // 建立親子關係
    tasks.forEach(task => {
      const currentTask = taskMap.get(task.wbs)!;
      
      if (task.level === 0) {
        tree.push(currentTask);
      } else {
        // 找到父任務WBS
        const parentWbs = this.findParentWbsByLevel(task.wbs, tasks, task.level);
        const parent = taskMap.get(parentWbs);
        if (parent) {
          parent.children = parent.children || [];
          parent.children.push(currentTask);
          currentTask.parent = parentWbs;
        } else {
          // 如果找不到父任務，放到根層級
          tree.push(currentTask);
        }
      }
    });
    
    return tree;
  }

  // 根據層級找到父任務WBS
  private findParentWbsByLevel(currentWbs: string, tasks: ScheduleTask[], currentLevel: number): string {
    const parentLevel = currentLevel - 1;
    
    // 在任務列表中往前找到同等級或更高等級的任務
    const currentIndex = tasks.findIndex(t => t.wbs === currentWbs);
    for (let i = currentIndex - 1; i >= 0; i--) {
      if (tasks[i].level === parentLevel) {
        return tasks[i].wbs;
      }
    }
    return '';
  }

  // 重新計算所有父層任務的日期和權重
  private recalculateParentTasks() {
    // 遞迴計算所有任務樹
    this.recalculateTaskTree(this.tasks);
  }

  // 遞迴計算任務樹的日期和權重
  private recalculateTaskTree(tasks: ScheduleTask[]) {
    tasks.forEach(task => {
      if (this.hasChildren(task) && task.children) {
        // 先遞迴計算子任務
        this.recalculateTaskTree(task.children);
        
        // 計算此父任務的日期和權重
        this.calculateParentTaskDates(task);
      }
    });
  }

  // 計算父任務的開始日、結束日、天數和權重
  private calculateParentTaskDates(parentTask: ScheduleTask) {
    if (!parentTask.children || parentTask.children.length === 0) {
      return;
    }

    let earliestStart: dayjs.Dayjs | null = null;
    let latestEnd: dayjs.Dayjs | null = null;
    let totalWeight = 0;
    let childCount = 0;

    // 找出所有子任務的最早開始日和最晚結束日
    parentTask.children.forEach(child => {
      if (child.startDate) {
        const childStart = dayjs(child.startDate);
        if (!earliestStart || childStart.isBefore(earliestStart)) {
          earliestStart = childStart;
        }
      }

      if (child.endDate) {
        const childEnd = dayjs(child.endDate);
        if (!latestEnd || childEnd.isAfter(latestEnd)) {
          latestEnd = childEnd;
        }
      }

      // 累加權重
      totalWeight += child.weight || 0;
      childCount++;
    });

    // 更新父任務的日期
    if (earliestStart) {
      parentTask.startDate = (earliestStart as dayjs.Dayjs).format('YYYY-MM-DD');
    }

    if (latestEnd) {
      parentTask.endDate = (latestEnd as dayjs.Dayjs).format('YYYY-MM-DD');
    }

    // 計算天數（確保為整數）
    if (earliestStart && latestEnd) {
      const days = Math.floor((latestEnd as dayjs.Dayjs).diff(earliestStart as dayjs.Dayjs, 'day')) + 1; // 包含開始日當天，確保為整數
      parentTask.days = days > 0 ? days : 1;
    }

    // 權重為子任務權重的加總（精確到小數點第2位）
    parentTask.weight = Math.round(totalWeight * 100) / 100;

    console.log(`重新計算父任務 ${parentTask.name} (WBS: ${parentTask.wbs}):`, {
      startDate: parentTask.startDate,
      endDate: parentTask.endDate,
      days: parentTask.days,
      weight: parentTask.weight,
      totalWeight: totalWeight,
      childCount: childCount
    });
  }

  // 計算任務完成百分比
  getTaskCompletionPercentage(task: ScheduleTask): number {
    // 如果是父任務，計算子任務的完成百分比乘以權重的加權平均
    if (this.hasChildren(task) && task.children) {
      let totalWeightedProgress = 0;
      let totalWeight = 0;
      
      task.children.forEach(child => {
        const childProgress = this.getTaskCompletionPercentage(child);
        const childWeight = child.weight || 1; // 如果沒有權重則預設為1
        totalWeightedProgress += childProgress * childWeight;
        totalWeight += childWeight;
      });
      
      if (totalWeight === 0) return 0;
      
      return Math.round(totalWeightedProgress / totalWeight);
    }
    
    // 子任務：根據進度記錄計算最高完成度
    if (!task.dailyProgress) return 0;
    
    const progressValues = Object.values(task.dailyProgress).filter(value => value > 0);
    if (progressValues.length === 0) return 0;
    
    // 取最高進度值作為完成度（而不是平均值）
    const maxProgress = Math.max(...progressValues);
    
    return Math.round(maxProgress);
  }

  // 獲取日期輸入提示訊息
  getDateInputTooltip(task: ScheduleTask, dateColumn: string): string {
    const date = dayjs(dateColumn, 'YYYY/M/D').format('YYYY-MM-DD');
    const isInRange = this.isDateInRange(task, dateColumn);
    const progress = this.getProgressForDate(task, dateColumn);
    
    if (isInRange) {
      return `${date} - 工作期間內 ${progress > 0 ? `(目前進度: ${progress}%)` : '(可輸入0-100%完成度)'}`;
    } else {
      return `${date} - 工作期間外 ${progress > 0 ? `(提早開始/延後結束: ${progress}%)` : '(可提早開始或延後結束)'}`;
    }
  }

  // 顯示進度提示
  showProgressTooltip(event: MouseEvent, task: ScheduleTask, dateColumn: string) {
    const element = event.target as HTMLElement;
    const tooltip = this.getDateInputTooltip(task, dateColumn);
    element.title = tooltip;
  }

  // 隱藏進度提示
  hideProgressTooltip() {
    // 這個方法可以用於清理提示，目前使用HTML的title屬性所以不需要特別處理
  }

  // 進度編輯優化方法
  isEditingProgress(task: ScheduleTask, dateColumn: string): boolean {
    const key = `${task.wbs}_${dateColumn}`;
    return this.editingProgress.get(key) || false;
  }

  showProgressInput(event: Event, task: ScheduleTask, dateColumn: string) {
    event.stopPropagation();
    const key = `${task.wbs}_${dateColumn}`;
    
    // 關閉其他正在編輯的輸入框
    this.editingProgress.clear();
    
    // 開啟當前輸入框
    this.editingProgress.set(key, true);
    
    // 等待 DOM 更新後聚焦到輸入框
    setTimeout(() => {
      const input = event.target as HTMLElement;
      const tdElement = input.closest('td');
      const inputElement = tdElement?.querySelector('input') as HTMLInputElement;
      if (inputElement) {
        inputElement.focus();
        inputElement.select();
      }
    }, 0);
  }

  async hideProgressInput(task: ScheduleTask, dateColumn: string, value: number) {
    const key = `${task.wbs}_${dateColumn}`;
    
    // 更新進度
    await this.updateProgress(task, dateColumn, value);
    
    // 關閉編輯狀態
    this.editingProgress.delete(key);
  }

  cancelProgressInput(task: ScheduleTask, dateColumn: string) {
    const key = `${task.wbs}_${dateColumn}`;
    // 取消編輯，不儲存變更
    this.editingProgress.delete(key);
  }

  // 日期欄位內容顯示優化
  shouldShowDateContent(task: ScheduleTask, dateColumn: string): boolean {
    // 如果是父任務，只在任務範圍內顯示
    if (this.hasChildren(task)) {
      return this.isDateInRange(task, dateColumn);
    }
    
    // 子任務：在任務範圍內或有進度記錄時顯示
    const hasProgress = this.getProgressForDate(task, dateColumn) > 0;
    const inRange = this.isDateInRange(task, dateColumn);
    
    return inRange || hasProgress;
  }

  getDateIndicatorOpacity(task: ScheduleTask, dateColumn: string): string {
    const inRange = this.isDateInRange(task, dateColumn);
    const hasProgress = this.getProgressForDate(task, dateColumn) > 0;
    
    if (hasProgress && inRange) return '1.0';
    if (hasProgress && !inRange) return '0.7'; // 超出範圍但有進度
    if (!hasProgress && inRange) return '0.3'; // 範圍內但無進度
    return '0.1'; // 範圍外且無進度
  }

  // 週檢視：檢查該週是否有進度
  hasProgressInWeek(task: ScheduleTask, weekColumn: string): boolean {
    if (!task.dailyProgress) return false;
    
    const weekNum = parseInt(weekColumn.replace('W', ''));
    const currentYear = dayjs().year();
    const weekStart = dayjs().year(currentYear).isoWeek(weekNum).startOf('isoWeek');
    const weekEnd = weekStart.endOf('isoWeek');
    
    // 檢查該週內的任何一天是否有進度記錄
    return Object.keys(task.dailyProgress).some(date => {
      const progressDate = dayjs(date);
      return progressDate.isSameOrAfter(weekStart, 'day') && 
             progressDate.isSameOrBefore(weekEnd, 'day') &&
             task.dailyProgress![date] > 0;
    });
  }

  // 月檢視：檢查該月是否有進度
  hasProgressInMonth(task: ScheduleTask, monthColumn: string): boolean {
    if (!task.dailyProgress) return false;
    
    const monthDate = dayjs(monthColumn, 'YYYY/MM');
    const monthStart = monthDate.startOf('month');
    const monthEnd = monthDate.endOf('month');
    
    // 檢查該月內的任何一天是否有進度記錄
    return Object.keys(task.dailyProgress).some(date => {
      const progressDate = dayjs(date);
      return progressDate.isSameOrAfter(monthStart, 'day') && 
             progressDate.isSameOrBefore(monthEnd, 'day') &&
             task.dailyProgress![date] > 0;
    });
  }



  // 自然排序函數，用於正確排序 WBS（如 1.1, 1.2, 1.3, 1.10, 1.11）
  private naturalSort(a: string, b: string): number {
    // 將 WBS 分割為數字陣列進行比較
    const aParts = a.split('.').map(part => parseInt(part, 10) || 0);
    const bParts = b.split('.').map(part => parseInt(part, 10) || 0);
    
    const maxLength = Math.max(aParts.length, bParts.length);
    
    for (let i = 0; i < maxLength; i++) {
      const aVal = aParts[i] || 0;
      const bVal = bParts[i] || 0;
      
      if (aVal < bVal) return -1;
      if (aVal > bVal) return 1;
    }
    
    return 0;
  }

  // 根據 WBS 列表移除任務
  private removeTasksByWbs(wbsList: string[]) {
    const wbsSet = new Set(wbsList);

    // 遞迴移除任務
    const removeFromTaskTree = (tasks: ScheduleTask[]): ScheduleTask[] => {
      return tasks.filter(task => {
        if (wbsSet.has(task.wbs)) {
          // 如果該任務要被移除，則跳過
          return false;
        }

        // 如果有子任務，遞迴處理子任務
        if (task.children && task.children.length > 0) {
          task.children = removeFromTaskTree(task.children);
        }

        return true;
      });
    };

    // 從根任務開始移除
    this.tasks = removeFromTaskTree(this.tasks);
  }

  // =============================================
  // 匯出甘特圖到 Excel（類似 Microsoft Project 樣式）
  // =============================================

  async exportGanttToExcel() {
    if (this.flatTasks.length === 0) {
      alert('沒有工程項目可匯出');
      return;
    }

    try {
      const workbook = new ExcelJS.Workbook();
      workbook.creator = 'CSIS 工地管理系統';
      workbook.created = new Date();

      const worksheet = workbook.addWorksheet('工程進度', {
        views: [{ state: 'frozen', xSplit: 4, ySplit: 2 }]
      });

      // 計算專案時間範圍
      const { projectStart, projectEnd } = this.getExcelProjectDateRange();

      // 根據視圖模式產生日期欄位
      const dateColumns = this.generateExcelDateColumns(projectStart, projectEnd);

      // 設定欄位寬度
      const fixedColumns = [
        { header: 'WBS', key: 'wbs', width: 12 },
        { header: '工作名稱', key: 'name', width: 30 },
        { header: '開始日期', key: 'start', width: 12 },
        { header: '結束日期', key: 'end', width: 12 }
      ];

      // 設定所有欄位
      worksheet.columns = [
        ...fixedColumns,
        ...dateColumns.map((col, index) => ({
          header: col.label,
          key: `date_${index}`,
          width: this.viewMode === 'week' ? 5 : (this.viewMode === 'day' ? 4 : 8)
        }))
      ];

      // 添加第一行標題
      const headerRow1 = worksheet.getRow(1);
      headerRow1.height = 20;

      // 固定欄位標題
      ['WBS', '工作名稱', '開始日期', '結束日期'].forEach((title, index) => {
        const cell = headerRow1.getCell(index + 1);
        cell.value = title;
        cell.font = { bold: true, size: 10 };
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFE0E0E0' }
        };
        cell.border = this.getExcelBorder();
      });

      // 日期欄位標題
      dateColumns.forEach((col, index) => {
        const cell = headerRow1.getCell(5 + index);
        cell.value = col.label;
        cell.font = { bold: true, size: 9 };
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: this.isExcelCurrentPeriod(col) ? 'FFFFF0B3' : 'FFE8F4FD' }
        };
        cell.border = this.getExcelBorder();
      });

      // 添加第二行標題（子標題）
      const headerRow2 = worksheet.getRow(2);
      headerRow2.height = 18;

      // 固定欄位在第二行保持空白
      for (let i = 1; i <= 4; i++) {
        const cell = headerRow2.getCell(i);
        cell.value = '';
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFE0E0E0' }
        };
        cell.border = this.getExcelBorder();
      }

      // 日期欄位子標題
      dateColumns.forEach((col, index) => {
        const cell = headerRow2.getCell(5 + index);
        cell.value = col.subLabel || '';
        cell.font = { size: 8 };
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: this.isExcelCurrentPeriod(col) ? 'FFFFF0B3' : 'FFF5FAFD' }
        };
        cell.border = this.getExcelBorder();
      });

      // 添加任務資料行
      this.flatTasks.forEach((task, taskIndex) => {
        const row = worksheet.getRow(taskIndex + 3);
        row.height = 22;

        // 計算任務層級
        const isParentTask = task.children && task.children.length > 0;

        // 固定欄位
        const wbsCell = row.getCell(1);
        wbsCell.value = task.wbs || '';
        wbsCell.font = { size: 10, bold: isParentTask };
        wbsCell.alignment = { horizontal: 'left', vertical: 'middle', indent: task.level };
        wbsCell.border = this.getExcelBorder();

        const nameCell = row.getCell(2);
        nameCell.value = task.name;
        nameCell.font = { size: 10, bold: isParentTask };
        nameCell.alignment = { horizontal: 'left', vertical: 'middle', indent: task.level };
        nameCell.border = this.getExcelBorder();

        const startCell = row.getCell(3);
        startCell.value = task.startDate || '';
        startCell.font = { size: 9 };
        startCell.alignment = { horizontal: 'center', vertical: 'middle' };
        startCell.border = this.getExcelBorder();

        const endCell = row.getCell(4);
        endCell.value = task.endDate || '';
        endCell.font = { size: 9 };
        endCell.alignment = { horizontal: 'center', vertical: 'middle' };
        endCell.border = this.getExcelBorder();

        // 甘特圖條
        const taskStart = task.startDate ? dayjs(task.startDate) : null;
        const taskEnd = task.endDate ? dayjs(task.endDate) : null;

        // 計算任務進度
        const progress = this.calculateTaskProgress(task);

        dateColumns.forEach((col, colIndex) => {
          const cell = row.getCell(5 + colIndex);
          cell.border = this.getExcelBorder();

          if (taskStart && taskEnd) {
            const colStart = col.startDate;
            const colEnd = col.endDate;

            // 檢查任務是否在此時間區間內
            const isInRange = taskStart.isBefore(colEnd.add(1, 'day')) && taskEnd.isAfter(colStart.subtract(1, 'day'));

            if (isInRange) {
              // 計算進度顏色
              const progressColor = isParentTask ? 'FF4472C4' : 'FF70AD47';
              const progressBgColor = isParentTask ? 'FFB4C6E7' : 'FFC5E0B4';

              // 根據進度設定填充
              if (progress > 0) {
                cell.fill = {
                  type: 'pattern',
                  pattern: 'solid',
                  fgColor: { argb: progress >= 100 ? progressColor : progressBgColor }
                };
              } else {
                cell.fill = {
                  type: 'pattern',
                  pattern: 'solid',
                  fgColor: { argb: 'FFDDDDDD' }
                };
              }

              // 如果這是任務範圍內的第一個欄位，顯示進度百分比
              const compareUnit = this.viewMode === 'week' ? 'week' : (this.viewMode === 'day' ? 'day' : 'month');
              if (colStart.isSame(taskStart, compareUnit) ||
                  (taskStart.isBefore(colStart) && colIndex === 0)) {
                cell.value = progress > 0 ? `${Math.round(progress)}%` : '';
                cell.font = { size: 8, color: { argb: 'FF000000' } };
                cell.alignment = { horizontal: 'center', vertical: 'middle' };
              }
            } else {
              cell.value = '';
            }
          } else {
            cell.value = '';
          }
        });
      });

      // 設定列印區域和頁面設定
      worksheet.pageSetup = {
        orientation: 'landscape',
        fitToPage: true,
        fitToWidth: 1,
        fitToHeight: 0
      };

      // 生成並下載檔案
      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      });
      const url = URL.createObjectURL(blob);

      const link = document.createElement('a');
      link.href = url;
      link.download = `工程進度甘特圖_${this.site()?.projectNo}_${dayjs().format('YYYY-MM-DD')}.xlsx`;
      link.click();

      setTimeout(() => {
        URL.revokeObjectURL(url);
      }, 100);

    } catch (error) {
      console.error('匯出Excel失敗', error);
      alert('匯出Excel時發生錯誤');
    }
  }

  // 計算任務進度
  private calculateTaskProgress(task: ScheduleTask): number {
    if (!task.dailyProgress) return 0;

    const progressValues = Object.values(task.dailyProgress);
    if (progressValues.length === 0) return 0;

    // 取最新的進度值（最大值）
    return Math.max(...progressValues);
  }

  // 取得專案的時間範圍
  private getExcelProjectDateRange(): { projectStart: dayjs.Dayjs, projectEnd: dayjs.Dayjs } {
    let minDate: dayjs.Dayjs | null = null;
    let maxDate: dayjs.Dayjs | null = null;

    this.flatTasks.forEach(task => {
      if (task.startDate) {
        const start = dayjs(task.startDate);
        if (!minDate || start.isBefore(minDate)) {
          minDate = start;
        }
      }
      if (task.endDate) {
        const end = dayjs(task.endDate);
        if (!maxDate || end.isAfter(maxDate)) {
          maxDate = end;
        }
      }
    });

    // 預設範圍：如果沒有任務日期，使用當前月份
    const projectStart = minDate || dayjs().startOf('month');
    const projectEnd = maxDate || dayjs().endOf('month');

    return { projectStart, projectEnd };
  }

  // 根據視圖模式產生日期欄位
  private generateExcelDateColumns(start: dayjs.Dayjs, end: dayjs.Dayjs): Array<{
    label: string;
    subLabel: string;
    startDate: dayjs.Dayjs;
    endDate: dayjs.Dayjs;
  }> {
    const columns: Array<{
      label: string;
      subLabel: string;
      startDate: dayjs.Dayjs;
      endDate: dayjs.Dayjs;
    }> = [];

    let current = start.clone();

    switch (this.viewMode) {
      case 'day':
        // 日視圖：每欄代表一天
        while (current.isBefore(end) || current.isSame(end, 'day')) {
          columns.push({
            label: current.format('M/D'),
            subLabel: current.format('ddd'),
            startDate: current.clone(),
            endDate: current.clone()
          });
          current = current.add(1, 'day');
        }
        break;

      case 'week':
        // 週視圖：每欄代表一週
        current = current.startOf('isoWeek');
        while (current.isBefore(end) || current.isSame(end, 'week')) {
          const weekStart = current.clone();
          const weekEnd = current.endOf('isoWeek');
          columns.push({
            label: `W${current.isoWeek()}`,
            subLabel: `${current.format('M/D')}`,
            startDate: weekStart,
            endDate: weekEnd
          });
          current = current.add(1, 'week');
        }
        break;

      case 'month':
      default:
        // 月視圖：每欄代表一個月
        current = current.startOf('month');
        while (current.isBefore(end) || current.isSame(end, 'month')) {
          const monthStart = current.clone();
          const monthEnd = current.endOf('month');
          columns.push({
            label: current.format('YYYY/MM'),
            subLabel: '',
            startDate: monthStart,
            endDate: monthEnd
          });
          current = current.add(1, 'month');
        }
        break;
    }

    return columns;
  }

  // 判斷是否為當前時間區間
  private isExcelCurrentPeriod(col: { startDate: dayjs.Dayjs; endDate: dayjs.Dayjs }): boolean {
    const today = dayjs();
    return today.isAfter(col.startDate.subtract(1, 'day')) && today.isBefore(col.endDate.add(1, 'day'));
  }

  // 取得 Excel 儲存格邊框樣式
  private getExcelBorder(): Partial<ExcelJS.Borders> {
    return {
      top: { style: 'thin', color: { argb: 'FFD0D0D0' } },
      left: { style: 'thin', color: { argb: 'FFD0D0D0' } },
      bottom: { style: 'thin', color: { argb: 'FFD0D0D0' } },
      right: { style: 'thin', color: { argb: 'FFD0D0D0' } }
    };
  }
} 
