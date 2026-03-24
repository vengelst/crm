#Requires -Version 5.1
param(
    [Parameter(Mandatory)]
    [ValidateSet("dev-pc1", "dev-pc2", "test")]
    [string]$Env,

    [ValidateSet("default", "migrate", "full")]
    [string]$Mode = "default",

    [ValidatePattern('^[0-9A-Za-z._/\-]+$')]
    [string]$Branch = "main"
)

[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$ErrorActionPreference = "Stop"

function Info($m) { Write-Host "[INFO]  $m" -ForegroundColor Cyan }
function Ok($m)   { Write-Host "[ OK ]  $m" -ForegroundColor Green }
function Err($m)  { Write-Host "[ERROR] $m" -ForegroundColor Red; exit 1 }

$scriptDir = $PSScriptRoot
$repoRoot = (Resolve-Path (Join-Path $scriptDir "..")).Path
Set-Location $repoRoot

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "   CRM Deploy" -ForegroundColor Cyan
Write-Host "   Env    : $Env" -ForegroundColor DarkGray
Write-Host "   Mode   : $Mode" -ForegroundColor DarkGray
Write-Host "   Branch : $Branch" -ForegroundColor DarkGray
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

if ($Env -eq "test") {
    $testMode = if ($Mode -eq "full") { "full" } else { "app" }
    & (Join-Path $scriptDir "deploy-test.ps1") -Mode $testMode -Branch $Branch
    exit $LASTEXITCODE
}

Info "Starte lokale Basisdienste fuer $Env..."
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d postgres minio
if ($LASTEXITCODE -ne 0) { Err "Lokaler Docker-Start fehlgeschlagen." }
Ok "Postgres und MinIO laufen."

if ($Mode -eq "migrate" -or $Mode -eq "full") {
    Info "Fuehre Migration aus..."
    pnpm db:migrate
    if ($LASTEXITCODE -ne 0) { Err "Migration fehlgeschlagen." }
    Ok "Migration abgeschlossen."
}

if ($Mode -eq "full") {
    Info "Starte kompletten Docker-Stack..."
    docker compose up -d --build
    if ($LASTEXITCODE -ne 0) { Err "Kompletter Docker-Start fehlgeschlagen." }
    Ok "Kompletter Docker-Stack laeuft."
}
