@echo off
chcp 65001 >nul
title 知行 · 一键启动
cd /d "%~dp0"

echo ============================================
echo   知行 · 一键启动
echo ============================================
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo [错误] 没有检测到 Node.js。
  echo        请先到 https://nodejs.org 安装 Node.js，然后重试。
  echo.
  pause
  exit /b 1
)

REM ---------- 1. 检查 / 启动后端 (3000) ----------
netstat -ano | findstr /R /C:":3000.*LISTENING" >nul 2>nul
if %errorlevel%==0 (
  echo [1/3] 后端已在运行 ^(端口 3000^)
) else (
  echo [1/3] 正在启动后端...
  start "晨光-后端(3000)" /min cmd /k "cd /d ""%~dp0backend"" && npm start"
)

REM ---------- 等待后端就绪（最多约 30 秒） ----------
set /a WAIT=0
:wait_backend
curl.exe -s -o NUL --max-time 2 http://localhost:3000/api/auth/me >nul 2>nul
if not errorlevel 1 goto backend_ready
set /a WAIT+=1
if %WAIT% GEQ 30 goto backend_ready
timeout /t 1 /nobreak >nul
goto wait_backend
:backend_ready

REM ---------- 2. 检查 / 启动前端 (5173) ----------
netstat -ano | findstr /R /C:":5173.*LISTENING" >nul 2>nul
if %errorlevel%==0 (
  echo [2/3] 前端已在运行 ^(端口 5173^)
) else (
  echo [2/3] 正在启动前端...
  start "晨光-前端(5173)" /min cmd /k "cd /d ""%~dp0"" && npm run dev"
)

REM ---------- 3. 打开浏览器 ----------
timeout /t 2 /nobreak >nul
echo [3/3] 正在打开浏览器...
start "" "http://localhost:5173/"
echo.
echo 启动完成！关闭请运行 stop.bat
echo 本窗口可最小化，不用关闭。
echo.
pause
