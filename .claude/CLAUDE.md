# CLAUDE.md

這是一個工地專案管理系統, 每個系統登入的使用者, 在不同的工地都有各自工地的權限。
工地管理系統, 每日有例行的表單作業需要進行。
從工地許可單為源頭, 依據申請施工的工作類別, 延伸所需的管制單及缺失單。
除表單之外, 也需管理工作人員, 工作人員在執行工作類別的時候，需要具備相關的工作證照。
另外, 也需要管理工地的進度。

## 開發指令

### 前端 (Angular - 在 `/web` 目錄)

- 使用 yarn 為套件管理工具
- 使用 angular v20 框架, 請使用新的語法及新功能
- 使用 bootstrap 為 CSS framework, 優先使用functional CSS, 例如 d-flex, h-100 等等, 以節省 css 檔案的內容, 並提升HTML的可讀性
- 使用 dayjs 處理時間, 以節省 ts 檔案的複雜度


### 後端 (Bun - 在 `/server` 目錄)

- /api/mongodb/:collection 為統一資料庫操作API入口, 物件可於前端定義, 就不用每個物件要開一個新的API


註記：前端和後端都使用 Yarn 作為套件管理器 (請見 package.json 中的 packageManager 欄位)。



### 關鍵技術
- **前端：** Angular 20, Bootstrap 5, ag-Grid, Chart.js, FullCalendar, DHTMLX Gantt, signature_pad, angularx-qrcode
- **後端：** Bun runtime, Express 4, MongoDB/Mongoose 8, GridFS, Socket.IO, JWT, Multer, Sharp (影像處理)
- **資料庫：** MongoDB 搭配 GridFS 進行檔案儲存

### 表單系統架構
應用程式擁有複雜的表單管理系統：
- 表單範本儲存於 MongoDB
- 表單配置的版本控制 (`form-config/`)
- 動態產生安全檢查表、許可證、工具箱會議等表單
- 整合 QR code 供行動裝置工人簽名
- GridFS 儲存表單附件和照片

### 認證流程
1. 基於 JWT 的認證 (`jsonwebtoken`)
2. AuthGuard 保護需要認證的路由
3. 提供公開路由供工人透過 QR code 收集簽名
4. 多工地使用者登入後需要選擇工地

### 資料流程
1. 前端服務透過 HTTP/WebSocket 與後端通訊
2. MongoDB 服務處理所有資料庫操作
3. GridFS 管理二進位資料 (照片、文件)
4. 透過 Socket.IO 實現協作功能的即時更新
