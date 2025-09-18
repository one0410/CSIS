import { Injectable, inject, effect, OnDestroy } from '@angular/core';
import { Site } from '../site-list/site-list.component';
import { MongodbService } from './mongodb.service';
import { SocketService } from './socket.service';
import { AuthService } from './auth.service';
import { Signal, computed, signal } from '@angular/core';
import { Equipment } from '../model/equipment.model';
import { SiteForm } from '../model/siteForm.model';
import { Worker } from '../model/worker.model';
import dayjs from 'dayjs';
import isSameOrBefore from 'dayjs/plugin/isSameOrBefore';
import isSameOrAfter from 'dayjs/plugin/isSameOrAfter';

// 添加 dayjs 插件
dayjs.extend(isSameOrBefore);
dayjs.extend(isSameOrAfter);

@Injectable({
  providedIn: 'root'
})
export class CurrentSiteService implements OnDestroy {
  private currentSiteSignal = signal<Site | null>(null);
  private loadedSiteId: string | null = null;
  private equipmentListSignal = signal<Equipment[]>([]);
  private formsListSignal = signal<SiteForm[]>([]);
  private workersListSignal = signal<Worker[]>([]);

  // 提供一個computed signal來獲取當前工地
  currentSite = computed(() => this.currentSiteSignal());

  // 提供一個computed signal來獲取當前工地的機具列表
  equipmentList = computed(() => this.equipmentListSignal());

  // 提供一個computed signal來獲取當前工地的表單列表
  formsList = computed(() => this.formsListSignal());

  // 提供一個computed signal來獲取當前工地的工人列表
  workersList = computed(() => this.workersListSignal());

  // 計算不合格機具的數量
  disqualifiedEquipmentCount = computed(() => {
    return this.equipmentListSignal().filter(equipment =>
      equipment.isQualified === false && equipment.inspectionDate !== undefined
    ).length;
  });

  // 計算即將到期和已過期的檢查數量（到期前3天 + 已過期）
  expiringInspectionCount = computed(() => {
    const today = dayjs();
    const threeDaysLater = today.add(3, 'day');

    return this.equipmentListSignal().filter(equipment => {
      const nextInspectionDate = this.getNextInspectionDate(equipment);
      if (!nextInspectionDate) return false;

      const nextDate = dayjs(nextInspectionDate);
      // 包含已過期和即將到期（3天內）的檢查
      return nextDate.isSameOrBefore(threeDaysLater);
    }).length;
  });

  // 計算下次檢查日期（如果沒有設定但有意義的檢查類型，則自動計算）
  private getNextInspectionDate(equipment: Equipment): Date | null {
    // 如果有設定具體的下次檢查日期，直接返回
    if (equipment.nextInspectionDate) {
      return equipment.nextInspectionDate;
    }

    // 如果有檢查日期和檢查類型，且不是自定義類型，則自動計算
    if (equipment.inspectionDate && equipment.nextInspectionType && equipment.nextInspectionType !== 'custom') {
      const baseDate = new Date(equipment.inspectionDate);
      let nextDate: Date;

      switch (equipment.nextInspectionType) {
        case 'weekly':
          nextDate = new Date(baseDate.getTime() + 7 * 24 * 60 * 60 * 1000);
          break;
        case 'monthly':
          nextDate = new Date(baseDate.getFullYear(), baseDate.getMonth() + 1, baseDate.getDate());
          break;
        case 'quarterly':
          nextDate = new Date(baseDate.getFullYear(), baseDate.getMonth() + 3, baseDate.getDate());
          break;
        case 'biannual':
          nextDate = new Date(baseDate.getFullYear(), baseDate.getMonth() + 6, baseDate.getDate());
          break;
        case 'yearly':
          nextDate = new Date(baseDate.getFullYear() + 1, baseDate.getMonth(), baseDate.getDate());
          break;
        default:
          return null;
      }

      return nextDate;
    }

    // 如果是自定義類型但沒有設定具體日期，返回 null
    if (equipment.nextInspectionType === 'custom' && !equipment.nextInspectionDate) {
      return null;
    }

    return null;
  }

  // 計算機具管理的總警告數量（不合格 + 即將到期）
  equipmentWarningCount = computed(() => {
    return this.disqualifiedEquipmentCount() + this.expiringInspectionCount();
  });

  // 計算沒有簽署危害告知的工人數量
  workersWithoutHazardNoticeCount = computed(() => {
    const workers = this.workersListSignal();
    const forms = this.formsListSignal();

    // 獲取所有危害告知表單
    const hazardNoticeForms = forms.filter(form => form.formType === 'hazardNotice');

    // 收集所有已簽名的工人身份證號碼或電話號碼
    const signedWorkerIds = new Set<string>();

    hazardNoticeForms.forEach((form: any) => {
      if (form.workerSignatures && form.workerSignatures.length > 0) {
        form.workerSignatures.forEach((signature: any) => {
          if (signature.idno) {
            signedWorkerIds.add(signature.idno);
          }
          if (signature.tel) {
            signedWorkerIds.add(signature.tel);
          }
        });
      }
    });

    // 計算沒有簽署危害告知的工人數量
    const workersWithoutHazardNotice = workers.filter(worker => {
      const hasHazardNotice = signedWorkerIds.has(worker.idno) ||
        (worker.tel ? signedWorkerIds.has(worker.tel) : false);
      return !hasHazardNotice;
    });

    return workersWithoutHazardNotice.length;
  });

  // 計算今天需要填寫但還沒填寫的表單數量
  pendingFormsCount = computed(() => {
    const forms = this.formsListSignal();
    const today = dayjs().format('YYYY-MM-DD');
    let pendingCount = 0;

    console.log('=== 計算待填表單數量 ===');
    console.log('今天日期:', today);
    console.log('表單總數:', forms.length);
    console.log('表單列表:', forms);

    // 找出所有工地許可單
    const allPermits = forms.filter((form: any) => form.formType === 'sitePermit');
    console.log('工地許可單數量:', allPermits.length);

    // 找出今天有效的許可單
    const activePermits = allPermits.filter((permit: any) => {
      if (!permit.workStartTime || !permit.workEndTime) return false;

      const startDate = dayjs(permit.workStartTime);
      const endDate = dayjs(permit.workEndTime);
      const todayObj = dayjs(today);

      const isActive = todayObj.isSameOrAfter(startDate, 'day') &&
        todayObj.isSameOrBefore(endDate, 'day');

      console.log(`許可單 ${permit._id}: ${startDate.format('YYYY-MM-DD')} 到 ${endDate.format('YYYY-MM-DD')}, 今天有效: ${isActive}`);

      return isActive;
    });

    console.log('今天有效的許可單數量:', activePermits.length);

    // 如果今天有有效的許可單，檢查是否需要工具箱會議
    if (activePermits.length > 0) {
      const toolboxMeetings = forms.filter((form: any) => form.formType === 'toolboxMeeting');
      console.log('工具箱會議總數:', toolboxMeetings.length);

      const hasToolboxMeeting = forms.some((form: any) => {
        const isToolboxMeeting = form.formType === 'toolboxMeeting';
        const meetingDate = dayjs(form.meetingDate || form.applyDate || form.createdAt).format('YYYY-MM-DD');
        const isToday = meetingDate === today;

        if (isToolboxMeeting) {
          console.log(`工具箱會議: 日期=${meetingDate}, 是今天=${isToday}`);
        }

        return isToolboxMeeting && isToday;
      });

      console.log('今天是否有工具箱會議:', hasToolboxMeeting);

      if (!hasToolboxMeeting) {
        pendingCount++;
        console.log('需要工具箱會議，待填數量+1');
      }

      // 檢查是否有環安衛自主檢點表
      const hasEnvironmentChecklist = forms.some((form: any) => {
        const isEnvironmentChecklist = form.formType === 'environmentChecklist';
        const checkDate = dayjs(form.checkDate || form.applyDate || form.createdAt).format('YYYY-MM-DD');
        const isToday = checkDate === today;

        if (isEnvironmentChecklist) {
          console.log(`環安衛自主檢點表: 日期=${checkDate}, 是今天=${isToday}`);
        }

        return isEnvironmentChecklist && isToday;
      });

      console.log('今天是否有環安衛自主檢點表:', hasEnvironmentChecklist);

      if (!hasEnvironmentChecklist) {
        pendingCount++;
        console.log('需要環安衛自主檢點表，待填數量+1');
      }

      // 檢查特殊作業檢點表
      activePermits.forEach((permit: any) => {
        if (permit.selectedCategories && permit.selectedCategories.length > 0) {
          console.log(`許可單 ${permit._id} 的作業類別:`, permit.selectedCategories);
          permit.selectedCategories.forEach((category: string) => {
            const hasCorrespondingChecklist = forms.some((form: any) =>
              form.formType === 'specialWorkChecklist' &&
              form.workType === category &&
              dayjs(form.checkDate || form.applyDate || form.createdAt).format('YYYY-MM-DD') === today
            );

            console.log(`作業類別 ${category} 今天是否有檢點表:`, hasCorrespondingChecklist);

            if (!hasCorrespondingChecklist) {
              pendingCount++;
              console.log(`需要 ${category} 檢點表，待填數量+1`);
            }
          });
        }
      });
    } else {
      console.log('今天沒有有效的許可單');
    }

    console.log('最終待填表單數量:', pendingCount);
    console.log('=== 計算完成 ===');

    return pendingCount;
  });

  private socketService = inject(SocketService);
  private authService = inject(AuthService);
  private _isWebSocketActive = signal<boolean>(false);

  constructor(private mongodbService: MongodbService) {
    // 檢查sessionStorage中是否有保存的工地ID
    this.loadSavedSite();

    // 監聽使用者變化，自動設定 WebSocket 監聽器
    effect(() => {
      const user = this.authService.user();
      if (user && this._isWebSocketActive()) {
        this.setupWebSocketListeners();
      }
    });
  }

  ngOnDestroy() {
    this.disconnectWebSocket();
  }

  /**
   * 設置當前工地
   */
  async setCurrentSite(site: Site) {
    this.currentSiteSignal.set(site);
    this.loadedSiteId = site?._id || null;

    // 保存到sessionStorage
    if (site && site._id) {
      sessionStorage.setItem('currentSiteId', site._id);
      // 載入該工地的機具列表、表單列表和工人列表
      await Promise.all([
        this.loadEquipmentList(site._id),
        this.loadFormsList(site._id),
        this.loadWorkersList(site._id)
      ]);
    } else {
      // 清空列表
      this.equipmentListSignal.set([]);
      this.formsListSignal.set([]);
      this.workersListSignal.set([]);
    }
  }

  /**
   * 根據ID設置當前工地
   */
  async setCurrentSiteById(siteId: string) {
    if (!siteId) return null;

    try {
      // 如果已經載入相同 ID 的工地，直接返回緩存資料
      if (this.loadedSiteId === siteId && this.currentSiteSignal()) {
        return this.currentSiteSignal();
      }

      const site = await this.mongodbService.getById('site', siteId);
      if (site) {
        await this.setCurrentSite(site);
        return site;
      }
    } catch (error) {
      console.error('載入工地信息時發生錯誤', error);
    }
    return null;
  }

  /**
   * 載入指定工地的機具列表
   */
  async loadEquipmentList(siteId: string) {
    if (!siteId) {
      this.equipmentListSignal.set([]);
      return;
    }

    try {
      const equipment = await this.mongodbService.getArray('equipment', {
        siteId: siteId,
      }, {
        projection: {
          _id: 1,
          siteId: 1,
          company: 1,
          name: 1,
          model: 1,
          serialNumber: 1,
          inspectionDate: 1,
          isQualified: 1,
          nextInspectionType: 1,
          nextInspectionDate: 1,
          status: 1,
          location: 1,
          // 排除大型或不常用欄位以減少傳輸量
          photos: -1,
          description: -1,
          purchaseDate: -1,
          maintenanceDate: -1,
          createdAt: -1,
          updatedAt: -1
        }
      });
      // 處理返回結果
      let equipmentData: any[] = [];
      if (equipment && typeof equipment === 'object' && 'data' in equipment && 'pagination' in equipment) {
        // 新的分頁格式
        equipmentData = equipment.data as any[];
      } else {
        // 舊格式，直接是陣列
        equipmentData = Array.isArray(equipment) ? equipment : [];
      }
      
      console.log('📊 載入機具列表成功 (優化後):', {
        total: equipmentData.length,
        '優化說明': '已排除大型欄位 (photos, description, purchaseDate, maintenanceDate, createdAt, updatedAt) 以減少傳輸量'
      });
      this.equipmentListSignal.set(equipmentData);
    } catch (error) {
      console.error('載入機具列表時發生錯誤', error);
      this.equipmentListSignal.set([]);
    }
  }

  /**
   * 載入指定工地的表單列表
   * 只載入相關日期範圍內的表單以提升效能
   */
  async loadFormsList(siteId: string) {
    if (!siteId) {
      this.formsListSignal.set([]);
      return;
    }

    try {
      const today = dayjs();
      const startDate = today.subtract(7, 'day').format('YYYY-MM-DD');
      const endDate = today.add(7, 'day').format('YYYY-MM-DD');
      const todayStr = today.format('YYYY-MM-DD');

      // 分別載入不同類型的表單以優化查詢
      const [permits, todayForms, hazardNotices] = await Promise.all([
        // 載入可能包含今天的工地許可單（過去7天到未來7天）
        this.mongodbService.getArray('siteForm', {
          siteId: siteId,
          formType: 'sitePermit',
          $or: [
            {
              workStartTime: { $lte: endDate },
              workEndTime: { $gte: startDate }
            },
            {
              applyDate: { $gte: startDate, $lte: endDate }
            }
          ]
        }, {
          projection: {
            _id: 1,
            siteId: 1,
            formType: 1,
            applyDate: 1,
            workStartTime: 1,
            workEndTime: 1,
            applicant: 1,
            selectedCategories: 1,
            status: 1,
            // 排除大型欄位以減少傳輸量
            workContent: -1,
            remarks: -1,
            signatures: -1,
            attachments: -1
          },
          limit: 5000, // 設定查詢上限
          sort: { createdAt: -1 }
        }),

        // 載入今天的其他表單類型
        this.mongodbService.getArray('siteForm', {
          siteId: siteId,
          formType: { $in: ['toolboxMeeting', 'environmentChecklist', 'specialWorkChecklist'] },
          $or: [
            { meetingDate: { $gte: todayStr, $lte: todayStr } },
            { checkDate: { $gte: todayStr, $lte: todayStr } },
            { applyDate: { $gte: todayStr, $lte: todayStr } }
          ]
        }, {
          projection: {
            _id: 1,
            siteId: 1,
            formType: 1,
            applyDate: 1,
            meetingDate: 1,
            checkDate: 1,
            status: 1,
            workType: 1, // 特殊作業檢點表需要這個欄位
            // 排除大型欄位以減少傳輸量
            signatures: -1,
            attachments: -1,
            remarks: -1
          },
          limit: 200, // 設定查詢上限
          sort: { createdAt: -1 }
        }),

        // 載入危害告知表單（用於計算工人簽署狀況，最近30天）
        this.mongodbService.getArray('siteForm', {
          siteId: siteId,
          formType: 'hazardNotice',
          applyDate: { $gte: today.subtract(30, 'day').format('YYYY-MM-DD') }
        }, {
          projection: {
            _id: 1,
            siteId: 1,
            formType: 1,
            applyDate: 1,
            status: 1,
            workerSignatures: 1, // 計算工人簽署狀況需要這個欄位
            // 排除大型欄位以減少傳輸量
            attachments: -1,
            remarks: -1
          },
          limit: 300, // 設定查詢上限
          sort: { createdAt: -1 }
        })
      ]);

      // 處理返回結果
      let permitsData: any[] = [];
      let todayFormsData: any[] = [];
      let hazardNoticesData: any[] = [];
      
      if (permits && typeof permits === 'object' && 'data' in permits && 'pagination' in permits) {
        permitsData = permits.data as any[];
      } else {
        permitsData = Array.isArray(permits) ? permits : [];
      }
      
      if (todayForms && typeof todayForms === 'object' && 'data' in todayForms && 'pagination' in todayForms) {
        todayFormsData = todayForms.data as any[];
      } else {
        todayFormsData = Array.isArray(todayForms) ? todayForms : [];
      }
      
      if (hazardNotices && typeof hazardNotices === 'object' && 'data' in hazardNotices && 'pagination' in hazardNotices) {
        hazardNoticesData = hazardNotices.data as any[];
      } else {
        hazardNoticesData = Array.isArray(hazardNotices) ? hazardNotices : [];
      }
      
      // 合併所有表單
      const allForms = [...permitsData, ...todayFormsData, ...hazardNoticesData];

      console.log('📊 載入表單列表成功 (優化後):', {
        permits: permitsData.length,
        todayForms: todayFormsData.length,
        hazardNotices: hazardNoticesData.length,
        total: allForms.length,
        '優化說明': '已排除大型欄位 (signatures, attachments, remarks, workContent) 以減少傳輸量'
      });

      this.formsListSignal.set(allForms);
    } catch (error) {
      console.error('載入表單列表時發生錯誤', error);
      this.formsListSignal.set([]);
    }
  }

  /**
   * 載入指定工地的工人列表（排除訪客）
   */
  async loadWorkersList(siteId: string) {
    if (!siteId) {
      this.workersListSignal.set([]);
      return;
    }

    try {
      const workers = await this.mongodbService.getArray('worker', {
        belongSites: { $elemMatch: { siteId: siteId } }
      }, {
        projection: {
          _id: 1,
          name: 1,
          tel: 1,
          idno: 1,
          contractingCompanyName: 1,
          belongSites: 1,
          // 排除大型欄位以減少傳輸量
          profilePicture: -1,
          idCardFrontPicture: -1,
          idCardBackPicture: -1,
          laborInsurancePicture: -1,
          sixHourTrainingFrontPicture: -1,
          sixHourTrainingBackPicture: -1,
          medicalExamPictures: -1,
          accidentInsurances: -1,
          certifications: -1
        }
      });

      // 處理返回結果
      let workersData: any[] = [];
      if (workers && typeof workers === 'object' && 'data' in workers && 'pagination' in workers) {
        // 新的分頁格式
        workersData = workers.data as any[];
      } else {
        // 舊格式，直接是陣列
        workersData = Array.isArray(workers) ? workers : [];
      }
      
      // 過濾掉訪客，只保留工作人員
      const filteredWorkers = workersData.filter((worker: Worker) => {
        const siteInfo = worker.belongSites?.find(site => site.siteId === siteId);
        return siteInfo && !siteInfo.isVisitor; // 排除訪客
      });

      console.log('📊 載入工人列表成功 (優化後):', {
        total: filteredWorkers.length,
        '優化說明': '已排除大型欄位 (profilePicture, idCardPictures, laborInsurancePicture, trainingPictures, medicalExamPictures, accidentInsurances, certifications) 以減少傳輸量'
      });
      this.workersListSignal.set(filteredWorkers);
    } catch (error) {
      console.error('載入工人列表時發生錯誤', error);
      this.workersListSignal.set([]);
    }
  }

  /**
   * 重新載入當前工地的機具列表
   * 用於機具資料更新後的刷新
   */
  async refreshEquipmentList() {
    const currentSite = this.currentSiteSignal();
    if (currentSite && currentSite._id) {
      await this.loadEquipmentList(currentSite._id);
    }
  }

  /**
   * 重新載入當前工地的表單列表
   * 用於表單資料更新後的刷新
   */
  async refreshFormsList() {
    const currentSite = this.currentSiteSignal();
    if (currentSite && currentSite._id) {
      await this.loadFormsList(currentSite._id);
    }
  }

  /**
   * 重新載入當前工地的工人列表
   * 用於工人資料更新後的刷新
   */
  async refreshWorkersList() {
    const currentSite = this.currentSiteSignal();
    if (currentSite && currentSite._id) {
      await this.loadWorkersList(currentSite._id);
    }
  }

  /**
   * 根據 ID 載入工地資訊
   * 如果已經載入相同 ID 的工地，則直接返回現有資料
   * 否則從資料庫重新獲取
   * 為了與現有代碼相容性保留此方法
   */
  async loadSite(siteId: string): Promise<Site | null> {
    return this.setCurrentSiteById(siteId);
  }

  /**
   * 手動更新工地資訊
   * 為了與現有代碼相容性保留此方法
   */
  updateSite(site: Site) {
    if (site && site._id) {
      this.setCurrentSite(site);
    }
  }

  /**
   * 將專案資料更新到資料庫並更新本地狀態
   * @param siteId 專案 ID
   * @param siteData 更新的專案資料
   * @returns 更新後的專案資料
   */
  async saveSiteChanges(siteId: string, siteData: any): Promise<Site | null> {
    try {
      // 更新資料庫
      const result = await this.mongodbService.put('site', siteId, siteData);

      if (result) {
        // 獲取當前專案資訊
        const currentSite = this.currentSiteSignal();

        // 合併更新後的資料
        if (currentSite) {
          const updatedSite = { ...currentSite, ...siteData };

          // 更新本地狀態
          await this.setCurrentSite(updatedSite);

          return updatedSite;
        }
      }

      return null;
    } catch (error) {
      console.error('更新專案資料時發生錯誤:', error);
      throw error;
    }
  }

  /**
   * 清除當前專案
   */
  clearCurrentSite() {
    this.currentSiteSignal.set(null);
    this.loadedSiteId = null;
    sessionStorage.removeItem('currentSiteId');
  }

  /**
   * 嘗試從sessionStorage載入保存的專案
   */
  private async loadSavedSite() {
    const savedSiteId = sessionStorage.getItem('currentSiteId');
    if (savedSiteId) {
      await this.setCurrentSiteById(savedSiteId);
    }
  }

  /**
   * 啟用 WebSocket 監聽 (由 FeedbackService 或其他服務調用)
   */
  enableWebSocketListening() {
    this._isWebSocketActive.set(true);
    const user = this.authService.user();
    if (user) {
      this.setupWebSocketListeners();
    }
  }

  /**
   * 設定 WebSocket 事件監聽器
   */
  private setupWebSocketListeners(): void {
    // 監聽機具更新事件
    this.socketService.onEquipmentUpdate((data) => {
      console.log('收到機具更新事件:', data);
      this.refreshEquipmentList();
    });

    // 監聽表單更新事件
    this.socketService.onFormUpdate((data) => {
      console.log('收到表單更新事件:', data);
      this.refreshFormsList();
    });

    // 監聽工人更新事件
    this.socketService.onWorkerUpdate((data) => {
      console.log('收到工人更新事件:', data);
      this.refreshWorkersList();
    });
  }

  /**
   * 斷開 WebSocket 連接
   */
  private disconnectWebSocket(): void {
    if (this._isWebSocketActive()) {
      this.socketService.offEquipmentUpdate();
      this.socketService.offFormUpdate();
      this.socketService.offWorkerUpdate();
      this._isWebSocketActive.set(false);
    }
  }

  /**
   * 機具相關事件發送方法
   */
  async onEquipmentCreated(equipmentId: string, siteId: string): Promise<void> {
    console.log('CurrentSiteService: 機具已創建，發送 WebSocket 事件');
    if (this._isWebSocketActive()) {
      this.socketService.emitEquipmentCreated(equipmentId, siteId);
    }
    await this.refreshEquipmentList();
  }

  async onEquipmentUpdated(equipmentId: string, siteId: string): Promise<void> {
    console.log('CurrentSiteService: 機具已更新，發送 WebSocket 事件');
    if (this._isWebSocketActive()) {
      this.socketService.emitEquipmentUpdated(equipmentId, siteId);
    }
    await this.refreshEquipmentList();
  }

  async onEquipmentDeleted(equipmentId: string, siteId: string): Promise<void> {
    console.log('CurrentSiteService: 機具已刪除，發送 WebSocket 事件');
    if (this._isWebSocketActive()) {
      this.socketService.emitEquipmentDeleted(equipmentId, siteId);
    }
    await this.refreshEquipmentList();
  }

  /**
   * 表單相關事件發送方法
   */
  async onFormCreated(formId: string, formType: string, siteId: string): Promise<void> {
    console.log('CurrentSiteService: 表單已創建，發送 WebSocket 事件');
    if (this._isWebSocketActive()) {
      this.socketService.emitFormCreated(formId, formType, siteId);
    }
    await this.refreshFormsList();
  }

  async onFormUpdated(formId: string, formType: string, siteId: string): Promise<void> {
    console.log('CurrentSiteService: 表單已更新，發送 WebSocket 事件');
    if (this._isWebSocketActive()) {
      this.socketService.emitFormUpdated(formId, formType, siteId);
    }
    await this.refreshFormsList();
  }

  async onFormDeleted(formId: string, formType: string, siteId: string): Promise<void> {
    console.log('CurrentSiteService: 表單已刪除，發送 WebSocket 事件');
    if (this._isWebSocketActive()) {
      this.socketService.emitFormDeleted(formId, formType, siteId);
    }
    await this.refreshFormsList();
  }

  /**
   * 工人相關事件發送方法
   */
  async onWorkerCreated(workerId: string, siteId: string): Promise<void> {
    console.log('CurrentSiteService: 工人已創建，發送 WebSocket 事件');
    if (this._isWebSocketActive()) {
      this.socketService.emitWorkerCreated(workerId, siteId);
    }
    await this.refreshWorkersList();
  }

  async onWorkerUpdated(workerId: string, siteId: string): Promise<void> {
    console.log('CurrentSiteService: 工人已更新，發送 WebSocket 事件');
    if (this._isWebSocketActive()) {
      this.socketService.emitWorkerUpdated(workerId, siteId);
    }
    await this.refreshWorkersList();
  }

  async onWorkerDeleted(workerId: string, siteId: string): Promise<void> {
    console.log('CurrentSiteService: 工人已刪除，發送 WebSocket 事件');
    if (this._isWebSocketActive()) {
      this.socketService.emitWorkerDeleted(workerId, siteId);
    }
    await this.refreshWorkersList();
  }

  async onWorkerAddedToSite(workerId: string, siteId: string): Promise<void> {
    console.log('CurrentSiteService: 工人已加入工地，發送 WebSocket 事件');
    if (this._isWebSocketActive()) {
      this.socketService.emitWorkerAddedToSite(workerId, siteId);
    }
    await this.refreshWorkersList();
  }

  async onWorkerRemovedFromSite(workerId: string, siteId: string): Promise<void> {
    console.log('CurrentSiteService: 工人已移出工地，發送 WebSocket 事件');
    if (this._isWebSocketActive()) {
      this.socketService.emitWorkerRemovedFromSite(workerId, siteId);
    }
    await this.refreshWorkersList();
  }
}
