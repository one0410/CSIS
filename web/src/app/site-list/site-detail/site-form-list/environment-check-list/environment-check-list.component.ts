import { Component, computed, OnInit, signal } from '@angular/core';

import { FormsModule } from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';
import { MongodbService } from '../../../../services/mongodb.service';
import { SignatureDialogService } from '../../../../shared/signature-dialog.service';
import { CurrentSiteService } from '../../../../services/current-site.service';
import { DocxTemplateService } from '../../../../services/docx-template.service';
import { AuthService } from '../../../../services/auth.service';
import dayjs from 'dayjs';

interface ChecklistItem {
  [key: string]: string;
}

interface ChecklistData {
  _id?: string;
  siteId: string;
  checkDate: string;
  location: string;
  projectNo: string;
  factoryArea: string;
  items: ChecklistItem;
  fixes: ChecklistItem;
  preWorkSupervisorSignature: string; 
  preWorkWorkerSignature: string;
  postWorkSupervisorSignature: string;
  postWorkWorkerSignature: string;
  preWorkCheckTime: string;
  postWorkCheckTime: string;
  remarks: string;
  status: string;
}

interface CheckPoint {
  code: string;
  description: string;
  category: string;
}

enum SignatureType {
  PreWorkSupervisor = 'preWorkSupervisor',
  PreWorkWorker = 'preWorkWorker',
  PostWorkSupervisor = 'postWorkSupervisor',
  PostWorkWorker = 'postWorkWorker'
}

@Component({
  selector: 'app-environment-check-list',
  templateUrl: './environment-check-list.component.html',
  styleUrls: ['./environment-check-list.component.scss'],
  imports: [FormsModule],
  standalone: true
})
export class EnvironmentCheckListComponent implements OnInit {
  siteId: string = '';
  formId: string = '';
  site = computed(() => this.currentSiteService.currentSite());
  currentUser = computed(() => this.authService.user());
  
  preWorkSupervisorSignature: string = '';
  preWorkWorkerSignature: string = '';
  postWorkSupervisorSignature: string = '';
  postWorkWorkerSignature: string = '';
  
  // 將SignatureType枚舉暴露給模板
  SignatureType = SignatureType;
  
  // 施工前檢點項目
  preWorkCheckPoints: CheckPoint[] = [
    { code: 'AA01', description: '進入施工區域已正確配戴安全帽並扣上帽帶。', category: '一、施工前' },
    { code: 'AA02', description: '穿著及膚之長袖及覆膝之上衣。', category: '一、施工前' },
    { code: 'AA03', description: '人員無嚼食吃檳榔、追逐嬉鬧、賭博、打架等行為。', category: '一、施工前' },
    { code: 'AA04', description: '人員未攜帶或飲用含酒精性飲料。', category: '一、施工前' },
    { code: 'AA05', description: '未攜帶管制物品(如：照相機、NOTEBOOK、磁片、打火機…等)。', category: '一、施工前' },
    { code: 'AA06', description: '施工人員無酒醉、吸毒或精神不能集中等異常現象。', category: '一、施工前' },
    { code: 'AA07', description: '施工區、預置區、堆放區已設置圍籬及標示廠商名稱、連絡人及電話。', category: '一、施工前' },
    { code: 'AA08', description: '現場地面放置工具、物料已舖設塑膠布或不鏽鋼板。', category: '一、施工前' },
    { code: 'AA09', description: '未在樓梯、通道上、緊急疏散路線、沖身洗眼器、逃生門以及緊急應變用品櫃附近，堆放機具、材料者。', category: '一、施工前' },
    { code: 'AA10', description: '將工具、材料置於安全處。', category: '一、施工前' },
    { code: 'AA11', description: '於指定區域用餐、飲食、休息。', category: '一、施工前' },
    { code: 'AA12', description: '於指定地點抽煙。', category: '一、施工前' },
    { code: 'AA13', description: '車輛持有通行證、依規定停放、未阻礙通道。', category: '一、施工前' },
    { code: 'AA14', description: '行車未超過速限/未逆向行駛。', category: '一、施工前' },
    { code: 'AA15', description: '未任意拆除或挪用機電設備、警告標誌、防護設備、消防設施(含消防管或滅火器移做他用)….等。', category: '一、施工前' },
    { code: 'AA16', description: '已申請拆除安全設施(如：安全網、平台護欄….等) 。', category: '一、施工前' },
    { code: 'AA17', description: '施工現場已無其他方式須直接踐踏機台、管路等，且已事先向管理單位申請許可。', category: '一、施工前' },
    { code: 'AA18', description: '轉動任一管路之閥類開關或電氣開關前已通知相關負責人員。', category: '一、施工前' },
    { code: 'AA20', description: '現場作業時正確配帶個人防護具。', category: '一、施工前' },
    { code: 'AA21', description: '未在廠內隨地便溺。', category: '一、施工前' },
    { code: 'AC01', description: '作業許可證或其他規定表格標示於現場明顯處。', category: '一、施工前' },
    { code: 'AC02', description: '實施作業自主檢點或機具檢點、檢查。', category: '一、施工前' },
    { code: 'AC03', description: '進行切管、修改等作業前，已經管理單位、人員確認無誤。', category: '一、施工前' },
    { code: 'AD01', description: '施工人員正確配戴識別證及穿著施工背心。', category: '一、施工前' },
    { code: 'AD02', description: '入廠施工人員依規定接受相關工安訓練課程。', category: '一、施工前' },
    { code: 'AD03', description: '人員未持來賓證進入廠區施作。', category: '一、施工前' },
    { code: 'AD04', description: '證件未借與他人或未冒用他人證件進出廠區。', category: '一、施工前' },
    { code: 'AD05', description: '已事先獲得管理人員許可才入廠施工。', category: '一、施工前' },
    { code: 'AD06', description: '未出入非經許可之區域(依識別證門禁區域判別)。', category: '一、施工前' },
    { code: 'AD07', description: '未於非緊急狀態違規打開或進出安全門。', category: '一、施工前' },
    { code: 'AD08', description: '未闖越簽到、讀卡、換證等門禁管制區域。', category: '一、施工前' },
    { code: 'AE01', description: '符合無塵室穿著規定。', category: '一、施工前' },
    { code: 'AE02', description: '設備材料機具進入無塵室，已擦拭乾淨及存放於規定區域。', category: '一、施工前' },
    { code: 'AE03', description: '於無塵室施工已做好潔淨措施。', category: '一、施工前' },
    { code: 'AE04', description: '施工時人員未直接坐於地面上。', category: '一、施工前' },
    { code: 'AE05', description: '未嚼食口香糖。', category: '一、施工前' },
    { code: 'AE06', description: '未攜帶管制物品(如：照相機、NOTEBOOK、磁片、鉛筆、非無塵紙、立可白、紙箱、行動電話、打火機…等)。', category: '一、施工前' },
    { code: 'AE07', description: '遵守其他無塵室相關規定。', category: '一、施工前' },
    { code: 'AF01', description: '遵守每日出工人員簽到規定。', category: '一、施工前' },
    { code: 'AF02', description: '依規定繳交相關文件。', category: '一、施工前' },
    { code: 'AF03', description: '出席『供應商安全衛生會議』。', category: '一、施工前' },
    { code: 'AF04', description: '遵守其他安全、管理相關規定。', category: '一、施工前' }
  ];

  // 收工前檢點項目
  postWorkCheckPoints: CheckPoint[] = [
    { code: 'AA19', description: '下班收工後已將電氣設備、氣體鋼瓶關閉。', category: '二、收工前' },
    { code: 'AA22', description: '已復原安全設施(如：安全網、平台護欄….等) 。', category: '二、收工前' },
    { code: 'AB01', description: '每日工程收工前，整理現場、收拾工具，使之恢復正常狀況。', category: '二、收工前' },
    { code: 'AB02', description: '每日工作後，將自動昇降機、A字梯、施工架等歸回定位。', category: '二、收工前' },
    { code: 'AB03', description: '每日工作後，將作業平台上工具及施工物件、材料等收拾完成。', category: '二、收工前' },
    { code: 'AB04', description: '庫存區、預置區、堆放區之機具、材料已分類、標示，廢棄物當日清除。', category: '二、收工前' },
    { code: 'AB05', description: '每日收工前將物料、工具置於暫存區並將當日垃圾清理乾淨。', category: '二、收工前' },
    { code: 'AB06', description: '生活廢棄物依照各區垃圾分類規定丟棄於各分類垃圾桶內。', category: '二、收工前' }
  ];
  
  checklistData: ChecklistData = {
    siteId: '',
    checkDate: new Date().toISOString().slice(0, 10),
    location: '',
    projectNo: '',
    factoryArea: '',
    items: {},
    fixes: {},
    preWorkSupervisorSignature: '',
    preWorkWorkerSignature: '',
    postWorkSupervisorSignature: '',
    postWorkWorkerSignature: '',
    preWorkCheckTime: dayjs().format('YYYY-MM-DDTHH:mm'),
    postWorkCheckTime: dayjs().format('YYYY-MM-DDTHH:mm'),
    remarks: '',
    status: 'draft'
  };

  // 文檔生成狀態
  isGeneratingDocument = signal<boolean>(false);

  constructor(
    private router: Router,
    private route: ActivatedRoute,
    private mongodbService: MongodbService,
    private signatureDialog: SignatureDialogService,
    private currentSiteService: CurrentSiteService,
    private docxTemplateService: DocxTemplateService,
    private authService: AuthService
  ) { }

  ngOnInit(): void {
    // 從路由獲取工地ID
    this.route.paramMap.subscribe(params => {
      const id = params.get('id');
      if (id) {
        this.siteId = id;
        this.checklistData.siteId = id;
        this.checklistData.location = (this.site()?.county || '') + (this.site()?.town || '');
        this.checklistData.projectNo = this.site()?.projectNo || '';

        // 檢查 URL 查詢參數中是否有日期
        this.route.queryParams.subscribe(queryParams => {
          if (queryParams['date']) {
            // 從 URL 查詢參數獲取日期並設置為 applyDate
            const dateFromUrl = queryParams['date'];
            if (dateFromUrl && dateFromUrl.match(/^\d{4}-\d{2}-\d{2}$/)) {
              // 如果日期格式正確 (YYYY-MM-DD)，則設置為 applyDate
              this.checklistData.checkDate = dateFromUrl;
            }
          }
        });
        
        // 檢查是否有表單ID（編輯模式）
        const formId = params.get('formId');
        if (formId) {
          this.formId = formId;
          this.loadChecklistData(formId);
        }
      }
    });  }

  

  // 加載檢查表數據（編輯模式）
  async loadChecklistData(formId: string): Promise<void> {
    try {
      const data = await this.mongodbService.getById('siteForm', formId);
      if (data && data.formType === 'environmentChecklist') {
        this.checklistData = data;
        // 更新簽名顯示
        this.preWorkSupervisorSignature = data.preWorkSupervisorSignature || '';
        this.preWorkWorkerSignature = data.preWorkWorkerSignature || '';
        this.postWorkSupervisorSignature = data.postWorkSupervisorSignature || '';
        this.postWorkWorkerSignature = data.postWorkWorkerSignature || '';
      }
    } catch (error) {
      console.error('加載檢查表數據失敗', error);
    }
  }

  // 批量設定施工前檢點項目狀態
  setAllPreWorkStatus(status: 'normal' | 'abnormal'): void {
    this.preWorkCheckPoints.forEach(item => {
      this.checklistData.items[item.code] = status;
    });
  }

  // 批量設定收工前檢點項目狀態
  setAllPostWorkStatus(status: 'normal' | 'abnormal'): void {
    this.postWorkCheckPoints.forEach(item => {
      this.checklistData.items[item.code] = status;
    });
  }

  // 打開簽名對話框
  async openSignatureDialog(type: SignatureType): Promise<void> {
    try {
      const signature = await this.signatureDialog.open();
      if (signature) {
        // 更新相應的簽名
        switch (type) {
          case SignatureType.PreWorkSupervisor:
            this.preWorkSupervisorSignature = signature;
            this.checklistData.preWorkSupervisorSignature = signature;
            break;
          case SignatureType.PreWorkWorker:
            this.preWorkWorkerSignature = signature;
            this.checklistData.preWorkWorkerSignature = signature;
            break;
          case SignatureType.PostWorkSupervisor:
            this.postWorkSupervisorSignature = signature;
            this.checklistData.postWorkSupervisorSignature = signature;
            break;
          case SignatureType.PostWorkWorker:
            this.postWorkWorkerSignature = signature;
            this.checklistData.postWorkWorkerSignature = signature;
            break;
        }
      }
    } catch (error) {
      console.error('簽名對話框操作失敗', error);
    }
  }

  // 保存檢查表
  async saveChecklist(): Promise<void> {
    try {
      const formData = {
        ...this.checklistData,
        formType: 'environmentChecklist',
        updatedAt: new Date()
      };

      let result;
      if (this.formId) {
        // 更新模式
        result = await this.mongodbService.put('siteForm', this.formId, formData);
      } else {
        // 新建模式
        const newFormData = {
          ...formData,
          createdAt: new Date()
        };
        result = await this.mongodbService.post('siteForm', newFormData);
        
        // 新建成功後設置 _id 以便後續可以下載Word
        if (result && result.insertedId) {
          this.checklistData._id = result.insertedId;
          this.formId = result.insertedId;
        }
      }

      if (result) {
        alert('檢查表保存成功');
        // 不導航，讓用戶可以下載Word
        // this.router.navigate(['/site', this.siteId, 'forms']);
      }
    } catch (error) {
      console.error('保存檢查表失敗', error);
      alert('保存失敗，請稍後重試');
    }
  }

  // Word生成方法
  async generateDocx(): Promise<void> {
    if (!this.checklistData._id) {
      alert('無法生成Word：表單ID不存在');
      return;
    }

    this.isGeneratingDocument.set(true);
    try {
      await this.docxTemplateService.generateEnvironmentChecklistDocx(this.checklistData._id);
      
    } catch (error) {
      console.error('生成Word失敗:', error);
      const errorMessage = error instanceof Error ? error.message : '未知錯誤';
      alert(`Word生成失敗: ${errorMessage}`);
    } finally {
      this.isGeneratingDocument.set(false);
    }
  }

  // 取消並返回
  cancel(): void {
    this.router.navigate(['/site', this.siteId, 'forms']);
  }

  // 刪除檢查表
  async deleteChecklist(): Promise<void> {
    if (!this.formId) {
      alert('無法刪除：缺少表單ID');
      return;
    }
    
    if (confirm('確定要刪除這份環安衛自主檢點表嗎？此操作無法復原。')) {
      try {
        await this.mongodbService.delete('siteForm', this.formId);
        
        alert('環安衛自主檢點表已刪除');
        this.router.navigate(['/site', this.siteId, 'forms']);
      } catch (error) {
        console.error('刪除檢查表時發生錯誤:', error);
        const errorMessage = error instanceof Error ? error.message : '未知錯誤';
        alert(`刪除失敗: ${errorMessage}`);
      }
    }
  }
}
