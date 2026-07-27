@echo off
cd /d "%~dp0"
set NODE_OPTIONS=--max-old-space-size=4096
npx next dev --hostname 0.0.0.0 --port 3000
pause
