param(
    [string]$Command,
    [ValidateSet("dev-pc1", "dev-pc2", "test", "staging", "prod")]
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
        Info "Dieser Menuepunkt verwendet immer die TEST-Umgebung."
    }

    Set-Location $repoRoot

    # ── 1. Git-Status pruefen ──────────────────────────────────
    Write-Host ""
    Info "Pruefe Git-Status ..."
    $statusOutput = git status --porcelain
    $hasChanges = -not [string]::IsNullOrWhiteSpace($statusOutput)

    if ($hasChanges) {
        Warn "Es gibt lokale Aenderungen:"
        Write-Host ""
        git status --short
        Write-Host ""

        $confirm = Read-Host "Alle aktuellen Aenderungen jetzt adden, committen und pushen? [y/N]"
        if ($confirm -ne "y") {
            Err "Deploy abgebrochen. Kein Deploy ohne bestaetigten Git-Schritt."
            Pause
            return
        }

        # ── 2. Add ─────────────────────────────────────────────
        git add .
        if ($LASTEXITCODE -ne 0) {
            Err "git add fehlgeschlagen. Deploy abgebrochen."
            Pause
            return
        }

        # ── 3. Commit ──────────────────────────────────────────
        $msg = Read-Host "Commit-Message"
        if ([string]::IsNullOrWhiteSpace($msg)) {
            Err "Keine Commit-Message angegeben. Deploy abgebrochen."
            Pause
            return
        }

        git commit -m "$msg"
        if ($LASTEXITCODE -ne 0) {
            Err "git commit fehlgeschlagen. Deploy abgebrochen."
            Pause
            return
        }
        Ok "Commit erstellt."

        # ── 4. Push ────────────────────────────────────────────
        git push
        if ($LASTEXITCODE -ne 0) {
            Err "git push fehlgeschlagen. Deploy abgebrochen."
            Pause
            return
        }
        Ok "Push erfolgreich."
    } else {
        Ok "Arbeitsverzeichnis sauber, keine Aenderungen. Fahre mit Deploy fort."
    }

    # ── 5. Deploy-Modus waehlen und starten ────────────────────
    Write-Host ""
    Write-Host "Deploy mode:"
    Write-Host "1  APP  (sicher)       - Code + Build + DB-Migration + API/Web-Neustart auf TEST"
    Write-Host "                         TEST-Datenbank und Storage bleiben erhalten"
    Write-Host "2  FULL (destruktiv)   - Lokale DB + Storage auf TEST ueberschreiben"
    Write-Host "                         ACHTUNG: Ueberschreibt alle TEST-Daten!"
    Write-Host ""
    $choice = Read-Host "Select mode [1]"
    if ([string]::IsNullOrWhiteSpace($choice)) { $choice = "1" }

    $mode = if ($choice -eq "2") { "full" } else { "app" }
    & "$base\deploy-test.ps1" -Mode $mode -Branch "main"
    Pause
}

function Show-Status {
    & "$base\live-events.ps1" -Mode dashboard
}

function Run-DeployStaging {
    Set-Location $repoRoot

    Write-Host ""
    Write-Host "=========================================" -ForegroundColor Yellow
    Write-Host "   STAGING DEPLOY (kontrolliert)" -ForegroundColor Yellow
    Write-Host "=========================================" -ForegroundColor Yellow
    Write-Host "Dieses Menue startet ausschliesslich abgleich\deploy-staging.ps1." -ForegroundColor White
    Write-Host "Hard-Block gegen TEST- und PROD-Pfade." -ForegroundColor White
    Write-Host ""

    $stagingServer = Read-Host "Staging-Server (z. B. root@staging.example.de)"
    if ([string]::IsNullOrWhiteSpace($stagingServer)) { Warn "Kein Server angegeben. Abgebrochen."; Pause; return }

    $stagingDomain = Read-Host "Staging-Domain (z. B. crm-staging.example.de)"
    if ([string]::IsNullOrWhiteSpace($stagingDomain)) { Warn "Keine Domain angegeben. Abgebrochen."; Pause; return }

    $stagingRemoteRepo = Read-Host "Staging-RemoteRepo (z. B. /opt/crm-staging)"
    if ([string]::IsNullOrWhiteSpace($stagingRemoteRepo)) { Warn "Kein RemoteRepo angegeben. Abgebrochen."; Pause; return }

    $envFile = Read-Host "Pfad zur .env.staging (Enter = .env.staging im Repo-Root)"
    if ([string]::IsNullOrWhiteSpace($envFile)) { $envFile = Join-Path $repoRoot ".env.staging" }

    Write-Host ""
    Write-Host "Mode auswaehlen:"
    Write-Host "1  app          - Code + Migration + Rebuild (Standard, sicher)"
    Write-Host "2  migrate-only - Nur Prisma-Migration auf bestehendem Code"
    Write-Host "3  full         - DESTRUKTIV: Lokale DB+Storage in STAGING ueberschreiben"
    $modeChoice = Read-Host "Auswahl [1]"
    $stagingMode = switch ($modeChoice) {
        "2" { "migrate-only" }
        "3" { "full" }
        default { "app" }
    }

    $args = @(
        '-Server',     $stagingServer,
        '-Domain',     $stagingDomain,
        '-RemoteRepo', $stagingRemoteRepo,
        '-EnvFile',    $envFile,
        '-Mode',       $stagingMode,
        '-Branch',     'main'
    )

    & "$base\deploy-staging.ps1" @args
    Pause
}

function Run-RollbackStaging {
    Set-Location $repoRoot

    Write-Host ""
    Write-Host "=========================================" -ForegroundColor Yellow
    Write-Host "   STAGING ROLLBACK" -ForegroundColor Yellow
    Write-Host "=========================================" -ForegroundColor Yellow
    Write-Host ""

    $stagingServer = Read-Host "Staging-Server"
    if ([string]::IsNullOrWhiteSpace($stagingServer)) { Warn "Kein Server angegeben."; Pause; return }
    $stagingRemoteRepo = Read-Host "Staging-RemoteRepo (z. B. /opt/crm-staging)"
    if ([string]::IsNullOrWhiteSpace($stagingRemoteRepo)) { Warn "Kein RemoteRepo angegeben."; Pause; return }
    $stamp = Read-Host "Snapshot-Stamp (Enter = 'last')"
    if ([string]::IsNullOrWhiteSpace($stamp)) { $stamp = "last" }

    Write-Host ""
    Write-Host "Mode auswaehlen:"
    Write-Host "1  code     - nur Code-Stand"
    Write-Host "2  db       - nur DB-Restore"
    Write-Host "3  storage  - nur Storage-Restore"
    Write-Host "4  full     - Code + DB + Storage"
    $modeChoice = Read-Host "Auswahl [1]"
    $rbMode = switch ($modeChoice) {
        "2" { "db" }
        "3" { "storage" }
        "4" { "full" }
        default { "code" }
    }

    $args = @(
        '-Server',     $stagingServer,
        '-RemoteRepo', $stagingRemoteRepo,
        '-Stamp',      $stamp,
        '-Mode',       $rbMode
    )
    & "$base\rollback-staging.ps1" @args
    Pause
}

function Run-StagingToProdReadiness {
    Set-Location $repoRoot
    Write-Host ""
    Write-Host "=========================================" -ForegroundColor Cyan
    Write-Host "   STAGING -> PROD READINESS CHECK" -ForegroundColor Cyan
    Write-Host "=========================================" -ForegroundColor Cyan
    Write-Host "Nicht-destruktiv, prueft Konsistenz vor PROD-Deploy." -ForegroundColor White
    Write-Host ""

    $stagingServer = Read-Host "Staging-Server"
    if ([string]::IsNullOrWhiteSpace($stagingServer)) { Warn "Kein Server angegeben."; Pause; return }
    $stagingRemoteRepo = Read-Host "Staging-RemoteRepo (z. B. /opt/crm-staging)"
    if ([string]::IsNullOrWhiteSpace($stagingRemoteRepo)) { Warn "Kein RemoteRepo angegeben."; Pause; return }
    $stagingDomain = Read-Host "Staging-Domain (Enter = ueberspringen)"
    $prodServer = Read-Host "Prod-Server (Enter = ueberspringen)"
    $prodRemoteRepo = if ($prodServer) { Read-Host "Prod-RemoteRepo (Enter = ueberspringen)" } else { "" }
    $prodDomain = Read-Host "Prod-Domain (Enter = ueberspringen)"

    $args = @(
        '-StagingServer',     $stagingServer,
        '-StagingRemoteRepo', $stagingRemoteRepo
    )
    if ($stagingDomain)  { $args += @('-StagingDomain',  $stagingDomain) }
    if ($prodServer)     { $args += @('-ProdServer',     $prodServer) }
    if ($prodRemoteRepo) { $args += @('-ProdRemoteRepo', $prodRemoteRepo) }
    if ($prodDomain)     { $args += @('-ProdDomain',     $prodDomain) }

    & "$base\staging-to-prod-readiness.ps1" @args
    Pause
}

function Run-DeployProd {
    Set-Location $repoRoot

    Write-Host ""
    Write-Host "=========================================" -ForegroundColor Magenta
    Write-Host "   PROD DEPLOY (kontrolliert, manuell)" -ForegroundColor Magenta
    Write-Host "=========================================" -ForegroundColor Magenta
    Write-Host "Dieses Menue startet ausschliesslich abgleich\deploy-prod.ps1." -ForegroundColor White
    Write-Host "Es gibt keinen stillen Default auf TEST." -ForegroundColor White
    Write-Host ""

    $prodServer = Read-Host "Prod-Server (z. B. root@prod.example.de)"
    if ([string]::IsNullOrWhiteSpace($prodServer)) { Warn "Kein Server angegeben. Abgebrochen."; Pause; return }

    $prodDomain = Read-Host "Prod-Domain (z. B. crm.example.de)"
    if ([string]::IsNullOrWhiteSpace($prodDomain)) { Warn "Keine Domain angegeben. Abgebrochen."; Pause; return }

    $prodRemoteRepo = Read-Host "Prod-RemoteRepo (z. B. /opt/crm-prod)"
    if ([string]::IsNullOrWhiteSpace($prodRemoteRepo)) { Warn "Kein RemoteRepo angegeben. Abgebrochen."; Pause; return }

    $envFile = Read-Host "Pfad zur .env.prod (Enter = .env.prod im Repo-Root)"
    if ([string]::IsNullOrWhiteSpace($envFile)) { $envFile = Join-Path $repoRoot ".env.prod" }

    Write-Host ""
    Write-Host "Mode auswaehlen:"
    Write-Host "1  app          - Code + Migration + Rebuild (Standard, sicher)"
    Write-Host "2  migrate-only - Nur Prisma-Migration auf bestehendem Code"
    Write-Host "3  full         - DESTRUKTIV: Lokale DB+Storage in PROD ueberschreiben"
    $modeChoice = Read-Host "Auswahl [1]"
    $prodMode = switch ($modeChoice) {
        "2" { "migrate-only" }
        "3" { "full" }
        default { "app" }
    }

    $args = @(
        '-Server',     $prodServer,
        '-Domain',     $prodDomain,
        '-RemoteRepo', $prodRemoteRepo,
        '-EnvFile',    $envFile,
        '-Mode',       $prodMode,
        '-Branch',     'main'
    )

    & "$base\deploy-prod.ps1" @args
    Pause
}

function Run-RollbackProd {
    Set-Location $repoRoot

    Write-Host ""
    Write-Host "=========================================" -ForegroundColor Magenta
    Write-Host "   PROD ROLLBACK" -ForegroundColor Magenta
    Write-Host "=========================================" -ForegroundColor Magenta
    Write-Host ""

    $prodServer = Read-Host "Prod-Server"
    if ([string]::IsNullOrWhiteSpace($prodServer)) { Warn "Kein Server angegeben."; Pause; return }
    $prodRemoteRepo = Read-Host "Prod-RemoteRepo (z. B. /opt/crm-prod)"
    if ([string]::IsNullOrWhiteSpace($prodRemoteRepo)) { Warn "Kein RemoteRepo angegeben."; Pause; return }
    $stamp = Read-Host "Snapshot-Stamp (Enter = 'last')"
    if ([string]::IsNullOrWhiteSpace($stamp)) { $stamp = "last" }

    Write-Host ""
    Write-Host "Mode auswaehlen:"
    Write-Host "1  code     - nur Code-Stand (App-Bug)"
    Write-Host "2  db       - nur DB-Restore (kaputte Migration, Code laeuft)"
    Write-Host "3  storage  - nur Storage-Restore"
    Write-Host "4  full     - Code + DB + Storage"
    $modeChoice = Read-Host "Auswahl [1]"
    $rbMode = switch ($modeChoice) {
        "2" { "db" }
        "3" { "storage" }
        "4" { "full" }
        default { "code" }
    }

    $args = @(
        '-Server',     $prodServer,
        '-RemoteRepo', $prodRemoteRepo,
        '-Stamp',      $stamp,
        '-Mode',       $rbMode
    )
    & "$base\rollback-prod.ps1" @args
    Pause
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
        "deploy-staging"   { Run-DeployStaging; exit 0 }
        "rollback-staging" { Run-RollbackStaging; exit 0 }
        "readiness"        { Run-StagingToProdReadiness; exit 0 }
        "deploy-prod"   { Run-DeployProd; exit 0 }
        "rollback-prod" { Run-RollbackProd; exit 0 }
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
    Write-Host "11 Deploy to TEST Server        - APP (Build+Migration+Restart, ohne Seed) oder FULL (destruktiv)"
    Write-Host "12 Live Status Dashboard        - Laufende Statusansicht"
    Write-Host "13 Git Workflow                 - Status/Add/Commit/Push"
    Write-Host "14 Deploy to PROD Server        - kontrolliert (deploy-prod.ps1, manuelle Eingaben, kein Default)" -ForegroundColor Magenta
    Write-Host "15 PROD Rollback                - rollback-prod.ps1 (code/db/storage/full)" -ForegroundColor Magenta
    Write-Host "16 Deploy to STAGING            - deploy-staging.ps1 (Hard-Block gegen TEST/PROD)" -ForegroundColor Yellow
    Write-Host "17 STAGING Rollback             - rollback-staging.ps1" -ForegroundColor Yellow
    Write-Host "18 STAGING -> PROD Readiness    - staging-to-prod-readiness.ps1 (nicht-destruktiv)" -ForegroundColor Cyan
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
        "14" { Run-DeployProd }
        "15" { Run-RollbackProd }
        "16" { Run-DeployStaging }
        "17" { Run-RollbackStaging }
        "18" { Run-StagingToProdReadiness }
        "20" { exit 0 }
        default {
            Warn "Ungueltige Auswahl."
            Pause
        }
    }
}
