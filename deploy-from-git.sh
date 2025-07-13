#!/bin/bash

# CSIS Git 自動部署腳本 (Linux)
# 使用方式: ./deploy-from-git.sh [branch_name]

set -e  # 遇到錯誤立即退出

echo "========================================"
echo "CSIS Git Auto-Deploy Script for Linux"
echo "========================================"
echo

# 設定變數
BRANCH=${1:-main}
BACKUP_DIR="backup-$(date +%Y%m%d_%H%M%S)"
LOG_FILE="deployment-$(date +%Y%m%d_%H%M%S).log"

# 創建日誌函數
log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

# 錯誤處理函數
error_exit() {
    log "ERROR: $1"
    echo "部署失敗！檢查日誌: $LOG_FILE"
    exit 1
}

# 檢查必要工具
log "檢查必要工具..."
command -v git >/dev/null 2>&1 || error_exit "Git 未安裝"
command -v docker >/dev/null 2>&1 || error_exit "Docker 未安裝"
command -v docker-compose >/dev/null 2>&1 || command -v docker compose >/dev/null 2>&1 || error_exit "Docker Compose 未安裝"

# 設定 Docker Compose 命令
if command -v docker-compose >/dev/null 2>&1; then
    DOCKER_COMPOSE="docker-compose"
else
    DOCKER_COMPOSE="docker compose"
fi

log "使用 Docker Compose: $DOCKER_COMPOSE"

# 檢查是否在 Git 倉庫中
if [ ! -d ".git" ]; then
    error_exit "當前目錄不是 Git 倉庫"
fi

# 檢查是否有未提交的變更
if [ -n "$(git status --porcelain)" ]; then
    log "警告: 發現未提交的變更，將會被覆蓋"
    read -p "是否繼續？ (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        log "部署已取消"
        exit 0
    fi
fi

# 備份當前狀態
log "備份當前狀態..."
mkdir -p "$BACKUP_DIR"
cp docker-compose.yml "$BACKUP_DIR/" 2>/dev/null || true
cp -r config "$BACKUP_DIR/" 2>/dev/null || true
cp .env "$BACKUP_DIR/" 2>/dev/null || true

# 儲存當前運行的容器列表
$DOCKER_COMPOSE ps --services --filter "status=running" > "$BACKUP_DIR/running_services.txt" 2>/dev/null || true

log "備份完成: $BACKUP_DIR"

# 拉取最新代碼
log "拉取最新代碼 (分支: $BRANCH)..."
git fetch origin || error_exit "無法從遠端拉取代碼"
git reset --hard "origin/$BRANCH" || error_exit "無法重置到最新代碼"
git clean -fd || error_exit "無法清理工作目錄"

log "代碼更新完成"

# 停止現有服務
log "停止現有服務..."
$DOCKER_COMPOSE down || log "警告: 停止服務時出現問題"

# 清理未使用的 Docker 資源
log "清理未使用的 Docker 資源..."
docker system prune -f || log "警告: 清理 Docker 資源時出現問題"

# 重新建構映像檔
log "重新建構 Docker 映像檔..."
$DOCKER_COMPOSE build --no-cache || error_exit "建構映像檔失敗"

# 啟動服務
log "啟動服務..."
$DOCKER_COMPOSE up -d || error_exit "啟動服務失敗"

# 等待服務啟動
log "等待服務啟動..."
sleep 10

# 健康檢查
log "執行健康檢查..."
HEALTH_CHECK_TIMEOUT=300  # 5分鐘
HEALTH_CHECK_INTERVAL=10  # 10秒間隔
elapsed=0

while [ $elapsed -lt $HEALTH_CHECK_TIMEOUT ]; do
    if $DOCKER_COMPOSE ps | grep -q "healthy\|Up"; then
        log "健康檢查通過"
        break
    fi
    
    log "等待服務健康檢查... ($elapsed/$HEALTH_CHECK_TIMEOUT 秒)"
    sleep $HEALTH_CHECK_INTERVAL
    elapsed=$((elapsed + HEALTH_CHECK_INTERVAL))
done

# 檢查是否所有服務都正常運行
FAILED_SERVICES=$($DOCKER_COMPOSE ps --services --filter "status=exited" 2>/dev/null || true)
if [ -n "$FAILED_SERVICES" ]; then
    log "警告: 以下服務啟動失敗: $FAILED_SERVICES"
    
    # 提供回滾選項
    read -p "是否回滾到之前的狀態？ (y/N): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        log "開始回滾..."
        $DOCKER_COMPOSE down
        
        if [ -f "$BACKUP_DIR/docker-compose.yml" ]; then
            cp "$BACKUP_DIR/docker-compose.yml" .
            cp -r "$BACKUP_DIR/config" . 2>/dev/null || true
            cp "$BACKUP_DIR/.env" . 2>/dev/null || true
            
            $DOCKER_COMPOSE up -d
            log "回滾完成"
        else
            log "無法回滾: 備份檔案不存在"
        fi
        exit 1
    fi
fi

# 顯示服務狀態
log "最終服務狀態:"
$DOCKER_COMPOSE ps

# 顯示服務 URL
log "服務可用的 URL:"
echo "  - Web: http://localhost (HTTP)"
echo "  - Web: https://localhost (HTTPS)"
echo "  - MongoDB: localhost:27017"
echo "  - Ollama API: http://localhost:11434"

log "部署完成！"
log "日誌檔案: $LOG_FILE"
log "備份目錄: $BACKUP_DIR"

echo
echo "========================================"
echo "部署成功完成！"
echo "========================================" 