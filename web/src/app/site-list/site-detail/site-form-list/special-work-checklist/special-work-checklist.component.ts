import { Component, computed, OnInit } from '@angular/core';

import { FormsModule } from '@angular/forms';
import { SiteFormHeaderComponent } from '../site-form-header/site-form-header.component';
import { Router, ActivatedRoute } from '@angular/router';
import { MongodbService } from '../../../../services/mongodb.service';
import { SignatureDialogService } from '../../../../shared/signature-dialog.service';
import { CurrentSiteService } from '../../../../services/current-site.service';
import { DocxTemplateService } from '../../../../services/docx-template.service';
import { SiteForm } from '../../../../model/siteForm.model';
import dayjs from 'dayjs';
import { AuthService } from '../../../../services/auth.service';

interface ChecklistItem {
  [key: string]: string;
}

export interface SpecialWorkChecklistData extends SiteForm {
  formType: 'specialWorkChecklist';
  location: string;
  projectNo: string;
  factoryArea: string;
  workType: string;
  items: ChecklistItem;
  fixes: ChecklistItem;
  itemInputs: {
    [itemCode: string]: {
      [inputKey: string]: string;
    }
  };
  // 施工前簽名和時間
  preWorkSupervisorSignature: string;
  preWorkWorkerSignature: string;
  preWorkCheckTime: string;
  // 收工前簽名和時間
  postWorkSupervisorSignature: string;
  postWorkWorkerSignature: string;
  postWorkCheckTime: string;
  remarks: string;
  status: string;
}

// 定義輸入欄位結構
interface InputField {
  key: string;
  label: string;
  type: 'text' | 'number' | 'time' | 'date';
  placeholder?: string;
}

// 定義檢查項目結構
interface CheckItem {
  code: string;
  description: string;
  inputFields?: InputField[]; // 可選的輸入欄位
  type?: 'preWork' | 'postWork'; // 標記是施工前還是收工前項目
}

enum SignatureType {
  PreWorkSupervisor = 'preWorkSupervisor',
  PreWorkWorker = 'preWorkWorker',
  PostWorkSupervisor = 'postWorkSupervisor',
  PostWorkWorker = 'postWorkWorker'
}

@Component({
  selector: 'app-special-work-checklist',
  templateUrl: './special-work-checklist.component.html',
  styleUrls: ['./special-work-checklist.component.scss'],
  imports: [FormsModule, SiteFormHeaderComponent],
  standalone: true
})
export class SpecialWorkChecklistComponent implements OnInit {
  siteId: string = '';
  formId: string = '';
  site = computed(() => this.currentSiteService.currentSite());
  
  // 施工前簽名
  preWorkSupervisorSignature: string = '';
  preWorkWorkerSignature: string = '';
  
  // 收工前簽名
  postWorkSupervisorSignature: string = '';
  postWorkWorkerSignature: string = '';
  
  // 將SignatureType枚舉暴露給模板
  SignatureType = SignatureType;
  
  // 定義所有作業類型
  workTypes: string[] = [
    '動火作業',
    '高架作業',
    '局限空間作業',
    '電力作業',
    '吊籠作業',
    '起重吊掛作業',
    '施工架組裝作業',
    '管線拆裝作業',
    '開口作業',
    '化學作業'
  ];

  // 定義收工前通用檢查項目，用於分配給各作業類型
  private commonPostWorkItems: CheckItem[] = [
    { code: 'AA19', description: '下班收工後已將電氣設備、氣體鋼瓶關閉。', type: 'postWork' },
    { code: 'AA22', description: '已復原安全設施(如：安全網、平台護欄….等) 。', type: 'postWork' },
    { code: 'AB01', description: '每日工程收工前，整理現場、收拾工具，使之恢復正常狀況。', type: 'postWork' },
    { code: 'AB02', description: '每日工作後，將自動昇降機、A字梯、施工架等歸回定位。', type: 'postWork' },
    { code: 'AB03', description: '每日工作後，將作業平台上工具及施工物件、材料等收拾完成。', type: 'postWork' },
    { code: 'AB04', description: '庫存區、預置區、堆放區之機具、材料已分類、標示，廢棄物當日清除。', type: 'postWork' },
    { code: 'AB05', description: '每日收工前將物料、工具置於暫存區並將當日垃圾清理乾淨。', type: 'postWork' },
    { code: 'AB06', description: '生活廢棄物依照各區垃圾分類規定丟棄於各分類垃圾桶內。', type: 'postWork' }
  ];

  // 定義每種作業類型的檢查項目
  workTypeCheckItems: { [key: string]: CheckItem[] } = {
    // 電動火作業檢查項目
    '動火作業': [
      // 施工前項目
      { code: 'BA01', description: '作業現場備有正確、足夠之滅火器，且有效期限未過期。', type: 'preWork' },
      { code: 'BA02', description: '作業現場易燃物已移除或加以防護。', type: 'preWork' },
      { code: 'BA03', description: '氣體鋼瓶集中時，保持豎立，或使用專用手推車搬運氣體鋼瓶。', type: 'preWork' },
      { code: 'BA04', description: '氣體鋼瓶使用鐵鍊、非彈性繩索固定，或每日作業後裝妥護蓋。', type: 'preWork' },
      { code: 'BA05', description: '焊接機具裝設有效之自動電擊防止裝置及漏電斷路器。', type: 'preWork' },
      { code: 'BA06', description: '氧氣鋼瓶裝有合乎規格之專用減壓調節器及防爆逆止閥。', type: 'preWork' },
      { code: 'BA07', description: '高處動火有以耐燃材料阻隔、收集、抑制火星四散或掉落。', type: 'preWork' },
      { code: 'BA08', description: '焊接時使用絕緣良好之安全手把、配戴盔帽及遮光玻璃。', type: 'preWork' },
      { code: 'BA09', description: '焊接地線已儘可能接近焊接點，電流迴路無經其它設備而導致跳電之虞。', type: 'preWork' },
      // 收工前項目 - 將通用項目加入
      ...this.commonPostWorkItems
    ],
    
    // 高架作業檢查項目
    '高架作業': [
      // 施工前項目
      { code: 'BB01', description: '依照施工地點之地形、地物使用下列之安全器具：(a)施工架/作業平台(含牢固護欄)(b)自動升降機(c)安全帶(d)安全網(e)A字梯(f)安全母索(g)其他防墜措施。', type: 'preWork' },
      { code: 'BB02', description: '未僱用下列人員從事高架作業：(a)患有高血壓、心血管疾病或貧血者(b)曾患有癲癇精神或神精疾病(c)平衡機能失常者(d)患有哮喘症者(e)四肢不全者(f)色盲者(g)聽力不正常者(h)酗酒者(i)身體虛弱者(j)情緒不佳有安全顧慮者(k)年齡未滿十八歲或超過五十五歲者。', type: 'preWork' },
      { code: 'BB03', description: '施工架上未再搭接梯子或踏凳等從事作業。', type: 'preWork' },
      { code: 'BB04', description: '移動式施工架於定位時應踩下車輪煞車器固定。', type: 'preWork' },
      { code: 'BB05', description: '人員位於施工架上時，未移動施工架。', type: 'preWork' },
      { code: 'BB06', description: '施工使用A字梯時，以一人在梯上一人在下扶持A字梯之夥同方式作業(作業廠區規定時適用) 。', type: 'preWork' },
      { code: 'BB07', description: '未使用損毀凹陷的A字梯、施工架。', type: 'preWork' },
      { code: 'BB08', description: '高差超過1.5公尺以上之場所，使用人員能安全上下之設備。', type: 'preWork' },
      { code: 'BB09', description: '未從高處投下物體，或使用適當之承受設備。', type: 'preWork' },
      { code: 'BB10', description: '高空工作車應標示空重、載重、額定荷重等，且不得超過高空工作車之積載荷重及能力。', type: 'preWork' },
      { code: 'BB11', description: '高空工作車事先應視作業場所之狀況、工作台高度、伸臂長度及作業場所地形等，規定適當之行駛速率，操作人員應依規定操作。', type: 'preWork' },
      { code: 'BB12', description: '在工作台以外之處所操作工作台時，操作人員與工作台上之人員間應規定統一指揮信號，並依信號從事指揮作業。', type: 'preWork' },
      { code: 'BB13', description: '除乘坐席位及工作台外不得搭載人員，且作業時禁止非相關人員進入操作半徑內，或附近有危險之虞之場所。', type: 'preWork' },
      { code: 'BB14', description: '應將其外伸撐座完全伸出，並採取防止地盤沉陷或崩塌等必要措施。', type: 'preWork' },
      { code: 'BB15', description: '高空工作車禁止停放斜坡，除非已採有安全措施。', type: 'preWork' },
      { code: 'BB16', description: '使用高空工作車從事作業時，工作台上的人員應佩帶背負式安全帶，工作台出入口處應有確保防止人員墜落的安全設施。', type: 'preWork' },
      { code: 'BB17', description: '工作車移動時，應將工作台下降至最低位置；若不使用時應確實使用制動裝置保持高空工作車於穩定狀態。', type: 'preWork' },
      // 收工前項目 - 將通用項目加入
      ...this.commonPostWorkItems
    ],
    
    // 局限空間作業檢查項目
    '局限空間作業': [
      // 施工前項目
      { 
        code: 'BC01', 
        description: '已對局限空間進行氧氣含量及有害物濃度測試合格後才進入作業。(O2濃度18~21%)',
        type: 'preWork'
      },
      { 
        code: 'BC02', 
        description: '缺氧作業主管於現場全程監督作業安全。', 
        inputFields: [
          { key: 'supervisor', label: '缺氧作業主管', type: 'text', placeholder: '請輸入缺氧作業主管姓名' }
        ],
        type: 'preWork'
      },
      { code: 'BC03', description: '人體有害物質已做妥隔離、遮斷、盲封、清除。', type: 'preWork' },
      { code: 'BC04', description: '作業現場備有良好且正確運作之通風設備。', type: 'preWork' },
      { 
        code: 'BC05', 
        description: '人員經許可後，再進入局限空間。', 
        inputFields: [
            { key: 'workerCount', label: '施工人數', type: 'text', placeholder: '請輸入施工人數' },
            { key: 'supervisorCount', label: '監督人數', type: 'text', placeholder: '請輸入監督人數' }
        ],
        type: 'preWork'
      },
      { 
        code: 'BC06', 
        description: '許可進入局限空間作業之人員已載明進入時間及期限。', 
        inputFields: [
          { key: 'enterTime', label: '進入時間', type: 'text', placeholder: '請輸入進入時間' },
          { key: 'leaveTime', label: '離開時間', type: 'text', placeholder: '請輸入離開時間' }
        ],
        type: 'preWork'
      },
      { code: 'BC07', description: '引火性液體之蒸氣或可燃性氣體之濃度不得超過其爆炸下限之30%。', type: 'preWork' },
      { code: 'BC08', description: '人員應配戴適當之呼吸防護具(濾氣式呼吸防護具、供氣式呼吸防護具等)。', type: 'preWork' },
      { code: 'BC09', description: '已訂定危害防止計畫供依循。', type: 'preWork' },
      { code: 'BC10', description: '於作業場所顯而易見處公告禁止進入。', type: 'preWork' },
      { code: 'BC11', description: '防護設備及救援設備已準備。', type: 'preWork' },
      // 收工前項目 - 將通用項目加入
      ...this.commonPostWorkItems
    ],

    // 電力作業檢查項目
    '電力作業': [
      // 施工前項目
      { code: 'BD01', description: '插頭依規定格式標示公司名稱、連絡人及連絡電話。', type: 'preWork' },
      { code: 'BD02', description: '使用之電線、插頭無破損或絕緣不良之現象。', type: 'preWork' },
      { code: 'BD03', description: '電線橫越道路及車輛行駛較頻繁之場所，以管路埋設地下或以厚鋼管、槽鐵等掩護或架高配設，且未形成通行障礙。', type: 'preWork' },
      { code: 'BD04', description: '使用經檢驗合格之電器設備。', type: 'preWork' },
      { code: 'BD05', description: '未以電線或其他金屬代替保險絲。', type: 'preWork' },
      { code: 'BD06', description: '施工用電使用〝施工專用電盤〞接電。', type: 'preWork' },
      { code: 'BD07', description: '使用〝施工專用電盤〞由上下開孔接電，不會妨礙電盤門開閉。', type: 'preWork' },
      { code: 'BD08', description: '危險地區加裝護欄及掛有安全標示。', type: 'preWork' },
      { code: 'BD09', description: '電氣設備遠離易燃品或有適當防護。', type: 'preWork' },
      { code: 'BD10', description: '非指定人員未隨意開動或關閉機械設備，以及工作起動後有關電氣設備部分之使用，經機械、設備之管理人員許可。', type: 'preWork' },
      { code: 'BD11', description: '馬達、穿孔器、一般常用之測試儀器及電動手工具，具有良好之絕緣設備，才可使用。', type: 'preWork' },
      { code: 'BD12', description: '電動工具使用前，依規定接地。', type: 'preWork' },
      { code: 'BD13', description: '電動工具裝設良好絕緣插頭，未以裸接方式直接插入插座上。', type: 'preWork' },
      { code: 'BD14', description: '在潮溼地區著乾燥之橡膠鞋及絕緣等措施，才使用電動手工具。', type: 'preWork' },
      { code: 'BD15', description: '使用之延長線有過載保護裝置。', type: 'preWork' },
      { code: 'BD16', description: '活線或臨時斷/供電作業，已標示、隔離，且作業後復原環境。', type: 'preWork' },
      // 收工前項目 - 將通用項目加入
      ...this.commonPostWorkItems
    ],

    '吊籠作業': [
      // 施工前項目
      { code: 'BE01', description: '吊籠經檢查合格取得檢查合格證。', type: 'preWork' },
      { code: 'BE02', description: '操作人員經教育訓練合格，領有結業證書。', type: 'preWork' },
      { code: 'BE03', description: '每次作業前確實做好檢點工作。', type: 'preWork' },
      { code: 'BE04', description: '作業人員確實使用防墜落裝置。', type: 'preWork' },
      // 收工前項目 - 將通用項目加入
      ...this.commonPostWorkItems
    ],

    '起重吊掛作業': [
      // 施工前項目
      { code: 'BF01', description: '於吊掛現場設置警告標誌且有專人管制人員通行。', type: 'preWork' },
      { code: 'BF02', description: '使用之起重機具經檢查合格取得檢查合格證。', type: 'preWork' },
      { code: 'BF03', description: '起重機具標示最高負荷，且未超過此項限制。', type: 'preWork' },
      { code: 'BF04', description: '起重機具之吊鉤，有防止吊舉中所吊物體脫落之安全防滑舌片。', type: 'preWork' },
      { code: 'BF05', description: '設置/使用過捲揚預防裝置。', type: 'preWork' },
      { code: 'BF06', description: '作業現場有一人以上執行吊掛指揮、督導。', type: 'preWork' },
      { code: 'BF07', description: '人員未由吊掛現場下方通過。', type: 'preWork' },
      { code: 'BF08', description: '使用、操作危險性機械設備，持有合格操作證照。', type: 'preWork' },
      { code: 'BF09', description: '實施作業前檢點。', type: 'preWork' },
      { code: 'BF10', description: '機械運轉時有警示燈或蜂鳴裝置。', type: 'preWork' },
      { code: 'BF11', description: '未以起重機或吊掛機為人員升降工具。', type: 'preWork' },
      // 收工前項目 - 將通用項目加入
      ...this.commonPostWorkItems
    ],

    
    '施工架組裝作業': [
      // 施工前項目
      { code: 'BG01', description: '施工架組配作業主管於現場全程監督作業安全。', type: 'preWork' },
      { code: 'BG02', description: '施工架組配之基腳無沈陷之虞。', type: 'preWork' },
      { code: 'BG03', description: '遇地震時立即停止作業，使人員退避至安全避難場所。', type: 'preWork' },
      { code: 'BG04', description: '地震或地質變化後，徹底檢查施工架後再行作業。', type: 'preWork' },
      { code: 'BG05', description: '確實完成組配施工架之安全設備（如插銷、交叉連桿等）。', type: 'preWork' },
      { code: 'BG06', description: '施工架組配物料運送前確實綁紮，無掉落之虞。', type: 'preWork' },
      { code: 'BG07', description: '施工架組配作業靠近電線、輸配電設備，有護圍、絕緣或掩蔽。', type: 'preWork' },
      // 收工前項目 - 將通用項目加入
      ...this.commonPostWorkItems
    ],
    
    '管線拆離作業': [
      // 施工前項目
      { code: 'BH01', description: '舊電力、化學或氣體管線拆除前，確認管內已無殘留危害物程序。', type: 'preWork' },
      { code: 'BH02', description: '管線清洗、拆離前，人員確實穿著防護用具。', type: 'preWork' },
      { code: 'BH03', description: '作業時，主管在現場場督導。', type: 'preWork' },
      { code: 'BH04', description: '管路拆除範圍，有防止非相關人員進入之標示及管制措施。', type: 'preWork' },
      // 收工前項目 - 將通用項目加入
      ...this.commonPostWorkItems
    ],

    // 開口作業檢查項目
    '開口作業': [
      // An施工前項目
      { code: 'BI01', description: '工作場所之地面或牆壁如有開口，已裝設護欄或蓋板。', type: 'preWork' },
      { code: 'BI02', description: '移開高架地板施工前，已先設置警示圍籬、標示。', type: 'preWork' },
      { code: 'BI03', description: '移開高架地板施工完畢後，已將高架地板復原並固定。', type: 'preWork' },
      // 收工前項目 - 將通用項目加入
      ...this.commonPostWorkItems
    ],
    

    '化學作業': [
      // 施工前項目
      { code: 'BJ01', description: '化學物質皆清楚標示。', type: 'preWork' },
      { code: 'BJ02', description: '化學物質使用完畢後，置於指定地點。', type: 'preWork' },
      { code: 'BJ03', description: '化學物質使用、處置、儲存、作業，備有安全資料表(SDS)。', type: 'preWork' },
      { code: 'BJ04', description: '可能產生危害之區域，設有警告標示及護欄。', type: 'preWork' },
      { code: 'BJ05', description: '化學物質作業，已穿戴適當的個人防護具。', type: 'preWork' },
      // 收工前項目 - 將通用項目加入
      ...this.commonPostWorkItems
    ]
  };

  // 獲取當前作業類型的施工前檢查項目
  getPreWorkItems(): CheckItem[] {
    return (this.workTypeCheckItems[this.checklistData.workType] || [])
      .filter(item => item.type === 'preWork' || !item.type);
  }

  // 獲取當前作業類型的收工前檢查項目
  getPostWorkItems(): CheckItem[] {
    return (this.workTypeCheckItems[this.checklistData.workType] || [])
      .filter(item => item.type === 'postWork');
  }

  // 獲取當前作業類型的檢查項目
  getWorkTypeCheckItems(): CheckItem[] {
    return this.workTypeCheckItems[this.checklistData.workType] || [];
  }
  
  // 這個方法保留與HTML相容，但實際上可以使用getPreWorkItems替代
  getSpecialCheckItems(): CheckItem[] {
    return this.getPreWorkItems();
  }
  
  checklistData: SpecialWorkChecklistData = {
    siteId: '',
    formType: 'specialWorkChecklist',
    applyDate: dayjs().format('YYYY-MM-DD'),
    location: '',
    projectNo: '',
    factoryArea: '',
    workType: '動火作業',
    items: {},
    fixes: {},
    itemInputs: {},
    preWorkSupervisorSignature: '',
    preWorkWorkerSignature: '',
    preWorkCheckTime: dayjs().format('YYYY-MM-DD HH:mm'),
    postWorkSupervisorSignature: '',
    postWorkWorkerSignature: '',
    postWorkCheckTime: dayjs().format('YYYY-MM-DD HH:mm'),
    remarks: '',
    status: 'draft',
    createdAt: new Date(),
    createdBy: '',
  };

  // 文檔生成狀態
  isGeneratingDocument: boolean = false;

  constructor(
    private router: Router,
    private route: ActivatedRoute,
    private mongodbService: MongodbService,
    private signatureDialog: SignatureDialogService,
    private currentSiteService: CurrentSiteService,
    private authService: AuthService,
    private docxTemplateService: DocxTemplateService
  ) { }

  ngOnInit(): void {
    // 從路由獲取工地ID
    this.route.paramMap.subscribe(async (params) => {
      const id = params.get('id');
      if (id) {
        this.siteId = id;
        await this.currentSiteService.setCurrentSiteById(id);
        this.checklistData.siteId = id;
        // this.checklistData.projectNo = this.site()?.projectNo || '';
        // this.checklistData.location = (this.site()?.county || '') + (this.site()?.town || '');

        // 檢查是否有表單ID（編輯模式）
        const formId = params.get('formId');
        if (formId) {
          this.formId = formId;
          this.loadChecklistData(formId);
        } else {
          // 初始化輸入欄位數據結構
          this.initializeItemInputs();
          
          // 從 URL 查詢參數獲取作業類型和許可單 ID
          this.route.queryParams.subscribe(queryParams => {
            // 設置作業類型
            if (queryParams['workType'] && this.workTypes.includes(queryParams['workType'])) {
              this.checklistData.workType = queryParams['workType'];
              // 當作業類型變更時，需要重新初始化相關的檢查項目
              this.onWorkTypeChange();
            }
            
            // 處理日期參數
            if (queryParams['date']) {
              // 從 URL 查詢參數獲取日期並設置為 applyDate
              const dateFromUrl = queryParams['date'];
              if (dateFromUrl && dateFromUrl.match(/^\d{4}-\d{2}-\d{2}$/)) {
                // 如果日期格式正確 (YYYY-MM-DD)，則設置為 applyDate
                this.checklistData.applyDate = dateFromUrl;
              } else {
                try {
                  // 嘗試使用 dayjs 解析日期
                  const parsedDate = dayjs(dateFromUrl).format('YYYY-MM-DD');
                  if (parsedDate !== 'Invalid Date') {
                    this.checklistData.applyDate = parsedDate;
                  }
                } catch (error) {
                  console.error('無法解析日期參數:', dateFromUrl, error);
                }
              }
            }
            
            // 如果有許可單 ID，可以處理相關邏輯
            if (queryParams['permitId']) {
              // 這裡可以添加與許可單相關的處理邏輯，例如從許可單獲取更多信息
              // 例如：this.loadPermitData(queryParams['permitId']);
            }
          });
        }
      }
    });
  }

  // 初始化輸入欄位數據結構
  initializeItemInputs(): void {
    // 確保 itemInputs 已初始化
    this.checklistData.itemInputs = this.checklistData.itemInputs || {};
    
    // 初始化各個工作類型的輸入欄位
    for (const workType in this.workTypeCheckItems) {
      for (const item of this.workTypeCheckItems[workType]) {
        if (item.inputFields && item.inputFields.length > 0) {
          this.checklistData.itemInputs[item.code] = this.checklistData.itemInputs[item.code] || {};
          for (const field of item.inputFields) {
            if (this.checklistData.itemInputs[item.code][field.key] === undefined) {
              this.checklistData.itemInputs[item.code][field.key] = '';
            }
          }
        }
      }
    }
  }

  // 當作業類型變更時，清空不再適用的檢查項目，同時初始化新的輸入欄位
  onWorkTypeChange(): void {
    // 切換作業類型時清空所有項目，因為每個作業類型都有不同的檢查項目
    this.checklistData.items = {};
    
    // 初始化新工作類型的輸入欄位
    this.initializeItemInputs();
  }  

  // 加載檢查表數據（編輯模式）
  async loadChecklistData(formId: string): Promise<void> {
    try {
      const data = await this.mongodbService.getById('siteForm', formId);
      if (data && data.formType === 'specialWorkChecklist') {
        this.checklistData = data;
        // 確保 itemInputs 已初始化
        this.checklistData.itemInputs = this.checklistData.itemInputs || {};
        // 初始化輸入欄位數據結構
        this.initializeItemInputs();
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
      };

      let result;
      if (this.formId) {
        formData.updatedAt = new Date();
        formData.updatedBy = this.authService.user()?.name || '';
        // 更新模式
        result = await this.mongodbService.put('siteForm', this.formId, formData);
      } else {
        // 新建模式
        const newFormData = {
          ...formData,
          createdAt: new Date(),
          createdBy: this.authService.user()?.name || '',
        };
        result = await this.mongodbService.post('siteForm', newFormData);
        
        // 新建成功後設置 _id 以便後續可以下載Word
        if (result && result.insertedId) {
          this.checklistData._id = result.insertedId;
          this.formId = result.insertedId;
        }
      }

      if (result) {
        alert('特殊作業自主檢點表保存成功');
        // 不導航，讓用戶可以下載Word
        // this.router.navigate(['/site', this.siteId, 'forms']);
      }
    } catch (error) {
      console.error('保存檢查表失敗', error);
      alert('保存失敗，請稍後重試');
    }
  }

  // 取消並返回
  cancel(): void {
    this.router.navigate(['/site', this.siteId, 'forms']);
  }

  // 選擇整列的radio按鈕
  selectAllForColumn(value: '正常' | '異常' | '不適用', section: 'preWork' | 'postWork'): void {
    let targetItems: CheckItem[] = [];
    
    if (section === 'preWork') {
      targetItems = this.getPreWorkItems();
    } else if (section === 'postWork') {
      targetItems = this.getPostWorkItems();
    }
    
    // 遍歷目標項目並設置為選中的值
    for (const item of targetItems) {
      this.checklistData.items[item.code] = value;
    }
  }

  // Word生成方法
  async generateDocx(): Promise<void> {
    if (!this.checklistData._id) {
      alert('無法生成Word：表單ID不存在');
      return;
    }

    if (!this.checklistData.workType) {
      alert('無法生成Word：請先選擇作業類型');
      return;
    }

    this.isGeneratingDocument = true;
    try {
      await this.docxTemplateService.generateSpecialWorkChecklistDocx(this.checklistData._id);
      
    } catch (error) {
      console.error('生成Word失敗:', error);
      const errorMessage = error instanceof Error ? error.message : '未知錯誤';
      alert(`Word生成失敗: ${errorMessage}`);
    } finally {
      this.isGeneratingDocument = false;
    }
  }
} 