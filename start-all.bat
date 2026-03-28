@echo off
REM ============================================
REM VMS - Start All Services (Windows)
REM ============================================
REM Opens 6 terminal windows - one per service.
REM Close them individually or use Task Manager.

echo ==========================================
echo   Starting Visitor Management System
echo ==========================================

REM --- Backends ---
echo [Backend] Registration API  -^> http://localhost:8000
start "VMS - Registration API (8000)" cmd /k "cd /d "%~dp0registration-app" && uvicorn app.main:app --reload --host 0.0.0.0 --port 8000"

echo [Backend] Check-in API      -^> http://localhost:8001
start "VMS - Check-in API (8001)" cmd /k "cd /d "%~dp0check-in-app" && uvicorn app.main:app --reload --host 0.0.0.0 --port 8001"

echo [Backend] Admin API         -^> http://localhost:8002
start "VMS - Admin API (8002)" cmd /k "cd /d "%~dp0admin-app" && uvicorn app.main:app --reload --host 0.0.0.0 --port 8002"

REM --- Frontends ---
echo [Frontend] Registration UI  -^> http://localhost:3000
start "VMS - Registration UI (3000)" cmd /k "cd /d "%~dp0registration-app" && npx next dev --turbo -p 3000"

echo [Frontend] Check-in UI      -^> http://localhost:3001
start "VMS - Check-in UI (3001)" cmd /k "cd /d "%~dp0check-in-app" && npx next dev --turbo -p 3001"

echo [Frontend] Admin UI         -^> http://localhost:3002
start "VMS - Admin UI (3002)" cmd /k "cd /d "%~dp0admin-app" && npx next dev --turbo -p 3002"

echo ==========================================
echo   All 6 services launched in separate windows!
echo ==========================================
pause
