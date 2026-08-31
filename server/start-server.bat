@echo off
chcp 65001 >nul
echo Starting Creator's Toolkit Server...
echo.

REM Check if shortcut exists in parent directory, if not create it
if not exist "..\Creator's Toolkit.lnk" (
    echo Creating desktop shortcut in main folder...
    powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0create-shortcut.ps1"
    if errorlevel 1 (
        echo Shortcut creation failed. The Toolkit can still be started from this launcher.
    )
    echo.
)

REM Change to server directory
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
    echo Node.js is required but was not found in PATH.
    pause
    exit /b 1
)

node launcher.js
if errorlevel 1 (
    echo.
    echo Creator's Toolkit did not start successfully.
    pause
    exit /b 1
)
