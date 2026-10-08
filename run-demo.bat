@echo off
set "PATH=C:\Program Files\nodejs;C:\Program Files\Git\cmd;%PATH%"
echo ========================================================
echo   Starting AI-Chan Assistant Fullstack Demo
echo ========================================================

echo [1/2] Starting FastAPI Backend on http://127.0.0.1:8000 ...
start "AI-Chan Backend (FastAPI)" cmd /k "cd ai-backend && (if exist .venv\Scripts\python.exe (.\.venv\Scripts\python.exe -m uvicorn src.main:app --port 8000 --reload) else (python -m uvicorn src.main:app --port 8000 --reload))"

timeout /t 3 /nobreak >nul

echo [2/2] Starting Next.js Frontend on http://localhost:3000 ...
start "AI-Chan Frontend (Next.js)" cmd /k "cd ai-frontend && npm run dev -- --port 3000"

echo.
echo All services launched!
echo - Frontend: http://localhost:3000
echo - Backend API Docs: http://127.0.0.1:8000/docs
echo.
pause
