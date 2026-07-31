@echo off
title AltiFlow Dev Server
cd /d "%~dp0"
set NODE_OPTIONS=--max-old-space-size=4096

echo Clearing build cache...
if exist .next (rd /s /q .next)

echo Starting AltiFlow on http://localhost:3000 ...
npm run dev
pause
