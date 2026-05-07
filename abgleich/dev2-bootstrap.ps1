param(
    [string]$RepoUrl = "https://github.com/vengelst/crm.git",
    [string]$TargetPath = "C:\coding\CRM"
)

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

function Info($m) { Write-Host "[INFO]  $m" -ForegroundColor Cyan }
function Ok($m)   { Write-Host "[ OK ]  $m" -ForegroundColor Green }
function Err($m)  { Write-Host "[ERR ]  $m" -ForegroundColor Red }

try {
    if (!(Get-Command git -ErrorAction SilentlyContinue)) {
        throw "git ist nicht installiert oder nicht im PATH."
    }

    if (!(Get-Command node -ErrorAction SilentlyContinue)) {
        throw "Node.js ist nicht installiert oder nicht im PATH."
    }

    if (!(Get-Command pnpm -ErrorAction SilentlyContinue)) {
        Info "pnpm nicht gefunden. Versuche Corepack-Aktivierung..."
        corepack enable | Out-Null
        corepack prepare pnpm@latest --activate | Out-Null
    }

    if (!(Get-Command pnpm -ErrorAction SilentlyContinue)) {
        throw "pnpm konnte nicht aktiviert werden. Bitte pnpm manuell installieren."
    }

    if (!(Test-Path $TargetPath)) {
        $parent = Split-Path -Parent $TargetPath
        if (!(Test-Path $parent)) {
            New-Item -ItemType Directory -Path $parent -Force | Out-Null
        }

        Info "Clone Repository nach $TargetPath ..."
        git clone $RepoUrl $TargetPath
        if ($LASTEXITCODE -ne 0) { throw "git clone fehlgeschlagen." }
    } else {
        Info "Target existiert bereits: $TargetPath"
        if (!(Test-Path (Join-Path $TargetPath ".git"))) {
            throw "Target existiert, ist aber kein Git-Repository: $TargetPath"
        }
        Info "Fuehre stattdessen git pull aus..."
        Set-Location $TargetPath
        git pull
        if ($LASTEXITCODE -ne 0) { throw "git pull fehlgeschlagen." }
    }

    Set-Location $TargetPath

    Info "Installiere Abhaengigkeiten (pnpm install) ..."
    pnpm install
    if ($LASTEXITCODE -ne 0) { throw "pnpm install fehlgeschlagen." }

    Ok "Setup abgeschlossen."
    Write-Host ""
    Write-Host "Starte jetzt automatisch crm-deploy Menu ..." -ForegroundColor Yellow
    & "$TargetPath\abgleich\crm-deploy.ps1"
}
catch {
    Err $_.Exception.Message
    exit 1
}
