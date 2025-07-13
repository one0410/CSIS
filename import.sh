#!/bin/bash

echo "========================================"
echo "CSIS Docker Import Script for Linux/macOS"
echo "========================================"
echo

# 檢查是否以 root 或 sudo 執行
if [ "$EUID" -ne 0 ]; then 
    echo "[ERROR] This script requires root privileges"
    echo "Please run with sudo: sudo ./import.sh"
    exit 1
fi

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

# 設定變數
DEPLOYMENT_DIR="/var/lib/csis"
DATA_DIR="${DEPLOYMENT_DIR}/data"
SSL_DIR="${DEPLOYMENT_DIR}/ssl"
CONFIG_DIR="${DEPLOYMENT_DIR}/config"

# 創建目錄結構
echo "Creating deployment directories..."
mkdir -p "${DATA_DIR}/mongodb"
mkdir -p "${DATA_DIR}/uploads"
mkdir -p "${DATA_DIR}/logs"
mkdir -p "${SSL_DIR}"
mkdir -p "${CONFIG_DIR}"

# 設定權限
chmod 755 "${DEPLOYMENT_DIR}"
chmod 755 "${DATA_DIR}"
chmod 700 "${SSL_DIR}"

# 載入 Docker images
echo
echo "Loading Docker images..."
echo "----------------------------------------"
if [ -f "../images/csis-mongodb.tar" ]; then
    echo "Loading MongoDB image..."
    docker load -i ../images/csis-mongodb.tar
else
    echo "[WARNING] MongoDB image not found, will pull from Docker Hub"
fi

if [ -f "../images/csis-server.tar" ]; then
    echo "Loading Server image..."
    docker load -i ../images/csis-server.tar
else
    echo "[ERROR] Server image not found!"
    exit 1
fi

if [ -f "../images/csis-web.tar" ]; then
    echo "Loading Web image..."
    docker load -i ../images/csis-web.tar
else
    echo "[ERROR] Web image not found!"
    exit 1
fi

if [ -f "../images/csis-ollama.tar" ]; then
    echo "Loading Ollama image..."
    docker load -i ../images/csis-ollama.tar
else
    echo "[WARNING] Ollama image not found, will pull from Docker Hub"
fi

# 複製設定檔案
echo
echo "Copying configuration files..."
echo "----------------------------------------"
cp -r ../config/* "${CONFIG_DIR}/"
cp ../config/docker-compose.yml "${DEPLOYMENT_DIR}/"

# 設定環境變數
echo
echo "Setting up environment..."
if [ ! -f "${DEPLOYMENT_DIR}/.env" ]; then
    if [ -f "../config/env.example" ]; then
        cp ../config/env.example "${DEPLOYMENT_DIR}/.env"
        echo
        echo "[IMPORTANT] Please edit environment file:"
        echo "  ${DEPLOYMENT_DIR}/.env"
        echo
        read -p "Press Enter to edit the file..." 
        ${EDITOR:-nano} "${DEPLOYMENT_DIR}/.env"
    fi
fi

# 處理 SSL 憑證
echo
echo "Setting up SSL certificates..."
echo "----------------------------------------"
if [ ! -f "${SSL_DIR}/server.crt" ]; then
    echo
    echo "No SSL certificates found!"
    echo
    echo "Options:"
    echo "1. Generate self-signed certificate (for testing only)"
    echo "2. I will manually copy certificates to ${SSL_DIR}/"
    echo
    read -p "Enter your choice (1 or 2): " SSL_CHOICE
    
    if [ "$SSL_CHOICE" = "1" ]; then
        echo "Generating self-signed certificate..."
        openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
            -keyout "${SSL_DIR}/server.key" \
            -out "${SSL_DIR}/server.crt" \
            -subj "/C=TW/ST=Taiwan/L=Taipei/O=CSIS/CN=localhost"
        chmod 600 "${SSL_DIR}/server.key"
        echo "[INFO] Self-signed certificate generated"
    else
        echo
        echo "Please copy your SSL files to:"
        echo "  - Certificate: ${SSL_DIR}/server.crt"
        echo "  - Private Key: ${SSL_DIR}/server.key"
        echo
        read -p "Press Enter when ready..."
    fi
fi

# 設定防火牆規則 (如果使用 ufw)
if command -v ufw &> /dev/null; then
    echo
    echo "Configuring firewall..."
    ufw allow 80/tcp
    ufw allow 443/tcp
    ufw allow 27017/tcp
fi

# 啟動服務
echo
echo "Starting services..."
echo "----------------------------------------"
cd "${DEPLOYMENT_DIR}"
docker compose up -d

# 等待服務啟動
echo
echo "Waiting for services to start..."
sleep 30

# 健康檢查
echo
echo "Performing health checks..."
echo "----------------------------------------"

# 檢查 MongoDB
if docker exec csis-mongodb mongosh --eval "db.adminCommand('ping')" &> /dev/null; then
    echo "✓ MongoDB is running"
else
    echo "✗ MongoDB is not responding"
fi

# 檢查 Server
if curl -f http://localhost:3000/api/health &> /dev/null; then
    echo "✓ API Server is running"
else
    echo "✗ API Server is not responding"
fi

# 檢查 Web
if curl -f http://localhost/ &> /dev/null; then
    echo "✓ Web Interface is running"
else
    echo "✗ Web Interface is not responding"
fi

# 檢查 Ollama
if curl -f http://localhost:11434/api/tags &> /dev/null; then
    echo "✓ Ollama is running"
else
    echo "✗ Ollama is not responding"
fi

# 檢查服務狀態
echo
echo "Service status:"
echo "----------------------------------------"
docker compose ps

# 顯示訪問資訊
echo
echo "========================================"
echo "Deployment completed!"
echo "========================================"
echo
echo "Access URLs:"
echo "  - Web Interface: https://$(hostname -I | awk '{print $1}')"
echo "  - API Server: http://$(hostname -I | awk '{print $1}'):3000"
echo "  - MongoDB: mongodb://$(hostname -I | awk '{print $1}'):27017"
echo "  - Ollama API: http://$(hostname -I | awk '{print $1}'):11434"
echo
echo "Default credentials:"
echo "  - Username: admin"
echo "  - Password: (check your configuration)"
echo
echo "Management commands:"
echo "  - View logs: docker compose logs -f"
echo "  - Stop services: docker compose down"
echo "  - Restart services: docker compose restart"
echo "  - Update services: docker compose pull && docker compose up -d"
echo
echo "Configuration directory: ${DEPLOYMENT_DIR}"
echo "========================================"
echo 