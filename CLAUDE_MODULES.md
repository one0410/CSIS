# 主要功能模組詳細說明

> 此文件為 CLAUDE.md 的補充，包含各功能模組的詳細業務規則與資料來源。
> 修改前端頁面前建議先閱讀對應模組說明。

## 專案基本資料（`site-basic-info`，路由：`overview`，集合：`site`）
- **基本資訊**：專案編號、專案名稱、合約開始/結束日期、專案簡述
- **地點管理**：縣市、鄉鎮市區聯動選擇器（AreaService）
- **圖片管理**：
  - 專案代表照片（拖放上傳，自動調整至 400x300px，Base64 儲存）
  - 業主 Logo（拖放上傳，自動調整至 200x200px，Base64 儲存）
- **廠區與區域**：動態新增/移除廠區及其下轄區域
- **系統別/作業類型**：動態新增/移除
- **照片統計**：張數、容量使用率（最大 1000MB），>70% 黃色、>90% 紅色
- **權限**：僅 `projectManager`、`secretary`、`admin` 可編輯

## 專案組織列表（`site-user-list`，路由：`userList`，集合：`user`）
- **使用者管理**：搜尋（姓名/帳號/部門）、新增至工地（單一/批次）、移除授權、分頁（每頁 10 筆）
- **工地角色**：admin、safetyManager、safetyEngineer、projectManager、siteManager、secretary、projectEngineer、vendor
- **角色編輯**：即時更新，若變更當前使用者角色則自動刷新 `authService.refreshCurrentUser()`
- **批次新增**：模態框多選使用者（含全選功能），自動過濾已授權使用者
- **權限**：僅 `projectManager`、`secretary`、`admin` 可編輯工地權限

## Dashboard（工地儀表板，`site-dashboard`）

Dashboard 由 4 個區塊組成，共 12 張卡片，以 3 欄 grid 排列。

### 第一區塊：即時資訊

1. **環境監測指標**（可點擊，導航至天氣頁面）
   - 6 項環境數據：溫度、濕度、風速、風向、PM10、PM2.5
   - 資料來源：WeatherAPI（依工地所在縣市查詢）
   - PM2.5 > 35 顯示警告色，> 75 顯示危險色；PM10 > 50 警告，> 100 危險
   - 下方顯示「熱危害指數」儀表（由溫度 + 濕度計算）

2. **今日實時出工狀況**
   - 彙總區：供應商在案人數、帆宣員工在案人數（分開統計）
   - 詳細列表：各供應商出工人數（不含帆宣）
   - 底部顯示總計人數
   - 資料來源：WorkerCountService，從當日**工具箱會議**（`toolboxMeeting`）表單的健康危害告知簽名區統計
   - 以工人姓名去重（同一天同公司簽多次只算一次）

3. **許可單統計**（可點擊，導航至許可單頁面）
   - 頂部顯示「今日有效許可單 N 張」
   - 一般作業：顯示項數（藍色）
   - 特殊作業：顯示項數（紅色），下方縮排顯示各作業類別子項目
   - 業務規則：
     - 有效許可單 = `workStartTime <= 今日結束` 且 `workEndTime >= 今日開始`
     - 特殊作業項數 = 總許可單數 − 一般作業數（因一張特殊作業許可單可包含多個作業類別）
     - 舊資料兼容：無 `isGeneralWork`/`isSpecialWork` 欄位的許可單視為特殊作業
     - 特殊作業子項目按數量降序排列

### 第二區塊：今日統計圖表

4. **今日各承攬商違規次數統計**（圖表元件）
5. **今日違規種類統計**（圖表元件）
6. **明日預計出工狀況**
   - 資料來源：**工地許可單**（`sitePermit`），查詢工作時間涵蓋明日的許可單
   - 依承攬商（`contractor`）分組，累加各許可單的施作人數（`workPersonCount`）
   - 不含帆宣員工（許可單無此資料）
   - 底部顯示預計總計人數

### 第三區塊：月報表統計

7. **每月累積出工人數**（圖表元件）
8. **當月各供應商累積出工人數**（圖表元件）
9. **工安零事故時數**（獨立子元件 `app-zero-accident-hours`）

### 第四區塊：違規與進度統計

10. **當月各供應商違規次數統計**（圖表元件）
11. **當月違規種類統計**（圖表元件）
12. **工程進度**
    - 實際進度百分比 + 進度條
    - 工程起訖日期（取自工地資料 `site.startDate` / `site.endDate`）
    - 進度趨勢圖表元件（`app-progress-trend-chart`）

## 進度管理
- **Gantt Chart**（`site-progress`，路由：`schedule`）：DHTMLX Gantt 視覺化、縮放（週/月/季/年）、匯出 Excel
- **新版進度表**（`new-schedule`，路由：`new-schedule`）：表格式進度管理、每日進度更新
- 共用功能：CSV/XML 匯入、工項進度更新

## 表單管理（`site-form-list`）
- 工作許可單（可包含多個工具箱會議）
- 工具箱會議（產生 QR Code 供簽名）
- 自主檢查、特殊作業表單
- 空白表單（掃描 QR Code 後填寫）

## 工安事項宣導（`site-bulletin`，路由：`bulletin`，集合：`bulletin`）
- **公告管理**：新增/編輯/刪除公告，卡片式排列（3 欄 grid）
- **公告分類**：general（一般）、safety（安全須知）、schedule（進度通知）、urgent（緊急通知）
- **優先級**：low、normal、high、urgent（各有顏色徽章區分）
- **置頂功能**：置頂公告優先顯示，排序依 `isPinned` → `publishDate`
- **查看統計**：點擊查看詳情時自動增加查看次數
- **過期管理**：自動過濾過期公告（依 `expiryDate`），軟刪除（`isActive: false`）
- **權限**：projectManager、siteManager、secretary、safetyManager、safetyEngineer、projectEngineer 可管理，所有人可檢視

## 進場管理

### 人才列表（`site-worker-list`，路由：`workerList`，集合：`worker`）
- **工作人員管理**：搜尋（姓名/身分證/承攬公司）、新增至工地、移除、公司篩選、分頁
- **人員狀態追蹤**：
  - 危害告知狀態（檢查是否已在危害告知表單簽名）
  - 教育訓練次數（可點擊導航至訓練頁面）
  - 勞保/意外險資料狀態（支援圖片上傳至 GridFS）
  - 證照狀態（有效/已過期數量）
  - 工安缺失次數（違規紀錄統計）
- **勞保/意外險管理**：模態框新增/查看/刪除，支援多張圖片上傳
- **標籤列印**：多選工作人員，列印 MIC 工作證標籤（廠商、姓名、血型、背心編號、緊急聯絡人、證照圖示、教育訓練/危害告知狀態），自動產生一年效期
- **導航**：查看詳細資料、歷史軌跡、快速導航至危害告知/教育訓練

### 訪客列表（`site-visitor-list`，路由：`visitorList`，集合：`visitor`）
- **訪客管理**：新增訪客（導航至危害告知頁面簽名）、編輯手機號碼、刪除
- **危害告知整合**：
  - 狀態顯示（已完成/未完成圖示）
  - QR Code 產生（訪客掃描後進入危害告知頁面）
  - 網址複製功能
- **危害告知事項設定**：可自訂工地專屬危害告知內容（儲存於 `setting` 集合，`type: 'visitorHazardNotice'`，預設 18 條工地安全規範）

### 危害告知（`site-hazard-notice`，路由：`hazardNotice`，集合：`siteForm`，`formType: 'hazardNotice'`）
- **表單管理**：新增、查看詳情、編輯（僅草稿可編輯）、作廢、回復已作廢（專案經理/秘書權限）、永久刪除（二次確認）
- **表單資訊**：申請日期、施工廠商、施工地點、工程名稱、簽名人數、狀態標籤（草稿/已發布/已作廢）
- **權限控制**：作廢表單顯示開關僅 `projectManager` 和 `secretary` 可見
- **子元件**：`hazard-notice-form`（表單詳細/編輯頁面）

### 機具管理（`site-equipment`，路由：`equipment`，集合：`equipment`）
- **設備列表**：新增（導航至建立頁面）、查看詳情、刪除（確認機制）
- **設備資訊**：承攬公司、設備名稱、序號、檢查日期/狀態（合格/不合格/未檢查）、下次檢查日期、檢查週期、照片數量、設備狀態（可用/使用中/維修中/已報廢）
- **警示提醒**：
  - 不合格設備數量（紅色徽章）
  - 即將到期檢查數量（3 天內到期或已過期，黃色徽章）
- **檢查週期自動計算**：支援每週/每月/每季/每半年/每年/自定義
- **即時更新**：WebSocket 整合，新增/更新/刪除設備時即時通知
- **設備詳情子元件**（`equipment-detail`）：設備資料編輯、多張照片上傳（GridFS）含說明文字、檢查結果與日期管理、狀態切換

## 照片管理（`site-photos`）
- 依月份瀏覽
- 拖曳上傳或手機拍照
- 照片備註與標籤
- 無限捲動

## 教育訓練管理（`site-training`，路由：`training`，集合：`siteForm`，`formType: 'training'`）
- **表單管理**：新增、編輯（僅草稿）、查看詳情、作廢、回復已作廢、永久刪除（二次確認）
- **搜尋**：依課程名稱、講師、參與者姓名即時過濾（支援 URL query `?search=xxx`）
- **表單狀態**：draft（草稿）、published（已發布）、revoked（已作廢）
- **顯示資訊**：上課日期、課程名稱、講師、簽到人數
- **QR Code 簽名**：工人透過 `/training/:formId` 公開路由掃碼簽到
- **權限**：所有授權使用者可新增/查看；僅 `projectManager`、`secretary` 可顯示作廢表單開關
- **子元件**：`training-form`（表單詳細頁面，支援建立/編輯/檢視模式）

## 工安通報系統（`site-accident-list`，路由：`accidentList`，集合：`accident`）
- **事件管理**：新增、編輯、刪除（確認對話框）、查看詳情（模態框分區顯示）
- **嚴重程度**：minor（輕微）、moderate（中等）、serious（嚴重）、critical（危急）
- **事件類別**：event（事件）、accident（事故）、near_miss（虛驚事件）
- **處理狀態**：reported（已回報）、investigating（調查中）、resolved（已解決）、closed（已結案）
- **資料欄位**：日期時間、內容、回報人員、嚴重程度、類別（必填）；職稱、電話、地點、目擊/受傷人數、備註（選填）
- **零事故時數**：排除 `near_miss` 類別，從最後事故時間或專案開始日期起算（供 Dashboard 卡片 9 使用）
- **列表排序**：依事件日期時間倒序

## 日報表（`site-daily-report`）

日報表共 8 張卡片，可選擇日期（快捷鍵：昨日/今日），各卡片說明如下：

1. **各廠商實際出工人數**
   - 資料來源：`siteForm`（`toolboxMeeting`），透過 `WorkerCountService.getDailyContractorWorkerCount()`
   - 從工具箱會議健康危害告知的 4 個簽名區擷取，以工人姓名去重
   - 顯示：各承攬商長條圖 + 人數

2. **累積工期與人數**
   - 資料來源：`siteForm`（`toolboxMeeting`），從工地開工日到所選日期
   - 上方：累積工期天數（`所選日期 - site.startDate + 1`）、累積總人數
   - 下方：近 7 日每日出工人數長條圖

3. **帆宣出工人數**
   - 資料來源：`workerCount` 集合（手動輸入）
   - 顯示近 7 日長條圖，可點擊新增/編輯每日人數
   - 因帆宣員工不在工具箱會議簽名區，故需手動紀錄

4. **各廠商當日執行內容**
   - 資料來源：`siteForm`（所有表單類型），以多重日期欄位比對所選日期
   - 顯示：表單類別徽章、承攬商、系統、位置、工作項目
   - 可逐張下載 Word、批次下載全部表單

5. **各廠商當日執行內容（許可單）**
   - 資料來源：`siteForm`（`sitePermit`），`workStartTime <= 所選日期` 且 `workEndTime >= 所選日期`
   - 顯示：承攬商、施工區域、作業類別徽章、工作內容

6. **當日照片分類統計**
   - 資料來源：GridFS（照片檔案 + metadata），依 `uploadDate` 篩選當日
   - 上方：標籤統計徽章（標籤名 + 數量）
   - 中間：照片縮圖網格（最多 9 張）
   - 可下載全部照片為 ZIP（依標籤分資料夾）

7. **當日 JSA（工作安全分析）**
   - 資料來源：`siteForm`（`sitePermit`），與許可單相同查詢條件
   - 僅顯示有填寫 JSA 欄位的許可單
   - 表格顯示：步驟/節點、高風險項目、危害因素、防護具、安全措施、緊急措施、施作日期、施作人數

8. **當日表單總數及彙整**
   - 資料來源：`siteForm`（所有類型），與卡片 4 相同查詢
   - 顯示各表單類型圖示、名稱、數量（各類型有專屬顏色）
   - 底部：總表單數、已完成、進行中

## 週報表（`site-weekly-report`）

週報表共 6 張卡片，以 ISO 8601 週次選擇（快捷鍵：上週/本週）。

1. **各廠商實際出工人數（週統計）**
   - 資料來源：`siteForm`（`toolboxMeeting`），透過 `WorkerCountService.getWeeklyContractorWorkerCount()`
   - 各承攬商顯示：總人次、日均人數
   - 每日明細徽章（週一至週日各日人數）

2. **各項施工申請數量統計**
   - 資料來源：`siteForm`（`sitePermit`），`applyDate` 在該週範圍內
   - 顯示：總申請數 + 各作業類別數量、百分比、彩色進度條
   - 作業類別：動火、高架、局限空間、電力、吊籠、起重吊掛、施工架組裝、管線拆裝、開口、化學

3. **當週缺失累計**
   - 資料來源：`siteForm`（`safetyIssueRecord`），`issueDate` 在該週範圍內
   - 兩種檢視切換：
     - **依廠商**：各承攬商缺失數量、百分比
     - **依類型**：S(安全衛生)、E(環境保護)、Q(品質管理)、M(現場管理)、EL(電力)、F(動火)、H(高架)、C(局限空間)
   - 從 `responsibleUnit` 和 `deductionCode` 欄位提取

4. **自檢表數量統計**
   - 資料來源：`siteForm`（`environmentChecklist`、`specialWorkChecklist`、`safetyPatrolChecklist`）
   - 上方：4 項指標（總表單、合格、不合格、總合格率）
   - 各類型顯示：總數、合格數、不合格數、合格率/不合格率進度條
   - 判定邏輯：檢查表單 items 中是否有異常/不符合/fail/false 值

5. **缺失改善照片**
   - 資料來源：`siteForm`（`safetyIssueRecord`），`issueDate` 在該週範圍內
   - 上方：3 項指標（總缺失、已改善、改善中）
   - 各缺失顯示：描述、承攬商、日期、狀態徽章、改善前/後照片網格
   - 改善判定：有改善後照片 且 `reviewResult === 'completed'`

6. **各廠商當週執行內容**（`weekly-work-content`）
   - 查詢當週（週一至週日）所有 siteForm
   - 查詢條件：sitePermit 以 workStartTime/workEndTime 交集判斷；其餘以 applyDate、meetingDate、checkDate、trainingDate、createdAt 判斷
   - 各表單顯示：類型徽章、狀態徽章、承攬商、系統、位置、工作內容
   - 依 formType 優先順序排序（sitePermit → toolboxMeeting → ... → training）
   - 支援單張 Word 下載及批次 ZIP 下載（`WordDownloadService`）
   - 點擊可導航至對應表單詳情頁

## 月報表（`site-monthly-report`）

月報表共 4 張卡片 + 1 段靜態內容，以月份選擇（快捷鍵：上月/本月）。

1. **本月出工人數統計**
   - 資料來源：`siteForm`（`toolboxMeeting`），透過 `WorkerCountService.getMonthlyContractorWorkerCount()`
   - 上方：4 項指標（廠商數量、總人次、平均人數/週、最高人數）
   - 各承攬商顯示：月總計 + 週別明細表（週次、日期範圍、總人次、工作天數、平均人數、趨勢長條）
   - 尖峰週以黃色標示

2. **本月缺失累計**
   - 資料來源：`siteForm`（`safetyIssueRecord`），`issueDate` 在該月範圍內
   - 結構同週報表缺失累計，兩種檢視（依廠商/依類型）

3. **優良廠商**
   - 資料來源：
     - `worker` 集合：依 `belongSites.siteId` 取得各承攬商工人數
     - `siteForm`（`safetyIssueRecord`）：`applyDate` 在該月範圍內
   - 上方：3 項指標（總廠商數、優良廠商、有缺失廠商）+ 優良率進度條
   - 判定邏輯：有工人但當月零缺失 = 優良廠商
   - 以 `contractingCompanyName` 分組工人，以 `supplierName` 比對缺失

4. **組織圖**
   - 資料來源：`siteForm`（`sitePermit`），`applyDate` 在該月範圍內
   - 樹狀結構：根節點為帆宣，子節點為該月許可單中不重複的監工單位（`supervisor` 欄位）

5. **組織章程**（靜態內容）
   - 顯示勞動基準法第 38 條相關法規文字，共 10 條協調事項
   - 無資料來源，純 HTML 靜態內容
