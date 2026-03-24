$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

Write-Host "[INFO]  Starte CRM Dev-Docker-Stack ..." -ForegroundColor Cyan
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --build

if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "[ OK ]  Dev-Stack laeuft." -ForegroundColor Green
    Write-Host ""
    Write-Host "  Web:    http://localhost:3800"
    Write-Host "  API:    http://localhost:3801/api"
    Write-Host "  MinIO:  http://localhost:9001"
    Write-Host ""
    Write-Host "  Logs:   pnpm dev:docker:logs"
    Write-Host "  Stop:   .\stopapp.ps1"
} else {
    Write-Host "[ERROR] Dev-Stack konnte nicht gestartet werden." -ForegroundColor Red
}
