@echo off
setlocal enabledelayedexpansion

echo ========================================
echo CSIS Git Auto-Deploy Script for Windows
echo ========================================
echo.

:: 設定變數
set BRANCH=%1
if "%BRANCH%"=="" set BRANCH=main

for /f "tokens=1-4 delims=/ " %%a in ('date /t') do set DATE=%%c%%a%%b
for /f "tokens=1-2 delims=: " %%a in ('time /t') do set TIME=%%a%%b
set TIMESTAMP=%DATE%_%TIME::=%
set TIMESTAMP=%TIMESTAMP: =%

set BACKUP_DIR=backup-%TIMESTAMP%
set LOG_FILE=deployment-%TIMESTAMP%.log

:: 日誌函數
call :log "檢查必要工具..."

:: 檢查 Git
git --version >nul 2>&1
if %errorlevel% neq 0 (
    call :error_exit "Git 未安裝或不在 PATH 中"
)

:: 檢查 Docker
docker --version >nul 2>&1
if %errorlevel% neq 0 (
    call :error_exit "Docker 未安裝或不在 PATH 中"
)

:: 檢查 Docker Compose
docker compose version >nul 2>&1
if %errorlevel% neq 0 (
    docker-compose --version >nul 2>&1
    if %errorlevel% neq 0 (
        call :error_exit "Docker Compose 未安裝"
    ) else (
        set DOCKER_COMPOSE=docker-compose
    )
) else (
    set DOCKER_COMPOSE=docker compose
)

call :log "使用 Docker Compose: !DOCKER_COMPOSE!"

:: 檢查是否在 Git 倉庫中
if not exist ".git" (
    call :error_exit "當前目錄不是 Git 倉庫"
)

:: 檢查是否有未提交的變更
for /f %%i in ('git status --porcelain 2^>nul ^| find /c /v ""') do set CHANGES=%%i
if !CHANGES! gtr 0 (
    call :log "警告: 發現未提交的變更，將會被覆蓋"
    set /p CONTINUE="是否繼續？ (y/N): "
    if /i not "!CONTINUE!"=="y" (
        call :log "部署已取消"
        exit /b 0
    )
)

:: 備份當前狀態
call :log "備份當前狀態..."
mkdir %BACKUP_DIR% 2>nul
copy docker-compose.yml %BACKUP_DIR%\ >nul 2>&1
xcopy config %BACKUP_DIR%\config\ /e /i /y >nul 2>&1
copy .env %BACKUP_DIR%\ >nul 2>&1

:: 儲存當前運行的容器列表
%DOCKER_COMPOSE% ps --services > %BACKUP_DIR%\running_services.txt 2>nul

call :log "備份完成: %BACKUP_DIR%"

:: 拉取最新代碼
call :log "拉取最新代碼 (分支: %BRANCH%)..."
git fetch origin
if %errorlevel% neq 0 (
    call :error_exit "無法從遠端拉取代碼"
)

git reset --hard origin/%BRANCH%
if %errorlevel% neq 0 (
    call :error_exit "無法重置到最新代碼"
)

git clean -fd
if %errorlevel% neq 0 (
    call :error_exit "無法清理工作目錄"
)

call :log "代碼更新完成"

:: 停止現有服務
call :log "停止現有服務..."
%DOCKER_COMPOSE% down
if %errorlevel% neq 0 (
    call :log "警告: 停止服務時出現問題"
)

:: 清理未使用的 Docker 資源
call :log "清理未使用的 Docker 資源..."
docker system prune -f
if %errorlevel% neq 0 (
    call :log "警告: 清理 Docker 資源時出現問題"
)

:: 重新建構映像檔
call :log "重新建構 Docker 映像檔..."
%DOCKER_COMPOSE% build --no-cache
if %errorlevel% neq 0 (
    call :error_exit "建構映像檔失敗"
)

:: 啟動服務
call :log "啟動服務..."
%DOCKER_COMPOSE% up -d
if %errorlevel% neq 0 (
    call :error_exit "啟動服務失敗"
)

:: 等待服務啟動
call :log "等待服務啟動..."
timeout /t 10 /nobreak >nul

:: 健康檢查
call :log "執行健康檢查..."
set HEALTH_CHECK_TIMEOUT=300
set HEALTH_CHECK_INTERVAL=10
set elapsed=0

:health_check_loop
if !elapsed! geq !HEALTH_CHECK_TIMEOUT! goto health_check_end

%DOCKER_COMPOSE% ps | findstr /i "healthy Up" >nul
if %errorlevel% equ 0 (
    call :log "健康檢查通過"
    goto health_check_end
)

call :log "等待服務健康檢查... (!elapsed!/!HEALTH_CHECK_TIMEOUT! 秒)"
timeout /t !HEALTH_CHECK_INTERVAL! /nobreak >nul
set /a elapsed=!elapsed!+!HEALTH_CHECK_INTERVAL!
goto health_check_loop

:health_check_end

:: 檢查是否有失敗的服務
for /f %%i in ('%DOCKER_COMPOSE% ps --services --filter "status=exited" 2^>nul ^| find /c /v ""') do set FAILED_COUNT=%%i
if !FAILED_COUNT! gtr 0 (
    call :log "警告: 有 !FAILED_COUNT! 個服務啟動失敗"
    
    set /p ROLLBACK="是否回滾到之前的狀態？ (y/N): "
    if /i "!ROLLBACK!"=="y" (
        call :log "開始回滾..."
        %DOCKER_COMPOSE% down
        
        if exist "%BACKUP_DIR%\docker-compose.yml" (
            copy %BACKUP_DIR%\docker-compose.yml . >nul
            xcopy %BACKUP_DIR%\config config\ /e /i /y >nul 2>&1
            copy %BACKUP_DIR%\.env . >nul 2>&1
            
            %DOCKER_COMPOSE% up -d
            call :log "回滾完成"
        ) else (
            call :log "無法回滾: 備份檔案不存在"
        )
        exit /b 1
    )
)

:: 顯示服務狀態
call :log "最終服務狀態:"
%DOCKER_COMPOSE% ps

:: 顯示服務 URL
call :log "服務可用的 URL:"
echo   - Web: http://localhost (HTTP)
echo   - Web: https://localhost (HTTPS)
echo   - MongoDB: localhost:27017
echo   - Ollama API: http://localhost:11434

call :log "部署完成！"
call :log "日誌檔案: %LOG_FILE%"
call :log "備份目錄: %BACKUP_DIR%"

echo.
echo ========================================
echo 部署成功完成！
echo ========================================
goto :eof

:: 日誌函數
:log
for /f "tokens=1-3 delims=/ " %%a in ('date /t') do set LOGDATE=%%c-%%a-%%b
for /f "tokens=1-2 delims=: " %%a in ('time /t') do set LOGTIME=%%a:%%b
echo [%LOGDATE% %LOGTIME%] %~1
echo [%LOGDATE% %LOGTIME%] %~1 >> %LOG_FILE%
goto :eof

:: 錯誤處理函數
:error_exit
call :log "ERROR: %~1"
echo 部署失敗！檢查日誌: %LOG_FILE%
exit /b 1 