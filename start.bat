@echo off
echo ========================================================
echo   Starting ReachInbox Email Scheduler Full-Stack App
echo ========================================================

REM 1. Start Redis Server in a new minimized window if not running
netstat -ano | findstr :6379 >nul
if %errorlevel% neq 0 (
    echo [1/3] Starting Redis Server...
    start "Redis Server (Port 6379)" /min "tools\redis\redis-server.exe" "tools\redis\redis.windows.conf"
    timeout /t 2 /nobreak >nul
) else (
    echo [1/3] Redis is already running on port 6379.
)

REM 2. Start Backend in a separate window if not running
netstat -ano | findstr :5000 >nul
if %errorlevel% neq 0 (
    echo [2/3] Starting Express Backend (Port 5000)...
    start "Backend API & BullMQ Worker" cmd /k "cd backend && npm run dev"
    timeout /t 3 /nobreak >nul
) else (
    echo [2/3] Backend is already running on port 5000.
)

REM 3. Start Frontend in a separate window if not running
netstat -ano | findstr :5173 >nul
if %errorlevel% neq 0 (
    echo [3/3] Starting Vite Frontend (Port 5173)...
    start "Frontend Dashboard" cmd /k "cd frontend && npm run dev"
    timeout /t 3 /nobreak >nul
) else (
    echo [3/3] Frontend is already running on port 5173.
)

echo.
echo ========================================================
echo   All Services Active:
echo   - Frontend: http://localhost:5173
echo   - Backend:  http://localhost:5000/api
echo   - Health:   http://localhost:5000/health
echo ========================================================
start http://localhost:5173
