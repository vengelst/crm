#Requires -Version 5.1
<#
.SYNOPSIS
  Rollback eines STAGING-Deploys auf Basis der von deploy-staging.ps1 angelegten Snapshots.

.DESCRIPTION
  Identisches Verhalten wie rollback-prod.ps1, aber explizit fuer STAGING:
    - Hard-Block gegen TEST-Pfade.
    - Hard-Block gegen PROD-Pfadkonventionen ("prod"/"-prod").
    - Bestaetigung 'ROLLBACK STAGING'.

  Modi:
    - code    : nur Code-Stand (git reset --hard <stored commit>) + Rebuild
    - db      : nur Datenbank (psql restore aus db.sql)
    - storage : nur Storage (tar -xzf storage.tar.gz)
    - full    : alle drei Schritte in stabiler Reihenfolge

  Entscheidungskriterien siehe abgleich/PROD-RUNBOOK.md (gilt analog fuer STAGING).
#>
param(
    [Parameter(Mandatory)]
    [string]$Server,

    [Parameter(Mandatory)]
    [string]$RemoteRepo,

    [string]$Stamp = "last",

    [ValidateSet("code", "db", "storage", "full")]
    [string]$Mode = "code"
)

[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$ErrorActionPreference = "Stop"

function Info($m) { Write-Host "[INFO]  $m" -ForegroundColor Cyan }
function Ok($m)   { Write-Host "[ OK ]  $m" -ForegroundColor Green }
function Warn($m) { Write-Host "[WARN]  $m" -ForegroundColor Yellow }
function Err($m)  { Write-Host "[ERROR] $m" -ForegroundColor Red; exit 1 }
function Ask($m)  { Read-Host "[?]     $m" }

$forbiddenRepoPaths = @("/opt/crm")
if ($forbiddenRepoPaths -contains $RemoteRepo) {
    Err "RemoteRepo '$RemoteRepo' ist als TEST-Pfad reserviert. STAGING-Rollback verlangt einen eigenen Pfad."
}
if ($RemoteRepo -match '(?i)\bprod\b' -or $RemoteRepo -match '(?i)-prod') {
    Err "RemoteRepo '$RemoteRepo' enthaelt 'prod' und ist fuer STAGING-Rollback nicht zugelassen."
}

Write-Host ""
Write-Host "============================================================" -ForegroundColor Yellow
Write-Host "   CRM STAGING ROLLBACK" -ForegroundColor Yellow
Write-Host "   Server     : $Server" -ForegroundColor White
Write-Host "   RemoteRepo : $RemoteRepo" -ForegroundColor White
Write-Host "   Snapshot   : $Stamp" -ForegroundColor White
Write-Host "   Mode       : $Mode" -ForegroundColor White
Write-Host "============================================================" -ForegroundColor Yellow
Write-Host ""

$confirm = Ask "Bitte 'ROLLBACK STAGING' eingeben, um fortzufahren"
if ($confirm -ne "ROLLBACK STAGING") { Err "Abgebrochen durch Benutzer." }

$tmpRemoteScript = Join-Path $env:TEMP "crm_staging_rollback.sh"

$remoteScript = @'
set -euo pipefail

REMOTE_REPO="{{REMOTE_REPO}}"
STAMP="{{STAMP}}"
MODE="{{MODE}}"

log()  { echo "[remote] $*"; }
fail() { echo "[remote][FEHLER] $*" >&2; exit 1; }

cd "$REMOTE_REPO"

if [ "$STAMP" = "last" ]; then
  if [ ! -L "$REMOTE_REPO/backups/last" ] && [ ! -d "$REMOTE_REPO/backups/last" ]; then
    fail "Kein Snapshot 'last' gefunden. Verfuegbare Snapshots:"
  fi
  SNAP="$REMOTE_REPO/backups/last"
else
  SNAP="$REMOTE_REPO/backups/$STAMP"
fi

if [ ! -d "$SNAP" ]; then
  echo "[remote] Verfuegbare Snapshots:" >&2
  ls -1 "$REMOTE_REPO/backups" 2>/dev/null >&2 || true
  fail "Snapshot-Verzeichnis $SNAP existiert nicht."
fi

log "Verwende Snapshot: $SNAP"
[ -f "$SNAP/commit.txt" ] && log "Stored commit: $(cat "$SNAP/commit.txt")"
[ -f "$SNAP/db.sql" ] && log "DB-Dump: $(stat -c%s "$SNAP/db.sql") Bytes"
[ -f "$SNAP/storage.tar.gz" ] && log "Storage-Tar vorhanden"

docker compose -f docker-compose.yml up -d postgres minio
for i in $(seq 1 30); do
  if docker exec crm-postgres pg_isready -U postgres -d crm_monteur >/dev/null 2>&1; then
    break
  fi
  sleep 2
done

case "$MODE" in
  code|full)
    if [ ! -f "$SNAP/commit.txt" ]; then
      fail "commit.txt fehlt im Snapshot. Code-Rollback nicht moeglich."
    fi
    PREV="$(cat "$SNAP/commit.txt")"
    log "Setze Code zurueck auf $PREV"
    git fetch origin
    git reset --hard "$PREV" || fail "git reset --hard $PREV fehlgeschlagen."
    ;;
esac

case "$MODE" in
  db|full)
    if [ ! -f "$SNAP/db.sql" ]; then
      fail "db.sql fehlt im Snapshot. DB-Rollback nicht moeglich."
    fi
    log "Spiele DB-Dump zurueck (DESTRUKTIV)..."
    cat "$SNAP/db.sql" | docker exec -i crm-postgres psql -U postgres -d crm_monteur
    log "DB restauriert."
    ;;
esac

case "$MODE" in
  storage|full)
    if [ ! -f "$SNAP/storage.tar.gz" ]; then
      fail "storage.tar.gz fehlt im Snapshot. Storage-Rollback nicht moeglich."
    fi
    log "Setze Storage zurueck..."
    rm -rf storage
    tar -xzf "$SNAP/storage.tar.gz" -C "$REMOTE_REPO"
    log "Storage restauriert."
    ;;
esac

case "$MODE" in
  code|full)
    log "Rebuild des Stacks..."
    docker compose -f docker-compose.yml up -d --build
    ;;
  db|storage)
    log "Restart der App-Container, damit Caches frisch sind..."
    docker compose -f docker-compose.yml restart api web || true
    ;;
esac

log "Container-Status nach Rollback:"
docker compose -f docker-compose.yml ps
'@

$remoteScript = $remoteScript.
    Replace('{{REMOTE_REPO}}', $RemoteRepo).
    Replace('{{STAMP}}',       $Stamp).
    Replace('{{MODE}}',        $Mode)
$remoteScript = $remoteScript -replace "`r`n", "`n"

[System.IO.File]::WriteAllText($tmpRemoteScript, $remoteScript, [System.Text.UTF8Encoding]::new($false))

Info "Lade Rollback-Skript hoch..."
scp $tmpRemoteScript "${Server}:/tmp/crm_staging_rollback.sh"
if ($LASTEXITCODE -ne 0) { Err "Upload des Rollback-Skripts fehlgeschlagen." }

Info "Fuehre STAGING-Rollback aus..."
ssh $Server "bash /tmp/crm_staging_rollback.sh; rc=`$?; rm -f /tmp/crm_staging_rollback.sh; exit `$rc"
if ($LASTEXITCODE -ne 0) { Err "Rollback fehlgeschlagen (Exit $LASTEXITCODE)." }

if (Test-Path $tmpRemoteScript) { Remove-Item $tmpRemoteScript -Force -ErrorAction SilentlyContinue }

Ok "STAGING-Rollback abgeschlossen ($Mode, Snapshot $Stamp)."
Info "Bitte zusaetzlich Smoke-Check fahren und Logs pruefen."
