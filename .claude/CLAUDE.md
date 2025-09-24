# CLAUDE.md

此檔案為 Claude Code (claude.ai/code) 提供在此儲存庫中工作的指引。

## 開發指令

### 前端 (Angular - 在 `/web` 目錄)
```bash
cd web
npm start         # 啟動開發伺服器於 port 4200 (會執行 prestart 來產生版本號)
npm run build     # 建置正式版本至 ../server/wwwroot (會執行 prebuild 來產生版本號)
npm run watch     # 開發模式下的監視建置
npm test          # 使用 Karma/Jasmine 執行單元測試
```

### 後端 (Bun/Node.js - 在 `/server` 目錄)
```bash
cd server
bun start         # 啟動伺服器 (預設 port 3000)
bun run watch     # 啟動伺服器並自動重載變更
bun run debug     # 啟動偵錯模式的伺服器
bun run build     # 建置 Windows 執行檔
bun run buildLinux # 建置 Linux 執行檔
```

### 工具指令
```bash
# 產生版本時間戳記 (在 build/start 時會自動執行)
cd web && bun ./src/environments/generateVersion.ts
```

註記：前端和後端都使用 Yarn 作為套件管理器 (請見 package.json 中的 packageManager 欄位)。

## 架構概覽

### 專案結構
工地安全管理系統 (CSIS) - 一個全面的安全管理平台。

**前端 (Angular 20)：** 位於 `/web`
- 進入點：`src/main.ts` → `app.component.ts` → `app.routes.ts`
- 核心服務：`src/app/services/` (mongodb, auth, photo, weather, gridfs, toast, history)
- 主要模組：
  - 認證：`login/`，由 `AuthGuard` 保護
  - 儀表板與管理：`home/` (包含使用者管理、工人清單、設定、表單配置)
  - 工地管理：`site-list/` 包含表單、工人、進度等巢狀元件
  - 共用元件：`shared/` (簽名板、頂部選單、側邊選單)

**後端 (Bun/Express)：** 位於 `/server`
- 進入點：`index.ts` - Express 伺服器搭配 Socket.IO 整合
- API 路由：`routes/` 目錄
  - `/auth` - 認證端點 (基於 JWT)
  - `/api/mongodb` - MongoDB CRUD 操作
  - `/api/gridfs` - GridFS 檔案儲存操作
  - `/api/photos` - 照片管理
  - `/api/file` - 檔案操作
- 靜態檔案服務於 `wwwroot/browser/`
- 透過 Socket.IO 支援 WebSocket (`mysocket.js`)
- 使用 Winston 進行日誌記錄 (`logger.js`)

### 關鍵技術
- **前端：** Angular 20, Bootstrap 5, ag-Grid, Chart.js, FullCalendar, DHTMLX Gantt, signature_pad, angularx-qrcode
- **後端：** Bun runtime, Express 4, MongoDB/Mongoose 8, GridFS, Socket.IO, JWT, Multer, Sharp (影像處理)
- **資料庫：** MongoDB 搭配 GridFS 進行檔案儲存
- **建置工具：** Angular CLI, Bun bundler

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

## 測試

### 前端測試
```bash
cd web
npm test          # 使用 Karma 執行所有測試
npm test -- --include='**/specific.spec.ts'  # 執行特定測試檔案
```

測試檔案位於元件旁邊，檔名為 `*.spec.ts`