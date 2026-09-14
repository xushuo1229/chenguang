@echo off
chcp 65001 >nul
title 知行 · 停止服务
echo 正在停止知行的服务...

for /f "tokens=5" %%p in ('netstat -ano ^| findstr /R /C:":3000.*LISTENING"') do (
  taskkill /PID %%p /F >nul 2>nul
)
for /f "tokens=5" %%p in ('netstat -ano ^| findstr /R /C:":5173.*LISTENING"') do (
  taskkill /PID %%p /F >nul 2>nul
)

echo 已停止后端和前端服务。
pause
