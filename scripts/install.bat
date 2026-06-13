@echo off
setlocal enabledelayedexpansion

REM ==============================================================================
REM CloudHub Storage Gateway - Manual Install Script (Windows)
REM ==============================================================================

echo.
echo ========================================================
echo    CloudHub Storage Gateway - Installation Script
echo ========================================================
echo.

set "PROJECT_ROOT=%~dp0.."
set ERRORS=0

REM ─── Check prerequisites ──────────────────────────────────────────────────

echo [CHECK] Verifying prerequisites...
echo.

where go >nul 2>&1
if %ERRORLEVEL% equ 0 (
    for /f "tokens=*" %%v in ('go version') do echo   [OK] %%v
) else (
    echo   [FAIL] Go not found - Install: https://go.dev/dl/
    set /a ERRORS+=1
)

where node >nul 2>&1
if %ERRORLEVEL% equ 0 (
    for /f "tokens=*" %%v in ('node --version') do echo   [OK] Node.js %%v
) else (
    echo   [FAIL] Node.js not found - Install: https://nodejs.org/
    set /a ERRORS+=1
)

where npm >nul 2>&1
if %ERRORLEVEL% equ 0 (
    for /f "tokens=*" %%v in ('npm --version') do echo   [OK] npm %%v
) else (
    echo   [FAIL] npm not found - Comes with Node.js
    set /a ERRORS+=1
)

where psql >nul 2>&1
if %ERRORLEVEL% equ 0 (
    echo   [OK] psql found
) else (
    echo   [FAIL] psql not found - Install PostgreSQL: https://www.postgresql.org/download/windows/
    set /a ERRORS+=1
)

where redis-cli >nul 2>&1
if %ERRORLEVEL% equ 0 (
    echo   [OK] redis-cli found
) else (
    echo   [FAIL] redis-cli not found - Install Redis for Windows: https://github.com/tporadowski/redis/releases
    set /a ERRORS+=1
)

where rclone >nul 2>&1
if %ERRORLEVEL% equ 0 (
    for /f "tokens=*" %%v in ('rclone version ^| findstr "rclone"') do echo   [OK] %%v
) else (
    echo   [FAIL] rclone not found - Install: https://rclone.org/install/
    set /a ERRORS+=1
)

if %ERRORS% gtr 0 (
    echo.
    echo [FAIL] %ERRORS% required tool(s) missing. Install them and re-run this script.
    echo.
    pause
    exit /b 1
)

REM ─── Check services ──────────────────────────────────────────────────────

echo.
echo [CHECK] Verifying services...
echo.

redis-cli ping 2>nul | findstr "PONG" >nul
if %ERRORLEVEL% equ 0 (
    echo   [OK] Redis is running
) else (
    echo   [WARN] Redis may not be running.
    echo          Start Redis before running the application.
)

REM ─── Create database ─────────────────────────────────────────────────────

echo.
echo [SETUP] Creating database...
echo.

set DB_USER=postgres
set DB_NAME=storage_gateway

psql -U %DB_USER% -lqt 2>nul | findstr "%DB_NAME%" >nul
if %ERRORLEVEL% equ 0 (
    echo   [WARN] Database '%DB_NAME%' already exists - skipping
) else (
    echo   [INFO] Creating database '%DB_NAME%'...
    psql -U %DB_USER% -c "CREATE DATABASE %DB_NAME%;" 2>nul
    if %ERRORLEVEL% equ 0 (
        echo   [OK] Database '%DB_NAME%' created
    ) else (
        echo   [WARN] Could not create database. Run manually:
        echo          createdb -U %DB_USER% %DB_NAME%
    )
)

REM ─── Run migrations ──────────────────────────────────────────────────────

echo.
echo [SETUP] Running database migrations...
echo.

set "MIGRATION_DIR=%PROJECT_ROOT%\backend\migrations"
if exist "%MIGRATION_DIR%" (
    for %%f in ("%MIGRATION_DIR%\*.up.sql") do (
        echo   [INFO] Applying: %%~nxf
        psql -U %DB_USER% -d %DB_NAME% -f "%%f" 2>nul
        if %ERRORLEVEL% equ 0 (
            echo   [OK] Applied %%~nxf
        ) else (
            echo   [WARN] %%~nxf may have already been applied
        )
    )
) else (
    echo   [FAIL] Migration directory not found: %MIGRATION_DIR%
)

REM ─── Build backend ───────────────────────────────────────────────────────

echo.
echo [BUILD] Building Go backend...
echo.

cd /d "%PROJECT_ROOT%\backend"

echo   [INFO] Downloading Go dependencies...
go mod download
echo   [OK] Dependencies downloaded

echo   [INFO] Compiling server binary...
set CGO_ENABLED=0
go build -ldflags="-s -w" -o server.exe .\cmd\server\
if %ERRORLEVEL% equ 0 (
    echo   [OK] Backend built -^> backend\server.exe
) else (
    echo   [FAIL] Backend build failed
    pause
    exit /b 1
)

REM ─── Build frontend ──────────────────────────────────────────────────────

echo.
echo [BUILD] Building Next.js frontend...
echo.

cd /d "%PROJECT_ROOT%\frontend"

echo   [INFO] Installing npm dependencies...
npm ci --silent 2>nul || npm install --silent
echo   [OK] Dependencies installed

echo   [INFO] Building production bundle...
npm run build
if %ERRORLEVEL% equ 0 (
    echo   [OK] Frontend built
) else (
    echo   [FAIL] Frontend build failed
    pause
    exit /b 1
)

REM ─── Generate config ─────────────────────────────────────────────────────

echo.
echo [SETUP] Checking configuration...
echo.

if exist "%PROJECT_ROOT%\backend\config.yaml" (
    echo   [WARN] config.yaml already exists - keeping existing file
) else (
    echo   [INFO] Creating default config.yaml...
    (
        echo # Storage Gateway Configuration
        echo.
        echo # Server
        echo port: 8080
        echo environment: development
        echo.
        echo # Database
        echo database_url: postgres://postgres:***@localhost:5432/storage_gateway?sslmode=disable
        echo.
        echo # Redis
        echo redis_addr: localhost:6379
        echo redis_password: ""
        echo redis_db: 0
        echo.
        echo # JWT
        echo jwt_secret: change-this-to-a-random-secret
        echo jwt_access_token_ttl: 900
        echo jwt_refresh_token_ttl: 604800
        echo.
        echo # Encryption (must be exactly 32 characters^)
        echo encryption_key: CloudHub32CharEncryptionKey2026X
        echo.
        echo # rclone
        echo rclone_path: rclone
        echo rclone_config_path: rclone.conf
        echo.
        echo # Upload
        echo max_upload_size: 10737418240
        echo upload_concurrency: 10
        echo.
        echo # Workers (in seconds^)
        echo worker_capacity_refresh_interval: 900
        echo worker_health_check_interval: 300
        echo worker_retry_transfer_interval: 600
        echo worker_orphan_cleanup_interval: 3600
    ) > "%PROJECT_ROOT%\backend\config.yaml"
    echo   [OK] config.yaml created
)

REM ─── Done ────────────────────────────────────────────────────────────────

echo.
echo ========================================================
echo              Installation Complete!
echo ========================================================
echo.
echo   Start the application:
echo.
echo     Option 1 - Start script:
echo       scripts\start.bat
echo.
echo     Option 2 - Manual terminals:
echo       Terminal 1:  cd backend   ^&^& server.exe
echo       Terminal 2:  cd frontend  ^&^& npm start
echo.
echo   Then open: http://localhost:3000
echo   API docs:  http://localhost:8080/api/v1
echo.

pause
