import { Injectable } from '@angular/core';
import { Site } from '../site-list/site-list.component';
import { MongodbService } from './mongodb.service';
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
export class CurrentSiteService {
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

  constructor(private mongodbService: MongodbService) {
    // 檢查sessionStorage中是否有保存的工地ID
    this.loadSavedSite();
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
      const equipment = await this.mongodbService.get('equipment', {
        siteId: siteId,
      });
      this.equipmentListSignal.set(equipment || []);
    } catch (error) {
      console.error('載入機具列表時發生錯誤', error);
      this.equipmentListSignal.set([]);
    }
  }

  /**
   * 載入指定工地的表單列表
   */
  async loadFormsList(siteId: string) {
    if (!siteId) {
      this.formsListSignal.set([]);
      return;
    }

    try {
      const forms = await this.mongodbService.get('siteForm', {
        siteId: siteId,
      });
      console.log('載入表單列表成功:', forms);
      this.formsListSignal.set(forms || []);
    } catch (error) {
      console.error('載入表單列表時發生錯誤', error);
      this.formsListSignal.set([]);
    }
  }

  /**
   * 載入指定工地的工人列表
   */
  async loadWorkersList(siteId: string) {
    if (!siteId) {
      this.workersListSignal.set([]);
      return;
    }

    try {
      const workers = await this.mongodbService.get('worker', {
        belongSites: { $elemMatch: { siteId: siteId } }
      });
      console.log('載入工人列表成功:', workers);
      this.workersListSignal.set(workers || []);
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
   * 將工地資料更新到資料庫並更新本地狀態
   * @param siteId 工地 ID
   * @param siteData 更新的工地資料
   * @returns 更新後的工地資料
   */
  async saveSiteChanges(siteId: string, siteData: any): Promise<Site | null> {
    try {
      // 更新資料庫
      const result = await this.mongodbService.put('site', siteId, siteData);
      
      if (result) {
        // 獲取當前工地資訊
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
      console.error('更新工地資料時發生錯誤:', error);
      throw error;
    }
  }

  /**
   * 清除當前工地
   */
  clearCurrentSite() {
    this.currentSiteSignal.set(null);
    this.loadedSiteId = null;
    sessionStorage.removeItem('currentSiteId');
  }

  /**
   * 嘗試從sessionStorage載入保存的工地
   */
  private async loadSavedSite() {
    const savedSiteId = sessionStorage.getItem('currentSiteId');
    if (savedSiteId) {
      await this.setCurrentSiteById(savedSiteId);
    }
  }
}
