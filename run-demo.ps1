# AI-Chan Assistant Fullstack Launch Script
Write-Host "========================================================" -ForegroundColor Cyan
Write-Host "   Starting AI-Chan Assistant Fullstack Demo" -ForegroundColor Cyan
Write-Host "========================================================" -ForegroundColor Cyan

$env:PATH = "C:\Program Files\nodejs;C:\Program Files\Git\cmd;C:\Users\sv\AppData\Local\Programs\Python\Python313;" + $env:PATH

Write-Host "[1/2] Starting FastAPI Backend on http://127.0.0.1:8000 ..." -ForegroundColor Yellow
$backendCmd = "`$env:PATH = 'C:\Program Files\nodejs;C:\Program Files\Git\cmd;' + `$env:PATH; cd ai-backend; if (Test-Path .venv\Scripts\python.exe) { .\.venv\Scripts\python.exe -m uvicorn src.main:app --port 8000 --reload } else { python -m uvicorn src.main:app --port 8000 --reload }"
Start-Process powershell -ArgumentList "-NoExit", "-ExecutionPolicy", "Bypass", "-Command", $backendCmd

Start-Sleep -Seconds 3

Write-Host "[2/2] Starting Next.js Frontend on http://localhost:3000 ..." -ForegroundColor Yellow
$frontendCmd = "`$env:PATH = 'C:\Program Files\nodejs;C:\Program Files\Git\cmd;' + `$env:PATH; cd ai-frontend; npm.cmd run dev -- --port 3000"
Start-Process powershell -ArgumentList "-NoExit", "-ExecutionPolicy", "Bypass", "-Command", $frontendCmd

Write-Host ""
Write-Host "All services launched successfully!" -ForegroundColor Green
Write-Host "  -> Frontend App:      http://localhost:3000" -ForegroundColor White
Write-Host "  -> Backend Swagger:   http://127.0.0.1:8000/docs" -ForegroundColor White
Write-Host "  -> Backend Health:    http://127.0.0.1:8000/api/v1/health" -ForegroundColor White
Write-Host ""
