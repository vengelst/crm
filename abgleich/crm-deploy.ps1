param(
    [string]$Command,
    [ValidateSet("dev-pc1", "dev-pc2", "test")]
    [string]$Env = "dev-pc1"
)

[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$ErrorActionPreference = "Stop"

$base = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path

function Pause {
    Write-Host ""
    Read-Host "Press ENTER to continue"
}

function Info($m) { Write-Host "[INFO]  $m" -ForegroundColor Cyan }
function Ok($m)   { Write-Host "[ OK ]  $m" -ForegroundColor Green }
function Warn($m) { Write-Host "[WARN]  $m" -ForegroundColor Yellow }
function Err($m)  { Write-Host "[ERROR] $m" -ForegroundColor Red }

function Run-EnvCheck {
    & "$base\env-check.ps1"
    Pause
}

function Start-DevServices {
    Set-Location $repoRoot
    docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d postgres minio
    if ($LASTEXITCODE -eq 0) {
        Ok "Postgres und MinIO laufen."
    } else {
        Err "Konnte Dev-Dienste nicht starten."
    }
    Pause
}

function Start-DevDocker {
    Set-Location $repoRoot
    Info "Starte Dev-Umgebung (Watch-Modus, detached)..."
    docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --build
    if ($LASTEXITCODE -eq 0) {
        Ok "Dev-Stack laeuft.  Web: http://localhost:3800  API: http://localhost:3801/api"
    } else {
        Err "Konnte Dev-Stack nicht starten."
    }
    Pause
}

function Stop-DevDocker {
    Set-Location $repoRoot
    Info "Stoppe Dev-Docker-Stack..."
    docker compose -f docker-compose.yml -f docker-compose.dev.yml down
    if ($LASTEXITCODE -eq 0) {
        Ok "Dev-Stack gestoppt."
    } else {
        Err "Konnte Dev-Stack nicht stoppen."
    }
    Pause
}

function Show-DevLogs {
    Set-Location $repoRoot
    Info "Zeige Dev-Logs (Ctrl+C zum Beenden)..."
    docker compose -f docker-compose.yml -f docker-compose.dev.yml logs -f
}

function Start-FullStack {
    Set-Location $repoRoot
    Info "Starte produktiven Docker-Stack (gebaut, kein Watch)..."
    docker compose -f docker-compose.yml up -d --build
    if ($LASTEXITCODE -eq 0) {
        Ok "Kompletter Docker-Stack laeuft (Produktion)."
    } else {
        Err "Konnte den kompletten Docker-Stack nicht starten."
    }
    Pause
}

function Run-Migrate {
    & "$base\migrate.ps1"
    Pause
}

function Run-Seed {
    & "$base\seed.ps1"
    Pause
}

function Run-Dump {
    Set-Location $repoRoot
    $outDir = Join-Path $PSScriptRoot "dumps"
    if (!(Test-Path $outDir)) {
        New-Item -ItemType Directory -Path $outDir | Out-Null
    }

    $ts = Get-Date -Format "yyyyMMdd_HHmmss"
    $outFile = Join-Path $outDir ("crm_{0}_{1}.sql" -f $Env, $ts)

    docker exec crm-postgres pg_dump -U postgres --clean --if-exists crm_monteur | Out-File -FilePath $outFile -Encoding utf8
    if ($LASTEXITCODE -eq 0) {
        Ok "Dump erstellt: $outFile"
    } else {
        Err "Dump fehlgeschlagen."
    }
    Pause
}

function Run-Restore {
    Set-Location $repoRoot
    $file = Read-Host "Dump-Datei angeben (absoluter Pfad oder Dateiname aus abgleich\dumps)"
    if ([string]::IsNullOrWhiteSpace($file)) {
        Warn "Keine Datei angegeben."
        Pause
        return
    }

    $dumpPath = $file
    if (!(Test-Path $dumpPath)) {
        $candidate = Join-Path $PSScriptRoot "dumps\$file"
        if (Test-Path $candidate) {
            $dumpPath = $candidate
        }
    }

    if (!(Test-Path $dumpPath)) {
        Err "Dump-Datei nicht gefunden."
        Pause
        return
    }

    $confirm = Read-Host "Die lokale Datenbank wird ueberschrieben. Bitte 'yes' eingeben"
    if ($confirm -ne "yes") {
        Warn "Restore abgebrochen."
        Pause
        return
    }

    Get-Content -Raw $dumpPath | docker exec -i crm-postgres psql -U postgres -d crm_monteur
    if ($LASTEXITCODE -eq 0) {
        Ok "Restore erfolgreich."
    } else {
        Err "Restore fehlgeschlagen."
    }
    Pause
}

function Run-Deploy {
    if ($Env -ne "test") {
        Info "Menuepunkt 8 verwendet immer die TEST-Umgebung. Aktueller Env-Wert: $Env"
    }

    Write-Host ""
    Write-Host "Deploy mode:"
    Write-Host "1  FULL snapshot                - Code + DB + Storage auf TEST spiegeln"
    Write-Host "2  APP only                     - Nur Code auf TEST aktualisieren"
    $choice = Read-Host "Select mode [1]"
    if ([string]::IsNullOrWhiteSpace($choice)) { $choice = "1" }

    $mode = if ($choice -eq "2") { "app" } else { "full" }
    & "$base\deploy-test.ps1" -Mode $mode -Branch "main"
    Pause
}

function Show-Status {
    & "$base\live-events.ps1" -Mode dashboard
}

function Git-Workflow {
    Set-Location $repoRoot
    Write-Host ""
    Write-Host "================================="
    Write-Host "          GIT WORKFLOW"
    Write-Host "================================="
    Write-Host "1  Git Status"
    Write-Host "2  Git Add ."
    Write-Host "3  Git Commit"
    Write-Host "4  Git Push"
    Write-Host "5  Version erstellen"
    Write-Host "6  Back"
    Write-Host ""

    $choice = Read-Host "Select option"
    switch ($choice) {
        "1" {
            git status
            Pause
        }
        "2" {
            git add .
            Pause
        }
        "3" {
            $msg = Read-Host "Commit message"
            if ($msg) {
                git commit -m "$msg"
            }
            Pause
        }
        "4" {
            git push
            Pause
        }
        "5" {
            $tag = Read-Host "Versions-Tag (z. B. v0.1.0)"
            if (-not [string]::IsNullOrWhiteSpace($tag)) {
                git tag $tag
                if ($LASTEXITCODE -eq 0) {
                    git push origin $tag
                }
            }
            Pause
        }
        "6" { return }
        default {
            Warn "Ungueltige Auswahl."
            Pause
        }
    }
}

if ($Command) {
    switch ($Command.ToLower()) {
        "env-check" { Run-EnvCheck; exit 0 }
        "dev-services" { Start-DevServices; exit 0 }
        "dev-docker" { Start-DevDocker; exit 0 }
        "dev-docker-stop" { Stop-DevDocker; exit 0 }
        "dev-docker-logs" { Show-DevLogs; exit 0 }
        "docker-full" { Start-FullStack; exit 0 }
        "migrate" { Run-Migrate; exit 0 }
        "seed" { Run-Seed; exit 0 }
        "dump" { Run-Dump; exit 0 }
        "restore" { Run-Restore; exit 0 }
        "deploy" { Run-Deploy; exit 0 }
        "status" { Show-Status; exit 0 }
        default {
            Err "Unknown command: $Command"
            exit 1
        }
    }
}

while ($true) {
    Clear-Host
    Write-Host ""
    Write-Host "================================="
    Write-Host "         CRM OPERATIONS MENU"
    Write-Host "================================="
    Write-Host ("Aktuelle Umgebung: {0}" -f $Env)
    Write-Host ""
    Write-Host "1  Environment Check            - Docker, pnpm, API, Web, Container"
    Write-Host "2  Start Dev Services           - Nur Postgres + MinIO (nativer Dev)"
    Write-Host "3  Start Dev Docker Stack       - Komplett in Docker mit Hot-Reload"
    Write-Host "4  Stop Dev Docker Stack        - Dev-Stack stoppen"
    Write-Host "5  Dev Docker Logs              - Live-Logs aller Dev-Container"
    Write-Host "6  Start Prod Docker Stack      - Produktiv-Build (Test-Server)"
    Write-Host "7  Run DB Migration             - pnpm db:migrate"
    Write-Host "8  Run DB Seed                  - pnpm db:seed"
    Write-Host "9  Create DB Dump               - SQL-Dump aus crm-postgres"
    Write-Host "10 Restore DB Dump              - Dump in crm_monteur einspielen"
    Write-Host "11 Deploy to TEST Server        - Deploy nach crm.vivahome.de"
    Write-Host "12 Live Status Dashboard        - Laufende Statusansicht"
    Write-Host "13 Git Workflow                 - Status/Add/Commit/Push"
    Write-Host "20 Exit"
    Write-Host ""

    $choice = Read-Host "Select option"
    switch ($choice) {
        "1" { Run-EnvCheck }
        "2" { Start-DevServices }
        "3" { Start-DevDocker }
        "4" { Stop-DevDocker }
        "5" { Show-DevLogs }
        "6" { Start-FullStack }
        "7" { Run-Migrate }
        "8" { Run-Seed }
        "9" { Run-Dump }
        "10" { Run-Restore }
        "11" { Run-Deploy }
        "12" { Show-Status }
        "13" { Git-Workflow }
        "20" { exit 0 }
        default {
            Warn "Ungueltige Auswahl."
            Pause
        }
    }
}
