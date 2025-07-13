@echo off
setlocal enabledelayedexpansion

echo ========================================
echo CSIS Docker Import Script for Windows
echo ========================================
echo.

:: 檢查管理員權限
net session >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] This script requires administrator privileges
    echo Please run as administrator
    pause
    exit /b 1
)

:: 檢查 Docker 是否安裝
docker --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Docker is not installed or not in PATH
    pause
    exit /b 1
)

:: 設定變數
set DEPLOYMENT_DIR=c:\csis
set DATA_DIR=%DEPLOYMENT_DIR%\data
set SSL_DIR=%DEPLOYMENT_DIR%\ssl
set CONFIG_DIR=%DEPLOYMENT_DIR%\config

:: 創建目錄結構
echo Creating deployment directories...
mkdir %DEPLOYMENT_DIR% 2>nul
mkdir %DATA_DIR% 2>nul
mkdir %DATA_DIR%\mongodb 2>nul
mkdir %DATA_DIR%\uploads 2>nul
mkdir %DATA_DIR%\logs 2>nul
mkdir %SSL_DIR% 2>nul
mkdir %CONFIG_DIR% 2>nul

:: 載入 Docker images
echo.
echo Loading Docker images...
echo ----------------------------------------
if exist ..\images\csis-mongodb.tar (
    echo Loading MongoDB image...
    docker load -i ..\images\csis-mongodb.tar
) else (
    echo [WARNING] MongoDB image not found, will pull from Docker Hub
)

if exist ..\images\csis-server.tar (
    echo Loading Server image...
    docker load -i ..\images\csis-server.tar
) else (
    echo [ERROR] Server image not found!
    pause
    exit /b 1
)

if exist ..\images\csis-web.tar (
    echo Loading Web image...
    docker load -i ..\images\csis-web.tar
) else (
    echo [ERROR] Web image not found!
    pause
    exit /b 1
)

if exist ..\images\csis-ollama.tar (
    echo Loading Ollama image...
    docker load -i ..\images\csis-ollama.tar
) else (
    echo [WARNING] Ollama image not found, will pull from Docker Hub
)

:: 複製設定檔案
echo.
echo Copying configuration files...
echo ----------------------------------------
copy ..\config\*.* %CONFIG_DIR%\ >nul
copy ..\config\docker-compose.yml %DEPLOYMENT_DIR%\ >nul

:: 設定環境變數
echo.
echo Setting up environment...
if not exist %DEPLOYMENT_DIR%\.env (
    if exist ..\config\env.example (
        copy ..\config\env.example %DEPLOYMENT_DIR%\.env >nul
        echo.
        echo [IMPORTANT] Please edit %DEPLOYMENT_DIR%\.env to set your passwords!
        notepad %DEPLOYMENT_DIR%\.env
    )
)

:: 處理 SSL 憑證
echo.
echo Setting up SSL certificates...
echo ----------------------------------------
if not exist %SSL_DIR%\server.crt (
    echo.
    echo No SSL certificates found!
    echo.
    echo Options:
    echo 1. Generate self-signed certificate (for testing only)
    echo 2. I will manually copy certificates to %SSL_DIR%\
    echo.
    set /p SSL_CHOICE="Enter your choice (1 or 2): "
    
    if "!SSL_CHOICE!"=="1" (
        echo Generating self-signed certificate...
        powershell -Command "& {
            $cert = New-SelfSignedCertificate -DnsName 'localhost', '*.localhost' -CertStoreLocation 'Cert:\LocalMachine\My' -NotAfter (Get-Date).AddYears(5)
            $certPath = 'Cert:\LocalMachine\My\' + $cert.Thumbprint
            $pwd = ConvertTo-SecureString -String 'csis2024' -Force -AsPlainText
            Export-PfxCertificate -Cert $certPath -FilePath '%SSL_DIR%\server.pfx' -Password $pwd
            Export-Certificate -Cert $certPath -FilePath '%SSL_DIR%\server.crt'
        }"
        echo [INFO] Self-signed certificate generated
        echo [INFO] Certificate password: csis2024
    ) else (
        echo.
        echo Please copy your SSL files to:
        echo   - Certificate: %SSL_DIR%\server.crt
        echo   - Private Key: %SSL_DIR%\server.key
        echo.
        pause
    )
)

:: 啟動服務
echo.
echo Starting services...
echo ----------------------------------------
cd /d %DEPLOYMENT_DIR%
docker compose up -d

:: 等待服務啟動
echo.
echo Waiting for services to start...
timeout /t 30 /nobreak >nul

:: 檢查服務狀態
echo.
echo Checking service status...
echo ----------------------------------------
docker compose ps

:: 顯示訪問資訊
echo.
echo ========================================
echo Deployment completed!
echo ========================================
echo.
echo Access URLs:
echo   - Web Interface: http://localhost
echo   - API Server: http://localhost:3000
echo   - MongoDB: mongodb://localhost:27017
echo   - Ollama API: http://localhost:11434
echo.
echo Default credentials:
echo   - Username: admin
echo   - Password: (check your configuration)
echo.
echo Management commands:
echo   - View logs: docker compose logs -f
echo   - Stop services: docker compose down
echo   - Restart services: docker compose restart
echo   - Update services: docker compose pull ^&^& docker compose up -d
echo.
echo Configuration directory: %DEPLOYMENT_DIR%
echo ========================================
echo.
pause 