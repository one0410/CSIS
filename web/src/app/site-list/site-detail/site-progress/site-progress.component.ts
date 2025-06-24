import {
  Component,
  ViewChild,
  ElementRef,
  AfterViewInit,
  OnDestroy,
  OnInit,
  Input,
  OnChanges,
  SimpleChanges,
  computed,
} from '@angular/core';
import { FormsModule } from '@angular/forms';

import { DatePipe } from '@angular/common';
import { gantt } from 'dhtmlx-gantt';
import { MongodbService } from '../../../services/mongodb.service';
import { ActivatedRoute } from '@angular/router';
import { Site } from '../../site-list.component';
import { Modal } from 'bootstrap';
import { CurrentSiteService } from '../../../services/current-site.service';

// 進度歷史記錄介面
interface ProgressRecord {
  date: string; // YYYY-MM-DD 格式
  progress: number; // 0-100 的進度值
  updatedBy?: string; // 更新人員（可選）
  note?: string; // 備註（可選）
}

// 擴展Task接口，增加WBS和項目編號
interface ProjectTask {
  _id?: string;
  id: string;
  name: string;
  start?: string;
  end?: string;
  progress: number;
  dependencies: string;
  wbs?: string;
  type?: string;
  parent?: string;
  siteId: string;
  isNewRow?: boolean; // 標記是否為新行
  custom_class?: string;
  progressHistory?: ProgressRecord[]; // 進度歷史記錄
  [key: string]: any;
  
  // 新增：同步進度方法
  syncProgress?(): void;
}

// 同步進度的輔助函數
function syncTaskProgress(task: ProjectTask): void {
  if (!task.progressHistory || task.progressHistory.length === 0) {
    // 如果沒有歷史記錄，保持原 progress 值
    return;
  }
  
  // 按日期排序，取最新的進度
  const sorted = [...task.progressHistory].sort((a, b) => 
    new Date(b.date).getTime() - new Date(a.date).getTime()
  );
  
  task.progress = sorted[0].progress;
}

// 定義甘特圖視圖模式類型
type GanttViewMode = 'Week' | 'Month' | 'Quarter' | 'Year';

@Component({
  selector: 'app-site-progress',
  imports: [FormsModule],
  templateUrl: './site-progress.component.html',
  styleUrl: './site-progress.component.scss',
  providers: [DatePipe],
})
export class SiteProgressComponent
  implements AfterViewInit, OnDestroy, OnInit, OnChanges {
  @ViewChild('downloadLink') downloadLink!: ElementRef;
  @ViewChild('ganttScrollContainer') ganttScrollContainer!: ElementRef;
  @ViewChild('fileInput') fileInput!: ElementRef<HTMLInputElement>;
  @ViewChild('progressForm') progressForm: any;

  siteId: string = '';
  site = computed(() => this.currentSiteService.currentSite());

  tasks: ProjectTask[] = [];
  ganttChart: any = null;
  newTask: ProjectTask = {
    _id: '',
    id: '',
    name: '',
    start: '',
    end: '',
    progress: 0,
    dependencies: '',
    wbs: '',
    siteId: '',
  };
  taskModal: Modal | null = null;
  importModal: Modal | null = null;
  progressModal: Modal | null = null; // 進度輸入Modal
  importPreview: ProjectTask[] = [];
  totalImportItems: number = 0;
  importData: ProjectTask[] = [];

  // 進度輸入相關
  selectedTask: ProjectTask | null = null; // 選中的任務
  progressInput = {
    date: new Date().toISOString().split('T')[0], // 預設今天
    progress: 0,
    note: ''
  };
  currentViewDate: string = new Date().toISOString().split('T')[0]; // 當前查看的日期
  progressUpdateMessage: string = ''; // 進度更新成功訊息

  // 批量進度輸入相關
  batchProgressDate: string = new Date().toISOString().split('T')[0]; // 批量輸入的日期
  batchProgressInputs: { [taskId: string]: number } = {}; // 存儲每個任務的進度輸入
  recentProgressDates: string[] = []; // 最近的進度日期
  
  // 日期範圍選擇相關
  selectedDateRange: string = 'recent5'; // 選擇的日期範圍
  customDateRange = {
    start: '',
    end: ''
  }; // 自定義日期範圍

  // 甘特圖控制
  ganttViewMode: GanttViewMode = 'Month'; // 當前視圖模式

  // 滾動相關
  private ganttScrollHandler: any = null;
  private ganttResizeObserver: ResizeObserver | null = null;

  constructor(
    private mongodbService: MongodbService,
    private route: ActivatedRoute,
    private currentSiteService: CurrentSiteService
  ) { }

  async ngOnInit() {
    // 從路由參數獲取項目編號
    this.route.parent?.paramMap.subscribe(async (params) => {
      try {
        let id = params.get('id');
        console.log('從路由獲取的 id:', id);

        this.siteId = id || '';
        console.log('使用的項目編號:', this.siteId);

        try {
          // 清理舊的甘特圖實例
          if (this.ganttChart) {
            console.log('清理舊的甘特圖實例');
            try {
              // 移除所有事件監聽器
              this.ganttChart.detachAllEvents();
              // 銷毀甘特圖
              // this.ganttChart.destructor();
            } catch (cleanupError) {
              console.error('清理舊甘特圖時發生錯誤:', cleanupError);
            }
            // this.ganttChart = null;
          }

          // 清理滾動處理器
          this.cleanupGanttScrollHandling();

          // 等待資料載入完成
          console.log('開始載入資料...');
          await this.loadGridData();
          console.log('資料載入完成，任務數量:', this.tasks.length);
          
          // 確保DOM已準備好
          setTimeout(() => {
            // 資料載入後再初始化甘特圖
            console.log('從ngOnInit初始化甘特圖');
            if (this.ensureGanttDomElement()) {
              this.initGantt();
            } else {
              console.error('找不到甘特圖DOM元素，無法初始化');
            }
          }, 100);
        } catch (error) {
          console.error('載入資料或初始化甘特圖時發生錯誤:', error);
        }
      } catch (routeError) {
        console.error('處理路由參數時發生錯誤:', routeError);
      }
    });
  }

  // 確保甘特圖DOM元素存在且可見
  ensureGanttDomElement() {
    console.log('檢查甘特圖DOM元素');
    
    const ganttContainer = document.getElementById('gantt');
    if (!ganttContainer) {
      console.error('甘特圖容器元素不存在!');
      
      // 嘗試創建甘特圖容器元素
      if (this.ganttScrollContainer) {
        const ganttScrollContainer = this.ganttScrollContainer.nativeElement;
        if (ganttScrollContainer) {
          // 檢查是否已經存在某個元素
          const existingGantt = ganttScrollContainer.querySelector('#gantt');
          if (!existingGantt) {
            console.log('嘗試創建甘特圖DOM元素');
            const newGanttContainer = document.createElement('div');
            newGanttContainer.id = 'gantt';
            newGanttContainer.style.height = '500px';
            newGanttContainer.style.width = '100%';
            ganttScrollContainer.appendChild(newGanttContainer);
            console.log('成功創建甘特圖DOM元素');
            return true;
          } else {
            console.log('甘特圖DOM元素已存在，但getElementById無法找到它');
            return true;
          }
        }
      }
      return false;
    }
    
    // 確保甘特圖容器有正確的尺寸
    if (ganttContainer.style.height === '' || ganttContainer.style.height === '0px') {
      ganttContainer.style.height = '500px';
      console.log('已設定甘特圖容器高度為500px');
    }
    
    if (ganttContainer.style.width === '' || ganttContainer.style.width === '0px') {
      ganttContainer.style.width = '100%';
      console.log('已設定甘特圖容器寬度為100%');
    }
    
    return true;
  }

  ngAfterViewInit() {
    // 初始化Bootstrap Modal
    const taskModalElement = document.getElementById('taskModal');
    if (taskModalElement) {
      this.taskModal = new Modal(taskModalElement);
    }

    const importModalElement = document.getElementById('importModal');
    if (importModalElement) {
      this.importModal = new Modal(importModalElement);
    }

    const progressModalElement = document.getElementById('progressModal');
    if (progressModalElement) {
      this.progressModal = new Modal(progressModalElement);
      
      // 監聽進度Modal的顯示事件
      progressModalElement.addEventListener('shown.bs.modal', () => {
        this.loadBatchProgressData();
      });
    }

    // 確認甘特圖是否已經初始化，如果沒有則初始化
    setTimeout(() => {
      this.ensureGanttDomElement();
      if (this.tasks.length > 0 && !this.ganttChart) {
        console.log('在ngAfterViewInit中初始化甘特圖');
        this.initGantt();
      }
    }, 500);
  }

  ngOnDestroy() {
    try {
      // 清理滾動事件監聽器
      this.cleanupGanttScrollHandling();

      // 清理大小觀察器
      if (this.ganttResizeObserver) {
        this.ganttResizeObserver.disconnect();
        this.ganttResizeObserver = null;
      }

      // 清理甘特圖
      if (this.ganttChart) {
        // 移除所有事件監聽器
        try {
          this.ganttChart.detachAllEvents();
        } catch (e) {
          console.error('移除甘特圖事件失敗', e);
        }

        // 銷毀甘特圖
        try {
          this.ganttChart.destructor();
        } catch (e) {
          console.error('銷毀甘特圖失敗', e);
        }
        this.ganttChart = null;
      }
    } catch (error) {
      console.error('甘特圖清理失敗', error);
    }
  }

  ngOnChanges(changes: SimpleChanges) {
    console.log('ngOnChanges 被觸發', changes);

    // 檢查 projectNo 是否有變更，且不是第一次初始化
    if (
      changes['projectNo'] &&
      !changes['projectNo'].isFirstChange() &&
      changes['projectNo'].currentValue
    ) {
      console.log(
        'projectNo 發生變更:',
        changes['projectNo'].previousValue,
        '->',
        changes['projectNo'].currentValue
      );

      // 當 projectNo 變更時，重新載入資料並初始化甘特圖
      this.loadGridData()
        .then(() => {
          console.log('因 projectNo 變更而重新載入資料，初始化甘特圖');
          this.initGantt();
        })
        .catch((error) => {
          console.error('因 projectNo 變更重新載入資料失敗', error);
        });
    }
  }

  // === 甘特圖控制功能 ===

  // 移動甘特圖到今天
  ganttGoToday() {
    if (this.ganttChart) {
      try {
        // 使用正確的方法
        this.ganttChart.showDate(new Date());
      } catch (error) {
        console.error('移動甘特圖到今天失敗', error);
      }
    }
  }

  // 放大甘特圖視圖
  ganttZoomIn() {
    if (this.ganttChart) {
      try {
        // 根據當前視圖模式選擇下一個更詳細的視圖
        if (this.ganttViewMode === 'Quarter') {
          this.changeGanttViewMode('Month');
        } else if (this.ganttViewMode === 'Month') {
          this.changeGanttViewMode('Week');
        } else if (this.ganttViewMode === 'Year') {
          this.changeGanttViewMode('Quarter');
        }
      } catch (error) {
        console.error('甘特圖放大失敗', error);
      }
    }
  }

  // 縮小甘特圖視圖
  ganttZoomOut() {
    if (this.ganttChart) {
      try {
        // 根據當前視圖模式選擇下一個更寬泛的視圖
        if (this.ganttViewMode === 'Week') {
          this.changeGanttViewMode('Month');
        } else if (this.ganttViewMode === 'Month') {
          this.changeGanttViewMode('Quarter');
        } else if (this.ganttViewMode === 'Quarter') {
          this.changeGanttViewMode('Year');
        }
      } catch (error) {
        console.error('甘特圖縮小失敗', error);
      }
    }
  }

  // 變更甘特圖視圖模式
  changeGanttViewMode(mode: GanttViewMode) {
    console.log('changeGanttViewMode 被調用，模式:', mode);
    // 臨時調試：確認按鈕點擊事件有觸發
    // alert(`切換到 ${mode} 視圖`);
    
    if (this.ganttChart) {
      try {
        console.log('切換甘特圖視圖模式:', mode);
        this.ganttViewMode = mode;

        switch (mode) {
          case 'Week':
            // 週視圖：主刻度顯示週，子刻度顯示日期
            this.ganttChart.config.scales = [
              { unit: 'week', step: 1, format: '%Y年第%W週' },
              { unit: 'day', step: 1, format: '%d日' }
            ];
            this.ganttChart.config.min_column_width = 70;
            break;
          case 'Month':
            // 月視圖：主刻度顯示月份，子刻度顯示週
            this.ganttChart.config.scales = [
              { unit: 'month', step: 1, format: '%Y年%m月' },
              { unit: 'week', step: 1, format: '第%W週' }
            ];
            this.ganttChart.config.min_column_width = 80;
            break;
          case 'Quarter':
            // 季視圖：主刻度顯示年季，子刻度顯示月份
            this.ganttChart.config.scales = [
              { 
                unit: 'quarter', 
                step: 1, 
                format: function(date: Date) {
                  const year = date.getFullYear();
                  const quarter = Math.floor(date.getMonth() / 3) + 1;
                  return `${year}年Q${quarter}`;
                }
              },
              { unit: 'month', step: 1, format: '%m月' }
            ];
            this.ganttChart.config.min_column_width = 120;
            break;
          case 'Year':
            // 年視圖：主刻度顯示年份，子刻度顯示月份
            this.ganttChart.config.scales = [
              { unit: 'year', step: 1, format: '%Y年' },
              { unit: 'month', step: 1, format: '%m月' }
            ];
            this.ganttChart.config.min_column_width = 80;
            break;
        }

        console.log('應用新的 scales 配置:', this.ganttChart.config.scales);
        this.ganttChart.render();
        console.log('甘特圖重新渲染完成');
      } catch (error) {
        console.error('變更甘特圖視圖模式失敗', error);
      }
    } else {
      console.error('甘特圖實例不存在，無法切換視圖模式');
    }
  }

  // 處理甘特圖滾動
  setupGanttScrollHandling() {
    // 確保DOM元素已存在
    if (!this.ganttScrollContainer) return;

    const scrollContainer = this.ganttScrollContainer.nativeElement;

    // 阻止滾輪事件冒泡，避免與頁面滾動衝突
    this.ganttScrollHandler = (e: WheelEvent) => {
      // 防止滾輪事件冒泡
      e.stopPropagation();

      // 手動控制滾動量
      if (e.deltaY !== 0) {
        scrollContainer.scrollLeft += e.deltaY;
      }
    };

    // 添加事件監聽器
    scrollContainer.addEventListener('wheel', this.ganttScrollHandler, {
      passive: false,
    });
  }

  // 清理甘特圖滾動處理
  cleanupGanttScrollHandling() {
    if (this.ganttScrollHandler && this.ganttScrollContainer) {
      const scrollContainer = this.ganttScrollContainer.nativeElement;
      scrollContainer.removeEventListener('wheel', this.ganttScrollHandler);
      this.ganttScrollHandler = null;
    }
  }

  // // 監控甘特圖容器大小變化，以便調整甘特圖
  // observeGanttResize() {
  //   if (!this.ganttScrollContainer || typeof ResizeObserver === 'undefined')
  //     return;

  //   const container = this.ganttScrollContainer.nativeElement;

  //   this.ganttResizeObserver = new ResizeObserver((entries) => {
  //     for (const entry of entries) {
  //       if (entry.target === container) {
  //         // 容器大小變化時刷新甘特圖
  //         this.refreshGantt();
  //       }
  //     }
  //   });

  //   this.ganttResizeObserver.observe(container);
  // }

  // 刷新甘特圖顯示，但不重新載入數據
  refreshGantt() {
    if (this.ganttChart) {
      const { tasks, links } = this.convertTasksForDhtmlxGantt(this.tasks);

      this.ganttChart.clearAll();
      this.ganttChart.parse({ data: tasks, links: links });
    }
  }

  // === 資料載入與處理 ===

  async loadTasks(): Promise<ProjectTask[]> {
    try {
      try {
        const rawData = await this.mongodbService.get('task', {
          siteId: this.siteId,
        });
        console.log('從數據庫獲取的原始數據:', rawData);

        if (!Array.isArray(rawData)) {
          console.error('從資料庫獲取的資料不是陣列格式');
          return [];
        }

        if (rawData.length === 0) {
          console.warn('從資料庫獲取的任務清單為空');
          return [];
        }
        
        // 將MongoDB數據轉換為適用於甘特圖的格式
        const tasks: ProjectTask[] = rawData.map((task) => {
          try {
            const taskObj: ProjectTask = {
              _id: task._id ? task._id.toString() : '',
              id: task._id ? task._id.toString() : '',
              name: task.name || '未命名任務',
              start: task.start || '',
              end: task.end || '',
              progress: task.progress !== undefined ? task.progress : 0,
              dependencies: task.dependencies || '',
              wbs: task.wbs || '',
              siteId: this.siteId,
              progressHistory: task.progressHistory || [], // 載入進度歷史
            };
            
            // 確保 progress 與 progressHistory 一致
            syncTaskProgress(taskObj);
            
            return taskObj;
          } catch (itemError) {
            console.error('處理單個任務資料時出錯:', itemError, task);
            return {
              _id: '',
              id: '',
              name: '資料錯誤',
              start: '',
              end: '',
              progress: 0,
              dependencies: '',
              wbs: '',
              siteId: this.siteId,
              progressHistory: [],
            };
          }
        }).filter(task => task._id); // 過濾掉沒有有效ID的任務

        // 檢查 wbs, 如果該WBS下還有子WBS, 則將該工項設為 type: 'project'
        tasks.forEach((task) => {
          if (task.wbs) {
            const subTasks = tasks.filter(
              (t) => t.wbs?.startsWith(task.wbs!) && t.wbs !== task.wbs
            );
            if (subTasks.length > 0) {
              task.type = 'project';
              task['open'] = true;
              
              // 計算父項目的進度：子項目進度加總除以子項目個數
              const totalProgress = subTasks.reduce((sum, subTask) => sum + (subTask.progress || 0), 0);
              task.progress = Math.round(totalProgress / subTasks.length);
              
              console.log(`重新計算父項目 ${task.name} (WBS: ${task.wbs}) 的進度: ${subTasks.length} 個子項目，平均進度 ${task.progress}%`);

              subTasks.forEach((subTask) => {
                subTask['parent'] = task._id;
              });
            }
          }
        });

        console.log('處理後的任務數據:', tasks);
        return tasks;
      } catch (dbError) {
        console.error('資料庫操作失敗:', dbError);
        return [];
      }
    } catch (error) {
      console.error('從資料庫載入任務失敗', error);
      return [];
    }
  }

  // 將數據轉換為 dhtmlxGantt 需要的格式
  convertTasksForDhtmlxGantt(tasks: ProjectTask[]) {
    console.log('轉換任務格式，原始任務數:', tasks.length);
    
    if (!tasks || tasks.length === 0) {
      console.warn('沒有任務資料可供轉換');
      return { tasks: [], links: [] };
    }
    
    const ganttTasks = tasks.map((task) => {
      const ganttTask: any = {
        id: task._id,
        text: task.name || '未命名任務',
        progress: this.getTaskProgressForGantt(task), // 使用指定日期的進度
        parent: task.parent || 0,
        open: task['open'] || false,
        wbs: task.wbs || '',
        dependencies: task.dependencies || '',
      };

      // 設置任務類型
      if (task.type === 'project') {
        ganttTask.type = 'project';
      }
      
      // 只有當任務有開始和結束日期時才設置日期
      // 對於父項目（type: 'project'），如果沒有日期，讓 dhtmlx gantt 自動計算
      if (task.start && task.end) {
        ganttTask.start_date = new Date(task.start);
        ganttTask.end_date = new Date(task.end);
        
        // 檢查日期是否有效
        if (isNaN(ganttTask.start_date.getTime())) {
          console.warn(`任務 ${task._id} 的開始日期無效:`, task.start);
          delete ganttTask.start_date;
        }
        
        if (isNaN(ganttTask.end_date.getTime())) {
          console.warn(`任務 ${task._id} 的結束日期無效:`, task.end);
          delete ganttTask.end_date;
        }
      } else if (task.type !== 'project') {
        // 對於非父項目的任務，如果沒有日期，設置預設日期
        ganttTask.start_date = new Date();
        ganttTask.end_date = new Date();
      }
      
      return ganttTask;
    });

    // 處理依賴關係
    const links = [];
    let linkId = 1;

    for (const task of tasks) {
      if (task.dependencies) {
        const deps = task.dependencies
          .split(',')
          .map((d) => d.trim())
          .filter(Boolean);
        for (const dep of deps) {
          links.push({
            id: linkId++,
            source: dep,
            target: task._id,
            type: '0', // 0 - 完成到開始, 1 - 開始到開始, 2 - 完成到完成, 3 - 開始到完成
          });
        }
      }
    }

    console.log('轉換完成，甘特圖任務數:', ganttTasks.length, '連結數:', links.length);
    return { tasks: ganttTasks, links };
  }

  // 使用 iframe 載入甘特圖，避免 $destroyed 問題
  loadGanttInIframe() {
    if (!this.ganttScrollContainer) {
      console.error('甘特圖容器尚未初始化');
      return;
    }

    const scrollContainer = this.ganttScrollContainer.nativeElement;
    
    // 清理現有元素
    while (scrollContainer.firstChild) {
      scrollContainer.removeChild(scrollContainer.firstChild);
    }
    
    // 創建 iframe 元素
    const iframe = document.createElement('iframe');
    iframe.id = 'gantt-iframe';
    iframe.style.width = '100%';
    iframe.style.height = '600px';
    iframe.style.border = 'none';
    
    scrollContainer.appendChild(iframe);
    
    // 建立 iframe 內容
    const iframeDoc = iframe.contentWindow?.document;
    if (!iframeDoc) {
      console.error('無法獲取 iframe 文檔');
      return;
    }
    
    // 建立一個完整的 HTML 文檔，包含甘特圖
    iframeDoc.open();
    iframeDoc.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>甘特圖</title>
        <meta charset="utf-8">
        <link rel="stylesheet" href="//cdn.dhtmlx.com/gantt/edge/dhtmlxgantt.css">
        <script src="//cdn.dhtmlx.com/gantt/edge/dhtmlxgantt.js"></script>
        <style>
          html, body { width: 100%; height: 100%; margin: 0; padding: 0; }
          #gantt_here { width: 100%; height: 100%; }
        </style>
      </head>
      <body>
        <div id="gantt_here"></div>
        <script>
          // iframe 初始化腳本
          const gantt = window.gantt;

          // 用於從父窗口接收資料
          window.initGantt = function(tasksData) {
            const parsedData = JSON.parse(tasksData);
            
            gantt.config.xml_date = '%Y-%m-%d';
            gantt.config.autosize = 'y';
            gantt.config.fit_tasks = true;
            gantt.config.show_progress = true;
            
            // 啟用自動調度功能，讓父項目自動計算子項目的時程範圍
            gantt.config.auto_scheduling = true;
            gantt.config.auto_scheduling_strict = true;
            gantt.config.auto_scheduling_initial = true;
            
            // 設置欄位
            gantt.config.columns = [
              { name: 'wbs', label: 'WBS', tree: true, width: 100 },
              { name: 'text', label: '工程項目', width: 200 },
              { name: 'start_date', label: '開始日期', align: 'center', width: 100 },
              { name: 'end_date', label: '結束日期', align: 'center', width: 100 },
              {
                name: 'progress',
                label: '進度',
                align: 'center',
                width: 80,
                template: function(task) {
                  return Math.round(task.progress * 100) + '%';
                }
              }
            ];
            
            // 初始化甘特圖
            gantt.init('gantt_here');
            
            // 載入資料
            gantt.parse(parsedData);
            
            // 設置今天的指示線
            gantt.addMarker({
              start_date: new Date(),
              css: 'today',
              text: '今天',
              title: new Date().toLocaleDateString()
            });
            
            // 任務更新時通知父窗口
            gantt.attachEvent('onAfterTaskUpdate', function(id, task) {
              window.parent.postMessage({
                type: 'taskUpdate',
                id: id,
                task: task
              }, '*');
            });
            
            // 任務刪除時通知父窗口
            gantt.attachEvent('onAfterTaskDelete', function(id) {
              window.parent.postMessage({
                type: 'taskDelete',
                id: id
              }, '*');
            });
            
            // 連接更新時通知父窗口
            gantt.attachEvent('onAfterLinkAdd', function(id, link) {
              window.parent.postMessage({
                type: 'linkAdd',
                id: id,
                link: link
              }, '*');
            });
            
            // 連接刪除時通知父窗口
            gantt.attachEvent('onAfterLinkDelete', function(id, link) {
              window.parent.postMessage({
                type: 'linkDelete',
                id: id,
                link: link
              }, '*');
            });
          };
        </script>
      </body>
      </html>
    `);
    iframeDoc.close();
    
    // 設置監聽 iframe 傳來的消息
    window.addEventListener('message', this.handleIframeMessage.bind(this));
    
    // 等待 iframe 加載完成
    iframe.onload = () => {
      // 將任務資料轉換並傳送到 iframe
      const { tasks, links } = this.convertTasksForDhtmlxGantt(this.tasks);
      const ganttData = {
        data: tasks,
        links: links
      };
      
      // 將資料發送到 iframe
      (iframe.contentWindow as any).initGantt(JSON.stringify(ganttData));
    };
  }
  
  // 處理從 iframe 收到的消息
  handleIframeMessage(event: MessageEvent) {
    const data = event.data;
    
    if (!data || !data.type) return;
    
    switch (data.type) {
      case 'taskUpdate':
        this.updateTaskFromGantt(data.id, data.task);
        break;
      case 'taskDelete':
        this.deleteTask(data.id);
        break;
      case 'linkAdd':
        this.updateDependencyFromGantt(data.link);
        break;
      case 'linkDelete':
        this.updateDependencyAfterDelete(data.link);
        break;
    }
  }
  
  // 初始化甘特圖
  initGantt() {
    if (!this.ganttScrollContainer) {
      console.error('甘特圖容器尚未初始化');
      return;
    }

    console.log('開始初始化甘特圖，重建 DOM 元素');
    
    try {
      // 清理舊的甘特圖實例
      if (this.ganttChart) {
        try {
          this.ganttChart.detachAllEvents();
          this.ganttChart.destructor();
        } catch (e) {
          console.error('清理舊甘特圖實例失敗', e);
        }
        this.ganttChart = null;
      }
      
      // 重建甘特圖容器
      const scrollContainer = this.ganttScrollContainer.nativeElement;
      const oldGantt = document.getElementById('gantt');
      if (oldGantt) {
        scrollContainer.removeChild(oldGantt);
      }
      
      // 創建新的容器元素
      const ganttContainer = document.createElement('div');
      ganttContainer.id = 'gantt';
      ganttContainer.style.height = '500px';
      ganttContainer.style.width = '100%';
      scrollContainer.appendChild(ganttContainer);
      
      // 強制重載 dhtmlxGantt 腳本
      const script = document.createElement('script');
      script.onload = () => {
        console.log('甘特圖腳本已重新載入');
        
        // 使用全局作用域中的新 gantt 實例
        const freshGantt = (window as any).gantt;
        if (!freshGantt) {
          console.error('無法獲取新的 gantt 實例');
          return;
        }
        
        // 設置甘特圖
        this.ganttChart = freshGantt;
        
        this.ganttChart.plugins({ marker: true });
        
        // 配置甘特圖
        this.ganttChart.config.xml_date = '%Y-%m-%d';
        this.ganttChart.config.autosize = 'y';
        this.ganttChart.config.fit_tasks = true;
        this.ganttChart.config.show_progress = true;
        
        // 啟用自動調度功能，讓父項目自動計算子項目的時程範圍
        this.ganttChart.config.auto_scheduling = true;
        this.ganttChart.config.auto_scheduling_strict = true;
        this.ganttChart.config.auto_scheduling_initial = true;
  
        this.ganttChart.config.lightbox.sections = [
          { name: 'description', height: 100, map_to: 'text', type: 'textarea' },
          { name: "time", type: "duration", map_to: "auto", time_format: ["%d", "%m", "%Y", "%H:%i"] },
        ];
  
        // 設置本地化
        this.setGanttLocalization();
        
        // 設置欄位
        this.ganttChart.config.columns = [
          { name: 'wbs', label: 'WBS', tree: true, width: 100 },
          { name: 'text', label: '工程項目', width: 200 },
          { name: 'start_date', label: '開始日期', align: 'center', width: 100 },
          { name: 'end_date', label: '結束日期', align: 'center', width: 100 },
          {
            name: 'progress',
            label: '進度',
            align: 'center',
            width: 80,
            template: (task: any) => {
              return Math.round(task.progress * 100) + '%';
            },
          },
        ];
  
        // 設置任務資料變更監聽
        this.setupGanttEventListeners();
  
        console.log('正在初始化甘特圖...');
        // 初始化甘特圖
        this.ganttChart.init(ganttContainer);
        console.log('甘特圖初始化完成');
        
        // 甘特圖初始化完成後再設置視圖模式
        this.changeGanttViewMode(this.ganttViewMode);

        // 載入任務數據
        this.loadDataToGantt();
      };
      
      // 強制瀏覽器加載新腳本，使用時間戳防止緩存
      script.src = '//cdn.dhtmlx.com/gantt/edge/dhtmlxgantt.js?v=' + new Date().getTime();
      document.head.appendChild(script);
      
    } catch (error) {
      console.error('初始化甘特圖失敗', error);
    }
  }
  
  // 設置甘特圖事件監聽器
  setupGanttEventListeners() {
    // 設置任務資料變更監聽
    this.ganttChart.attachEvent('onAfterTaskUpdate', (id: string, task: any) => {
      this.updateTaskFromGantt(id, task);
    });

    // delete task
    this.ganttChart.attachEvent('onAfterTaskDelete', (id: string) => {
      this.deleteTask(id);
    });

    this.ganttChart.attachEvent('onAfterLinkAdd', (id: string, link: any) => {
      this.updateDependencyFromGantt(link);
    });

    this.ganttChart.attachEvent('onAfterLinkDelete', (id: string, link: any) => {
      this.updateDependencyAfterDelete(link);
    });
  }
  
  // 載入數據到甘特圖
  loadDataToGantt() {
    const { tasks, links } = this.convertTasksForDhtmlxGantt(this.tasks);
    console.log(
      '準備載入資料到甘特圖',
      tasks.length,
      '個任務,',
      links.length,
      '個連結'
    );

    try {
      this.ganttChart.clearAll();
      console.log('已清除甘特圖資料');
      this.ganttChart.parse({ data: tasks, links: links });
      console.log('已載入資料到甘特圖');
      
      // 設置今天的指示線
      this.ganttChart.addMarker({
        start_date: new Date(),
        css: 'today',
        text: '今天',
        title: new Date().toLocaleDateString(),
      });
    } catch (parseError) {
      console.error('在解析資料時發生錯誤:', parseError);
    }
  }
  
  // 設置甘特圖本地化
  setGanttLocalization() {
    this.ganttChart.i18n.setLocale({
      date: {
        month_full: [
          '一月',
          '二月',
          '三月',
          '四月',
          '五月',
          '六月',
          '七月',
          '八月',
          '九月',
          '十月',
          '十一月',
          '十二月',
        ],
        month_short: [
          '1月',
          '2月',
          '3月',
          '4月',
          '5月',
          '6月',
          '7月',
          '8月',
          '9月',
          '10月',
          '11月',
          '12月',
        ],
        day_full: [
          '星期日',
          '星期一',
          '星期二',
          '星期三',
          '星期四',
          '星期五',
          '星期六',
        ],
        day_short: ['日', '一', '二', '三', '四', '五', '六'],
      },
      labels: {
        new_task: '新任務',
        icon_save: '保存',
        icon_cancel: '取消',
        icon_details: '詳細',
        icon_edit: '編輯',
        icon_delete: '刪除',
        confirm_closing: '任務已修改，需要保存嗎？',
        confirm_deleting: '任務將被刪除，確定嗎？',
        section_description: '描述',
        section_time: '時間範圍',
        section_progress: '進度',

        /* grid columns */
        column_wbs: 'WBS',
        column_text: '任務名稱',
        column_start_date: '開始日期',
        column_duration: '工期',
        column_end_date: '結束日期',
        column_progress: '進度',
        column_add: '添加',
      },
    });
  }

  // 從甘特圖更新任務資料
  async updateTaskFromGantt(id: string, ganttTask: any) {
    try {
      const taskIndex = this.tasks.findIndex((t) => t._id === id);
      if (taskIndex === -1) return;

      // 更新本地任務資料
      const updatedTask = { ...this.tasks[taskIndex] };
      updatedTask.name = ganttTask.text;
      updatedTask.start = this.formatDate(ganttTask.start_date);
      updatedTask.end = this.formatDate(ganttTask.end_date);
      // 移除進度更新，進度只能通過專門的進度輸入 Modal 更新
      // updatedTask.progress = Math.round(ganttTask.progress * 100);

      this.tasks[taskIndex] = updatedTask;

      // 保存到資料庫
      await this.saveTask(updatedTask);
    } catch (error) {
      console.error('從甘特圖更新任務失敗', error);
    }
  }

  // 從甘特圖更新依賴關係
  async updateDependencyFromGantt(link: any) {
    try {
      const targetTask = this.tasks.find((t) => t._id === link.target);
      if (!targetTask) return;

      // 更新相依項目
      let dependencies = targetTask.dependencies
        ? targetTask.dependencies.split(',').map((d) => d.trim())
        : [];
      if (!dependencies.includes(link.source)) {
        dependencies.push(link.source);
      }

      targetTask.dependencies = dependencies.join(',');

      // 保存到資料庫
      await this.saveTask(targetTask);
    } catch (error) {
      console.error('從甘特圖更新依賴關係失敗', error);
    }
  }

  // 刪除依賴關係後更新
  async updateDependencyAfterDelete(link: any) {
    try {
      const targetTask = this.tasks.find((t) => t._id === link.target);
      if (!targetTask) return;

      // 更新相依項目
      let dependencies = targetTask.dependencies
        ? targetTask.dependencies.split(',').map((d) => d.trim())
        : [];
      dependencies = dependencies.filter((dep) => dep !== link.source);

      targetTask.dependencies = dependencies.join(',');

      // 保存到資料庫
      await this.saveTask(targetTask);
    } catch (error) {
      console.error('從甘特圖刪除依賴關係失敗', error);
    }
  }

  // 日期處理功能
  formatDate(date: Date): string {
    // 使用ISO日期格式並截取YYYY-MM-DD部分，以避免時區問題
    return date.toISOString().split('T')[0];
  }

  parseDate(dateStr: string): Date {
    const [year, month, day] = dateStr.split('-').map(Number);
    const date = new Date(year, month - 1, day);
    date.setHours(0, 0, 0, 0); // 重設時間部分
    return date;
  }

  // 保存任務
  async saveTask(task: ProjectTask) {
    try {
      task.siteId = this.siteId;

      if (task._id) {
        await this.mongodbService.put('task', task._id, task);
      } else {
        await this.mongodbService.post('task', task);
      }

      // 重新載入數據
      await this.loadTasks();

      this.refreshGantt();
    } catch (error) {
      console.error('儲存任務失敗', error);
    }
  }

  // 刪除任務
  async deleteTask(taskId: string) {
    try {
      await this.mongodbService.delete('task', taskId);
      // 重新載入最新任務資料
      this.tasks = await this.loadTasks();
      this.refreshGantt();
    } catch (error) {
      console.error('刪除任務失敗', error);
    }
  }

  // === 其他功能 ===

  // 從Modal添加新任務
  async addNewTask() {
    if (!this.newTask.name || !this.newTask.start || !this.newTask.end) {
      alert('請填寫必要欄位：工程項目、開始日期和結束日期');
      return;
    }

    try {
      // 設定預設值
      if (!this.newTask.progress) this.newTask.progress = 0;

      // 檢查 WBS 是否已存在
      let existingTask: ProjectTask | undefined;
      if (this.newTask.wbs && this.newTask.wbs.trim()) {
        existingTask = this.tasks.find(task => 
          task.wbs && task.wbs.trim() === this.newTask.wbs!.trim()
        );
        
        // 如果找到重複的 WBS，詢問使用者是否要覆蓋
        if (existingTask) {
          const confirmMessage = `已存在相同的 WBS「${this.newTask.wbs}」的工程項目：\n「${existingTask.name}」\n\n是否要覆蓋此項目？\n\n點選「確定」會覆蓋現有項目\n點選「取消」可回到編輯畫面修改 WBS`;
          
          const userConfirmed = confirm(confirmMessage);
          
          if (!userConfirmed) {
            // 使用者選擇不覆蓋，回到編輯畫面
            console.log('使用者取消覆蓋，保持在編輯畫面');
            return; // 直接返回，不關閉 modal，讓使用者可以繼續編修
          }
          
          // 使用者確認覆蓋，繼續執行後續邏輯
          console.log('使用者確認覆蓋現有項目');
        }
      }

      // 準備要儲存的任務資料
      const taskToSave = { ...this.newTask, siteId: this.siteId };
      
      if (this.newTask.progress > 0) {
        // 建立今天的進度歷史記錄
        const todayProgressRecord: ProgressRecord = {
          date: new Date().toISOString().split('T')[0], // 今天的日期
          progress: this.newTask.progress,
          note: existingTask ? '更新項目時設定的進度' : '建立項目時設定的初始進度'
        };
        
        if (existingTask && existingTask.progressHistory) {
          // 如果是更新現有項目，保留原有的進度歷史並加入新記錄
          taskToSave.progressHistory = [...existingTask.progressHistory, todayProgressRecord];
        } else {
          taskToSave.progressHistory = [todayProgressRecord];
        }
      } else {
        // 如果是更新現有項目且沒有設定新進度，保留原有的進度歷史
        if (existingTask && existingTask.progressHistory) {
          taskToSave.progressHistory = existingTask.progressHistory;
        } else {
          taskToSave.progressHistory = [];
        }
      }

      if (existingTask && existingTask._id) {
        // WBS 已存在，更新現有項目
        taskToSave._id = existingTask._id;
        taskToSave.id = existingTask.id; // 保持原有的 id
        
        await this.mongodbService.put('task', existingTask._id, taskToSave);
        console.log('已更新現有工程項目 (WBS: ' + this.newTask.wbs + ')');
      } else {
        // WBS 不存在或為空，新增項目
        await this.mongodbService.post('task', taskToSave);
        console.log('已新增工程項目');
      }

      // 重新載入任務資料
      this.tasks = await this.loadTasks();
      
      // 重新載入甘特圖
      this.refreshGantt();

      // 重設表單
      this.newTask = {
        id: '',
        name: '',
        start: '',
        end: '',
        progress: 0,
        dependencies: '',
        wbs: '',
        siteId: this.siteId,
      };

      // 關閉Modal
      this.closeModal('task');
      
      console.log('任務處理完成並刷新畫面');
      
    } catch (error) {
      console.error('處理任務失敗', error);
      alert('處理任務時發生錯誤');
    }
  }

  // 關閉Modal
  closeModal(type: 'task' | 'import' | 'progress') {
    if (type === 'task' && this.taskModal) {
      this.taskModal.hide();
    } else if (type === 'import' && this.importModal) {
      this.importModal.hide();
    } else if (type === 'progress' && this.progressModal) {
      this.progressModal.hide();
    }
  }

  // 匯出任務
  exportTasks() {
    if (this.tasks.length === 0) {
      alert('沒有工程項目可匯出');
      return;
    }

    // 準備CSV內容
    const headers = [
      'WBS',
      '工程項目',
      '開始日期',
      '結束日期',
      '進度(%)',
      '相依項目',
    ];
    const csvRows = [headers.join(',')];

    // 按照 WBS 排序任務
    const sortedTasks = [...this.tasks].sort((a, b) => {
      // 如果兩個任務都沒有 WBS，按名稱排序
      if (!a.wbs && !b.wbs) {
        return a.name.localeCompare(b.name);
      }
      // 如果只有一個任務沒有 WBS，將它排在後面
      if (!a.wbs) return 1;
      if (!b.wbs) return -1;
      
      // 都有 WBS 的情況下，按 WBS 字母數字順序排序
      return a.wbs.localeCompare(b.wbs, undefined, { 
        numeric: true, 
        sensitivity: 'base' 
      });
    });

    // 轉換任務資料為CSV行
    sortedTasks.forEach((task) => {
      const row = [
        task.wbs || '',
        task.name,
        task.start,
        task.end,
        task.progress.toString(),
        task.dependencies || '',
      ];
      // 處理欄位中可能包含逗號的情況
      const csvRow = row.map((field) => {
        if (field && (field.includes(',') || field.includes('"'))) {
          return `"${field.replace(/"/g, '""')}"`;
        }
        return field || '';
      });
      csvRows.push(csvRow.join(','));
    });

    // 在檔案最前面加上 UTF-8 BOM
    const csvContent = '\uFEFF' + csvRows.join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);

    // 使用預先建立的下載連結
    const link = this.downloadLink.nativeElement as HTMLAnchorElement;
    link.href = url;
    link.download = `工程進度_${this.site()?.projectNo}_${this.formatDate(
      new Date()
    )}.csv`;
    link.click();

    // 清理
    setTimeout(() => {
      URL.revokeObjectURL(url);
    }, 100);
  }

  // 選擇文件後處理
  onFileSelected(event: Event) {
    const target = event.target as HTMLInputElement;
    if (!target.files || target.files.length === 0) {
      return;
    }

    const file = target.files[0];
    const reader = new FileReader();

    reader.onload = (e: ProgressEvent<FileReader>) => {
      try {
        const result = e.target?.result as string;
        if (!result) return;

        // 解析CSV
        this.parseImportFile(result);
      } catch (error) {
        console.error('解析檔案失敗', error);
        alert('檔案格式錯誤，請確認是否為正確的CSV檔案');
      }
    };

    reader.readAsText(file);
  }

  // 驗證CSV檔案標題是否正確
  private validateCsvHeader(headerLine: string): boolean {
    // 期望的標題欄位（忽略大小寫和空白）
    const expectedHeaders = [
      'wbs',
      '工程項目',
      '開始日期',
      '結束日期', 
      '進度',
      '相依項目'
    ];

    // 解析標題行
    const actualHeaders = headerLine.split(',').map(h => h.trim().toLowerCase());
    
    // 檢查欄位數量
    if (actualHeaders.length < 4) {
      console.log('標題欄位數量不足，至少需要4個欄位');
      return false;
    }

    // 檢查關鍵欄位是否存在（允許不同的表達方式）
    const hasValidWbs = actualHeaders[0] ? (
      actualHeaders[0].includes('wbs') || 
      actualHeaders[0].includes('編號') ||
      actualHeaders[0].includes('項目編號')
    ) : false;

    const hasValidName = actualHeaders[1] ? (
      actualHeaders[1].includes('工程項目') ||
      actualHeaders[1].includes('項目名稱') ||
      actualHeaders[1].includes('工作項目') ||
      actualHeaders[1].includes('任務') ||
      actualHeaders[1].includes('name') ||
      actualHeaders[1].includes('task')
    ) : false;

    const hasValidStart = actualHeaders[2] ? (
      actualHeaders[2].includes('開始') ||
      actualHeaders[2].includes('start') ||
      actualHeaders[2].includes('開工')
    ) : false;

    const hasValidEnd = actualHeaders[3] ? (
      actualHeaders[3].includes('結束') ||
      actualHeaders[3].includes('end') ||
      actualHeaders[3].includes('完工') ||
      actualHeaders[3].includes('截止')
    ) : false;

    console.log('標題驗證結果:', {
      headers: actualHeaders,
      hasValidWbs,
      hasValidName, 
      hasValidStart,
      hasValidEnd
    });

    // 至少要有名稱、開始日期、結束日期這三個必要欄位
    return hasValidName && hasValidStart && hasValidEnd;
  }

  // 解析匯入文件
  parseImportFile(content: string) {
    // 清空預覽
    this.importPreview = [];
    this.importData = [];

    // 解析CSV內容
    const lines = content.split('\n');
    if (lines.length <= 1) {
      alert('檔案內容為空或只有標題行');
      return;
    }

    // 檢查檔案格式是否正確（檢查第一行標題）
    if (!this.validateCsvHeader(lines[0])) {
      alert('檔案格式不正確！\n\n正確的欄位順序應為：\nWBS, 工程項目, 開始日期 (YYYY-MM-DD), 結束日期 (YYYY-MM-DD), 進度 (數字), 相依項目 (任務ID, 以逗號分隔)\n\n例如：A1,地基工程,2024-01-01,2024-01-15,30,');
      return;
    }

    // 跳過標題行
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      try {
        // 簡單的CSV解析，未處理引號跳脫等複雜情況
        const fields = line.split(',');
        if (fields.length < 4) continue; // 確保至少有名稱和日期

        const task: ProjectTask = {
          id: Date.now() + i.toString(), // 臨時ID
          wbs: fields[0]?.trim() || '',
          name: fields[1]?.trim() || '',
          start: fields[2]?.trim() || '',
          end: fields[3]?.trim() || '',
          progress: parseInt(fields[4]?.trim() || '0'),
          dependencies: fields[5]?.trim() || '',
          siteId: this.siteId,
        };

        // 檢查必填欄位
        if (!task.name || !task.start || !task.end) continue;

        this.importData.push(task);
      } catch (error) {
        console.error('解析行失敗', line, error);
      }
    }

    // 檢查 wbs, 如果該WBS下還有子WBS, 則將該工項設為 type: 'project' 並清空 start 和 end
    this.importData.forEach((task) => {
      if (task.wbs) {
        const subTasks = this.importData.filter(
          (t) => t.wbs?.startsWith(task.wbs!) && t.wbs !== task.wbs
        );
        if (subTasks.length > 0) {
          task.type = 'project';
          task['open'] = true;
          // 如果是父WBS，清空開始和結束日期
          task.start = '';
          task.end = '';
          
          // 計算父項目的進度：子項目進度加總除以子項目個數
          const totalProgress = subTasks.reduce((sum, subTask) => sum + (subTask.progress || 0), 0);
          task.progress = Math.round(totalProgress / subTasks.length);
          
          console.log(`計算父項目 ${task.name} (WBS: ${task.wbs}) 的進度: ${subTasks.length} 個子項目，平均進度 ${task.progress}%`);

          subTasks.forEach((subTask) => {
            subTask.parent = task.id;
          });
        }
      }
    });

    // 更新預覽
    this.totalImportItems = this.importData.length;
    this.importPreview = this.importData.slice(0, 10); // 只顯示前10項
  }

  // 匯入任務
  async importTasks() {
    if (this.importData.length === 0) {
      alert('沒有可匯入的資料');
      return;
    }

    try {
      // 先取得現有任務的 WBS 對照表
      const existingTasks = await this.loadTasks();
      const wbsMap: Record<string, ProjectTask> = {};
      existingTasks.forEach((task) => {
        if (task.wbs) wbsMap[task.wbs] = task;
      });

      // 依據 WBS 決定是新增還是覆蓋
      for (const importTask of this.importData) {
        importTask.siteId = this.siteId;
        if (importTask.wbs && wbsMap[importTask.wbs]) {
          // 覆蓋：保留原 id
          importTask._id = wbsMap[importTask.wbs]._id;
        }
        await this.saveTask(importTask);
      }

      alert(`成功匯入 ${this.importData.length} 個工程項目`);
      this.closeModal('import');

      // 清空匯入資料
      this.importData = [];
      this.importPreview = [];
      this.totalImportItems = 0;

      // 清空 file input
      if (this.fileInput?.nativeElement) {
        this.fileInput.nativeElement.value = '';
      }

      // 重新載入資料
      await this.loadTasks();
      this.refreshGantt();
    } catch (error) {
      console.error('匯入失敗', error);
      alert('匯入過程中發生錯誤');
      
      // 即使發生錯誤也清空 file input
      if (this.fileInput?.nativeElement) {
        this.fileInput.nativeElement.value = '';
      }
    }
  }

  // 載入網格數據
  async loadGridData() {
    try {
      console.log('loadGridData - 開始載入網格數據，項目編號:', this.siteId);

      if (!this.siteId) {
        console.error('項目編號為空，無法載入網格數據');
        throw new Error('項目編號為空');
      }

      // 使用loadTasks方法載入並驗證任務數據
      const loadedTasks = await this.loadTasks();
      
      if (!loadedTasks || loadedTasks.length === 0) {
        console.warn('沒有載入到任何任務，可能是項目尚未設定任務或資料庫連線問題');
        this.tasks = [];
      } else {
        this.tasks = loadedTasks;
        console.log('成功載入任務數據，數量:', this.tasks.length);
      }

      return this.tasks;
    } catch (error) {
      console.error('載入表格數據時發生錯誤:', error);
      this.tasks = [];
      // 拋出錯誤以便 ngOnInit 知道
      throw error;
    }
  }

  // === 進度輸入與管理功能 ===

  // 根據日期取得任務的進度
  getProgressByDate(task: ProjectTask, date: string): number {
    if (!task.progressHistory || task.progressHistory.length === 0) {
      return task.progress; // 回傳當前進度
    }

    // 尋找指定日期的進度記錄
    const exactRecord = task.progressHistory.find(record => record.date === date);
    if (exactRecord) {
      return exactRecord.progress;
    }

    // 如果沒有找到精確日期，找最近的歷史記錄
    const sortedHistory = [...task.progressHistory].sort((a, b) => 
      new Date(a.date).getTime() - new Date(b.date).getTime()
    );

    // 找到指定日期之前最近的記錄
    let latestProgress = task.progress;
    for (const record of sortedHistory) {
      if (new Date(record.date) <= new Date(date)) {
        latestProgress = record.progress;
      } else {
        break;
      }
    }

    return latestProgress;
  }

  // 重新計算父項目進度
  async recalculateParentProgress(childTask: ProjectTask) {
    if (!childTask.parent) return;

    try {
      const parentTask = this.tasks.find(task => task._id === childTask.parent);
      if (!parentTask) return;

      // 找到所有子項目
      const childTasks = this.tasks.filter(task => task.parent === parentTask._id);
      if (childTasks.length === 0) return;

      // 計算平均進度
      const totalProgress = childTasks.reduce((sum, task) => {
        // 取得當前查看日期的進度
        return sum + this.getProgressByDate(task, this.currentViewDate);
      }, 0);

      const averageProgress = Math.round(totalProgress / childTasks.length);

      // 更新父項目的進度歷史
      if (!parentTask.progressHistory) {
        parentTask.progressHistory = [];
      }

      const existingIndex = parentTask.progressHistory.findIndex(
        record => record.date === this.currentViewDate
      );

      const newRecord: ProgressRecord = {
        date: this.currentViewDate,
        progress: averageProgress,
        note: `自動計算：${childTasks.length}個子項目的平均進度`
      };

      if (existingIndex >= 0) {
        parentTask.progressHistory[existingIndex] = newRecord;
      } else {
        parentTask.progressHistory.push(newRecord);
      }

      // 排序並更新當前進度
      parentTask.progressHistory.sort((a, b) => 
        new Date(a.date).getTime() - new Date(b.date).getTime()
      );
      
      parentTask.progress = averageProgress;

      // 儲存父項目
      await this.saveTask(parentTask);

      console.log(`父項目 ${parentTask.name} 進度已重新計算為 ${averageProgress}%`);

      // 遞迴處理上級父項目
      await this.recalculateParentProgress(parentTask);

    } catch (error) {
      console.error('重新計算父項目進度失敗', error);
    }
  }

  // 查看任務的進度歷史
  getTaskProgressHistory(task: ProjectTask): ProgressRecord[] {
    return task.progressHistory || [];
  }

  // 設定查看日期
  setViewDate(date: string) {
    this.currentViewDate = date;
    // 重新載入甘特圖以反映該日期的進度
    this.refreshGantt();
  }

  // 取得任務在特定日期的進度百分比（用於甘特圖顯示）
  getTaskProgressForGantt(task: ProjectTask): number {
    const progress = this.getProgressByDate(task, this.currentViewDate);
    return progress / 100; // dhtmlx gantt 使用 0-1 的進度值
  }

  // 新增進度記錄（表格內直接輸入）
  async addProgressRecord() {
    if (!this.selectedTask) {
      alert('請先選擇工程項目');
      return;
    }

    if (!this.progressInput.date) {
      alert('請選擇日期');
      return;
    }

    if (this.progressInput.progress < 0 || this.progressInput.progress > 100) {
      alert('進度必須在 0 到 100 之間');
      return;
    }

    try {
      // 初始化進度歷史陣列
      if (!this.selectedTask.progressHistory) {
        this.selectedTask.progressHistory = [];
      }

      // 檢查是否已有該日期的記錄
      const existingIndex = this.selectedTask.progressHistory.findIndex(
        record => record.date === this.progressInput.date
      );

      const newRecord: ProgressRecord = {
        date: this.progressInput.date,
        progress: this.progressInput.progress,
        note: this.progressInput.note || ''
      };

      if (existingIndex >= 0) {
        // 更新現有記錄
        this.selectedTask.progressHistory[existingIndex] = newRecord;
      } else {
        // 新增記錄
        this.selectedTask.progressHistory.push(newRecord);
      }

      // 排序進度歷史（按日期，從舊到新）
      this.selectedTask.progressHistory.sort((a, b) => 
        new Date(a.date).getTime() - new Date(b.date).getTime()
      );

      // 使用同步函數確保進度一致性
      syncTaskProgress(this.selectedTask);

      // 儲存到資料庫
      if (this.selectedTask._id) {
        await this.mongodbService.put('task', this.selectedTask._id, this.selectedTask);
      }

      // 重新計算父項目進度（如果有的話）
      await this.recalculateParentProgress(this.selectedTask);

      // 顯示成功訊息
      this.progressUpdateMessage = `已新增 ${this.progressInput.date} 的進度記錄：${this.progressInput.progress}%`;

      // 重置輸入表單
      this.progressInput = {
        date: new Date().toISOString().split('T')[0],
        progress: 0,
        note: ''
      };

      // 重新載入甘特圖
      this.refreshGantt();

      // 3秒後自動清除成功訊息
      setTimeout(() => {
        this.progressUpdateMessage = '';
      }, 3000);

    } catch (error) {
      console.error('新增進度記錄失敗', error);
      alert('新增進度記錄時發生錯誤');
    }
  }

  // 刪除進度記錄
  async deleteProgressRecord(task: ProjectTask, date: string) {
    if (!task || !task.progressHistory) return;

    if (!confirm(`確定要刪除 ${date} 的進度記錄嗎？`)) return;

    try {
      // 從進度歷史中移除指定日期的記錄
      task.progressHistory = task.progressHistory.filter(record => record.date !== date);

      // 更新當前進度為最新的進度（如果還有記錄的話）
      if (task.progressHistory.length > 0) {
        const latestRecord = task.progressHistory[task.progressHistory.length - 1];
        task.progress = latestRecord.progress;
      } else {
        task.progress = 0;
      }

      // 儲存到資料庫
      if (task._id) {
        await this.mongodbService.put('task', task._id, task);
      }

      // 重新計算父項目進度（如果有的話）
      await this.recalculateParentProgress(task);

      // 顯示成功訊息
      this.progressUpdateMessage = `已刪除 ${date} 的進度記錄`;

      // 重新載入甘特圖
      this.refreshGantt();

      // 3秒後自動清除成功訊息
      setTimeout(() => {
        this.progressUpdateMessage = '';
      }, 3000);

    } catch (error) {
      console.error('刪除進度記錄失敗', error);
      alert('刪除進度記錄時發生錯誤');
    }
  }

  // 取得非父項目的任務列表
  getNonProjectTasks(): ProjectTask[] {
    return this.tasks.filter(task => task.type !== 'project');
  }

  // 載入批量進度資料
  loadBatchProgressData() {
    // 計算最近的進度日期（顯示在表格中）
    this.calculateRecentProgressDates();
    
    // 載入選定日期的現有進度
    this.loadExistingProgressForDate();
  }

  // 計算最近的進度日期
  calculateRecentProgressDates() {
    const allDates = new Set<string>();
    
    // 收集所有任務的所有進度日期
    this.tasks.forEach(task => {
      if (task.progressHistory) {
        task.progressHistory.forEach(record => {
          allDates.add(record.date);
        });
      }
    });

    // 根據選擇的範圍篩選日期
    let filteredDates = Array.from(allDates);
    
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];
    
    switch (this.selectedDateRange) {
      case 'recent5':
        // 排序並取最近的5個日期
        filteredDates = filteredDates
          .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())
          .slice(0, 5);
        break;
        
      case 'recent10':
        // 排序並取最近的10個日期
        filteredDates = filteredDates
          .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())
          .slice(0, 10);
        break;
        
      case 'recent30':
        // 最近30天內的日期
        const thirtyDaysAgo = new Date(today);
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        const thirtyDaysAgoStr = thirtyDaysAgo.toISOString().split('T')[0];
        
        filteredDates = filteredDates.filter(date => 
          date >= thirtyDaysAgoStr && date <= todayStr
        );
        break;
        
      case 'thisMonth':
        // 本月的日期
        const thisMonthStart = new Date(today.getFullYear(), today.getMonth(), 1);
        const thisMonthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0);
        const thisMonthStartStr = thisMonthStart.toISOString().split('T')[0];
        const thisMonthEndStr = thisMonthEnd.toISOString().split('T')[0];
        
        filteredDates = filteredDates.filter(date => 
          date >= thisMonthStartStr && date <= thisMonthEndStr
        );
        break;
        
      case 'lastMonth':
        // 上個月的日期
        const lastMonthStart = new Date(today.getFullYear(), today.getMonth() - 1, 1);
        const lastMonthEnd = new Date(today.getFullYear(), today.getMonth(), 0);
        const lastMonthStartStr = lastMonthStart.toISOString().split('T')[0];
        const lastMonthEndStr = lastMonthEnd.toISOString().split('T')[0];
        
        filteredDates = filteredDates.filter(date => 
          date >= lastMonthStartStr && date <= lastMonthEndStr
        );
        break;
        
      case 'custom':
        // 自定義範圍
        if (this.customDateRange.start && this.customDateRange.end) {
          filteredDates = filteredDates.filter(date => 
            date >= this.customDateRange.start && date <= this.customDateRange.end
          );
        }
        break;
        
      case 'all':
        // 全部日期，不篩選
        break;
        
      default:
        // 預設為最近5個日期
        filteredDates = filteredDates
          .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())
          .slice(0, 5);
    }

    // 排序並設置結果（從舊到新排列）
    this.recentProgressDates = filteredDates
      .sort((a, b) => new Date(a).getTime() - new Date(b).getTime());
  }

  // 日期範圍變更處理
  onDateRangeChange() {
    if (this.selectedDateRange === 'custom') {
      // 設置預設的自定義範圍為最近30天
      const today = new Date();
      const thirtyDaysAgo = new Date(today);
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      
      this.customDateRange.start = thirtyDaysAgo.toISOString().split('T')[0];
      this.customDateRange.end = today.toISOString().split('T')[0];
    }
    
    this.loadBatchProgressData();
  }

  // 設置快速日期範圍
  setQuickDateRange(range: string) {
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];
    
    switch (range) {
      case 'last7days':
        const sevenDaysAgo = new Date(today);
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
        this.customDateRange.start = sevenDaysAgo.toISOString().split('T')[0];
        this.customDateRange.end = todayStr;
        break;
        
      case 'last30days':
        const thirtyDaysAgo = new Date(today);
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        this.customDateRange.start = thirtyDaysAgo.toISOString().split('T')[0];
        this.customDateRange.end = todayStr;
        break;
        
      case 'last90days':
        const ninetyDaysAgo = new Date(today);
        ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
        this.customDateRange.start = ninetyDaysAgo.toISOString().split('T')[0];
        this.customDateRange.end = todayStr;
        break;
    }
    
    this.loadBatchProgressData();
  }

  // 載入選定日期的現有進度
  loadExistingProgressForDate() {
    this.batchProgressInputs = {};
    
    if (!this.batchProgressDate) return;

    this.getNonProjectTasks().forEach(task => {
      if (task._id) {
        const existingProgress = this.getProgressByDate(task, this.batchProgressDate);
        // 只有在該日期確實有記錄時才載入，否則保持空白
        const hasRecordForDate = task.progressHistory?.some(record => record.date === this.batchProgressDate);
        if (hasRecordForDate) {
          this.batchProgressInputs[task._id] = existingProgress;
        }
      }
    });
  }

  // 清除批量進度輸入
  clearBatchProgressInputs() {
    this.batchProgressInputs = {};
  }

  // 儲存批量進度
  async saveBatchProgress() {
    if (!this.batchProgressDate) {
      alert('請選擇日期');
      return;
    }

    try {
      let updatedCount = 0;
      const updatedTasks: ProjectTask[] = [];

      // 處理每個有輸入進度的任務
      for (const taskId in this.batchProgressInputs) {
        const progress = this.batchProgressInputs[taskId];
        
        // 跳過空值或無效值
        if (progress === undefined || progress === null || progress < 0 || progress > 100) {
          continue;
        }

        const task = this.tasks.find(t => t._id === taskId);
        if (!task) continue;

        // 初始化進度歷史陣列
        if (!task.progressHistory) {
          task.progressHistory = [];
        }

        // 檢查是否已有該日期的記錄
        const existingIndex = task.progressHistory.findIndex(
          record => record.date === this.batchProgressDate
        );

        const newRecord: ProgressRecord = {
          date: this.batchProgressDate,
          progress: progress,
          note: `批量輸入 - ${this.batchProgressDate}`
        };

        if (existingIndex >= 0) {
          // 更新現有記錄
          task.progressHistory[existingIndex] = newRecord;
        } else {
          // 新增記錄
          task.progressHistory.push(newRecord);
        }

        // 排序進度歷史（按日期，從舊到新）
        task.progressHistory.sort((a, b) => 
          new Date(a.date).getTime() - new Date(b.date).getTime()
        );

        // 更新當前進度為最新的進度
        const latestRecord = task.progressHistory[task.progressHistory.length - 1];
        task.progress = latestRecord.progress;

        updatedTasks.push(task);
        updatedCount++;
      }

      if (updatedCount === 0) {
        alert('沒有輸入任何進度資料');
        return;
      }

      // 批量儲存到資料庫
      for (const task of updatedTasks) {
        if (task._id) {
          await this.mongodbService.put('task', task._id, task);
        }
      }

      // 重新載入任務資料
      this.tasks = await this.loadTasks();

      // 重新計算所有父項目進度
      for (const task of updatedTasks) {
        await this.recalculateParentProgress(task);
      }

      // 顯示成功訊息
      this.progressUpdateMessage = `已成功更新 ${updatedCount} 個項目在 ${this.batchProgressDate} 的進度`;

      // 清除輸入
      this.clearBatchProgressInputs();

      // 重新載入批量進度資料
      this.loadBatchProgressData();

      // 重新載入甘特圖
      this.refreshGantt();

      // 3秒後自動清除成功訊息
      setTimeout(() => {
        this.progressUpdateMessage = '';
      }, 3000);

    } catch (error) {
      console.error('批量儲存進度失敗', error);
      alert('儲存進度時發生錯誤');
    }
  }
}
