#!/bin/bash

echo "========================================"
echo "CSIS Docker Export Script for Linux/macOS"
echo "========================================"
echo

# 檢查 Docker 是否安裝
if ! command -v docker &> /dev/null; then
    echo "[ERROR] Docker is not installed or not in PATH"
    exit 1
fi

# 檢查 Docker Compose
if ! docker compose version &> /dev/null; then
    echo "[ERROR] Docker Compose is not available"
    exit 1
fi

# 檢查磁碟空間 (至少需要 5GB)
AVAILABLE_SPACE=$(df -BG . | awk 'NR==2 {print $4}' | sed 's/G//')
if [ "$AVAILABLE_SPACE" -lt 5 ]; then
    echo "[WARNING] Low disk space: ${AVAILABLE_SPACE}GB available"
    read -p "Continue anyway? (y/N) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

# 設定變數
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
EXPORT_DIR="csis-deployment-${TIMESTAMP}"
IMAGES_DIR="${EXPORT_DIR}/images"
CONFIG_DIR="${EXPORT_DIR}/config"
SCRIPTS_DIR="${EXPORT_DIR}/scripts"

# 創建目錄結構
echo "Creating export directories..."
mkdir -p "${IMAGES_DIR}" "${CONFIG_DIR}" "${SCRIPTS_DIR}"

# 建構 Docker images
echo
echo "Building Docker images..."
echo "----------------------------------------"
docker compose build
if [ $? -ne 0 ]; then
    echo "[ERROR] Failed to build Docker images"
    exit 1
fi

# 儲存 Docker images
echo
echo "Saving Docker images..."
echo "----------------------------------------"
echo "Saving MongoDB image..."
docker save -o "${IMAGES_DIR}/csis-mongodb.tar" mongo:7.0

echo "Saving Server image..."
docker save -o "${IMAGES_DIR}/csis-server.tar" csis-server:latest

echo "Saving Web image..."
docker save -o "${IMAGES_DIR}/csis-web.tar" csis-web:latest

echo "Saving Ollama image..."
docker save -o "${IMAGES_DIR}/csis-ollama.tar" ollama/ollama:latest

# 複製設定檔案
echo
echo "Copying configuration files..."
echo "----------------------------------------"
cp docker-compose.yml "${CONFIG_DIR}/"
cp -r config/* "${CONFIG_DIR}/" 2>/dev/null || true
cp import.bat "${SCRIPTS_DIR}/" 2>/dev/null || true
cp import.sh "${SCRIPTS_DIR}/"
chmod +x "${SCRIPTS_DIR}/import.sh"

# 創建 README
echo
echo "Creating README..."
cat > "${EXPORT_DIR}/README.md" << EOF
# CSIS 部署包

建立時間: $(date)

## 內容說明
- images/: Docker 映像檔
- config/: 設定檔案
- scripts/: 部署腳本

## 部署步驟
1. 將此目錄複製到目標伺服器
2. 進入 scripts 目錄
3. 執行 ./import.sh (Linux/macOS) 或 import.bat (Windows)
4. 根據提示完成部署

## 注意事項
- 請確保目標伺服器已安裝 Docker
- 部署前請先設定 SSL 憑證
- 記得修改預設密碼
EOF

# 壓縮打包
echo
echo "Creating deployment package..."
echo "----------------------------------------"
tar -czf "csis-deployment-${TIMESTAMP}.tar.gz" "${EXPORT_DIR}"

# 清理暫存目錄
echo
echo "Cleaning up..."
rm -rf "${EXPORT_DIR}"

# 清理舊版本 (保留最新 3 個)
echo
echo "Removing old deployment packages..."
ls -t csis-deployment-*.tar.gz 2>/dev/null | tail -n +4 | xargs -r rm -f

echo
echo "========================================"
echo "Export completed successfully!"
echo "Package: csis-deployment-${TIMESTAMP}.tar.gz"
echo "========================================"
echo 