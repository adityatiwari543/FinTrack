# ==============================================================================
# FinTrack - Start All Microservices in Separate PowerShell Windows
# ==============================================================================
# Usage:
#   .\scripts\start-all.ps1
#
# This script opens a dedicated, color-coded terminal window for each service:
#   1. Auth Service         -> http://localhost:5001
#   2. Transaction Service  -> http://localhost:5002
#   3. Notification Service -> http://localhost:5003
#   4. API Gateway          -> http://localhost:8000
#   5. Frontend React App   -> http://localhost:5173
# ==============================================================================

Write-Host "`n=======================================================" -ForegroundColor Cyan
Write-Host "       FinTrack Microservices Local Launcher           " -ForegroundColor Cyan
Write-Host "=======================================================`n" -ForegroundColor Cyan

$rootDir = Split-Path -Parent $PSScriptRoot

# 1. Setup .env files if missing
Write-Host "[1/6] Verifying environment (.env) configuration..." -ForegroundColor White
npm run setup:env

# 2. Start Auth Service
Write-Host "[2/6] Launching Auth Service (Port 5001)..." -ForegroundColor Yellow
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$rootDir\services\auth-service'; Write-Host '=== FinTrack Auth Service (Port 5001) ===' -ForegroundColor Yellow; npm run dev"

# 3. Start Transaction Service
Write-Host "[3/6] Launching Transaction Service (Port 5002)..." -ForegroundColor Blue
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$rootDir\services\transaction-service'; Write-Host '=== FinTrack Transaction Service (Port 5002) ===' -ForegroundColor Cyan; npm run dev"

# 4. Start Notification Service
Write-Host "[4/6] Launching Notification Service (Port 5003)..." -ForegroundColor Magenta
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$rootDir\services\notification-service'; Write-Host '=== FinTrack Notification Service (Port 5003) ===' -ForegroundColor Magenta; npm run dev"

# 5. Start API Gateway
Write-Host "[5/6] Launching API Gateway (Port 8000)..." -ForegroundColor Green
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$rootDir\gateway'; Write-Host '=== FinTrack API Gateway (Port 8000) ===' -ForegroundColor Green; npm run dev"

# 6. Start Frontend React App
Write-Host "[6/6] Launching Frontend UI (Port 5173)..." -ForegroundColor White
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$rootDir\frontend'; Write-Host '=== FinTrack Frontend (Port 5173) ===' -ForegroundColor Green; npm run dev"

Write-Host "`n=======================================================" -ForegroundColor Green
Write-Host " All 5 microservices have been launched successfully!  " -ForegroundColor Green
Write-Host "=======================================================" -ForegroundColor Green
Write-Host " Frontend URL : http://localhost:5173" -ForegroundColor White
Write-Host " Gateway URL  : http://localhost:8000" -ForegroundColor White
Write-Host " Demo Seeder  : npm run seed" -ForegroundColor Yellow
Write-Host " To stop all  : .\scripts\stop-all.ps1`n" -ForegroundColor Gray
