@echo off
setlocal enabledelayedexpansion

echo ========================================
echo CSIS Docker Export Script for Windows
echo ========================================
echo.

:: 檢查 Docker 是否安裝
docker --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Docker is not installed or not in PATH
    exit /b 1
)

:: 設定變數
set TIMESTAMP=%date:~0,4%%date:~5,2%%date:~8,2%_%time:~0,2%%time:~3,2%%time:~6,2%
set TIMESTAMP=%TIMESTAMP: =0%
set DEPLOYMENT_ROOT=deployment
set EXPORT_DIR=%DEPLOYMENT_ROOT%\csis-deployment-%TIMESTAMP%
set IMAGES_DIR=%EXPORT_DIR%\images
set CONFIG_DIR=%EXPORT_DIR%\config
set SCRIPTS_DIR=%EXPORT_DIR%\scripts

:: 創建目錄結構
echo Creating export directories...
mkdir %DEPLOYMENT_ROOT% 2>nul
mkdir %EXPORT_DIR% 2>nul
mkdir %IMAGES_DIR% 2>nul
mkdir %CONFIG_DIR% 2>nul
mkdir %SCRIPTS_DIR% 2>nul

:: 建構 Docker images
echo.
echo Building Docker images...
echo ----------------------------------------
docker compose build
if %errorlevel% neq 0 (
    echo [ERROR] Failed to build Docker images
    exit /b 1
)

:: 儲存 Docker images
echo.
echo Saving Docker images...
echo ----------------------------------------
docker save -o %IMAGES_DIR%\csis-mongodb.tar mongo:7.0
docker save -o %IMAGES_DIR%\csis-server.tar csis-server:latest
docker save -o %IMAGES_DIR%\csis-web.tar csis-web:latest
docker save -o %IMAGES_DIR%\csis-ollama.tar ollama/ollama:latest

:: 複製設定檔案
echo.
echo Copying configuration files...
echo ----------------------------------------
copy docker-compose.yml %CONFIG_DIR%\ >nul
copy config\*.* %CONFIG_DIR%\ >nul
copy import.bat %SCRIPTS_DIR%\ >nul
copy import.sh %SCRIPTS_DIR%\ >nul

:: 創建 README
echo.
echo Creating README...
(
echo # CSIS 部署包
echo.
echo 建立時間: %date% %time%
echo.
echo ## 內容說明
echo - images/: Docker 映像檔
echo - config/: 設定檔案
echo - scripts/: 部署腳本
echo.
echo ## 部署步驟
echo 1. 將此目錄複製到目標伺服器
echo 2. 進入 scripts 目錄
echo 3. 執行 import.bat ^(Windows^) 或 import.sh ^(Linux^)
echo 4. 根據提示完成部署
echo.
echo ## 注意事項
echo - 請確保目標伺服器已安裝 Docker
echo - 部署前請先設定 SSL 憑證
echo - 記得修改預設密碼
) > %EXPORT_DIR%\README.md

:: 壓縮打包
echo.
echo Creating deployment package...
echo ----------------------------------------
powershell -Command "Compress-Archive -Path '%EXPORT_DIR%\*' -DestinationPath '%DEPLOYMENT_ROOT%\csis-deployment-%TIMESTAMP%.zip' -Force"

:: 清理暫存目錄
echo.
echo Cleaning up...
rmdir /s /q %EXPORT_DIR%

:: 清理舊版本 (保留最新 3 個)
echo.
echo Removing old deployment packages...
for /f "skip=3 delims=" %%f in ('dir /b /o-d %DEPLOYMENT_ROOT%\csis-deployment-*.zip 2^>nul') do (
    echo Removing %%f
    del "%DEPLOYMENT_ROOT%\%%f"
)

echo.
echo ========================================
echo Export completed successfully!
echo Package: %DEPLOYMENT_ROOT%\csis-deployment-%TIMESTAMP%.zip
echo ========================================
echo. 