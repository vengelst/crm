#Requires -Version 5.1
<#
.SYNOPSIS
  Rollback eines PROD-Deploys auf Basis der von deploy-prod.ps1 angelegten Snapshots.

.DESCRIPTION
  Liest die unter $RemoteRepo/backups/<stamp>/ abgelegten Pre-Deploy-Snapshots und
  stellt wahlweise wieder her:
    - code    : nur Code-Stand (git reset --hard <stored commit>) + Rebuild
    - db      : nur Datenbank (psql restore aus db.sql)
    - storage : nur Storage (tar -xzf storage.tar.gz)
    - full    : alle drei Schritte in stabiler Reihenfolge

  Entscheidungskriterien (siehe abgleich/PROD-RUNBOOK.md):
    - App-only-Fehler (Bug nach Deploy, DB unveraendert):    -Mode code
    - Migration kaputt, Daten vor Migration noch ok:          -Mode db
    - Storage-Korruption ohne DB-Verlust:                     -Mode storage
    - Vollstaendiger Restore nach failed FULL-Deploy:         -Mode full

.PARAMETER Stamp
  Konkreter Snapshot-Ordner (Format YYYYMMDD_HHMMSS). Default: "last" -> Symlink
  auf das zuletzt erzeugte Snapshot-Verzeichnis.

.NOTES
  - Die Code-Migrationsreihenfolge wird NICHT automatisch zurueckgerollt.
    Bei DB-Restore werden alle nach dem Snapshot eingespielten Migrationen
    inhaltlich verworfen. Falls anschliessend ein neuer Deploy laeuft, muessen
    die Migrationsdateien zum DB-Stand passen.
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

$forbiddenRepoPaths = @("/opt/crm","/opt/crm-staging")
if ($forbiddenRepoPaths -contains $RemoteRepo) {
    Err "RemoteRepo '$RemoteRepo' ist als TEST/STAGING-Pfad reserviert. PROD-Rollback verlangt einen eigenen Pfad."
}
if ($RemoteRepo -match '(?i)\bstaging\b' -or $RemoteRepo -match '(?i)-staging') {
    Err "RemoteRepo '$RemoteRepo' enthaelt 'staging' und ist fuer PROD-Rollback nicht erlaubt."
}

Write-Host ""
Write-Host "============================================================" -ForegroundColor Magenta
Write-Host "   CRM PROD ROLLBACK" -ForegroundColor Magenta
Write-Host "   Server     : $Server" -ForegroundColor White
Write-Host "   RemoteRepo : $RemoteRepo" -ForegroundColor White
Write-Host "   Snapshot   : $Stamp" -ForegroundColor White
Write-Host "   Mode       : $Mode" -ForegroundColor White
Write-Host "============================================================" -ForegroundColor Magenta
Write-Host ""

$confirm = Ask "Bitte 'ROLLBACK PROD' eingeben, um fortzufahren"
if ($confirm -ne "ROLLBACK PROD") { Err "Abgebrochen durch Benutzer." }

$tmpRemoteScript = Join-Path $env:TEMP "crm_prod_rollback.sh"

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

# Postgres muss laufen
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

# Rebuild der App-Container in Code-/Full-Mode noetig.
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
scp $tmpRemoteScript "${Server}:/tmp/crm_prod_rollback.sh"
if ($LASTEXITCODE -ne 0) { Err "Upload des Rollback-Skripts fehlgeschlagen." }

Info "Fuehre PROD-Rollback aus..."
ssh $Server "bash /tmp/crm_prod_rollback.sh; rc=`$?; rm -f /tmp/crm_prod_rollback.sh; exit `$rc"
if ($LASTEXITCODE -ne 0) { Err "Rollback fehlgeschlagen (Exit $LASTEXITCODE)." }

if (Test-Path $tmpRemoteScript) { Remove-Item $tmpRemoteScript -Force -ErrorAction SilentlyContinue }

Ok "PROD-Rollback abgeschlossen ($Mode, Snapshot $Stamp)."
Info "Bitte zusaetzlich Smoke-Check fahren und Logs pruefen."
