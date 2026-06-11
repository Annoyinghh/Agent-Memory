@echo off
chcp 65001 >nul
title Agent Memory System Controller
color 0B

echo =====================================================================
echo    * AGENT MEMORY SYSTEM LAUNCHER (CONSOLIDATED)
echo =====================================================================
echo.
echo [*] Checking and cleaning up any existing processes on ports 3000 and 8900...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :3000 ^| findstr LISTENING') do (
    echo [*] Terminating legacy frontend process PID: %%a...
    taskkill /f /pid %%a >nul 2>&1
)
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :8900 ^| findstr LISTENING') do (
    echo [*] Terminating legacy backend process PID: %%a...
    taskkill /f /pid %%a >nul 2>&1
)
echo.
echo [*] Configuring environment variables...
set PYTHONIOENCODING=utf-8
set NODE_ENV=development

echo [*] Starting Local Memory API Server (Port: 8900)...
:: Start backend in the background of this terminal
start /b "Agent Memory API" cmd /c "set PYTHONIOENCODING=utf-8 && cd /d %~dp0Agent-Memory-Server && C:\Users\Administrator\.conda\envs\agent-memory\python.exe api.py"

echo [*] Starting Next.js Dashboard UI (Port: 3000)...
:: Start frontend in the background of this terminal
start /b "Agent Memory Frontend" cmd /c "cd /d %~dp0Agent-memory-ui && npm run dev"

echo.
echo =====================================================================
echo [OK] Services initialized in this terminal window!
echo.
echo     - Backend API: http://127.0.0.1:8900/docs
echo     - Dashboard UI: http://localhost:3000
echo.
echo =====================================================================
echo.
echo Press any key in this terminal window to stop both services and exit.
pause >nul

echo.
echo [*] Stopping services and releasing ports...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :3000 ^| findstr LISTENING') do taskkill /f /pid %%a >nul 2>&1
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :8900 ^| findstr LISTENING') do taskkill /f /pid %%a >nul 2>&1
echo [OK] All services stopped successfully.
timeout /t 2 >nul
