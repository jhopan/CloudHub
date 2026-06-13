@echo off
REM ==============================================================================
REM CloudHub Storage Gateway - Start Script (Windows)
REM Starts backend and frontend in separate windows
REM ==============================================================================

echo.
echo ========================================================
echo    CloudHub Storage Gateway - Starting Services
echo ========================================================
echo.

set "PROJECT_ROOT=%~dp0.."

REM ─── Pre-flight checks ──────────────────────────────────────────────────

if not exist "%PROJECT_ROOT%\backend\server.exe" (
    echo [FAIL] Backend binary not found.
    echo        Run scripts\install.bat first, or build manually:
    echo        cd backend ^&^& go build -o server.exe .\cmd\server\
    pause
    exit /b 1
)

REM ─── Start backend ──────────────────────────────────────────────────────

echo [OK] Starting backend on :8080...
start "CloudHub - Backend (:8080)" cmd /k "cd /d %PROJECT_ROOT%\backend && server.exe"

REM Wait a moment for backend to initialize
echo      Waiting for backend to start...
timeout /t 3 /nobreak >nul

REM ─── Start frontend ────────────────────────────────────────────────────

echo [OK] Starting frontend on :3000...
start "CloudHub - Frontend (:3000)" cmd /k "cd /d %PROJECT_ROOT%\frontend && npm start"

REM ─── Summary ────────────────────────────────────────────────────────────

echo.
echo ========================================================
echo              All services started!
echo ========================================================
echo.
echo   Frontend:  http://localhost:3000
echo   Backend:   http://localhost:8080
echo   API:       http://localhost:8080/api/v1
echo.
echo   Close the Backend and Frontend windows to stop.
echo.

pause
