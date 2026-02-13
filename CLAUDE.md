# CLAUDE.md

這是一個工地專案管理系統 (CSIS - Construction Site Information System)，用於工地安全管理、人才管理、進度追蹤及表單作業。每個系統登入的使用者在不同的工地都有各自的權限。

## 管理標的

1. **工地**：依據不同使用者可以看到自己的工地
2. **工地表單**：從工地許可單為源頭，依據申請施工的工作類別，延伸所需的管制單及缺失單
3. **工地工作人員**：管理工作人員及其證照，工作人員沒有系統登錄帳號，但可透過 QR Code 掃描簽名（需驗證手機或身份證號碼）
4. **工地進度**：可從 XML 或 CSV 匯入專案進度，使用者可在畫面上更新每日工作進度
5. **照片**：可上傳工地照片，並給與不同的標籤來進行管理

## 專案結構

```
CSIS/
├── web/          # Angular 前端
├── server/       # Bun/Express 後端
└── form-config/  # 表單配置版本控制
```

## 開發指令

### 前端 (Angular - 在 `/web` 目錄)

```bash
yarn install      # 安裝依賴
yarn start        # 開發伺服器 (http://localhost:4200)
yarn build        # 建置生產版本
```

### 後端 (Bun - 在 `/server` 目錄)

```bash
yarn install      # 安裝依賴
bun run start     # 啟動伺服器 (http://localhost:3000)
bun run watch     # 開發模式 (自動重載)
bun run build     # 編譯為 Windows 執行檔
bun run buildLinux # 編譯為 Linux 執行檔
```

## 開發規範

### 前端
- 使用 **yarn** 為套件管理工具
- 使用 **Angular v20** 框架，請使用新的語法及功能（如 `@if`、`@for`、signals 等）
- 使用 **Bootstrap 5** 為 CSS framework，優先使用 functional CSS（如 `d-flex`、`h-100`）以節省 CSS 檔案內容並提升 HTML 可讀性
- 使用 **dayjs** 處理時間，以簡化程式碼

### 後端
- `/api/mongodb/:collection` 為統一資料庫操作 API 入口，物件可於前端定義，不需每個物件開新 API

## 關鍵技術

### 前端
- Angular 20、Bootstrap 5、ag-Grid、Chart.js、FullCalendar、DHTMLX Gantt
- signature_pad（簽名功能）、angularx-qrcode（QR Code 產生）
- docxtemplater（Word 文件產生）、exceljs/xlsx（Excel 處理）
- jspdf/html2canvas（PDF 產生）、jszip（ZIP 檔案處理）

### 後端
- Bun runtime、Express 4、MongoDB/Mongoose 8
- GridFS（檔案儲存）、Socket.IO（即時通訊）
- JWT（身份驗證）、Multer（檔案上傳）、Sharp/Jimp（影像處理）

### 資料庫
- MongoDB 搭配 GridFS 進行檔案儲存

## 系統架構

### 表單系統
- 表單範本儲存於 MongoDB
- 表單配置的版本控制（`form-config/` 目錄）
- 動態產生安全檢查表、許可證、工具箱會議等表單
- 整合 QR Code 供行動裝置工人簽名
- GridFS 儲存表單附件和照片

### 認證流程
1. 基於 JWT 的認證
2. AuthGuard 保護需要認證的路由
3. 提供公開路由供工人透過 QR Code 收集簽名
4. 多工地使用者登入後需要選擇工地

### 資料流程
1. 前端服務透過 HTTP/WebSocket 與後端通訊
2. MongoDB 服務處理所有資料庫操作
3. GridFS 管理二進位資料（照片、文件）
4. 透過 Socket.IO 實現協作功能的即時更新

## 圖片儲存規範

為解決 MongoDB 16MB 文檔大小限制：

- **Base64 格式**：`profilePicture`（大頭貼，調整為 100px）
- **GridFS URL 格式**：
  - 身份證正反面、勞保證明、六小時證明
  - 體檢報告、證照圖片等

### ZIP 匯入圖片檔名格式
`{身份證號}_{姓名}_{代碼}.jpg/jpeg/png`

支援的圖片代碼：
- `P`：大頭照
- `IDF`/`IDR`：身份證正面/反面
- `L`/`G`：勞保證明
- `6F`/`6R`：六小時證明正面/反面
- `H`/`H1`/`H2`/`H3`：體檢報告
- `G1`/`G2`/`G3`：意外險證明
- `{證照代碼}F`/`{證照代碼}R`：證照正面/反面

## 主要功能模組

> 各模組詳細業務規則與資料來源見 `CLAUDE_MODULES.md`，修改前端頁面前請先讀取。

| 選單項目 | 元件 | 路由 | 主要集合 |
|---------|------|------|---------|
| 專案基本資料 | `site-basic-info` | `overview` | `site` |
| 專案組織列表 | `site-user-list` | `userList` | `user` |
| Dashboard | `site-dashboard` | `dashboard` | 多表（12 張卡片） |
| 進度管理 | `site-progress` / `new-schedule` | `schedule` / `new-schedule` | `schedule` |
| 工地表單 | `site-form-list` | `forms` | `siteForm` |
| 工安事項宣導 | `site-bulletin` | `bulletin` | `bulletin` |
| **進場管理** | | | |
| - 人才列表 | `site-worker-list` | `workerList` | `worker` |
| - 訪客列表 | `site-visitor-list` | `visitorList` | `visitor` |
| - 危害告知 | `site-hazard-notice` | `hazardNotice` | `siteForm` |
| - 機具管理 | `site-equipment` | `equipment` | `equipment` |
| 照片管理 | `site-photos` | `photos` | GridFS |
| 教育訓練管理 | `site-training` | `training` | `siteForm` |
| 工安通報系統 | `site-accident-list` | `accidentList` | `accident` |
| **報表** | | | |
| - 日報表 | `site-daily-report` | `daily-report` | 8 張卡片 |
| - 週報表 | `site-weekly-report` | `weekly-report` | 6 張卡片 |
| - 月報表 | `site-monthly-report` | `monthly-report` | 5 張卡片 |

