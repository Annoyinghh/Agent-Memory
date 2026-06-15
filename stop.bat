@echo off
chcp 65001 >nul
title Agent Memory System Stopper
color 0C

echo =====================================================================
echo    * AGENT MEMORY SYSTEM STOPPER (PROCESS-TREE CLEAN)
echo =====================================================================
echo.
echo [*] Stopping backend API (api.py) and MCP server (server.py)...

:: Kill by process tree (/t) so child python.exe spawned by cmd wrappers die too.
:: Also clean any server.py / api.py / next-dev remnants regardless of port state,
:: which is what leaves the sqlite file locked after closing start.bat.
taskkill /f /t /fi "WINDOWTITLE eq Agent Memory API*" >nul 2>&1
taskkill /f /t /fi "WINDOWTITLE eq Agent Memory Frontend*" >nul 2>&1

:: Sweep all python processes running our server.py or api.py entrypoints.
:: /t ensures the cmd.exe wrapper + python.exe child both die.
for /f "tokens=2" %%p in ('tasklist /v /fo csv ^| findstr /i "server.py api.py"') do (
    echo [*] Killing backend/MCP process tree PID: %%p
    taskkill /f /t /pid %%p >nul 2>&1
)

:: Sweep any lingering next.js dev server (npm/node) we spawned.
for /f "tokens=2" %%p in ('tasklist /v /fo csv ^| findstr /i "next dev next-server npm"') do (
    echo [*] Killing frontend process PID: %%p
    taskkill /f /t /pid %%p >nul 2>&1
)

:: Final port-based sweep as a safety net.
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":3000 :8900" ^| findstr LISTENING') do (
    echo [*] Force-releasing port PID: %%a
    taskkill /f /t /pid %%a >nul 2>&1
)

echo.
echo [*] Verifying no backend/MCP python processes remain...
set LEAK=0
for /f "tokens=2" %%p in ('tasklist /v /fo csv ^| findstr /i "server.py api.py"') do (
    echo     [!] Leaked process still running: PID %%p
    set LEAK=1
)
if "%LEAK%"=="0" echo [OK] All Agent-Memory backend and MCP processes terminated.

echo.
echo [OK] Cleanup complete. Database files are now unlocked.
timeout /t 2 >nul
