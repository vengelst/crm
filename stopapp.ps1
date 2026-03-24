$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

Write-Host "[INFO]  Stoppe CRM Dev-Docker-Stack ..." -ForegroundColor Cyan
docker compose -f docker-compose.yml -f docker-compose.dev.yml down

if ($LASTEXITCODE -eq 0) {
    Write-Host "[ OK ]  Dev-Stack gestoppt." -ForegroundColor Green
} else {
    Write-Host "[ERROR] Dev-Stack konnte nicht gestoppt werden." -ForegroundColor Red
}
