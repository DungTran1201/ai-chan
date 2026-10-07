# AI-Chan Assistant Fullstack Launch Script
Write-Host "========================================================" -ForegroundColor Cyan
Write-Host "   Starting AI-Chan Assistant Fullstack Demo" -ForegroundColor Cyan
Write-Host "========================================================" -ForegroundColor Cyan

Write-Host "[1/2] Starting FastAPI Backend on http://127.0.0.1:8000 ..." -ForegroundColor Yellow
$backendCmd = "cd ai-backend; if (Test-Path .venv\Scripts\Activate.ps1) { .\.venv\Scripts\Activate.ps1 }; python -m uvicorn src.main:app --port 8000 --reload"
Start-Process powershell -ArgumentList "-NoExit", "-Command", $backendCmd

Start-Sleep -Seconds 3

Write-Host "[2/2] Starting Next.js Frontend on http://localhost:3000 ..." -ForegroundColor Yellow
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd ai-frontend; npm run dev -- --port 3000"

Write-Host ""
Write-Host "All services launched successfully!" -ForegroundColor Green
Write-Host "  -> Frontend App:      http://localhost:3000" -ForegroundColor White
Write-Host "  -> Backend Swagger:   http://127.0.0.1:8000/docs" -ForegroundColor White
Write-Host "  -> Backend Health:    http://127.0.0.1:8000/api/v1/health" -ForegroundColor White
Write-Host ""
