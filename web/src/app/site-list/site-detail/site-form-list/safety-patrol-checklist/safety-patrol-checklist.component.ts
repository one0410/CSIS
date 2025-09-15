import { Component, computed, OnInit, signal } from '@angular/core';

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

export interface SafetyPatrolChecklistData extends SiteForm {
  formType: 'safetyPatrolChecklist';
  checkType: string; // 檢查種類：工地管理、一般作業、特殊作業
  inspectionUnit: string;
  inspector: string;
  inspectee: string;
  projectNo: string; // 專案編號
  items: ChecklistItem;
  itemRemarks: { [key: string]: string }; // 各項目的備註
  remarks: string;
  status: string;
  // 缺失責任單位和MIC監工單位的簽名
  faultyUnitSignature: string;
  micSupervisorSignature: string;
  signatureDate: string;
}

// 定義檢查項目結構
interface CheckItem {
  code: string;
  description: string;
  groupName: string; // 分組名稱
}

@Component({
  selector: 'app-safety-patrol-checklist',
  templateUrl: './safety-patrol-checklist.component.html',
  styleUrls: ['./safety-patrol-checklist.component.scss'],
  imports: [FormsModule, SiteFormHeaderComponent],
  standalone: true
})
export class SafetyPatrolChecklistComponent implements OnInit {
  siteId: string = '';
  formId: string = '';
  site = computed(() => this.currentSiteService.currentSite());
  currentUser = computed(() => this.authService.user());
  
  // 簽名數據
  faultyUnitSignature: string = '';
  micSupervisorSignature: string = '';
  
  // 文檔生成狀態
  isGeneratingDocument = signal<boolean>(false);
  
  // 定義檢查種類
  checkTypes: string[] = [
    '工地管理',
    '一般作業', 
    '特殊作業'
  ];

  // 定義各種檢查類型的檢查項目
  checkTypeItems: { [key: string]: CheckItem[] } = {
    // 工地管理檢查項目
    '工地管理': [
      { code: 'M01', description: '對供應商及作業人員實施危害告知訓練並留存紀錄。', groupName: '工地管理' },
      { code: 'M02', description: '要求進廠之供應商人員依規定接受相關工安訓練課程。(包含供應商工安認證、高風險作業…)', groupName: '工地管理' },
      { code: 'M03', description: '派任安衛人員應具有安全衛生人員資格，並將備查資料留存現場。', groupName: '工地管理' },
      { code: 'M04', description: '協議組織申請表留存完備。【供應商數2家(含)以上時】', groupName: '工地管理' },
      { code: 'M05', description: '每個月定期召開一次以上協議組織會議並留存紀錄。', groupName: '工地管理' },
      { code: 'M06', description: '施工前完成各類作業許可申請。', groupName: '工地管理' },
      { code: 'M07', description: '每日實施工具箱會議並留存紀錄。', groupName: '工地管理' },
      { code: 'M08', description: '實施各類作業自動檢查並留存紀錄。', groupName: '工地管理' },
      { code: 'M09', description: '實施現場巡檢並留存紀錄。', groupName: '工地管理' },
      { code: 'M10', description: '現場已建立進廠人員資料，並保留完整資料。', groupName: '工地管理' },
      { code: 'M11', description: '專案工安人員已接受M8「專案工安人員訓練」。', groupName: '工地管理' },
      { code: 'M12', description: '從事化學品相關作業人員已接受危害通識教育訓練。', groupName: '工地管理' }
    ],
    
    // 一般作業檢查項目
    '一般作業': [
      // AA類項目（一般安全管理AA）
      { code: 'AA01', description: '進入施工區域已正確配戴安全帽並扣上帽帶。', groupName: '一般安全管理AA' },
      { code: 'AA02', description: '穿著及膝之長褲及覆肩之上衣。', groupName: '一般安全管理AA' },
      { code: 'AA03', description: '人員無嚼食檳榔、追逐嬉戲、賭博、打架等行為。', groupName: '一般安全管理AA' },
      { code: 'AA04', description: '人員未攜帶或飲用含酒精性飲料。', groupName: '一般安全管理AA' },
      { code: 'AA05', description: '未攜帶管制物品(如：照相機、NOTEBOOK、磁片、打火機…等)。', groupName: '一般安全管理AA' },
      { code: 'AA06', description: '施工人員無酒醉、吸毒或精神不能集中等異常現象。', groupName: '一般安全管理AA' },
      { code: 'AA07', description: '施工區、預置區、堆放區已設置圍籬及標示廠商名稱、連絡人及電話。', groupName: '一般安全管理AA' },
      { code: 'AA08', description: '現場地面放置工具、物料已舖設塑膚布或不鏽鋼板。', groupName: '一般安全管理AA' },
      { code: 'AA09', description: '未在樓梯、通道上、緊急疏散路線、沖身洗眼器、逃生門以及緊急應變用品櫃附近，堆放機具、材料者。', groupName: '一般安全管理AA' },
      { code: 'AA10', description: '將工具、材料置於安全處。', groupName: '一般安全管理AA' },
      { code: 'AA11', description: '於指定區域用餐、飲食、休息。', groupName: '一般安全管理AA' },
      { code: 'AA12', description: '於指定地點抽煙。', groupName: '一般安全管理AA' },
      { code: 'AA13', description: '車輛持有通行證、依規定停放、未阻礙通道。', groupName: '一般安全管理AA' },
      { code: 'AA14', description: '行車未超過速限/未逆向行駛。', groupName: '一般安全管理AA' },
      { code: 'AA15', description: '未任意拆除或挪用機電設備、警告標誌、防護設備、消防設施(含消防管或滅火器移做他用)….等。', groupName: '一般安全管理AA' },
      { code: 'AA16', description: '已申請拆除安全設施(如：安全網、平台護欄….等) 。', groupName: '一般安全管理AA' },
      { code: 'AA17', description: '施工現場已無其他方式須直接踐踏機台、管路等，且已事先向管理單位申請許可。', groupName: '一般安全管理AA' },
      { code: 'AA18', description: '轉動任一管路之閥類開關或電氣開關前已通知相關負責人員。', groupName: '一般安全管理AA' },
      { code: 'AA19', description: '下班收工後已將電氣設備、氣體鋼瓶關閉。', groupName: '一般安全管理AA' },
      { code: 'AA20', description: '現場作業時正確配帶個人防護具。', groupName: '一般安全管理AA' },
      { code: 'AA21', description: '未在廠內隨地便溺。', groupName: '一般安全管理AA' },
      { code: 'AA22', description: '已復原安全設施(如：安全網、平台護欄….等) 。', groupName: '一般安全管理AA' },
      
      // AB類項目（整理整頓AB）
      { code: 'AB01', description: '每日工程收工前，整理現場、收拾工具，使之恢復正常狀況。', groupName: '整理整頓AB' },
      { code: 'AB02', description: '每日工作後，將自動昇降機、A字梯、施工架等歸回定位。', groupName: '整理整頓AB' },
      { code: 'AB03', description: '每日工作後，將作業平台上工具及施工物件、材料等收拾完成。', groupName: '整理整頓AB' },
      { code: 'AB04', description: '庫存區、預置區、堆放區之機具、材料已分類、標示，廢棄物當日清除。', groupName: '整理整頓AB' },
      { code: 'AB05', description: '每日收工前將物料、工具置於暫存區並將當日垃圾清理乾淨。', groupName: '整理整頓AB' },
      { code: 'AB06', description: '生活廢棄物依照各區垃圾分類規定丟棄於各分類垃圾桶內。', groupName: '整理整頓AB' },
      
      // AC類項目（作業檢驗AC）
      { code: 'AC01', description: '作業許可證或其他規定表格標示於現場明顯處。', groupName: '作業檢驗AC' },
      { code: 'AC02', description: '實施作業自主檢點或機具檢點、檢查。', groupName: '作業檢驗AC' },
      { code: 'AC03', description: '進行切管、修改等作業前，已經管理單位、人員確認無誤。', groupName: '作業檢驗AC' },
      
      // AD類項目（門禁管理AD）
      { code: 'AD01', description: '施工人員正確配戴識別證及穿著施工背心。', groupName: '門禁管理AD' },
      { code: 'AD02', description: '入廠施工人員依規定接受相關工安訓練課程。', groupName: '門禁管理AD' },
      { code: 'AD03', description: '人員未持來賓證進入廠區施作。', groupName: '門禁管理AD' },
      { code: 'AD04', description: '證件未借與他人或未冒用他人證件進出廠區。', groupName: '門禁管理AD' },
      { code: 'AD05', description: '已事先獲得管理人員許可才入廠施工。', groupName: '門禁管理AD' },
      { code: 'AD06', description: '未出入非經許可之區域(依識別證門禁區域判別)。', groupName: '門禁管理AD' },
      { code: 'AD07', description: '未於非緊急狀態違規打開或進出安全門。', groupName: '門禁管理AD' },
      { code: 'AD08', description: '未闖越簽到、讀卡、換證等門禁管制區域。', groupName: '門禁管理AD' },
      
      // AE類項目（無塵室管理AE）
      { code: 'AE01', description: '符合無塵室穿著規定。', groupName: '無塵室管理AE' },
      { code: 'AE02', description: '設備材料機具進入無塵室，已擦拭乾淨及存放於規定區域。', groupName: '無塵室管理AE' },
      { code: 'AE03', description: '於無塵室施工已做好潔淨措施。', groupName: '無塵室管理AE' },
      { code: 'AE04', description: '施工時人員未直接坐於地面上。', groupName: '無塵室管理AE' },
      { code: 'AE05', description: '未嚼食口香糖。', groupName: '無塵室管理AE' },
      { code: 'AE06', description: '未攜帶管制物品(如：照相機、NOTEBOOK、磁片、鉛筆、非無塵紙、立可白、紙箱、行動電話、打火機…等)。', groupName: '無塵室管理AE' },
      { code: 'AE07', description: '遵守其他無塵室相關規定。', groupName: '無塵室管理AE' },
      
      // AF類項目（其他管理AF）
      { code: 'AF01', description: '遵守每日出工人員簽到規定。', groupName: '其他管理AF' },
      { code: 'AF02', description: '依規定繳交相關文件。', groupName: '其他管理AF' },
      { code: 'AF03', description: '出席『供應商安全衛生會議』。', groupName: '其他管理AF' },
      { code: 'AF04', description: '遵守其他安全、管理相關規定。', groupName: '其他管理AF' }
    ],
    
    // 特殊作業檢查項目
    '特殊作業': [
      // BA類項目（動火作業BA）
      { code: 'BA01', description: '作業現場備有正確、足夠之滅火器，且有效期限未過期。', groupName: '動火作業BA' },
      { code: 'BA02', description: '作業現場易燃物已移除或加以防護。', groupName: '動火作業BA' },
      { code: 'BA03', description: '氣體鋼瓶集中時，保持豎立，或使用專用手推車搬運氣體鋼瓶。', groupName: '動火作業BA' },
      { code: 'BA04', description: '氣體鋼瓶使用鐵鍊、非彈性繩索固定，或每日作業後裝妥護蓋。', groupName: '動火作業BA' },
      { code: 'BA05', description: '焊接機具裝設有效之自動電擊防止裝置及漏電斷路器。', groupName: '動火作業BA' },
      { code: 'BA06', description: '氧氣鋼瓶裝有合乎規格之專用減壓調節器及防爆逆止閥。', groupName: '動火作業BA' },
      { code: 'BA07', description: '高處動火有以耐燃材料阻隔、收集、抑制火星四散或掉落。', groupName: '動火作業BA' },
      { code: 'BA08', description: '焊接時使用絕緣良好之安全手把、配戴盔帽及遮光玻璃。', groupName: '動火作業BA' },
      { code: 'BA09', description: '焊接地線已儘可能接近焊接點，電流迴路無經其它設備而導致跳電之虞。', groupName: '動火作業BA' },
      
      // BB類項目（高架作業BB）
      { code: 'BB01', description: '依照施工地點之地形、地物使用下列之安全器具：(a)施工架/作業平台(含牢固護欄)(b)自動升降機(c)安全帶(d)安全網(e)A字梯(f)安全母索(g)其他防墜措施。', groupName: '高架作業BB' },
      { code: 'BB02', description: '未僱用下列人員從事高架作業：(a)患有高血壓、心血管疾病或貧血者(b)曾患有癲癇精神或神精疾病(c)平衡機能失常者(d)患有哮喘症者(e)四肢不全者(f)色盲者(g)聽力不正常者(h)酗酒者(i)身體虛弱者(j)情緒不佳有安全顧慮者(k)年齡未滿十八歲或超過五十五歲者。', groupName: '高架作業BB' },
      { code: 'BB03', description: '施工架上未再搭接梯子或踏凳等從事作業。', groupName: '高架作業BB' },
      { code: 'BB04', description: '移動式施工架於定位時應踩下車輪煞車器固定。', groupName: '高架作業BB' },
      { code: 'BB05', description: '人員位於施工架上時，未移動施工架。', groupName: '高架作業BB' },
      { code: 'BB06', description: '施工使用A字梯時，以一人在梯上一人在下扶持A字梯之夥同方式作業(作業廠區規定時適用) 。', groupName: '高架作業BB' },
      { code: 'BB07', description: '未使用損毀凹陷的A字梯、施工架。', groupName: '高架作業BB' },
      { code: 'BB08', description: '高差超過1.5公尺以上之場所，使用人員能安全上下之設備。', groupName: '高架作業BB' },
      { code: 'BB09', description: '未從高處投下物體，或使用適當之承受設備。', groupName: '高架作業BB' },
      { code: 'BB10', description: '高空工作車應標示空重、載重、額定荷重等，且不得超過高空工作車之積載荷重及能力。', groupName: '高架作業BB' },
      { code: 'BB11', description: '高空工作車事先應視作業場所之狀況、工作台高度、伸臂長度及作業場所地形等，規定適當之行駛速率，操作人員應依規定操作。', groupName: '高架作業BB' },
      { code: 'BB12', description: '在工作台以外之處所操作工作台時，操作人員與工作台上之人員間應規定統一指揮信號，並依信號從事指揮作業。', groupName: '高架作業BB' },
      { code: 'BB13', description: '除乘坐席位及工作台外不得搭載人員，且作業時禁止非相關人員進入操作半徑內，或附近有危險之虞之場所。', groupName: '高架作業BB' },
      { code: 'BB14', description: '應將其外伸撐座完全伸出，並採取防止地盤沉陷或崩塌等必要措施', groupName: '高架作業BB' },
      { code: 'BB15', description: '高空工作車禁止停放斜坡，除非已採有安全措施。', groupName: '高架作業BB' },
      { code: 'BB16', description: '使用高空工作車從事作業時，工作台上的人員應佩帶背負式安全帶，工作台出入口處應有確保防止人員墜落的安全設施。', groupName: '高架作業BB' },
      { code: 'BB17', description: '工作車移動時，應將工作台下降至最低位置；若不使用時應確實使用制動裝置保持高空工作車於穩定狀態。', groupName: '高架作業BB' },
      
      // BC類項目（局限空間作業BC）
      { code: 'BC01', description: '已對局限空間進行氧氣含量及有害物濃度測試合格後才進入作業。(O2濃度18~21%)', groupName: '局限空間作業BC' },
      { code: 'BC02', description: '缺氧作業主管於現場全程監督作業安全。', groupName: '局限空間作業BC' },
      { code: 'BC03', description: '人體有害物質已做妥隔離、遮斷、盲封、清除。', groupName: '局限空間作業BC' },
      { code: 'BC04', description: '作業現場備有良好且正確運作之通風設備。', groupName: '局限空間作業BC' },
      { code: 'BC05', description: '人員經許可後，再進入局限空間。', groupName: '局限空間作業BC' },
      { code: 'BC06', description: '許可進入局限空間作業之人員已載明進入時間及期限。', groupName: '局限空間作業BC' },
      { code: 'BC07', description: '引火性液體之蒸氣或可燃性氣體之濃度不得超過其爆炸下限之30%。', groupName: '局限空間作業BC' },
      { code: 'BC08', description: '人員應配戴適當之呼吸防護具(濾過式、供氣式呼吸防護具等)', groupName: '局限空間作業BC' },
      { code: 'BC09', description: '已訂定危害防止計劃供依循。', groupName: '局限空間作業BC' },
      { code: 'BC10', description: '於作業場所顯而易見處公告禁止進入。', groupName: '局限空間作業BC' },
      { code: 'BC11', description: '防護設備及救援設備已準備。', groupName: '局限空間作業BC' },
      
      // BD類項目（電力作業BD）
      { code: 'BD01', description: '插頭依規定格式標示公司名稱、連絡人及連絡電話。', groupName: '電力作業BD' },
      { code: 'BD02', description: '使用之電線、插頭無破損或絕緣不良之現象。', groupName: '電力作業BD' },
      { code: 'BD03', description: '電線橫越道路及車輛行駛較頻繁之場所，以管路埋設地下或以厚鋼管、槽鐵等掩護或架高配設，且未形成通行障礙。', groupName: '電力作業BD' },
      { code: 'BD04', description: '使用經檢驗合格之電器設備。', groupName: '電力作業BD' },
      { code: 'BD05', description: '未以電線或其他金屬代替保險絲。', groupName: '電力作業BD' },
      { code: 'BD06', description: '施工用電使用〝施工專用電盤〞接電。', groupName: '電力作業BD' },
      { code: 'BD07', description: '使用〝施工專用電盤〞由上下開孔接電，不會妨礙電盤門開閉。', groupName: '電力作業BD' },
      { code: 'BD08', description: '危險地區加裝護欄及掛有安全標示。', groupName: '電力作業BD' },
      { code: 'BD09', description: '電氣設備遠離易燃品或有適當防護。', groupName: '電力作業BD' },
      { code: 'BD10', description: '非指定人員未隨意開動或關閉機械設備，以及工作起動後有關電氣設備部分之使用，經機械、設備之管理人員許可。', groupName: '電力作業BD' },
      { code: 'BD11', description: '馬達、穿孔器、一般常用之測試儀器及電動手工具，具有良好之絕緣設備，才可使用。', groupName: '電力作業BD' },
      { code: 'BD12', description: '電動工具使用前，依規定接地。', groupName: '電力作業BD' },
      { code: 'BD13', description: '電動工具裝設良好絕緣插頭，未以裸接方式直接插入插座上。', groupName: '電力作業BD' },
      { code: 'BD14', description: '在潮溼地區著乾燥之橡膠鞋及絕緣等措施，才使用電動手工具。', groupName: '電力作業BD' },
      { code: 'BD15', description: '使用之延長線有過載保護裝置。', groupName: '電力作業BD' },
      { code: 'BD16', description: '活線或臨時斷/供電作業，已標示、隔離，且作業後復原環境。', groupName: '電力作業BD' },
      
      // BE類項目（吊籠作業BE）
      { code: 'BE01', description: '吊籠經檢查合格取得檢查合格證。', groupName: '吊籠作業BE' },
      { code: 'BE02', description: '操作人員經教育訓練合格，領有結業證書。', groupName: '吊籠作業BE' },
      { code: 'BE03', description: '每次作業前確實做好檢點工作。', groupName: '吊籠作業BE' },
      { code: 'BE04', description: '作業人員確實使用防墜落裝置。', groupName: '吊籠作業BE' },
      
      // BF類項目（起重吊掛作業BF）
      { code: 'BF01', description: '於吊掛現場設置警告標誌且有專人管制人員通行。', groupName: '起重吊掛作業BF' },
      { code: 'BF02', description: '使用之起重機具經檢查合格取得檢查合格證。', groupName: '起重吊掛作業BF' },
      { code: 'BF03', description: '起重機具標示最高負荷，且未超過此項限制。', groupName: '起重吊掛作業BF' },
      { code: 'BF04', description: '起重機具之吊鉤，有防止吊舉中所吊物體脫落之安全防滑舌片。', groupName: '起重吊掛作業BF' },
      { code: 'BF05', description: '設置/使用過捲揚預防裝置。', groupName: '起重吊掛作業BF' },
      { code: 'BF06', description: '作業現場有一人以上執行吊掛指揮、督導。', groupName: '起重吊掛作業BF' },
      { code: 'BF07', description: '人員未由吊掛現場下方通過。', groupName: '起重吊掛作業BF' },
      { code: 'BF08', description: '使用、操作危險性機械設備，持有合格操作證照。', groupName: '起重吊掛作業BF' },
      { code: 'BF09', description: '實施作業前檢點。', groupName: '起重吊掛作業BF' },
      { code: 'BF10', description: '機械運轉時有警示燈或蜂鳴裝置。', groupName: '起重吊掛作業BF' },
      { code: 'BF11', description: '未以起重機或吊掛機為人員升降工具。', groupName: '起重吊掛作業BF' },
      
      // BG類項目（施工架組配作業BG）
      { code: 'BG01', description: '施工架組配作業主管於現場全程監督作業安全。', groupName: '施工架組配作業BG' },
      { code: 'BG02', description: '施工架組配之基腳無沈陷之虞。', groupName: '施工架組配作業BG' },
      { code: 'BG03', description: '遇地震時立即停止作業，使人員退避至安全避難場所。', groupName: '施工架組配作業BG' },
      { code: 'BG04', description: '地震或地質變化後，徹底檢查施工架後再行作業。', groupName: '施工架組配作業BG' },
      { code: 'BG05', description: '確實完成組配施工架之安全設備（如插銷、交叉連桿等）。', groupName: '施工架組配作業BG' },
      { code: 'BG06', description: '施工架組配物料運送前確實綁紮，無掉落之虞。', groupName: '施工架組配作業BG' },
      { code: 'BG07', description: '施工架組配作業靠近電線、輸配電設備，有護圍、絕緣或掩蔽。', groupName: '施工架組配作業BG' },
      
      // BH類項目（管線拆除作業BH）
      { code: 'BH01', description: '舊電力、化學或氣體管線拆除前，確認管內已無殘留危害物程序。', groupName: '管線拆除作業BH' },
      { code: 'BH02', description: '管線清洗、拆離前，人員確實穿著防護用具。', groupName: '管線拆除作業BH' },
      { code: 'BH03', description: '作業時，主管在現場場督導。', groupName: '管線拆除作業BH' },
      { code: 'BH04', description: '管路拆除範圍，有防止非相關人員進入之標示及管制措施。', groupName: '管線拆除作業BH' },
      
      // BI類項目（開口作業BI）
      { code: 'BI01', description: '工作場所之地面或牆壁如有開口，已裝設護欄或蓋板。', groupName: '開口作業BI' },
      { code: 'BI02', description: '移開高架地板施工前，已先設置警示圍籬、標示。', groupName: '開口作業BI' },
      { code: 'BI03', description: '移開高架地板施工完畢後，已將高架地板復原並固定。', groupName: '開口作業BI' },
      
      // BJ類項目（化學作業BJ）
      { code: 'BJ01', description: '化學物質皆清楚標示。', groupName: '化學作業BJ' },
      { code: 'BJ02', description: '化學物質使用完畢後，置於指定地點。', groupName: '化學作業BJ' },
      { code: 'BJ03', description: '化學物質使用、處置、儲存、作業，備有物質安全資料表(MSDS)。', groupName: '化學作業BJ' },
      { code: 'BJ04', description: '可能產生危害之區域，設有警告標示及護欄。', groupName: '化學作業BJ' },
      { code: 'BJ05', description: '化學物質作業，已穿戴適當的個人防護具。', groupName: '化學作業BJ' }
    ]
  };

  checklistData: SafetyPatrolChecklistData = {
    siteId: '',
    formType: 'safetyPatrolChecklist',
    checkType: '一般作業',
    applyDate: dayjs().format('YYYY-MM-DD'),
    inspectionUnit: '',
    inspector: '',
    inspectee: '',
    projectNo: '',
    items: {},
    itemRemarks: {},
    remarks: '',
    status: 'draft',
    faultyUnitSignature: '',
    micSupervisorSignature: '',
    signatureDate: dayjs().format('YYYY-MM-DD'),
    createdAt: new Date(),
    createdBy: '',
  };

  // 獲取當前檢查類型的所有檢查項目
  getAllCheckItems(): CheckItem[] {
    return this.checkTypeItems[this.checklistData.checkType] || [];
  }

  // 獲取當前日期時間
  getCurrentDateTime(): string {
    return dayjs().format('MM/DD, HH:mm');
  }

  // 批量選擇所有項目為指定值
  selectAllForColumn(value: '正常' | '異常' | '不適用'): void {
    const items = this.getAllCheckItems();
    items.forEach(item => {
      this.checklistData.items[item.code] = value;
      // 如果不是異常，清除備註
      if (value !== '異常') {
        delete this.checklistData.itemRemarks[item.code];
      }
    });
  }

  // 獲取項目分組資訊
  getItemGroups(): {groupName: string, items: CheckItem[], firstIndex: number}[] {
    const items = this.getAllCheckItems();
    const groups: {groupName: string, items: CheckItem[], firstIndex: number}[] = [];
    
    let currentGroup = '';
    let currentItems: CheckItem[] = [];
    let firstIndex = 0;
    
    items.forEach((item, index) => {
      const groupName = item.groupName;
      
      if (currentGroup !== groupName) {
        if (currentItems.length > 0) {
          groups.push({
            groupName: currentGroup,
            items: [...currentItems],
            firstIndex: firstIndex
          });
        }
        currentGroup = groupName;
        currentItems = [item];
        firstIndex = index;
      } else {
        currentItems.push(item);
      }
    });
    
    // 添加最後一組
    if (currentItems.length > 0) {
      groups.push({
        groupName: currentGroup,
        items: [...currentItems],
        firstIndex: firstIndex
      });
    }
    
    return groups;
  }

  // 檢查是否是分組的第一個項目
  isFirstInGroup(itemIndex: number): boolean {
    const groups = this.getItemGroups();
    return groups.some(group => group.firstIndex === itemIndex);
  }

  // 獲取分組的rowspan數量
  getGroupRowspan(itemIndex: number): number {
    const groups = this.getItemGroups();
    const group = groups.find(g => g.firstIndex === itemIndex);
    return group ? group.items.length : 1;
  }

  // 獲取分組名稱
  getGroupName(itemIndex: number): string {
    const groups = this.getItemGroups();
    const group = groups.find(g => g.firstIndex === itemIndex);
    return group ? group.groupName : '';
  }

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
    this.route.paramMap.subscribe(async (params) => {
      const id = params.get('id');
      if (id) {
        this.siteId = id;
        await this.currentSiteService.setCurrentSiteById(id);
        this.checklistData.siteId = id;
        
        // 初始化專案編號
        const currentSite = this.currentSiteService.currentSite();
        if (currentSite?.projectNo) {
          this.checklistData.projectNo = currentSite.projectNo;
        }

        // 檢查是否有表單ID（編輯模式）
        const formId = params.get('formId');
        if (formId) {
          this.formId = formId;
          this.loadChecklistData(formId);
        } else {
          // 從 URL 查詢參數獲取日期和檢查類型
          this.route.queryParams.subscribe(queryParams => {
            // 設置檢查類型
            if (queryParams['checkType'] && this.checkTypes.includes(queryParams['checkType'])) {
              this.checklistData.checkType = queryParams['checkType'];
              this.onCheckTypeChange();
            }
            
            // 處理日期參數
            if (queryParams['date']) {
              const dateFromUrl = queryParams['date'];
              if (dateFromUrl && dateFromUrl.match(/^\d{4}-\d{2}-\d{2}$/)) {
                this.checklistData.applyDate = dateFromUrl;
              }
            }
          });
        }
      }
    });
  }

  // 當檢查類型變更時，清空檢查項目
  onCheckTypeChange(): void {
    this.checklistData.items = {};
    this.checklistData.itemRemarks = {};
  }

  // 加載檢查表數據（編輯模式）
  async loadChecklistData(formId: string): Promise<void> {
    try {
      const data = await this.mongodbService.getById('siteForm', formId);
      if (data && data.formType === 'safetyPatrolChecklist') {
        this.checklistData = data;
        // 更新簽名顯示
        this.faultyUnitSignature = data.faultyUnitSignature || '';
        this.micSupervisorSignature = data.micSupervisorSignature || '';
      }
    } catch (error) {
      console.error('加載檢查表數據失敗', error);
    }
  }

  // 打開簽名對話框
  async openSignatureDialog(type: 'faultyUnit' | 'micSupervisor'): Promise<void> {
    try {
      const signature = await this.signatureDialog.open();
      if (signature) {
        if (type === 'faultyUnit') {
          this.faultyUnitSignature = signature;
          this.checklistData.faultyUnitSignature = signature;
        } else if (type === 'micSupervisor') {
          this.micSupervisorSignature = signature;
          this.checklistData.micSupervisorSignature = signature;
        }
      }
    } catch (error) {
      console.error('簽名對話框操作失敗', error);
    }
  }

  // 驗證表單必填欄位
  validateForm(): { isValid: boolean; missingFields: string[] } {
    const missingFields: string[] = [];

    // 檢查必填欄位
    if (!this.checklistData.checkType) {
      missingFields.push('檢查種類');
    }
    if (!this.checklistData.applyDate) {
      missingFields.push('巡檢日期');
    }
    if (!this.checklistData.projectNo) {
      missingFields.push('專案編號');
    }
    if (!this.checklistData.inspectionUnit) {
      missingFields.push('巡檢單位');
    }
    if (!this.checklistData.inspector) {
      missingFields.push('巡檢人員');
    }
    if (!this.checklistData.inspectee) {
      missingFields.push('巡檢對象');
    }

    return {
      isValid: missingFields.length === 0,
      missingFields
    };
  }

  // 保存檢查表
  async saveChecklist(): Promise<void> {
    try {
      // 先驗證表單
      const validation = this.validateForm();
      if (!validation.isValid) {
        alert(`請填寫以下必填欄位：\n${validation.missingFields.join('、')}`);
        return;
      }

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
        alert('工安巡迴檢查表保存成功');
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
      await this.docxTemplateService.generateFormDocx(this.checklistData._id, 'safetyPatrolChecklist');
      
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
} 