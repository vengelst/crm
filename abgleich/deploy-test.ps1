#Requires -Version 5.1
param(
    [ValidateSet("full", "app")]
    [string]$Mode = "full",

    [ValidatePattern('^[0-9A-Za-z._/\-]+$')]
    [string]$Branch = "main",

    [string]$Server = "root@crm.vivahome.de",
    [string]$RemoteRepo = "/opt/crm",
    [string]$LocalPostgresContainer = "crm-postgres",
    [string]$RemoteGitUrl = "git@github.com:vengelst/crm.git",
    [bool]$RequireCleanTree = $true,
    [switch]$SkipGitPush
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
    if ($LASTEXITCODE -ne 0) {
        return $null
    }
    return ($output | Out-String).Trim()
}

function Resolve-RunningPostgresContainer([string]$PreferredName) {
    $running = @(docker ps --format "{{.Names}}" 2>$null)
    if ($running -contains $PreferredName) {
        return $PreferredName
    }

    $all = @(docker ps -a --format "{{.Names}}" 2>$null)
    if ($all -contains $PreferredName) {
        Warn "Container '$PreferredName' ist vorhanden, aber nicht aktiv. Starte ihn..."
        docker start $PreferredName | Out-Null
        if ($LASTEXITCODE -eq 0) {
            Ok "Container gestartet: $PreferredName"
            return $PreferredName
        }
    }

    $candidates = @($running | Where-Object { $_ -match "postgres" -and $_ -match "crm" })
    if ($candidates.Count -gt 0) {
        Warn "Standardcontainer '$PreferredName' nicht gefunden. Nutze laufenden Postgres-Container: $($candidates[0])"
        return $candidates[0]
    }

    Err "Kein nutzbarer lokaler Postgres-Container gefunden. Erwartet: '$PreferredName'."
}

$scriptDir = $PSScriptRoot
$repoRoot  = (Resolve-Path (Join-Path $scriptDir "..")).Path
Set-Location $repoRoot

$storagePath = Join-Path $repoRoot "storage"
if ($Mode -eq "full" -and -not (Test-Path $storagePath)) {
    Warn "Storage-Verzeichnis nicht gefunden. Es wird fuer den Full-Deploy leer angelegt: $storagePath"
    New-Item -ItemType Directory -Path $storagePath -Force | Out-Null
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "   CRM Deploy TEST" -ForegroundColor Cyan
Write-Host "   Mode   : $Mode" -ForegroundColor DarkGray
Write-Host "   Branch : $Branch" -ForegroundColor DarkGray
Write-Host "   Server : $Server" -ForegroundColor DarkGray
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

$dirty = (git status --porcelain 2>&1)
if ($RequireCleanTree -and $dirty) {
    Err "Working tree is not clean. Bitte zuerst committen oder stashen."
}
if (-not $RequireCleanTree -and $dirty) {
    Warn "Deploy mit lokal uncommitted changes."
}

$localBranch = (git rev-parse --abbrev-ref HEAD 2>$null | Out-String).Trim()
if (-not $localBranch) {
    Err "Aktueller lokaler Branch konnte nicht ermittelt werden."
}

if (-not $SkipGitPush -and $localBranch -ne $Branch) {
    Err "Lokaler Branch '$localBranch' passt nicht zum Zielbranch '$Branch'."
}

$remoteActiveBranch = Get-RemoteGitValue "git rev-parse --abbrev-ref HEAD"
if ($remoteActiveBranch) {
    Info "Aktiver Server-Branch: $remoteActiveBranch"
}
Info "Ausgewaehlter Ziel-Branch: $Branch"

$localCommit = (git rev-parse --short HEAD 2>$null | Out-String).Trim()
$localMessage = (git log -1 --pretty="%s" 2>$null | Out-String).Trim()
$remoteCommit = Get-RemoteGitValue "git rev-parse --short HEAD"
$remoteMessage = Get-RemoteGitValue "git log -1 --pretty=%s"

Write-Host ""
Write-Host "----------------------------------------" -ForegroundColor DarkGray
Write-Host "  Lokal vs TEST-Server" -ForegroundColor Cyan
Write-Host "----------------------------------------" -ForegroundColor DarkGray
Write-Host ("  Lokal:   {0} @ {1}" -f $localBranch, $localCommit) -ForegroundColor White
if ($localMessage) { Write-Host ("           {0}" -f $localMessage) -ForegroundColor DarkGray }
Write-Host ("  Server:  {0} @ {1}" -f $(if ($remoteActiveBranch) { $remoteActiveBranch } else { "?" }), $(if ($remoteCommit) { $remoteCommit } else { "?" })) -ForegroundColor White
if ($remoteMessage) { Write-Host ("           {0}" -f $remoteMessage) -ForegroundColor DarkGray }
Write-Host "----------------------------------------" -ForegroundColor DarkGray
Write-Host ""

if (-not $SkipGitPush) {
    Info "Git sync nach origin/$Branch..."
    git fetch origin $Branch
    if ($LASTEXITCODE -ne 0) { Err "git fetch fehlgeschlagen." }
    git push origin "${Branch}:${Branch}"
    if ($LASTEXITCODE -ne 0) { Err "git push fehlgeschlagen." }
    Ok "Git sync abgeschlossen."
} else {
    Warn "Git-Push wurde uebersprungen."
}

$tmpDump = Join-Path $env:TEMP "crm_test_deploy_dump.sql"
$tmpStorage = Join-Path $env:TEMP "crm_test_storage.zip"
$localEnvFile = Join-Path $repoRoot ".env.server"
$tmpEnvFile = Join-Path $env:TEMP "crm_test.env"
$tmpRemoteScript = Join-Path $env:TEMP "crm_test_remote_deploy.sh"

if ($Mode -eq "full") {
    $activePostgresContainer = Resolve-RunningPostgresContainer $LocalPostgresContainer

    $confirm = Ask "ACHTUNG DESTRUKTIV: FULL ueberschreibt die gesamte TEST-Datenbank und den Storage mit dem lokalen Stand. Bitte 'yes' eingeben"
    if ($confirm -ne "yes") { Err "Abgebrochen durch Benutzer." }

    Info "Erstelle DB-Dump aus lokalem Container $activePostgresContainer..."
    if (Test-Path $tmpDump) { Remove-Item $tmpDump -Force -ErrorAction SilentlyContinue }
    docker exec $activePostgresContainer pg_dump -U postgres --clean --if-exists crm_monteur | Out-File -FilePath $tmpDump -Encoding utf8
    if ($LASTEXITCODE -ne 0 -or -not (Test-Path $tmpDump) -or ((Get-Item $tmpDump).Length -eq 0)) {
        Err "pg_dump ist fehlgeschlagen oder die Dump-Datei ist leer."
    }
    Ok "Dump erstellt: $tmpDump"

    if (Test-Path $tmpStorage) { Remove-Item $tmpStorage -Force -ErrorAction SilentlyContinue }
    Info "Packe lokales Storage-Verzeichnis..."
    Compress-Archive -Path $storagePath -DestinationPath $tmpStorage -Force
    Ok "Storage-Archiv erstellt: $tmpStorage"

    Info "Lade Dump und Storage auf den TEST-Server..."
    scp $tmpDump "${Server}:/tmp/crm_dump.sql"
    if ($LASTEXITCODE -ne 0) { Err "SCP fuer Dump fehlgeschlagen." }
    scp $tmpStorage "${Server}:/tmp/crm_storage.zip"
    if ($LASTEXITCODE -ne 0) { Err "SCP fuer Storage fehlgeschlagen." }
    Ok "Artefakt-Upload abgeschlossen."
}

if (Test-Path $localEnvFile) {
    Info "Erzeuge TEST-.env aus .env.server ..."
    $envContent = Get-Content $localEnvFile
    $hasApiUrl = $false
    $envContent = $envContent | ForEach-Object {
        if ($_ -match '^NEXT_PUBLIC_API_URL=') {
            $hasApiUrl = $true
            'NEXT_PUBLIC_API_URL=/api'
        } else {
            $_
        }
    }
    if (-not $hasApiUrl) {
        $envContent += 'NEXT_PUBLIC_API_URL=/api'
    }
    Set-Content -Path $tmpEnvFile -Value $envContent -Encoding UTF8

    Info "Lade TEST-.env auf den TEST-Server..."
    scp $tmpEnvFile "${Server}:/tmp/crm.env"
    if ($LASTEXITCODE -ne 0) { Err "SCP fuer .env fehlgeschlagen." }
} else {
    Err ".env.server wurde nicht gefunden. Deploy abgebrochen."
}

$remoteScript = @'
set -euo pipefail

if [ ! -d "{{REMOTE_REPO}}" ]; then
  echo "[git] {{REMOTE_REPO}} fehlt - initialer Clone wird angelegt"
  mkdir -p "$(dirname "{{REMOTE_REPO}}")"
  git clone {{REMOTE_GIT_URL}} {{REMOTE_REPO}}
fi

cd {{REMOTE_REPO}}

if [ -f /tmp/crm.env ]; then
  cp /tmp/crm.env .env
fi

echo "[git] Target branch: {{BRANCH}}"
git fetch origin {{BRANCH}}
if git show-ref --verify --quiet "refs/heads/{{BRANCH}}"; then
  git checkout {{BRANCH}}
else
  git checkout -B {{BRANCH}} origin/{{BRANCH}}
fi
git reset --hard origin/{{BRANCH}}

docker compose up -d postgres minio

for i in $(seq 1 30); do
  if docker exec crm-postgres pg_isready -U postgres -d crm_monteur >/dev/null 2>&1; then
    break
  fi
  sleep 2
done

if [ "{{MODE}}" = "full" ]; then
  echo "[db] FULL: restoring crm_monteur from local dump (DESTRUKTIV)"
  cat /tmp/crm_dump.sql | docker exec -i crm-postgres psql -U postgres -d crm_monteur

  echo "[storage] FULL: replacing storage directory"
  rm -rf storage
  mkdir -p storage

  if command -v python3 >/dev/null 2>&1; then
    python3 - <<'PY'
import os
import shutil
import zipfile

archive = "/tmp/crm_storage.zip"
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
    unzip -oq /tmp/crm_storage.zip -d .
  else
    echo "[storage] neither python3 nor unzip available" >&2
    exit 1
  fi
else
  echo "[db] APP: fuehre Prisma-Migration auf TEST-Datenbank aus..."
  if ! docker compose run --rm --build -e DATABASE_URL=postgresql://postgres:postgres@postgres:5432/crm_monteur api sh -c "npx prisma migrate deploy --config prisma/prisma.config.ts"; then
    echo "" >&2
    echo "========================================" >&2
    echo "  APP-Deploy abgebrochen:" >&2
    echo "  Prisma-Migration auf TEST fehlgeschlagen." >&2
    echo "  Kein Container-Rebuild durchgefuehrt." >&2
    echo "  TEST-System laeuft weiter mit altem Stand." >&2
    echo "========================================" >&2
    exit 1
  fi
  echo "[db] APP: Migration erfolgreich."
fi

echo "[docker] rebuilding stack"
docker compose up -d --build
'@

$remoteScript = $remoteScript.
    Replace('{{REMOTE_REPO}}', $RemoteRepo).
    Replace('{{REMOTE_GIT_URL}}', $RemoteGitUrl).
    Replace('{{MODE}}', $Mode).
    Replace('{{BRANCH}}', $Branch)
$remoteScript = $remoteScript -replace "`r`n", "`n"

Info "Fuehre Remote-Deploy aus..."
[System.IO.File]::WriteAllText($tmpRemoteScript, $remoteScript, [System.Text.UTF8Encoding]::new($false))
scp $tmpRemoteScript "${Server}:/tmp/crm_remote_deploy.sh"
if ($LASTEXITCODE -ne 0) { Err "Upload des Remote-Deploy-Skripts fehlgeschlagen." }
ssh $Server "bash /tmp/crm_remote_deploy.sh; rc=`$?; rm -f /tmp/crm_remote_deploy.sh; exit `$rc"
if ($LASTEXITCODE -ne 0) { Err "Remote-Deploy fehlgeschlagen." }

$finalRemoteBranch = Get-RemoteGitValue "git rev-parse --abbrev-ref HEAD"
$finalRemoteCommit = Get-RemoteGitValue "git rev-parse --short HEAD"
$finalRemoteMessage = Get-RemoteGitValue "git log -1 --pretty=%s"

if (Test-Path $tmpStorage) { Remove-Item $tmpStorage -Force -ErrorAction SilentlyContinue }
if (Test-Path $tmpDump) { Remove-Item $tmpDump -Force -ErrorAction SilentlyContinue }
if (Test-Path $tmpEnvFile) { Remove-Item $tmpEnvFile -Force -ErrorAction SilentlyContinue }
if (Test-Path $tmpRemoteScript) { Remove-Item $tmpRemoteScript -Force -ErrorAction SilentlyContinue }

Ok "Deploy TEST abgeschlossen."
if ($finalRemoteBranch) { Ok "Aktiver Server-Branch: $finalRemoteBranch" }
if ($finalRemoteCommit) { Ok "Commit: $finalRemoteCommit" }
if ($finalRemoteMessage) { Ok "Message: $finalRemoteMessage" }
