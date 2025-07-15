# Git 檔案權限問題解決方案

## 問題描述

在佈署伺服器上每次執行 `git pull` 之後，`deploy-from-git.sh` 等 shell 腳本的執行權限都會被移除。

## 根本原因

專案的 Git 設定中 `core.filemode = false`，這導致 Git 不會追蹤檔案的執行權限。當代碼從 Windows 開發環境推送到 GitHub，再在 Linux 伺服器上拉取時，執行權限就會遺失。

## 解決方案

### 1. 創建 .gitattributes 檔案

已在專案根目錄創建 `.gitattributes` 檔案，設定：
- 所有 shell 腳本 (`*.sh`) 使用 LF 行尾符
- batch 檔案 (`*.bat`) 使用 CRLF 行尾符
- 各種文字檔案使用統一的行尾符格式
- 二進位檔案標記為 binary

### 2. 腳本自動權限修正

在以下腳本的開頭加入自動權限修正功能：

#### deploy-from-git.sh
- 腳本啟動時自動修正自身和相關腳本的權限
- 在 `git pull` 完成後重新設定權限

#### export.sh
- 腳本啟動時自動修正自身權限

#### import.sh
- 腳本啟動時自動修正自身權限

### 3. 權限修正程式碼

```bash
# 自動修正腳本執行權限
chmod +x "$0" 2>/dev/null || true
chmod +x export.sh 2>/dev/null || true
chmod +x import.sh 2>/dev/null || true
```

## 已修改的檔案

1. **新增檔案**：
   - `.gitattributes` - Git 屬性設定檔案

2. **修改檔案**：
   - `deploy-from-git.sh` - 加入權限自動修正
   - `export.sh` - 加入權限自動修正
   - `import.sh` - 加入權限自動修正

## 使用說明

### 第一次部署後

1. 將修改提交到 Git：
   ```bash
   git add .gitattributes
   git add deploy-from-git.sh export.sh import.sh
   git commit -m "修正 Git 檔案權限問題"
   git push origin main
   ```

2. 在部署伺服器上拉取最新代碼：
   ```bash
   git pull origin main
   ```

3. 如果權限仍有問題，手動執行一次：
   ```bash
   chmod +x deploy-from-git.sh
   ./deploy-from-git.sh
   ```

### 後續部署

腳本現在會自動處理權限問題，無需手動干預。

## 效果

- ✅ 解決了 Git 不追蹤檔案權限的問題
- ✅ 確保各平台間檔案格式一致性
- ✅ 腳本具備自我修復權限的能力
- ✅ 減少部署過程中的手動操作

## 注意事項

- 權限修正使用 `2>/dev/null || true` 確保即使權限設定失敗也不會中斷腳本執行
- `.gitattributes` 檔案會影響所有開發者的工作環境，確保團隊了解這些設定
- 如果在 Windows 環境下開發，建議設定編輯器使用正確的行尾符格式 