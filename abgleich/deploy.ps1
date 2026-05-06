#Requires -Version 5.1
param(
    [Parameter(Mandatory)]
    [ValidateSet("dev-pc1", "dev-pc2", "test", "staging", "prod")]
    [string]$Env,

    [ValidateSet("default", "migrate", "full", "app", "migrate-only")]
    [string]$Mode = "default",

    [ValidatePattern('^[0-9A-Za-z._/\-]+$')]
    [string]$Branch = "main",

    # Folgende Parameter sind ausschliesslich relevant fuer -Env staging und werden
    # an abgleich/deploy-staging.ps1 durchgereicht. Keine stillen Defaults.
    [string]$StagingServer,
    [string]$StagingDomain,
    [string]$StagingRemoteRepo,
    [string]$StagingEnvFile,
    [switch]$StagingSkipBackup,
    [switch]$StagingSkipDriftCheck,

    # Folgende Parameter sind ausschliesslich relevant fuer -Env prod und werden
    # an abgleich/deploy-prod.ps1 durchgereicht. Keine stillen Defaults.
    [string]$ProdServer,
    [string]$ProdDomain,
    [string]$ProdRemoteRepo,
    [string]$ProdEnvFile,
    [switch]$ProdSkipBackup,
    [switch]$ProdSkipDriftCheck
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

if ($Env -eq "staging") {
    if (-not $StagingServer)     { Err "Fuer -Env staging ist -StagingServer zwingend erforderlich." }
    if (-not $StagingDomain)     { Err "Fuer -Env staging ist -StagingDomain zwingend erforderlich." }
    if (-not $StagingRemoteRepo) { Err "Fuer -Env staging ist -StagingRemoteRepo zwingend erforderlich." }

    $stagingMode = switch ($Mode) {
        "default"      { "app" }
        "app"          { "app" }
        "migrate"      { "migrate-only" }
        "migrate-only" { "migrate-only" }
        "full"         { "full" }
        default        { "app" }
    }

    $stagingArgs = @(
        '-Server',     $StagingServer,
        '-Domain',     $StagingDomain,
        '-RemoteRepo', $StagingRemoteRepo,
        '-Mode',       $stagingMode,
        '-Branch',     $Branch
    )
    if ($StagingEnvFile)        { $stagingArgs += @('-EnvFile', $StagingEnvFile) }
    if ($StagingSkipBackup)     { $stagingArgs += '-SkipBackup' }
    if ($StagingSkipDriftCheck) { $stagingArgs += '-SkipDriftCheck' }

    & (Join-Path $scriptDir "deploy-staging.ps1") @stagingArgs
    exit $LASTEXITCODE
}

if ($Env -eq "prod") {
    if (-not $ProdServer)     { Err "Fuer -Env prod ist -ProdServer zwingend erforderlich." }
    if (-not $ProdDomain)     { Err "Fuer -Env prod ist -ProdDomain zwingend erforderlich." }
    if (-not $ProdRemoteRepo) { Err "Fuer -Env prod ist -ProdRemoteRepo zwingend erforderlich." }

    $prodMode = switch ($Mode) {
        "default"      { "app" }
        "app"          { "app" }
        "migrate"      { "migrate-only" }
        "migrate-only" { "migrate-only" }
        "full"         { "full" }
        default        { "app" }
    }

    $prodArgs = @(
        '-Server',     $ProdServer,
        '-Domain',     $ProdDomain,
        '-RemoteRepo', $ProdRemoteRepo,
        '-Mode',       $prodMode,
        '-Branch',     $Branch
    )
    if ($ProdEnvFile)        { $prodArgs += @('-EnvFile', $ProdEnvFile) }
    if ($ProdSkipBackup)     { $prodArgs += '-SkipBackup' }
    if ($ProdSkipDriftCheck) { $prodArgs += '-SkipDriftCheck' }

    & (Join-Path $scriptDir "deploy-prod.ps1") @prodArgs
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
