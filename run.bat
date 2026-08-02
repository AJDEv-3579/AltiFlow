@echo off
title AltiFlow Dev Server
cd /d "%~dp0"
set NODE_OPTIONS=--max-old-space-size=4096

echo ===================================================
echo   AltiFlow Enterprise - Operations Launch Control
echo ===================================================
echo.

echo [1/3] Running Security Guardrails Check...
node scripts/security_guardrails_check.js
if %errorlevel% neq 0 (
    echo.
    echo [ERROR] Security guardrails check failed. Please resolve errors before launching.
    pause
    exit /b %errorlevel%
)

echo.
echo [2/3] Preparing workspace and clearing stale build cache...
if exist .next (
    rd /s /q .next >nul 2>&1
)

echo.
echo [3/3] Launching AltiFlow Dev Server on http://localhost:3000 ...
echo.
npm run dev

pause
