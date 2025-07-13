# CSIS Docker 部署指南

## 系統架構

本系統使用 Docker Compose 部署，包含以下服務：
- **MongoDB**: 資料庫服務
- **Server**: Bun 執行的 API 伺服器
- **Web**: Angular 前端應用程式 (透過 Nginx 服務)
- **Ollama**: 本地大型語言模型服務 (預載 gemma2:9b 模型)

## 部署流程

### 1. 開發機 - 匯出部署包

#### Windows
```bash
# 在專案根目錄執行
export.bat
```

#### Linux/macOS
```bash
# 在專案根目錄執行
chmod +x export.sh
./export.sh
```

執行後會產生：
- Windows: `csis-deployment-YYYYMMDD_HHMMSS.zip`
- Linux/macOS: `csis-deployment-YYYYMMDD_HHMMSS.tar.gz`

### 2. 傳輸部署包

將產生的部署包檔案複製到目標伺服器。

### 3. 目標伺服器 - 匯入部署

#### Windows 伺服器
1. 解壓縮部署包
2. 進入 `scripts` 目錄
3. 以管理員身份執行：
   ```cmd
   import.bat
   ```

#### Linux/macOS 伺服器
1. 解壓縮部署包：
   ```bash
   tar -xzf csis-deployment-*.tar.gz
   ```
2. 進入 `scripts` 目錄：
   ```bash
   cd csis-deployment-*/scripts
   ```
3. 執行匯入腳本：
   ```bash
   chmod +x import.sh
   sudo ./import.sh
   ```

## 設定說明

### 環境變數 (.env)
```env
# MongoDB 設定
MONGO_USERNAME=admin
MONGO_PASSWORD=your_secure_password_here

# SSL 憑證檔案名稱
SSL_CERT=server.crt
SSL_KEY=server.key

# 時區設定
TZ=Asia/Taipei

# Node 環境
NODE_ENV=production
```

### SSL 憑證設定

#### 選項 1: 使用自簽憑證 (測試用)
匯入腳本會提供選項自動產生自簽憑證。

#### 選項 2: 使用正式憑證
將憑證檔案放置到：
- Windows: `C:\csis\ssl\`
- Linux: `/var/lib/csis/ssl/`

檔案名稱：
- `server.crt` - SSL 憑證
- `server.key` - 私鑰

### 資料庫設定
MongoDB 初始化時會自動：
- 創建資料庫使用者
- 建立必要的集合和索引
- 插入預設管理員帳號

## 目錄結構

### Windows 部署目錄
```
C:\csis\
├── config\          # 設定檔案
├── data\            # 應用程式資料
│   ├── mongodb\     # MongoDB 資料
│   ├── uploads\     # 上傳檔案
│   └── logs\        # 日誌檔案
├── ssl\             # SSL 憑證
├── docker-compose.yml
└── .env
```

### Linux 部署目錄
```
/var/lib/csis/
├── config/          # 設定檔案
├── data/            # 應用程式資料
│   ├── mongodb/     # MongoDB 資料
│   ├── uploads/     # 上傳檔案
│   └── logs/        # 日誌檔案
├── ssl/             # SSL 憑證
├── docker-compose.yml
└── .env
```

## 管理命令

### 查看服務狀態
```bash
docker compose ps
```

### 查看日誌
```bash
# 查看所有服務日誌
docker compose logs -f

# 查看特定服務日誌
docker compose logs -f server
docker compose logs -f web
docker compose logs -f mongodb
```

### 停止服務
```bash
docker compose down
```

### 重啟服務
```bash
docker compose restart
```

### 更新服務
```bash
docker compose pull
docker compose up -d
```

### 備份資料
```bash
# 備份 MongoDB
docker exec csis-mongodb mongodump --out /backup

# 備份上傳檔案
tar -czf uploads-backup.tar.gz /path/to/data/uploads
```

## Ollama 服務說明

### 功能特點
- 本地執行大型語言模型
- 預載 gemma2:9b 模型（約 5.5GB）
- 提供 REST API 介面
- 支援多種開源模型

### 使用方式
```bash
# 列出已安裝的模型
curl http://localhost:11434/api/tags

# 與模型對話
curl http://localhost:11434/api/generate -d '{
  "model": "gemma2:9b",
  "prompt": "你好，請介紹一下自己"
}'

# 安裝其他模型
curl http://localhost:11434/api/pull -d '{"name": "llama3:8b"}'
```

### 模型管理
- 模型存放位置：`/var/lib/csis/data/ollama` (Linux) 或 `C:\csis\data\ollama` (Windows)
- 初次啟動會自動下載 gemma2:9b 模型
- 可透過 API 管理和切換模型

## 疑難排解

### 服務無法啟動
1. 檢查 Docker 是否正常運行
2. 確認埠號沒有被佔用：80, 443, 3000, 27017, 11434
3. 查看錯誤日誌：`docker compose logs`

### 無法連線到服務
1. 檢查防火牆設定
2. 確認服務健康狀態：`docker compose ps`
3. 測試服務連線：
   ```bash
   curl http://localhost:3000/api/health
   curl http://localhost/
   ```

### SSL 憑證問題
1. 確認憑證檔案存在且權限正確
2. 檢查憑證有效期限
3. 查看 Nginx 錯誤日誌

## 安全建議

1. **修改預設密碼**
   - MongoDB 管理員密碼
   - 應用程式管理員密碼

2. **設定防火牆**
   - 僅開放必要的埠號
   - 限制 MongoDB 埠號 (27017) 的存取

3. **使用正式 SSL 憑證**
   - 避免在生產環境使用自簽憑證
   - 定期更新憑證

4. **定期備份**
   - 設定自動備份排程
   - 測試備份還原流程

5. **監控和日誌**
   - 定期檢查系統日誌
   - 設定異常警報

## test server

Hi Andy，帆宣測試機連線資訊如下
再跟我說你是架設在哪個port
目前對外只有開這個ssh port你架設完要連線測試的話，可以先用ssh tunnel測試
或者我這邊設定完domain name對應的port以後，你也可以直接用domain連
```
Host mic-iem2
    HostName 140.116.247.125
    Port 11122
    User ubuntu
    pass netdb
```