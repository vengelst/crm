#Requires -Version 5.1
param(
    [ValidateSet("dev-pc1", "dev-pc2")]
    [string]$SourceEnv = "dev-pc1",

    [ValidateSet("dev-pc1", "dev-pc2")]
    [string]$TargetEnv = "dev-pc2",

    [Parameter(Mandatory)]
    [string]$TargetHost,

    [string]$TargetRepoPath = "C:\coding\CRM",
    [string]$RemoteTempDir = "C:\Temp\crm-sync"
)

[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$ErrorActionPreference = "Stop"

function Info($m) { Write-Host "[INFO]  $m" -ForegroundColor Cyan }
function Ok($m)   { Write-Host "[ OK ]  $m" -ForegroundColor Green }
function Err($m)  { Write-Host "[ERROR] $m" -ForegroundColor Red; exit 1 }
function Ask($m)  { Read-Host "[?]     $m" }

if ($SourceEnv -eq $TargetEnv) {
    Err "SourceEnv und TargetEnv muessen unterschiedlich sein."
}

$scriptDir = $PSScriptRoot
$repoRoot  = (Resolve-Path (Join-Path $scriptDir "..")).Path
Set-Location $repoRoot

$storagePath = Join-Path $repoRoot "storage"
if (-not (Test-Path $storagePath)) {
    New-Item -ItemType Directory -Path $storagePath -Force | Out-Null
}

$dirty = (git status --porcelain 2>&1)
if ($dirty) {
    Err "Working tree ist nicht sauber. Bitte zuerst committen oder stashen."
}

Info "Pushe aktuellen Stand nach GitHub..."
git fetch origin main
if ($LASTEXITCODE -ne 0) { Err "git fetch fehlgeschlagen." }
git push origin main
if ($LASTEXITCODE -ne 0) { Err "git push fehlgeschlagen." }
Ok "GitHub-Sync abgeschlossen."

$tmpDump = Join-Path $env:TEMP "crm_dev_sync_dump.sql"
$tmpZip = Join-Path $env:TEMP "crm_dev_sync_storage.zip"

Info "Erstelle lokalen DB-Dump..."
docker exec crm-postgres pg_dump -U postgres --clean --if-exists crm_monteur | Out-File -FilePath $tmpDump -Encoding utf8
if ($LASTEXITCODE -ne 0) { Err "DB-Dump fehlgeschlagen." }
Ok "Dump erstellt: $tmpDump"

Info "Packe Storage..."
if (Test-Path $tmpZip) { Remove-Item $tmpZip -Force -ErrorAction SilentlyContinue }
Compress-Archive -Path $storagePath -DestinationPath $tmpZip -Force
Ok "Storage-Archiv erstellt: $tmpZip"

$confirm = Ask "Zielsystem $TargetHost wird fuer DB und Storage ueberschrieben. Bitte 'yes' eingeben"
if ($confirm -ne "yes") { Err "Abgebrochen durch Benutzer." }

Info "Erstelle Temp-Verzeichnis auf Zielsystem..."
ssh $TargetHost "powershell -NoProfile -Command `"New-Item -ItemType Directory -Force -Path '$RemoteTempDir' | Out-Null`""
if ($LASTEXITCODE -ne 0) { Err "Temp-Verzeichnis auf Zielsystem konnte nicht erstellt werden." }

Info "Uebertrage Dump und Storage..."
scp $tmpDump "${TargetHost}:`"$RemoteTempDir\crm_dump.sql`""
if ($LASTEXITCODE -ne 0) { Err "SCP fuer Dump fehlgeschlagen." }
scp $tmpZip "${TargetHost}:`"$RemoteTempDir\crm_storage.zip`""
if ($LASTEXITCODE -ne 0) { Err "SCP fuer Storage fehlgeschlagen." }
Ok "Transfer abgeschlossen."

$remoteScriptLocal = Join-Path $env:TEMP "crm_remote_apply.ps1"
@"
`$ErrorActionPreference = 'Stop'
Set-Location '$TargetRepoPath'

git pull origin main

docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d postgres minio
Start-Sleep -Seconds 5

Get-Content '$RemoteTempDir\crm_dump.sql' | docker exec -i crm-postgres psql -U postgres -d crm_monteur

if (Test-Path 'storage') {
    Remove-Item 'storage' -Recurse -Force
}
Expand-Archive -Path '$RemoteTempDir\crm_storage.zip' -DestinationPath '.' -Force
"@ | Set-Content -Path $remoteScriptLocal -Encoding UTF8

Info "Lade Remote-Apply-Skript hoch..."
scp $remoteScriptLocal "${TargetHost}:`"$RemoteTempDir\apply-sync.ps1`""
if ($LASTEXITCODE -ne 0) { Err "Upload des Remote-Apply-Skripts fehlgeschlagen." }

Info "Fuehre Remote-Sync aus..."
ssh $TargetHost "powershell -NoProfile -ExecutionPolicy Bypass -File `"$RemoteTempDir\apply-sync.ps1`""
if ($LASTEXITCODE -ne 0) { Err "Remote-Sync fehlgeschlagen." }

Remove-Item $tmpDump -Force -ErrorAction SilentlyContinue
Remove-Item $tmpZip -Force -ErrorAction SilentlyContinue
Remove-Item $remoteScriptLocal -Force -ErrorAction SilentlyContinue

Ok "Dev-Sync erfolgreich abgeschlossen."
