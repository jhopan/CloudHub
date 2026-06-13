@echo off
REM ==============================================================================
REM CloudHub Storage Gateway - Stop Script (Windows)
REM ==============================================================================

echo.
echo Stopping CloudHub Storage Gateway services...
echo.

taskkill /fi "WINDOWTITLE eq CloudHub - Backend*" /f >nul 2>&1
if %ERRORLEVEL% equ 0 (
    echo   [OK] Backend stopped
) else (
    echo   [!] Backend not running
)

taskkill /fi "WINDOWTITLE eq CloudHub - Frontend*" /f >nul 2>&1
if %ERRORLEVEL% equ 0 (
    echo   [OK] Frontend stopped
) else (
    echo   [!] Frontend not running
)

echo.
echo Done.
echo.
pause
