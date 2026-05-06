#Requires -Version 5.1
<#
.SYNOPSIS
  CRM Produktions-Deploy. Bewusst getrennt vom TEST-Pfad (deploy-test.ps1).

.DESCRIPTION
  Erzwingt eine eindeutige PROD-Konfiguration:
    - Server, Domain, RemoteRepo, EnvFile MUESSEN explizit angegeben werden.
    - Kein stiller Fallback auf TEST-Defaults.
    - Vor Migrations-/Restart-Schritten: Credential-Precheck (DB-Verbindung).
    - Vor jedem APP-Deploy: automatischer Pre-Deploy-Snapshot (Code-Commit, DB-Dump, Storage-Tar) auf dem Server.
    - Destruktive Schritte (FULL = Restore lokaler DB/Storage in PROD) erfordern eine getippte Bestaetigung "PROD".

.PARAMETER Server
  SSH-Ziel der PROD-Maschine, z.B. "root@prod.example.de". Pflicht.

.PARAMETER Domain
  Public-Domain der PROD-Instanz, z.B. "crm.example.de". Wird im Smoke-Check benutzt.

.PARAMETER RemoteRepo
  Absoluter Pfad des Repos auf dem PROD-Server. Pflicht (z.B. "/opt/crm-prod").
  Muss sich bewusst von TEST unterscheiden.

.PARAMETER EnvFile
  Lokaler Pfad zur .env-Datei fuer PROD (Default: ".env.prod" im Repo-Root).
  Wird auf dem Server als ".env" abgelegt und niemals ins Repo committed.

.PARAMETER Mode
  - app          : Code-Update + Prisma-Migration + Rebuild (sicher).
  - migrate-only : Nur Prisma-Migration auf bestehendem Stand.
  - full         : DESTRUKTIV. Ueberschreibt PROD-DB und PROD-Storage mit lokalem Stand.
                   Nur fuer kontrolliertes Re-Bootstrapping. Erfordert "PROD"-Bestaetigung.

.PARAMETER Branch
  Git-Branch, der deployt wird. Default "main".

.PARAMETER RemoteGitUrl
  Git-Remote, falls Repo auf dem Server initial geklont werden muss.

.PARAMETER SkipBackup
  Schaltet den Pre-Deploy-Snapshot ab. Nur fuer Notfaelle. Erfordert getippte Bestaetigung "NO BACKUP".

.PARAMETER ConfirmProd
  Schalter fuer halb-automatische Ablaeufe. Wird er gesetzt, bestaetigt das Skript trotzdem alle
  destruktiven Schritte zusaetzlich interaktiv.
#>
param(
    [Parameter(Mandatory)]
    [string]$Server,

    [Parameter(Mandatory)]
    [string]$Domain,

    [Parameter(Mandatory)]
    [string]$RemoteRepo,

    [string]$EnvFile,

    [ValidateSet("app", "migrate-only", "full")]
    [string]$Mode = "app",

    [ValidatePattern('^[0-9A-Za-z._/\-]+$')]
    [string]$Branch = "main",

    [string]$RemoteGitUrl = "git@github.com:vengelst/crm.git",

    [string]$LocalPostgresContainer = "crm-postgres",

    [bool]$RequireCleanTree = $true,

    [switch]$SkipBackup,

    [switch]$SkipDriftCheck,

    [switch]$ConfirmProd
)

[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$ErrorActionPreference = "Stop"

function Info($m) { Write-Host "[INFO]  $m" -ForegroundColor Cyan }
function Ok($m)   { Write-Host "[ OK ]  $m" -ForegroundColor Green }
function Warn($m) { Write-Host "[WARN]  $m" -ForegroundColor Yellow }
function Err($m)  { Write-Host "[ERROR] $m" -ForegroundColor Red; exit 1 }
function Ask($m)  { Read-Host "[?]     $m" }

function Get-RemoteGitValue([string]$GitArgs) {
    $output = ssh $Server "if [ -d '$RemoteRepo' ]; then cd '$RemoteRepo' && $GitArgs; fi" 2>$null
    if ($LASTEXITCODE -ne 0) { return $null }
    return ($output | Out-String).Trim()
}

function Resolve-RunningPostgresContainer([string]$PreferredName) {
    $running = @(docker ps --format "{{.Names}}" 2>$null)
    if ($running -contains $PreferredName) { return $PreferredName }
    Err "Lokaler Postgres-Container '$PreferredName' nicht aktiv. PROD-FULL benoetigt einen lokalen Quellstand."
}

function Get-EnvMap([string]$Path) {
    $map = @{}
    if (-not (Test-Path $Path)) { return $map }
    Get-Content -LiteralPath $Path | ForEach-Object {
        $line = $_.Trim()
        if (-not $line) { return }
        if ($line.StartsWith('#')) { return }
        $idx = $line.IndexOf('=')
        if ($idx -lt 1) { return }
        $key = $line.Substring(0, $idx).Trim()
        $val = $line.Substring($idx + 1)
        $map[$key] = $val
    }
    return $map
}

function Format-Secret([string]$Value) {
    if (-not $Value) { return '<leer>' }
    if ($Value.Length -le 4) { return '****' }
    return $Value.Substring(0,2) + '***' + $Value.Substring($Value.Length - 2, 2)
}

# ---------------------------------------------------------------------------
# Sicherheits-Vorbedingungen
# ---------------------------------------------------------------------------

$scriptDir = $PSScriptRoot
$repoRoot  = (Resolve-Path (Join-Path $scriptDir "..")).Path
Set-Location $repoRoot

if (-not $EnvFile) {
    $EnvFile = Join-Path $repoRoot ".env.prod"
}
if (-not (Test-Path $EnvFile)) {
    Err ".env-Datei fuer PROD nicht gefunden: $EnvFile  (Vorlage: .env.prod.example)"
}

# Hard-stop: TEST- und STAGING-Reservierungen ablehnen, damit ein typo nicht in TEST oder STAGING landet.
$forbiddenHosts = @("crm.vivahome.de")
if ($forbiddenHosts -contains $Domain) {
    Err "Domain '$Domain' ist als TEST-Domain reserviert. PROD-Deploy abgelehnt."
}
$forbiddenRepoPaths = @("/opt/crm","/opt/crm-staging")
if ($forbiddenRepoPaths -contains $RemoteRepo) {
    Err "RemoteRepo '$RemoteRepo' ist als TEST/STAGING-Pfad reserviert. PROD muss einen eigenen Pfad nutzen (z. B. /opt/crm-prod)."
}
if ($RemoteRepo -match '(?i)\bstaging\b' -or $RemoteRepo -match '(?i)-staging') {
    Err "RemoteRepo '$RemoteRepo' enthaelt 'staging' und ist fuer PROD nicht erlaubt. Bitte einen PROD-Pfad verwenden."
}
if ($Domain -match '(?i)\bstaging\b') {
    Err "Domain '$Domain' enthaelt 'staging'. PROD-Deploy gegen vermeintliche STAGING-Domain abgelehnt."
}

# ---------------------------------------------------------------------------
# Banner + explizite Bestaetigung
# ---------------------------------------------------------------------------

Write-Host ""
Write-Host "============================================================" -ForegroundColor Magenta
Write-Host "   CRM PROD DEPLOY" -ForegroundColor Magenta
Write-Host "   Server     : $Server" -ForegroundColor White
Write-Host "   Domain     : $Domain" -ForegroundColor White
Write-Host "   RemoteRepo : $RemoteRepo" -ForegroundColor White
Write-Host "   Branch     : $Branch" -ForegroundColor White
Write-Host "   Mode       : $Mode" -ForegroundColor White
Write-Host "   EnvFile    : $EnvFile" -ForegroundColor White
Write-Host "============================================================" -ForegroundColor Magenta
Write-Host ""

$confirm = Ask "Bitte 'PROD' eingeben, um diesen PROD-Deploy zu starten"
if ($confirm -ne "PROD") { Err "Abgebrochen durch Benutzer (Bestaetigung fehlt)." }

if ($Mode -eq "full") {
    Warn "FULL-Modus ist DESTRUKTIV: PROD-DB und PROD-Storage werden mit lokalem Stand ueberschrieben."
    $confirm2 = Ask "Bitte zur Bestaetigung erneut 'OVERWRITE PROD DATA' eingeben"
    if ($confirm2 -ne "OVERWRITE PROD DATA") { Err "Abgebrochen durch Benutzer." }
}

if ($SkipBackup) {
    Warn "Pre-Deploy-Snapshot wurde per Parameter abgeschaltet. Rollback ist dann NICHT garantiert."
    $confirm3 = Ask "Bitte 'NO BACKUP' eingeben, um ohne Snapshot zu deployen"
    if ($confirm3 -ne "NO BACKUP") { Err "Abgebrochen durch Benutzer (Backup-Schalter)." }
}

# ---------------------------------------------------------------------------
# Lokaler Git-Status
# ---------------------------------------------------------------------------

$dirty = (git status --porcelain 2>&1)
if ($RequireCleanTree -and $dirty) {
    Err "Working tree ist nicht sauber. Bitte zuerst committen oder stashen."
}

$localBranch = (git rev-parse --abbrev-ref HEAD 2>$null | Out-String).Trim()
if (-not $localBranch) { Err "Aktueller lokaler Branch konnte nicht ermittelt werden." }
if ($localBranch -ne $Branch) {
    Err "Lokaler Branch '$localBranch' passt nicht zum Zielbranch '$Branch'."
}

$localCommit  = (git rev-parse --short HEAD 2>$null | Out-String).Trim()
$localMessage = (git log -1 --pretty="%s" 2>$null | Out-String).Trim()

$remoteActiveBranch = Get-RemoteGitValue "git rev-parse --abbrev-ref HEAD"
$remoteCommit       = Get-RemoteGitValue "git rev-parse --short HEAD"
$remoteMessage      = Get-RemoteGitValue "git log -1 --pretty=%s"

Write-Host ""
Write-Host "----------------------------------------" -ForegroundColor DarkGray
Write-Host "  Lokal vs PROD-Server" -ForegroundColor Cyan
Write-Host "----------------------------------------" -ForegroundColor DarkGray
Write-Host ("  Lokal:   {0} @ {1}" -f $localBranch, $localCommit) -ForegroundColor White
if ($localMessage) { Write-Host ("           {0}" -f $localMessage) -ForegroundColor DarkGray }
$displayBranch = if ($remoteActiveBranch) { $remoteActiveBranch } else { "?" }
$displayCommit = if ($remoteCommit) { $remoteCommit } else { "?" }
Write-Host ("  Server:  {0} @ {1}" -f $displayBranch, $displayCommit) -ForegroundColor White
if ($remoteMessage) { Write-Host ("           {0}" -f $remoteMessage) -ForegroundColor DarkGray }
Write-Host "----------------------------------------" -ForegroundColor DarkGray
Write-Host ""

# ---------------------------------------------------------------------------
# Lokaler ENV-Drift-Vorabcheck (lokale .env.prod vs. aktuelle Server-.env)
# ---------------------------------------------------------------------------

$tmpServerEnv = Join-Path $env:TEMP "crm_prod_server_env.txt"

if (-not $SkipDriftCheck) {
    Info "Lokaler ENV-Drift-Vorabcheck (lokale .env.prod vs. aktuelle Server-.env)..."
    $serverEnvOut  = ssh $Server "if [ -f '$RemoteRepo/.env' ]; then cat '$RemoteRepo/.env'; else echo '__NO_ENV__'; fi" 2>$null
    $serverEnvText = ($serverEnvOut | Out-String)
    if ($LASTEXITCODE -ne 0) {
        Warn "Server-.env konnte nicht gelesen werden. Pruefe SSH-Zugriff."
        $confirmSkip = Ask "Trotzdem fortfahren? Bitte 'CONTINUE' eingeben"
        if ($confirmSkip -ne "CONTINUE") { Err "Abgebrochen durch Benutzer." }
    } elseif ($serverEnvText -match "__NO_ENV__") {
        Info "Auf dem Server existiert noch keine .env -> ENV-Drift-Vorabcheck wird uebersprungen (Erst-Inbetriebnahme)."
    } else {
        [System.IO.File]::WriteAllText($tmpServerEnv, $serverEnvText, [System.Text.UTF8Encoding]::new($false))
        $localMap  = Get-EnvMap $EnvFile
        $serverMap = Get-EnvMap $tmpServerEnv

        $watchKeys = @(
            'DATABASE_URL',
            'POSTGRES_PASSWORD',
            'JWT_SECRET',
            'NEXT_PUBLIC_API_URL',
            'MINIO_ENDPOINT',
            'MINIO_BUCKET',
            'MINIO_ROOT_USER',
            'MINIO_ROOT_PASSWORD',
            'STORAGE_LOCAL_FALLBACK',
            'SMTP_HOST',
            'SMTP_FROM'
        )
        $missing = @()
        $changed = @()
        foreach ($k in $watchKeys) {
            $hasLocal  = $localMap.ContainsKey($k)
            $hasServer = $serverMap.ContainsKey($k)
            if (-not $hasLocal -and $hasServer) { $missing += $k; continue }
            if ($hasLocal -and $hasServer -and ($localMap[$k] -ne $serverMap[$k])) { $changed += $k }
        }

        if ($changed.Count -gt 0 -or $missing.Count -gt 0) {
            Write-Host ""
            Write-Host "  ENV-Drift erkannt (lokal vs Server):" -ForegroundColor Yellow
            foreach ($k in $changed) {
                $isSecret = $k -match '(?i)PASS|SECRET|TOKEN|KEY'
                $localShown  = if ($isSecret) { Format-Secret $localMap[$k] } else { $localMap[$k] }
                $serverShown = if ($isSecret) { Format-Secret $serverMap[$k] } else { $serverMap[$k] }
                Write-Host ("    [CHANGE] {0,-22} server={1}  ->  local={2}" -f $k, $serverShown, $localShown) -ForegroundColor Yellow
            }
            foreach ($k in $missing) {
                Write-Host ("    [MISSING] {0,-21} server hat den Wert, lokale .env nicht" -f $k) -ForegroundColor Red
            }
            Write-Host ""

            if ($missing.Count -gt 0) {
                Err "Lokale .env fehlt Schluessel, die der Server gesetzt hat. Bitte .env.prod vervollstaendigen."
            }

            $hasCriticalChange = $changed | Where-Object { $_ -in @('POSTGRES_PASSWORD','MINIO_ROOT_PASSWORD','MINIO_ROOT_USER') }
            if ($hasCriticalChange) {
                Warn "Kritischer Drift: Volume-bindende Secrets (Postgres/MinIO) weichen ab."
                Warn "Volumes uebernehmen geaenderte Passwoerter NICHT automatisch -> Login schlaegt fehl,"
                Warn "wenn das Passwort nicht zusaetzlich per ALTER USER / mc admin user update angeglichen wird."
                $confirmCrit = Ask "Trotzdem deployen? Bitte 'PROD DRIFT OK' eingeben"
                if ($confirmCrit -ne "PROD DRIFT OK") { Err "Abgebrochen durch Benutzer (kritischer ENV-Drift)." }
            } else {
                Warn "ENV-Drift erkannt, aber nicht in volume-bindenden Secrets."
                $confirmDrift = Ask "Mit Drift fortfahren? Bitte 'CONTINUE' eingeben"
                if ($confirmDrift -ne "CONTINUE") { Err "Abgebrochen durch Benutzer (ENV-Drift)." }
            }
        } else {
            Ok "ENV-Drift-Vorabcheck: Lokale .env.prod konsistent zur Server-.env (geprueft: $($watchKeys.Count) Schluessel)."
        }
    }
} else {
    Warn "Lokaler ENV-Drift-Vorabcheck per Parameter abgeschaltet (-SkipDriftCheck)."
}

# ---------------------------------------------------------------------------
# Git push
# ---------------------------------------------------------------------------

Info "Git sync nach origin/$Branch..."
git fetch origin $Branch
if ($LASTEXITCODE -ne 0) { Err "git fetch fehlgeschlagen." }
git push origin "${Branch}:${Branch}"
if ($LASTEXITCODE -ne 0) { Err "git push fehlgeschlagen." }
Ok "Git sync abgeschlossen."

# ---------------------------------------------------------------------------
# Lokale Artefakte fuer FULL
# ---------------------------------------------------------------------------

$tmpDump          = Join-Path $env:TEMP "crm_prod_deploy_dump.sql"
$tmpStorage       = Join-Path $env:TEMP "crm_prod_storage.zip"
$tmpEnvFile       = Join-Path $env:TEMP "crm_prod.env"
$tmpRemoteScript  = Join-Path $env:TEMP "crm_prod_remote_deploy.sh"

if ($Mode -eq "full") {
    $activePostgresContainer = Resolve-RunningPostgresContainer $LocalPostgresContainer

    Info "Erstelle DB-Dump aus lokalem Container $activePostgresContainer..."
    if (Test-Path $tmpDump) { Remove-Item $tmpDump -Force -ErrorAction SilentlyContinue }
    docker exec $activePostgresContainer pg_dump -U postgres --clean --if-exists crm_monteur | Out-File -FilePath $tmpDump -Encoding utf8
    if ($LASTEXITCODE -ne 0 -or -not (Test-Path $tmpDump) -or ((Get-Item $tmpDump).Length -eq 0)) {
        Err "pg_dump ist fehlgeschlagen oder die Dump-Datei ist leer."
    }
    Ok "Dump erstellt: $tmpDump"

    $storagePath = Join-Path $repoRoot "storage"
    if (-not (Test-Path $storagePath)) {
        Warn "Storage-Verzeichnis nicht gefunden. Es wird leer angelegt: $storagePath"
        New-Item -ItemType Directory -Path $storagePath -Force | Out-Null
    }
    if (Test-Path $tmpStorage) { Remove-Item $tmpStorage -Force -ErrorAction SilentlyContinue }
    Info "Packe lokales Storage-Verzeichnis..."
    Compress-Archive -Path $storagePath -DestinationPath $tmpStorage -Force
    Ok "Storage-Archiv erstellt: $tmpStorage"

    Info "Lade Dump und Storage auf den PROD-Server..."
    scp $tmpDump "${Server}:/tmp/crm_prod_dump.sql"
    if ($LASTEXITCODE -ne 0) { Err "SCP fuer Dump fehlgeschlagen." }
    scp $tmpStorage "${Server}:/tmp/crm_prod_storage.zip"
    if ($LASTEXITCODE -ne 0) { Err "SCP fuer Storage fehlgeschlagen." }
    Ok "Artefakt-Upload abgeschlossen."
}

# ---------------------------------------------------------------------------
# .env auf den Server kopieren (NEXT_PUBLIC_API_URL=/api erzwingen)
# ---------------------------------------------------------------------------

Info "Bereite PROD-.env vor..."
$envContent = Get-Content $EnvFile
$hasApiUrl = $false
$envContent = $envContent | ForEach-Object {
    if ($_ -match '^NEXT_PUBLIC_API_URL=') {
        $hasApiUrl = $true
        'NEXT_PUBLIC_API_URL=/api'
    } else {
        $_
    }
}
if (-not $hasApiUrl) { $envContent += 'NEXT_PUBLIC_API_URL=/api' }

# UTF-8 ohne BOM (sonst frisst Linux das erste Zeichen).
$envLines = @($envContent | ForEach-Object { "$_" })
$envText = ($envLines -join "`n") + "`n"
[System.IO.File]::WriteAllText($tmpEnvFile, $envText, [System.Text.UTF8Encoding]::new($false))

Info "Lade PROD-.env auf den Server..."
scp $tmpEnvFile "${Server}:/tmp/crm_prod.env"
if ($LASTEXITCODE -ne 0) { Err "SCP fuer .env fehlgeschlagen." }
Ok ".env hochgeladen."

# ---------------------------------------------------------------------------
# Remote-Skript: Backup + Credential-Precheck + Migration + Rebuild
# ---------------------------------------------------------------------------

$skipBackupFlag = if ($SkipBackup) { "1" } else { "0" }

$remoteScript = @'
set -euo pipefail

REMOTE_REPO="{{REMOTE_REPO}}"
BRANCH="{{BRANCH}}"
MODE="{{MODE}}"
SKIP_BACKUP="{{SKIP_BACKUP}}"
DOMAIN="{{DOMAIN}}"
REMOTE_GIT_URL="{{REMOTE_GIT_URL}}"

log()  { echo "[remote] $*"; }
fail() { echo "[remote][FEHLER] $*" >&2; exit 1; }

# ---------- 1. Repo bereitstellen ----------
if [ ! -d "$REMOTE_REPO" ]; then
  log "Initialer Clone nach $REMOTE_REPO"
  mkdir -p "$(dirname "$REMOTE_REPO")"
  git clone "$REMOTE_GIT_URL" "$REMOTE_REPO"
fi

cd "$REMOTE_REPO"

# ---------- 2. .env aktualisieren ----------
if [ -f /tmp/crm_prod.env ]; then
  cp /tmp/crm_prod.env .env
  rm -f /tmp/crm_prod.env
else
  fail ".env wurde nicht hochgeladen (/tmp/crm_prod.env fehlt)."
fi

# ---------- 3. Pre-Deploy-Snapshot (Backups) ----------
PREV_COMMIT="$(git rev-parse --short HEAD 2>/dev/null || echo none)"
TS="$(date +%Y%m%d_%H%M%S)"
BACKUP_DIR="$REMOTE_REPO/backups/$TS"

if [ "$SKIP_BACKUP" = "1" ]; then
  log "Pre-Deploy-Snapshot uebersprungen (SkipBackup gesetzt)."
else
  mkdir -p "$BACKUP_DIR"
  echo "$PREV_COMMIT" > "$BACKUP_DIR/commit.txt"
  log "Aktuellen Commit gemerkt: $PREV_COMMIT  ->  $BACKUP_DIR/commit.txt"

  # Sicherstellen, dass postgres laeuft (falls Stack nicht oben).
  docker compose -f docker-compose.yml up -d postgres minio

  for i in $(seq 1 30); do
    if docker exec crm-postgres pg_isready -U postgres -d crm_monteur >/dev/null 2>&1; then
      break
    fi
    sleep 2
  done

  log "Erstelle PROD DB-Dump nach $BACKUP_DIR/db.sql"
  if docker exec crm-postgres pg_dump -U postgres --clean --if-exists crm_monteur > "$BACKUP_DIR/db.sql"; then
    log "DB-Dump ok ($(stat -c%s "$BACKUP_DIR/db.sql") Bytes)."
  else
    fail "DB-Dump fehlgeschlagen. Pre-Deploy-Snapshot unvollstaendig."
  fi

  if [ -d "$REMOTE_REPO/storage" ]; then
    log "Packe Storage nach $BACKUP_DIR/storage.tar.gz"
    tar -czf "$BACKUP_DIR/storage.tar.gz" -C "$REMOTE_REPO" storage || fail "Storage-Backup fehlgeschlagen."
  else
    log "Kein Storage-Verzeichnis vorhanden, ueberspringe Storage-Snapshot."
  fi

  # Symlink auf "letztes Backup" (rollback-prod.ps1 nutzt das per Default).
  ln -sfn "$BACKUP_DIR" "$REMOTE_REPO/backups/last"
  log "Snapshot bereit: $BACKUP_DIR (Symlink: backups/last)."
fi

# ---------- 4. Code aktualisieren ----------
log "Target branch: $BRANCH"
git fetch origin "$BRANCH"
if git show-ref --verify --quiet "refs/heads/$BRANCH"; then
  git checkout "$BRANCH"
else
  git checkout -B "$BRANCH" "origin/$BRANCH"
fi
git reset --hard "origin/$BRANCH"

# ---------- 5. Basisdienste oben halten ----------
docker compose -f docker-compose.yml up -d postgres minio

for i in $(seq 1 30); do
  if docker exec crm-postgres pg_isready -U postgres -d crm_monteur >/dev/null 2>&1; then
    break
  fi
  sleep 2
done

# ---------- 6. ENV laden + Credential-Precheck ----------
if [ ! -f .env ]; then
  fail ".env fehlt nach Code-Sync."
fi

set -a
# shellcheck disable=SC1091
. ./.env
set +a

if [ -z "${DATABASE_URL:-}" ]; then
  fail "DATABASE_URL ist in .env nicht gesetzt."
fi

# DATABASE_URL parsen.
DB_USER="$(printf %s "$DATABASE_URL" | sed -E 's#^postgres(ql)?://([^:]+):([^@]+)@([^:/]+)(:[0-9]+)?/([^?]+).*#\2#')"
DB_PASS="$(printf %s "$DATABASE_URL" | sed -E 's#^postgres(ql)?://([^:]+):([^@]+)@([^:/]+)(:[0-9]+)?/([^?]+).*#\3#')"
DB_NAME="$(printf %s "$DATABASE_URL" | sed -E 's#^postgres(ql)?://([^:]+):([^@]+)@([^:/]+)(:[0-9]+)?/([^?]+).*#\6#')"

log "Credential-Precheck: User=$DB_USER DB=$DB_NAME"
if ! docker exec -e PGPASSWORD="$DB_PASS" crm-postgres psql -U "$DB_USER" -d "$DB_NAME" -h localhost -tAc "select 1" >/dev/null 2>&1; then
  cat >&2 <<EOF

============================================================
  PROD-Deploy ABGEBROCHEN: DB-Credentials passen nicht.
============================================================
  DATABASE_URL aus .env konnte sich nicht an Postgres anmelden.
  Typische Ursachen:
    - Passwort-Drift: das aktuelle Postgres-Volume nutzt noch ein
      altes Passwort. POSTGRES_PASSWORD greift NUR beim ersten
      Volume-Init. Spaetere Aenderungen muessen per
      "ALTER USER ... PASSWORD '...'" in der laufenden DB erfolgen.
    - Falscher User/DB-Name in DATABASE_URL.
    - Volume noch nicht initialisiert (z. B. nach Neuanlage).

  Fix-Optionen:
    a) Passwort der DB-Rolle an .env angleichen:
         docker exec -it crm-postgres psql -U postgres \\
           -c "ALTER USER $DB_USER PASSWORD '<wert aus .env>';"
    b) DATABASE_URL in .env an aktuelles Volume-Passwort anpassen
       und PROD-Deploy erneut starten.

  Es wurden KEINE Migrations- oder Container-Aenderungen vorgenommen.
============================================================
EOF
  exit 2
fi
log "Credential-Precheck ok."

# ---------- 7. Datenbank-Schritt ----------
case "$MODE" in
  full)
    log "FULL: Restore aus /tmp/crm_prod_dump.sql (DESTRUKTIV)"
    if [ ! -f /tmp/crm_prod_dump.sql ]; then
      fail "Erwartete Dump-Datei /tmp/crm_prod_dump.sql fehlt."
    fi
    cat /tmp/crm_prod_dump.sql | docker exec -i crm-postgres psql -U postgres -d crm_monteur
    rm -f /tmp/crm_prod_dump.sql

    log "FULL: Storage ersetzen"
    rm -rf storage
    mkdir -p storage
    if [ ! -f /tmp/crm_prod_storage.zip ]; then
      fail "Erwartete Storage-Archiv-Datei /tmp/crm_prod_storage.zip fehlt."
    fi
    if command -v python3 >/dev/null 2>&1; then
      python3 - <<'PY'
import os, shutil, zipfile
archive = "/tmp/crm_prod_storage.zip"
dest = os.path.abspath(".")
with zipfile.ZipFile(archive) as zf:
    for item in zf.infolist():
        rel = item.filename.replace("\\", "/").lstrip("/")
        if not rel:
            continue
        target = os.path.abspath(os.path.normpath(os.path.join(dest, rel)))
        if not (target == dest or target.startswith(dest + os.sep)):
            raise RuntimeError(f"Unsafe zip entry path: {item.filename!r}")
        if item.is_dir() or rel.endswith("/"):
            os.makedirs(target, exist_ok=True)
            continue
        os.makedirs(os.path.dirname(target), exist_ok=True)
        with zf.open(item) as rf, open(target, "wb") as wf:
            shutil.copyfileobj(rf, wf)
PY
    elif command -v unzip >/dev/null 2>&1; then
      unzip -oq /tmp/crm_prod_storage.zip -d .
    else
      fail "Weder python3 noch unzip verfuegbar."
    fi
    rm -f /tmp/crm_prod_storage.zip
    ;;

  app|migrate-only)
    log "Prisma migrate deploy..."
    if ! docker compose -f docker-compose.yml run --rm --build \
         -e DATABASE_URL="$DATABASE_URL" api \
         sh -c "npx prisma migrate deploy --config prisma/prisma.config.ts"; then
      cat >&2 <<EOF

============================================================
  PROD-Deploy ABGEBROCHEN: Prisma-Migration fehlgeschlagen.
============================================================
  - PROD laeuft mit altem Stand weiter (kein Rebuild ausgefuehrt).
  - Pre-Deploy-Snapshot liegt unter:
      $BACKUP_DIR
  - Rollback per:
      pwsh abgleich/rollback-prod.ps1 -Server '$Server' \\
           -RemoteRepo '$REMOTE_REPO' -Stamp '$TS' -Mode code
============================================================
EOF
      exit 3
    fi
    ;;
esac

# ---------- 8. Rebuild ----------
if [ "$MODE" = "migrate-only" ]; then
  log "migrate-only: kein Rebuild der App-Container."
else
  log "Rebuild des Stacks..."
  docker compose -f docker-compose.yml up -d --build
fi

# ---------- 9. Container-Status ----------
log "Container-Status:"
docker compose -f docker-compose.yml ps
'@

$remoteScript = $remoteScript.
    Replace('{{REMOTE_REPO}}',  $RemoteRepo).
    Replace('{{REMOTE_GIT_URL}}', $RemoteGitUrl).
    Replace('{{MODE}}',         $Mode).
    Replace('{{BRANCH}}',       $Branch).
    Replace('{{DOMAIN}}',       $Domain).
    Replace('{{SKIP_BACKUP}}',  $skipBackupFlag)
$remoteScript = $remoteScript -replace "`r`n", "`n"

[System.IO.File]::WriteAllText($tmpRemoteScript, $remoteScript, [System.Text.UTF8Encoding]::new($false))

Info "Lade Remote-Deploy-Skript hoch..."
scp $tmpRemoteScript "${Server}:/tmp/crm_prod_remote_deploy.sh"
if ($LASTEXITCODE -ne 0) { Err "Upload des Remote-Deploy-Skripts fehlgeschlagen." }

Info "Fuehre PROD-Remote-Deploy aus..."
ssh $Server "bash /tmp/crm_prod_remote_deploy.sh; rc=`$?; rm -f /tmp/crm_prod_remote_deploy.sh; exit `$rc"
$remoteRc = $LASTEXITCODE
if ($remoteRc -ne 0) {
    Warn "Remote-Deploy mit Exit-Code $remoteRc beendet."
    Warn "Hinweis: Pre-Deploy-Snapshot liegt auf dem Server unter $RemoteRepo/backups/last/."
    Err  "PROD-Deploy NICHT erfolgreich. Bitte Logs pruefen und ggf. rollback-prod.ps1 anwenden."
}
Ok "Remote-Deploy erfolgreich."

# ---------------------------------------------------------------------------
# Smoke-Check
# ---------------------------------------------------------------------------

Info "Smoke-Check: https://$Domain/api"
try {
    $resp = Invoke-WebRequest -Uri "https://$Domain/api" -UseBasicParsing -TimeoutSec 10
    if ($resp.StatusCode -ge 200 -and $resp.StatusCode -lt 500) {
        Ok "Smoke-Check ok (HTTP $($resp.StatusCode))."
    } else {
        Warn "Smoke-Check ungewoehnlicher Status: HTTP $($resp.StatusCode)"
    }
} catch {
    Warn "Smoke-Check fehlgeschlagen: $($_.Exception.Message)"
    Warn "PROD ist evtl. trotzdem ok, aber bitte manuell verifizieren."
}

# ---------------------------------------------------------------------------
# Aufraeumen
# ---------------------------------------------------------------------------

if (Test-Path $tmpDump)         { Remove-Item $tmpDump         -Force -ErrorAction SilentlyContinue }
if (Test-Path $tmpStorage)      { Remove-Item $tmpStorage      -Force -ErrorAction SilentlyContinue }
if (Test-Path $tmpEnvFile)      { Remove-Item $tmpEnvFile      -Force -ErrorAction SilentlyContinue }
if (Test-Path $tmpRemoteScript) { Remove-Item $tmpRemoteScript -Force -ErrorAction SilentlyContinue }
if (Test-Path $tmpServerEnv)    { Remove-Item $tmpServerEnv    -Force -ErrorAction SilentlyContinue }

$finalRemoteCommit  = Get-RemoteGitValue "git rev-parse --short HEAD"
$finalRemoteMessage = Get-RemoteGitValue "git log -1 --pretty=%s"

Write-Host ""
Ok  "PROD-Deploy abgeschlossen."
if ($finalRemoteCommit)  { Ok "Server-Commit:  $finalRemoteCommit" }
if ($finalRemoteMessage) { Ok "Server-Message: $finalRemoteMessage" }
Write-Host ""
Info "Rollback-Hinweis:"
Info "  Pre-Deploy-Snapshot: $RemoteRepo/backups/last/"
Info "  Rollback-Skript:     pwsh abgleich/rollback-prod.ps1 -Server '$Server' -RemoteRepo '$RemoteRepo'"
