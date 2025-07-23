import { Component, ViewChild, ElementRef, AfterViewInit, computed } from '@angular/core';

import {
  FullCalendarComponent,
  FullCalendarModule,
} from '@fullcalendar/angular';
import { CalendarOptions } from '@fullcalendar/core';
import twLocale from '@fullcalendar/core/locales/zh-tw';
import dayGridPlugin from '@fullcalendar/daygrid';
import interactionPlugin from '@fullcalendar/interaction';
import bootstrap5Plugin from '@fullcalendar/bootstrap5';
import { Router, ActivatedRoute } from '@angular/router';
import { MongodbService } from '../../../services/mongodb.service';
import { CurrentSiteService } from '../../../services/current-site.service';
import { AuthService } from '../../../services/auth.service';
import dayjs from 'dayjs';
import isSameOrBefore from 'dayjs/plugin/isSameOrBefore';
import isSameOrAfter from 'dayjs/plugin/isSameOrAfter';
import { SiteForm } from '../../../model/siteForm.model';

// 添加 dayjs 插件
dayjs.extend(isSameOrBefore);
dayjs.extend(isSameOrAfter);

// 導入 Bootstrap Modal 相關類型
declare const bootstrap: {
  Modal: new (element: HTMLElement, options?: any) => {
    show: () => void;
    hide: () => void;
    dispose: () => void;
  };
};

@Component({
  selector: 'app-site-form-list',
  imports: [FullCalendarModule],
  templateUrl: './site-form-list.component.html',
  styleUrl: './site-form-list.component.scss',
})
export class SiteFormListComponent implements AfterViewInit {
  // references the #calendar in the template
  @ViewChild('calendar') calendarComponent!: FullCalendarComponent;
  siteId: string = '';
  private readonly CALENDAR_VIEW_KEY = 'site_calendar_view';
  private formsLoaded = false;
  private allSiteForms: any[] = []; // 快取所有表單資料
  private lastFormsLoadTime: number = 0; // 記錄上次載入表單的時間
  private readonly FORMS_CACHE_DURATION = 5 * 60 * 1000; // 5分鐘快取時間
  currentUser = computed(() => this.authService.user());
  
  // 在構造函數中獲取保存的視圖設定
  calendarOptions: CalendarOptions;

  // QR Code 相關
  formQrCodeUrl: string = '';
  qrCodeModal: any;
  permissionInfoModal: any;

  constructor(
    private router: Router,
    private route: ActivatedRoute,
    private mongodbService: MongodbService,
    private currentSiteService: CurrentSiteService,
    private authService: AuthService
  ) {
    // 讀取保存的視圖模式
    let initialView = 'dayGridMonth'; // 默認視圖
    try {
      const savedView = localStorage.getItem(this.CALENDAR_VIEW_KEY);
      if (savedView) {
        console.log(`構造函數中讀取到保存的視圖模式: ${savedView}`);
        initialView = savedView;
      }
    } catch (e) {
      console.error('讀取保存的視圖模式時出錯:', e);
    }
    
    // 初始化日曆選項
    this.calendarOptions = {
      // 基本設置
      themeSystem: 'bootstrap5',
      plugins: [bootstrap5Plugin, interactionPlugin, dayGridPlugin],
      initialView: initialView, // 使用保存的視圖模式或默認視圖
      headerToolbar: {
        left: 'prev,next today',
        center: 'title',
        right: 'dayGridMonth,dayGridWeek,dayGridDay',
      },
      // 自定義按鈕文字 (prev 和 next 使用 CSS 顯示 Font Awesome 圖示)
      buttonText: {
        today: '今天',
        month: '月',
        week: '週', 
        day: '日',
        list: '列表'
      },
      locale: twLocale, // 設置為繁體中文
      height: '100%', // 讓日曆填滿容器高度
      expandRows: true, // 自動調整行高以填滿容器
      
      // 事件展示設置
      events: [],
      displayEventEnd: true,
      
      // 跨天事件顯示設置
      eventDisplay: 'block', // 使用區塊顯示，更好地支持跨天事件
      eventOrder: 'displayOrder,title', // 先依 displayOrder，再依 title
      
      // "顯示更多"彈出框設置
      moreLinkClick: 'popover',  // 使用彈出框顯示更多事件
      
      // 配置不同視圖的事件顯示
      dayMaxEventRows: 3, // 默認在月視圖限制
      
      // 根據不同視圖調整顯示方式
      views: {
        dayGridWeek: {
          dayMaxEventRows: false, // 周視圖不限制事件數量
          dayMaxEvents: false // 確保不會出現"顯示更多"按鈕
        },
        dayGridDay: {
          dayMaxEventRows: false, // 日視圖不限制事件數量
          dayMaxEvents: false // 確保不會出現"顯示更多"按鈕
        }
      },
      
      // 事件顏色 (允許事件自行設置顏色)
      eventBackgroundColor: '#6c757d', // 默認灰色
      eventTextColor: '#ffffff',  // 默認白色文字
      
      // 事件布局設置
      
      // 禁用事件拖動
      editable: false,
      
      // 自定義事件渲染
      eventContent: this.customEventContent.bind(this),
      
      // 事件點擊處理
      eventClick: this.handleEventClick.bind(this),
      
      // 視圖渲染完成後處理
      viewDidMount: (arg) => {
        console.log('視圖已加載:', arg.view.type);
        // 儲存當前視圖 (通過程式改變視圖時也會觸發這個事件)
        this.saveCalendarView(arg.view.type);
        
        // 確保周視圖和日視圖顯示所有事件
        if (arg.view.type === 'dayGridWeek' || arg.view.type === 'dayGridDay') {
          setTimeout(() => {
            const moreLinks = document.querySelectorAll('.fc-more-link');
            if (moreLinks.length > 0) {
              console.log('發現顯示更多按鈕，重新渲染視圖');
              arg.view.calendar.changeView(arg.view.type);
            }
          }, 100);
        }
      },
      
      // 日曆視圖初始化後觸發
      datesSet: (dateInfo) => {
        console.log('日曆日期已設置，當前視圖:', dateInfo.view.type);
        // 這裡也保存視圖模式，確保任何方式的視圖變更都能被捕獲
        this.saveCalendarView(dateInfo.view.type);
        
        // 當日曆日期範圍改變時，重新載入表單
        if (this.formsLoaded && this.siteId) {
          const startDate = dayjs(dateInfo.start).format('YYYY-MM-DD');
          const endDate = dayjs(dateInfo.end).subtract(1, 'day').format('YYYY-MM-DD'); // FullCalendar的end是排除的，所以減一天
          
          console.log(`視圖日期範圍改變，重新載入表單: ${startDate} 到 ${endDate}`);
          this.loadForms(startDate, endDate);
        }
      }
    };
  }

  async ngOnInit(): Promise<void> {
    // 重新載入當前使用者的完整資訊，確保工地權限是最新的
    await this.authService.refreshCurrentUser();
    
    // 從父路由獲取工地ID
    const parent = this.route.parent;
    if (parent) {
      parent.paramMap.subscribe(async params => {
        const id = params.get('id');
        if (id) {
          this.siteId = id;

          this.currentSiteService.setCurrentSiteById(this.siteId);
          // 初次載入時，先設置標記為已載入，避免 datesSet 事件重複觸發
          this.formsLoaded = true;
          // 讀取各種表單（會自動使用當前日曆視圖的日期範圍）
          await this.loadForms();
          console.log('表單載入完成，已標記為已載入');
        }
      });
    }
  }
  
  ngAfterViewInit(): void {
    console.log('ngAfterViewInit 被觸發');
    const calendarApi = this.calendarComponent.getApi();
    calendarApi.updateSize();
    console.log('calendar rendered');
    
    // 打印當前視圖，確認是否與保存的視圖一致
    console.log('當前視圖:', calendarApi.view.type);

    // 添加窗口大小變化監聽器，確保日曆能適應窗口大小變化
    window.addEventListener('resize', () => {
      if (this.calendarComponent) {
        calendarApi.updateSize();
      }
    });
    
    // 如果有 siteId 且尚未載入表單，則在日曆初始化完成後載入表單
    if (this.siteId && !this.formsLoaded) {
      setTimeout(async () => {
        console.log('日曆初始化完成，開始載入表單');
        this.formsLoaded = true;
        await this.loadForms();
        console.log('表單載入完成');
      }, 100);
    }
    
    // 添加視圖切換按鈕的事件監聽
    setTimeout(() => {
      this.addViewButtonListeners();
      this.initPermissionInfoModal();
    }, 500);
  }
  
  // 添加視圖切換按鈕的事件監聽
  private addViewButtonListeners(): void {
    console.log('正在添加視圖切換按鈕的事件監聽');
    
    // 獲取所有視圖切換按鈕
    const monthButton = document.querySelector('.fc-dayGridMonth-button');
    const weekButton = document.querySelector('.fc-dayGridWeek-button');
    const dayButton = document.querySelector('.fc-dayGridDay-button');
    
    // 為月視圖按鈕添加事件監聽
    if (monthButton) {
      console.log('找到月視圖按鈕，添加事件監聽');
      monthButton.addEventListener('click', () => {
        console.log('用戶點擊切換到月視圖');
        this.saveCalendarView('dayGridMonth');
      });
    } else {
      console.warn('未找到月視圖按鈕');
    }
    
    // 為周視圖按鈕添加事件監聽
    if (weekButton) {
      console.log('找到周視圖按鈕，添加事件監聽');
      weekButton.addEventListener('click', () => {
        console.log('用戶點擊切換到周視圖');
        this.saveCalendarView('dayGridWeek');
      });
    } else {
      console.warn('未找到周視圖按鈕');
    }
    
    // 為日視圖按鈕添加事件監聽
    if (dayButton) {
      console.log('找到日視圖按鈕，添加事件監聽');
      dayButton.addEventListener('click', () => {
        console.log('用戶點擊切換到日視圖');
        this.saveCalendarView('dayGridDay');
      });
    } else {
      console.warn('未找到日視圖按鈕');
    }
  }
  
  // 保存當前日曆視圖
  private saveCalendarView(viewName: string): void {
    console.log(`正在保存日曆視圖: ${viewName}`);
    try {
      localStorage.setItem(this.CALENDAR_VIEW_KEY, viewName);
      console.log(`已成功保存日曆視圖: ${viewName}`);
    } catch (error) {
      console.error('保存日曆視圖時發生錯誤:', error);
    }
  }
  
  async loadForms(startDate?: string, endDate?: string): Promise<void> {
    try {
      // 如果沒有提供日期範圍，則從日曆API獲取當前視圖的日期範圍
      if (!startDate || !endDate) {
        if (this.calendarComponent) {
          const calendarApi = this.calendarComponent.getApi();
          const currentView = calendarApi.view;
          startDate = dayjs(currentView.activeStart).format('YYYY-MM-DD');
          endDate = dayjs(currentView.activeEnd).format('YYYY-MM-DD');
        } else {
          // 如果日曆還未初始化，使用當前月份作為預設範圍
          const now = dayjs();
          startDate = now.startOf('month').format('YYYY-MM-DD');
          endDate = now.endOf('month').format('YYYY-MM-DD');
        }
      }

      console.log(`載入表單 - 日期範圍: ${startDate} 到 ${endDate}`);

      // 檢查是否需要重新載入所有表單資料（快取過期或首次載入）
      const now = Date.now();
      const needReload = !this.allSiteForms.length || (now - this.lastFormsLoadTime) > this.FORMS_CACHE_DURATION;
      
      if (needReload) {
        console.log('重新載入所有表單資料');
        this.allSiteForms = await this.mongodbService.get('siteForm', {
          siteId: this.siteId,
        });
        this.lastFormsLoadTime = now;
      } else {
        console.log('使用快取的表單資料');
      }

      // 在前端進行日期過濾
      const startDateObj = dayjs(startDate);
      const endDateObj = dayjs(endDate);
      
      const allForms = this.allSiteForms.filter((form: any) => {
        // 取得表單的相關日期
        let formDate: dayjs.Dayjs | null = null;
        
        // 根據表單類型決定使用哪個日期欄位
        if (form.formType === 'sitePermit' && form.workStartTime && form.workEndTime) {
          // 工地許可單：檢查工作期間是否與查詢範圍重疊
          const workStart = dayjs(form.workStartTime);
          const workEnd = dayjs(form.workEndTime);
          return workStart.isSameOrBefore(endDateObj, 'day') && workEnd.isSameOrAfter(startDateObj, 'day');
        } else if (form.applyDate) {
          formDate = dayjs(form.applyDate);
        } else if (form.meetingDate) {
          formDate = dayjs(form.meetingDate);
        } else if (form.checkDate) {
          formDate = dayjs(form.checkDate);
        } else if (form.trainingDate) {
          formDate = dayjs(form.trainingDate);
        } else if (form.createdAt) {
          formDate = dayjs(form.createdAt);
        }
        
        // 檢查日期是否在範圍內
        if (formDate) {
          return formDate.isSameOrAfter(startDateObj, 'day') && formDate.isSameOrBefore(endDateObj, 'day');
        }
        
        return false;
      });

      console.log('載入的表單數據:', allForms);

      // 將表單轉換為日曆事件
      const events = [];

      // 處理所有表單
      for (const form of allForms) {
        // 取得表單狀態對應的顏色
        const statusColor = this.getStatusColor(form.status);
        let displayOrder = 6; // 其他事件預設排第七
        if (form.formType === 'sitePermit') displayOrder = 0; // 工地許可單排第一
        else if (form.formType === 'toolboxMeeting') displayOrder = 1; // 工具箱會議排第二
        else if (form.formType === 'environmentChecklist') displayOrder = 2; // 環安衛自主檢點表排第三
        else if (form.formType === 'specialWorkChecklist') displayOrder = 3; // 特殊作業工安自主檢點表排第四
        else if (form.formType === 'safetyPatrolChecklist') displayOrder = 4; // 工安巡迴檢查表排第五
        else if (form.formType === 'training') displayOrder = 5; // 教育訓練排第六
        
        // 工地許可單特殊處理，顯示為跨天事件
        if (form.formType === 'sitePermit' && form.workStartTime && form.workEndTime) {
          try {
            // 日期格式化 (確保我們有正確的日期字符串格式)
            console.log(`處理工地許可單 ID:${form._id}, 開始時間:${form.workStartTime}, 結束時間:${form.workEndTime}`);

            // 解析開始和結束日期 - 直接使用字符串格式處理
            const startDate = dayjs(form.workStartTime);
            const endDate = dayjs(form.workEndTime);
            
            // 檢查日期是否有效
            if (startDate.isValid() && endDate.isValid()) {
              const startDateStr = startDate.format('YYYY-MM-DD');
              const endDateStr = endDate.add(1, 'day').format('YYYY-MM-DD'); // 結束日期加一天，因為FullCalendar的結束日期是排除的
              
              console.log(`處理跨天事件日期: ${startDateStr} 到 ${endDateStr}`);
              
              // 建立跨天事件
              const event = {
                id: form._id,
                title: this.getFormTypeDisplay(form),
                start: startDateStr,
                end: endDateStr,
                allDay: true,
                display: 'block', // 強制使用區塊顯示，確保跨天事件正確顯示
                backgroundColor: statusColor,
                borderColor: statusColor,
                textColor: '#ffffff',
                displayOrder, // 新增排序欄位
                extendedProps: {
                  formType: form.formType,
                  status: form.status,
                  originalData: form
                }
              };
              
              events.push(event);
              console.log(`添加跨天事件:`, event);
            } else {
              console.error(`無效的日期範圍: 開始=${form.workStartTime}, 結束=${form.workEndTime}`);
            }
          } catch (error) {
            console.error(`處理工地許可單日期時出錯:`, error);
          }
        } else {
          // 其他表單類型處理為單日事件
          const date = form.applyDate || form.meetingDate || form.checkDate || (form as any).trainingDate || form.createdAt;
          
          if (date) {
            const event = {
              id: form._id,
              title: this.getFormTypeDisplay(form),
              date: dayjs(date).format('YYYY-MM-DD'),  // 使用字符串格式
              backgroundColor: statusColor,
              borderColor: statusColor,
              textColor: '#ffffff',
              displayOrder, // 新增排序欄位
              extendedProps: {
                formType: form.formType,
                status: form.status,
                originalData: form
              }
            };
            
            events.push(event);
          }
        }
      }

      // 找出所有工地許可單
      const allPermits = allForms.filter((form: any) => form.formType === 'sitePermit');
      
      // 生成需要檢查的日期集合（只檢查有工作許可單的日期）
      const datesToCheck = new Set<string>();
      
      // 遍歷所有工地許可單，收集所有需要檢查的日期
      allPermits.forEach((permit: any) => {
        if (permit.workStartTime && permit.workEndTime) {
          const startDate = dayjs(permit.workStartTime);
          const endDate = dayjs(permit.workEndTime);
          
          // 確保日期有效
          if (startDate.isValid() && endDate.isValid()) {
            // 生成從開始日期到結束日期的每一天
            let currentDate = startDate.clone();
            while (currentDate.isSameOrBefore(endDate)) {
              datesToCheck.add(currentDate.format('YYYY-MM-DD'));
              currentDate = currentDate.add(1, 'day');
            }
          }
        }
      });
      
      console.log('需要檢查的日期:', Array.from(datesToCheck));
      
      // 對每個日期進行檢查
      datesToCheck.forEach(checkDate => {
        // 1. 檢查是否有工具箱會議
        const hasToolboxMeeting = allForms.some((form: any) => 
          form.formType === 'toolboxMeeting' && 
          dayjs(form.meetingDate || form.applyDate || form.createdAt).format('YYYY-MM-DD') === checkDate
        );
        
        // 如果沒有工具箱會議，添加提醒事件
        if (!hasToolboxMeeting) {
          events.push({
            title: '⚠️ 新增工具箱會議',
            date: checkDate,
            backgroundColor: '#ffcc00',
            borderColor: '#e6b800',
            textColor: '#000000',
            displayOrder: 98, // 提醒事件排最後
            extendedProps: {
              formType: 'reminder',
              isReminder: true,
              reminderType: 'toolboxMeeting'
            }
          });
        }

        // 1.1 檢查是否有環安衛自主檢點表
        const hasEnvironmentChecklist = allForms.some((form: any) => 
          form.formType === 'environmentChecklist' && 
          dayjs(form.checkDate || form.applyDate || form.createdAt).format('YYYY-MM-DD') === checkDate
        );
        
        // 如果沒有環安衛自主檢點表，添加提醒事件
        if (!hasEnvironmentChecklist) {
          events.push({
            title: '⚠️ 新增環安衛自檢表',
            date: checkDate,
            backgroundColor: '#ffcc00',
            borderColor: '#e6b800',
            textColor: '#000000',
            displayOrder: 98, // 提醒事件排最後
            extendedProps: {
              formType: 'reminder',
              isReminder: true,
              reminderType: 'environmentChecklist'
            }
          });
        }
        
        
        // 2. 找出當天有效的工地許可單
        const activePermits = allPermits.filter((permit: any) => {
          // 確保許可單有開始和結束日期
          if (!permit.workStartTime || !permit.workEndTime) return false;
          
          const startDate = dayjs(permit.workStartTime);
          const endDate = dayjs(permit.workEndTime);
          const checkDateObj = dayjs(checkDate);
          
          // 檢查日期是否在許可單的有效期內（含開始和結束日期）
          return checkDateObj.isSameOrAfter(startDate, 'day') && 
                 checkDateObj.isSameOrBefore(endDate, 'day');
        });
        
        // 3. 對每個當天有效的許可單，檢查特殊作業檢點表
        activePermits.forEach((permit: any) => {
          // 檢查許可單內的作業類別
          if (permit.selectedCategories && permit.selectedCategories.length > 0) {
            // 對於每個作業類別，檢查是否有對應的特殊作業工安自主檢點表
            permit.selectedCategories.forEach((category: string) => {
              // 查找當天是否有與此類別相關的特殊作業工安自主檢點表
              const hasCorrespondingChecklist = allForms.some((form: any) => 
                form.formType === 'specialWorkChecklist' && 
                form.workType === category &&
                dayjs(form.checkDate || form.applyDate || form.createdAt).format('YYYY-MM-DD') === checkDate
              );
              
              // 如果沒有對應的檢點表，添加提醒事件
              if (!hasCorrespondingChecklist) {
                events.push({
                  title: `⚠️ 新增「${category}」自檢表`,
                  date: checkDate,
                  backgroundColor: '#ff4500',
                  borderColor: '#cc3700',
                  textColor: '#ffffff',
                  displayOrder: 99, // 提醒事件排最後
                  extendedProps: {
                    formType: 'reminder',
                    isReminder: true,
                    reminderType: 'specialWorkChecklist',
                    workType: category,
                    permitId: permit._id
                  }
                });
              }
            });
          }
        });
      });

      console.log('最終生成的事件列表:', events);

      // 更新日曆事件
      this.calendarOptions.events = events;
      
      // 同時更新 CurrentSiteService 中的表單列表
      await this.currentSiteService.refreshFormsList();
    } catch (error) {
      console.error('載入表單時出錯:', error);
    }
  }

  // 刷新表單快取（在新增或修改表單後調用）
  async refreshFormsCache(): Promise<void> {
    console.log('刷新表單快取');
    this.allSiteForms = [];
    this.lastFormsLoadTime = 0;
    
    if (this.calendarComponent) {
      const calendarApi = this.calendarComponent.getApi();
      const currentView = calendarApi.view;
      const startDate = dayjs(currentView.activeStart).format('YYYY-MM-DD');
      const endDate = dayjs(currentView.activeEnd).subtract(1, 'day').format('YYYY-MM-DD');
      await this.loadForms(startDate, endDate);
    } else {
      await this.loadForms();
    }
  }

  // 獲取表單類型的顯示名稱
  getFormTypeDisplay(form: SiteForm): string {
    switch(form.formType) {
      case 'sitePermit':
        // 為工地許可單添加四個簽名狀態圖示
        let title = '工地許可單';
        
        // 四個簽名狀態的圖示：✓(已簽) 或 ✗(未簽)
        const anyForm = form as any; // 使用 any 型別避免型別檢查錯誤
        const signature1 = anyForm.applicantSignature?.signature ? '✅' : '❌';
        const signature2 = anyForm.departmentManagerSignature?.signature ? '✅' : '❌';
        const signature3 = anyForm.reviewSignature?.signature ? '✅' : '❌';
        const signature4 = anyForm.approvalSignature?.signature ? '✅' : '❌';
        
        // 不再在標題中包含圖標，改為在 eventContent 中處理
        return title;
      case 'toolboxMeeting':
        return '工具箱會議';
      case 'environmentChecklist':
        return '環安衛自檢表';
      case 'specialWorkChecklist':
        return '特殊作業自檢表-' + (form as any).workType;
      case 'safetyPatrolChecklist':
        return '工安巡迴檢查表';
      case 'defectRecord':
        return '缺失記錄單';
      case 'safetyIssueRecord':
        return '安全缺失記錄單';
      case 'hazardNotice':
        // 後面加上工程名稱。例如：危害告知單-工程名稱
        const workName = (form as any).workName;
        return workName ? `危害告知單-${workName}` : '危害告知單';
      case 'training':
        const courseName = (form as any).courseName;
        return courseName ? `教育訓練-${courseName}` : '教育訓練';
      default:
        return form.formType;
    }
  }

  // 獲取狀態對應的顏色
  getStatusColor(status: string): string {
    switch(status) {
      case 'draft':
        return '#6c757d'; // 灰色-草稿
      case 'pending':
        return '#ffc107'; // 黃色-待審核
      case 'approved':
        return '#28a745'; // 綠色-已核准
      case 'rejected':
        return '#dc3545'; // 紅色-已拒絕
      default:
        return '#6c757d'; // 預設灰色
    }
  }

  // 將事件點擊處理提取為單獨的方法
  handleEventClick(info: any): void {
    // 檢查是否是提醒事件
    if (info.event.extendedProps['isReminder']) {
      const reminderType = info.event.extendedProps['reminderType'];
      
      // 獲取事件的日期
      const eventDate = info.event.start ? dayjs(info.event.start).format('YYYY-MM-DD') : undefined;
      
      // 根據提醒類型執行不同的操作
      if (reminderType === 'toolboxMeeting') {
        // 如果是工具箱會議提醒，導航到創建工具箱會議頁面，並傳遞日期參數
        this.createToolboxMeeting(eventDate);
        return;
      } else if (reminderType === 'environmentChecklist') {
        // 如果是環安衛自主檢點表提醒，導航到創建環安衛自主檢點表頁面
        this.createEnvironmentCheckList(eventDate);
        return;
      } else if (reminderType === 'specialWorkChecklist') {
        // 如果是特殊作業檢點表提醒，導航到創建特殊作業檢點表頁面
        const workCategory = info.event.extendedProps['workCategory'];
        const permitId = info.event.extendedProps['permitId'];
        
        // 導航到特殊作業檢點表創建頁面，並攜帶作業類別和許可單ID以及日期
        this.router.navigate(
          ['/site', this.siteId, 'forms', 'create-special-work-checklist'], 
          { 
            queryParams: { 
              workCategory: workCategory,
              permitId: permitId,
              date: eventDate // 添加日期參數
            } 
          }
        );
        return;
      }
    }
    
    // 獲取事件ID和類型
    const eventId = info.event.id;
    const formType = info.event.extendedProps['formType'];
    
    if (eventId) {
      // 根據表單類型構建路由
      let route: string[] = [];
      
      // 使用 formType 決定路由
      switch (formType) {
        case 'sitePermit':
          route = ['/site', this.siteId, 'forms', 'permit', eventId];
          break;
        case 'toolboxMeeting':
          route = ['/site', this.siteId, 'forms', 'toolbox-meeting', eventId];
          break;
        case 'environmentChecklist':
          route = ['/site', this.siteId, 'forms', 'environment-check-list', eventId];
          break;
        case 'specialWorkChecklist':
          route = ['/site', this.siteId, 'forms', 'special-work-checklist', eventId];
          break;
        case 'safetyPatrolChecklist':
          route = ['/site', this.siteId, 'forms', 'safety-patrol-checklist', eventId];
          break;
        case 'defectRecord':
        case 'safetyIssueRecord':
          route = ['/site', this.siteId, 'forms', 'safety-issue-record', eventId];
          break;
        case 'hazardNotice':
          route = ['/site', this.siteId, 'forms', 'hazard-notice', eventId];
          break;
        case 'training':
          route = ['/site', this.siteId, 'training', eventId];
          break;
        default:
          // 當 formType 不明確或不存在時，使用標題來判斷
          const eventType = info.event.title;
          const title = eventType.trim().split(/\s+/)[0]; // 取第一個詞作為表單類型
          
          // 根據標題決定路由（備用方案）
          if (title.includes('工地許可單')) {
            route = ['/site', this.siteId, 'forms', 'permit', eventId];
          } else if (title.includes('工具箱會議')) {
            route = ['/site', this.siteId, 'forms', 'toolbox-meeting', eventId];
          } else if (title.includes('環安衛自主檢點')) {
            route = ['/site', this.siteId, 'forms', 'environment-check-list', eventId];
          } else if (title.includes('特殊作業') || title.includes('檢點表')) {
            route = ['/site', this.siteId, 'forms', 'special-work-checklist', eventId];
          } else if (title.includes('工安巡迴檢查表')) {
            route = ['/site', this.siteId, 'forms', 'safety-patrol-checklist', eventId];
          } else if (title.includes('缺失記錄') || title.includes('安全缺失')) {
            route = ['/site', this.siteId, 'forms', 'safety-issue-record', eventId];
          } else if (title.includes('危害告知')) {
            route = ['/site', this.siteId, 'forms', 'hazard-notice', eventId];
          } else if (title.includes('教育訓練') || title === 'training') {
            route = ['/site', this.siteId, 'training', eventId];
          } else {
            route = ['/site', this.siteId, 'forms', 'view', eventId];
          }
      }
      
      // 在同一個視窗中導航
      this.router.navigate(route);
    }
  }
  
  // 自定義事件渲染函數
  customEventContent(arg: any): any {
    const formType = arg.event.extendedProps['formType'];
    const isReminder = arg.event.extendedProps['isReminder'];
    
    // 檢查是否是提醒事件
    if (isReminder) {
      const reminderType = arg.event.extendedProps['reminderType'];
      
      // 創建自定義DOM元素
      const wrapper = document.createElement('div');
      wrapper.className = 'reminder-event';
      wrapper.style.cursor = 'pointer';
      wrapper.style.padding = '4px 6px';
      wrapper.style.borderRadius = '4px';
      wrapper.style.fontWeight = 'bold';
      wrapper.style.width = '100%';
      wrapper.style.animation = 'blink 1s ease-in-out infinite alternate';
      
      // 根據提醒類型設置不同的樣式
      if (reminderType === 'toolboxMeeting') {
        wrapper.style.backgroundColor = '#ffcc00';
        wrapper.style.color = '#000000';
      } else if (reminderType === 'specialWorkChecklist') {
        wrapper.style.backgroundColor = '#ff4500';
        wrapper.style.color = '#ffffff';
      }
      
      // 添加標題，修改為適應長文字，不置中（不再添加額外的圖標）
      wrapper.innerHTML = `
        <div style="display: flex; flex-wrap: wrap; align-items: center;">
          <span style="word-break: break-word; white-space: normal; overflow-wrap: break-word;">${arg.event.title}</span>
        </div>
      `;
      
      // 返回自定義內容
      return { domNodes: [wrapper] };
    }
    
    // 工地許可單特殊處理 - 添加簽名圖標
    if (formType === 'sitePermit') {
      // 創建外層容器
      const wrapper = document.createElement('div');
      wrapper.className = 'custom-event permit-event';
      wrapper.style.padding = '4px';
      wrapper.style.borderRadius = '4px';
      wrapper.style.fontWeight = 'bold';
      wrapper.style.width = '100%';
      
      // 獲取簽名狀態
      const event = arg.event;
      const anyProps = event.extendedProps as any;
      
      // 取得表單資料
      const permitData = anyProps.originalData || {};
      
      // 四個簽名狀態的圖示
      const signature1 = permitData.applicantSignature?.signature ? '✅' : '❌';
      const signature2 = permitData.departmentManagerSignature?.signature ? '✅' : '❌';
      const signature3 = permitData.reviewSignature?.signature ? '✅' : '❌';
      const signature4 = permitData.approvalSignature?.signature ? '✅' : '❌';
      
      // 完全重寫布局方式，強制圖示在標題右側
      wrapper.innerHTML = `
        <div style="position: relative; width: 100%;">
          ${event.title}
            ${signature1}${signature2}${signature3}${signature4}
        </div>
      `;
      
      // 設置事件顏色
      const backgroundColor = event.backgroundColor || this.getStatusColor(event.extendedProps['status']);
      const textColor = event.textColor || '#ffffff';
      
      wrapper.style.backgroundColor = backgroundColor as string;
      wrapper.style.color = textColor as string;
      
      return { domNodes: [wrapper] };
    }
    
    // 處理一般事件的自定義渲染
    const wrapper = document.createElement('div');
    wrapper.className = 'custom-event';
    wrapper.style.padding = '4px 6px';
    wrapper.style.borderRadius = '4px';
    wrapper.style.fontWeight = 'bold';
    wrapper.style.width = '100%';
    
    // 使用事件的背景色和文字顏色
    const backgroundColor = arg.event.backgroundColor || this.getStatusColor(arg.event.extendedProps['status']);
    const textColor = arg.event.textColor || '#ffffff';
    
    wrapper.style.backgroundColor = backgroundColor as string;
    wrapper.style.color = textColor as string;
    
    // 設置事件標題
    wrapper.textContent = arg.event.title;
    
    // 返回自定義內容
    return { domNodes: [wrapper] };
  }

  ngOnDestroy(): void {
    // 移除窗口大小變化監聽器，避免內存泄漏
    window.removeEventListener('resize', () => {
      if (this.calendarComponent) {
        this.calendarComponent.getApi().updateSize();
      }
    });
    
    // 移除視圖切換按鈕的事件監聽器
    const monthButton = document.querySelector('.fc-dayGridMonth-button');
    const weekButton = document.querySelector('.fc-dayGridWeek-button');
    const dayButton = document.querySelector('.fc-dayGridDay-button');
    
    if (monthButton) {
      monthButton.removeEventListener('click', () => {});
    }
    
    if (weekButton) {
      weekButton.removeEventListener('click', () => {});
    }
    
    if (dayButton) {
      dayButton.removeEventListener('click', () => {});
    }
  }

  // 導航到創建工地許可單頁面
  createSitePermit(): void {
    if (this.siteId) {
      this.router.navigate(['/site', this.siteId, 'forms', 'create-permit']);
    } else {
      console.error('缺少工地ID，無法導航到工地許可單表單頁面');
    }
  }

  // 導航到創建工具箱會議頁面
  createToolboxMeeting(date?: string): void {
    if (this.siteId) {
      // 如果有日期參數，則添加到查詢參數中
      const queryParams = date ? { date } : {};
      
      this.router.navigate(
        ['/site', this.siteId, 'forms', 'create-toolbox-meeting'],
        { queryParams }
      );
    } else {
      console.error('缺少工地ID，無法導航到工具箱會議表單頁面');
    }
  }

  // 導航到創建環安衛自主檢點表頁面
  createEnvironmentCheckList(date?: string): void {
    if (this.siteId) {
      // 如果有日期參數，則添加到查詢參數中
      const queryParams = date ? { date } : {};
      
      this.router.navigate(
        ['/site', this.siteId, 'forms', 'create-environment-check-list'],
        { queryParams }
      );
    } else {
      console.error('缺少工地ID，無法導航到環安衛自主檢點表頁面');
    }
  }

  // 導航到創建特殊作業自主檢點表頁面
  createSpecialWorkChecklist(): void {
    if (this.siteId) {
      this.router.navigate(['/site', this.siteId, 'forms', 'create-special-work-checklist']);
    } else {
      console.error('缺少工地ID，無法導航到特殊作業自主檢點表頁面');
    }
  }

  // 導航到創建缺失記錄單頁面
  createSafetyIssueRecord(): void {
    if (this.siteId) {
      this.router.navigate(['/site', this.siteId, 'forms', 'create-safety-issue-record']);
    } else {
      console.error('缺少工地ID，無法導航到缺失記錄單頁面');
    }
  }

  // 導航到創建工安巡迴檢查表頁面
  createSafetyPatrolChecklist(): void {
    if (this.siteId) {
      this.router.navigate(['/site', this.siteId, 'forms', 'create-safety-patrol-checklist']);
    } else {
      console.error('缺少工地ID，無法導航到工安巡迴檢查表頁面');
    }
  }

  // 導航到創建教育訓練頁面
  createTraining(): void {
    if (this.siteId) {
      this.router.navigate(['/site', this.siteId, 'training', 'create']);
    } else {
      console.error('缺少工地ID，無法導航到教育訓練頁面');
    }
  }

  // 檢查當前使用者是否有權限新增環安衛自主檢點表
  canCreateEnvironmentCheckList(): boolean {
    const user = this.currentUser();
    if (!user || !this.siteId) return false;
    
    // 取得當前使用者在此工地的角色
    const userSiteRole = user.belongSites?.find(site => site.siteId === this.siteId)?.role;
    
    // 專案經理、專案工程師、工地經理、環安主管、環安工程師可以新增環安衛自主檢點表
    return userSiteRole === 'projectManager' || 
           userSiteRole === 'projectEngineer' || 
           userSiteRole === 'siteManager' || 
           userSiteRole === 'safetyManager' || 
           userSiteRole === 'safetyEngineer';
  }

  // 檢查當前使用者是否有權限新增工地許可單
  canCreateSitePermit(): boolean {
    const user = this.currentUser();
    if (!user || !this.siteId) return false;
    
    // 取得當前使用者在此工地的角色
    const userSiteRole = user.belongSites?.find(site => site.siteId === this.siteId)?.role;
    
    // 所有角色都可以新增工地許可單
    return userSiteRole === 'projectManager' || 
           userSiteRole === 'secretary' || 
           userSiteRole === 'projectEngineer' || 
           userSiteRole === 'siteManager' || 
           userSiteRole === 'safetyManager' || 
           userSiteRole === 'safetyEngineer';
  }

  // 檢查當前使用者是否有權限新增工具箱會議
  canCreateToolboxMeeting(): boolean {
    const user = this.currentUser();
    if (!user || !this.siteId) return false;
    
    // 取得當前使用者在此工地的角色
    const userSiteRole = user.belongSites?.find(site => site.siteId === this.siteId)?.role;
    
    // 專案經理、工地經理、環安主管、環安工程師可以新增工具箱會議
    return userSiteRole === 'projectManager' || 
           userSiteRole === 'siteManager' || 
           userSiteRole === 'safetyManager' || 
           userSiteRole === 'safetyEngineer';
  }

  // 檢查當前使用者是否有權限新增特殊作業自主檢點表
  canCreateSpecialWorkChecklist(): boolean {
    const user = this.currentUser();
    if (!user || !this.siteId) return false;
    
    // 取得當前使用者在此工地的角色
    const userSiteRole = user.belongSites?.find(site => site.siteId === this.siteId)?.role;
    
    // 專案經理、專案工程師、工地經理、環安主管、環安工程師可以新增特殊作業自主檢點表
    return userSiteRole === 'projectManager' || 
           userSiteRole === 'projectEngineer' || 
           userSiteRole === 'siteManager' || 
           userSiteRole === 'safetyManager' || 
           userSiteRole === 'safetyEngineer';
  }

  // 檢查當前使用者是否有權限新增缺失紀錄單
  canCreateSafetyIssueRecord(): boolean {
    const user = this.currentUser();
    if (!user || !this.siteId) return false;
    
    // 取得當前使用者在此工地的角色
    const userSiteRole = user.belongSites?.find(site => site.siteId === this.siteId)?.role;
    
    // 專案經理、專案工程師、工地經理、環安主管、環安工程師可以新增缺失紀錄單
    return userSiteRole === 'projectManager' || 
           userSiteRole === 'projectEngineer' || 
           userSiteRole === 'siteManager' || 
           userSiteRole === 'safetyManager' || 
           userSiteRole === 'safetyEngineer';
  }

  // 檢查當前使用者是否有權限新增工安巡迴檢查表
  canCreateSafetyPatrolChecklist(): boolean {
    const user = this.currentUser();
    if (!user || !this.siteId) return false;
    
    // 取得當前使用者在此工地的角色
    const userSiteRole = user.belongSites?.find(site => site.siteId === this.siteId)?.role;
    
    // 只有環安主管、環安工程師可以新增工安巡迴檢查表
    return userSiteRole === 'safetyManager' || 
           userSiteRole === 'safetyEngineer';
  }

  // 檢查當前使用者是否有權限新增教育訓練
  canCreateTraining(): boolean {
    const user = this.currentUser();
    if (!user || !this.siteId) return false;
    
    // 取得當前使用者在此工地的角色
    const userSiteRole = user.belongSites?.find(site => site.siteId === this.siteId)?.role;
    
    // 所有角色都可以新增教育訓練
    return userSiteRole === 'projectManager' || 
           userSiteRole === 'secretary' || 
           userSiteRole === 'projectEngineer' || 
           userSiteRole === 'siteManager' || 
           userSiteRole === 'safetyManager' || 
           userSiteRole === 'safetyEngineer';
  }

  // 初始化權限說明 Modal
  private initPermissionInfoModal(): void {
    const permissionInfoModalEl = document.getElementById('permissionInfoModal');
    if (permissionInfoModalEl) {
      this.permissionInfoModal = new bootstrap.Modal(permissionInfoModalEl);
    }
  }

  // 顯示權限說明 Modal
  showPermissionInfo(): void {
    if (this.permissionInfoModal) {
      this.permissionInfoModal.show();
    }
  }
}
