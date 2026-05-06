#Requires -Version 5.1
<#
.SYNOPSIS
  Standalone-Drift-Check fuer eine Zielumgebung (test/staging/prod).

.DESCRIPTION
  Prueft VOR einem Deploy nicht-destruktiv:
    1) ENV-Drift   : lokale .env-Datei vs. derzeitige .env auf dem Zielserver.
                     Zeigt Aenderungen / fehlende Keys an. Secrets werden maskiert.
    2) Git-Drift   : Lokaler Branch/Commit vs. Server-Branch/Commit (read-only).
    3) Credential  : Liest DATABASE_URL aus der lokalen Env-Datei und prueft
                     'select 1' gegen den lokal laufenden crm-postgres-Container,
                     wahlweise zusaetzlich gegen den Zielserver.
    4) Endpoints   : Optionaler HTTPS-Smoke gegen https://<Domain> und /api.

  Das Skript schreibt nichts und macht KEINE Veraenderungen.

.PARAMETER EnvLabel
  test | staging | prod  -> bestimmt Default-EnvFile und Sicherheitsfilter.

.PARAMETER Server
  SSH-Ziel des Servers (Pflicht wenn -CheckServer gesetzt).

.PARAMETER Domain
  Domain fuer Smoke-Endpoint. Optional.

.PARAMETER RemoteRepo
  Absoluter Repo-Pfad auf dem Server (Pflicht wenn -CheckServer gesetzt).

.PARAMETER EnvFile
  Pfad zur lokalen Env-Datei. Default leitet sich aus -EnvLabel ab:
    test    -> .env.server
    staging -> .env.staging
    prod    -> .env.prod

.PARAMETER CheckServer
  Wenn gesetzt: greift per SSH auf den Server zu (.env lesen, git rev-parse,
  optional psql gegen Server-DB). Ohne diesen Schalter laueft ausschliesslich
  der lokale Teil.

.PARAMETER CheckCredential
  Wenn gesetzt: zusaetzlicher psql-Test gegen den Zielserver ueber den dort
  laufenden crm-postgres-Container.

.PARAMETER CheckSmoke
  Wenn gesetzt: HTTPS-Smoke-Check gegen https://<Domain>/ und /api.

.NOTES
  Exit-Codes:
    0 = alles in Ordnung
    1 = Aufruf-/Eingabefehler
    2 = Drift erkannt (siehe Konsolen-Output)
    3 = Server nicht erreichbar / Vorbedingungen nicht erfuellt
#>
param(
    [Parameter(Mandatory)]
    [ValidateSet("test","staging","prod")]
    [string]$EnvLabel,

    [string]$Server,
    [string]$Domain,
    [string]$RemoteRepo,
    [string]$EnvFile,

    [switch]$CheckServer,
    [switch]$CheckCredential,
    [switch]$CheckSmoke
)

[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$ErrorActionPreference = "Stop"

function Info($m) { Write-Host "[INFO]  $m" -ForegroundColor Cyan }
function Ok($m)   { Write-Host "[ OK ]  $m" -ForegroundColor Green }
function Warn($m) { Write-Host "[WARN]  $m" -ForegroundColor Yellow }
function Err($m)  { Write-Host "[ERROR] $m" -ForegroundColor Red }

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

function Parse-DatabaseUrl([string]$Url) {
    if (-not $Url) { return $null }
    $regex = '^postgres(ql)?://([^:]+):([^@]+)@([^:/]+)(:[0-9]+)?/([^?]+)'
    if ($Url -match $regex) {
        return @{
            User = $Matches[2]
            Pass = $Matches[3]
            Host = $Matches[4]
            Port = if ($Matches[5]) { $Matches[5].TrimStart(':') } else { '5432' }
            Db   = $Matches[6]
        }
    }
    return $null
}

$scriptDir = $PSScriptRoot
$repoRoot  = (Resolve-Path (Join-Path $scriptDir "..")).Path

if (-not $EnvFile) {
    switch ($EnvLabel) {
        "test"    { $EnvFile = Join-Path $repoRoot ".env.server" }
        "staging" { $EnvFile = Join-Path $repoRoot ".env.staging" }
        "prod"    { $EnvFile = Join-Path $repoRoot ".env.prod" }
    }
}

if (-not (Test-Path $EnvFile)) {
    Err "Lokale Env-Datei nicht gefunden: $EnvFile"
    exit 1
}

if ($CheckServer -and (-not $Server -or -not $RemoteRepo)) {
    Err "-CheckServer benoetigt -Server und -RemoteRepo."
    exit 1
}

# Hard-Blocks gegen falsche Cross-Use:
$forbidden = @{
    "test"    = @{ Domains = @(); Repos = @() }
    "staging" = @{ Domains = @("crm.vivahome.de"); Repos = @("/opt/crm","/opt/crm-prod") }
    "prod"    = @{ Domains = @("crm.vivahome.de"); Repos = @("/opt/crm","/opt/crm-staging") }
}
$rule = $forbidden[$EnvLabel]
if ($Domain     -and ($rule.Domains -contains $Domain))     { Err "Domain '$Domain' ist fuer '$EnvLabel' nicht erlaubt."; exit 1 }
if ($RemoteRepo -and ($rule.Repos   -contains $RemoteRepo)) { Err "RemoteRepo '$RemoteRepo' ist fuer '$EnvLabel' nicht erlaubt."; exit 1 }

Write-Host ""
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host ("   PREFLIGHT DRIFT CHECK  ({0})" -f $EnvLabel.ToUpper()) -ForegroundColor Cyan
Write-Host ("   EnvFile    : {0}" -f $EnvFile) -ForegroundColor White
if ($Server)     { Write-Host ("   Server     : {0}" -f $Server)     -ForegroundColor White }
if ($Domain)     { Write-Host ("   Domain     : {0}" -f $Domain)     -ForegroundColor White }
if ($RemoteRepo) { Write-Host ("   RemoteRepo : {0}" -f $RemoteRepo) -ForegroundColor White }
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host ""

$exitCode = 0
$localMap = Get-EnvMap $EnvFile

# ---------------------------------------------------------------------------
# 1) ENV-Drift gegen Server
# ---------------------------------------------------------------------------

if ($CheckServer) {
    Info "Lese Server-.env..."
    $serverEnvOut = ssh $Server "if [ -f '$RemoteRepo/.env' ]; then cat '$RemoteRepo/.env'; else echo '__NO_ENV__'; fi" 2>$null
    $serverEnvText = ($serverEnvOut | Out-String)
    if ($LASTEXITCODE -ne 0) {
        Err "Server nicht erreichbar oder Pfad falsch."
        exit 3
    }
    if ($serverEnvText -match "__NO_ENV__") {
        Warn "Server hat keine .env. Vergleich uebersprungen."
    } else {
        $tmpServerEnv = Join-Path $env:TEMP "crm_${EnvLabel}_server_env.txt"
        [System.IO.File]::WriteAllText($tmpServerEnv, $serverEnvText, [System.Text.UTF8Encoding]::new($false))
        $serverMap = Get-EnvMap $tmpServerEnv
        Remove-Item $tmpServerEnv -Force -ErrorAction SilentlyContinue

        $watchKeys = @(
            'DATABASE_URL','POSTGRES_PASSWORD','JWT_SECRET','NEXT_PUBLIC_API_URL',
            'MINIO_ENDPOINT','MINIO_BUCKET','MINIO_ROOT_USER','MINIO_ROOT_PASSWORD',
            'STORAGE_LOCAL_FALLBACK','SMTP_HOST','SMTP_FROM'
        )
        $changed = @()
        $missing = @()
        foreach ($k in $watchKeys) {
            $hasL = $localMap.ContainsKey($k)
            $hasS = $serverMap.ContainsKey($k)
            if (-not $hasL -and $hasS) { $missing += $k; continue }
            if ($hasL -and $hasS -and ($localMap[$k] -ne $serverMap[$k])) { $changed += $k }
        }

        if ($changed.Count -eq 0 -and $missing.Count -eq 0) {
            Ok "ENV-Drift: keine relevanten Differenzen ($($watchKeys.Count) Schluessel geprueft)."
        } else {
            $exitCode = 2
            Warn "ENV-Drift erkannt:"
            foreach ($k in $changed) {
                $isSecret = $k -match '(?i)PASS|SECRET|TOKEN|KEY'
                $L = if ($isSecret) { Format-Secret $localMap[$k] }  else { $localMap[$k] }
                $S = if ($isSecret) { Format-Secret $serverMap[$k] } else { $serverMap[$k] }
                Write-Host ("    [CHANGE]  {0,-22} server={1}  ->  local={2}" -f $k, $S, $L) -ForegroundColor Yellow
            }
            foreach ($k in $missing) {
                Write-Host ("    [MISSING] {0,-22} server hat den Wert, lokale .env nicht" -f $k) -ForegroundColor Red
            }
        }
    }

    Info "Lese Server-Git-Stand..."
    $remoteBranch = ssh $Server "cd '$RemoteRepo' && git rev-parse --abbrev-ref HEAD" 2>$null
    $remoteCommit = ssh $Server "cd '$RemoteRepo' && git rev-parse --short HEAD" 2>$null
    $localBranch  = (git rev-parse --abbrev-ref HEAD 2>$null | Out-String).Trim()
    $localCommit  = (git rev-parse --short HEAD 2>$null | Out-String).Trim()
    Write-Host ("    Lokal  : {0} @ {1}" -f $localBranch, $localCommit) -ForegroundColor White
    Write-Host ("    Server : {0} @ {1}" -f ($remoteBranch | Out-String).Trim(), ($remoteCommit | Out-String).Trim()) -ForegroundColor White
    if (($remoteCommit | Out-String).Trim() -ne $localCommit) {
        Warn "Git-Drift: Server-Commit weicht von lokalem ab. Das kann nach Deploy korrekt sein, ist aber im Vorabcheck zu beachten."
    } else {
        Ok "Git-Drift: kein Drift zum aktuellen Commit."
    }
}

# ---------------------------------------------------------------------------
# 2) Credential-Probe gegen Zielserver (optional)
# ---------------------------------------------------------------------------

if ($CheckCredential) {
    if (-not $CheckServer) {
        Err "-CheckCredential benoetigt -CheckServer (sonst kein psql-Zugriff moeglich)."
        exit 1
    }
    $dbUrl = $localMap['DATABASE_URL']
    $parts = Parse-DatabaseUrl $dbUrl
    if (-not $parts) {
        Warn "DATABASE_URL konnte nicht geparst werden -> Credential-Probe uebersprungen."
    } else {
        Info "Credential-Probe (psql select 1) auf Server..."
        $cmd = "docker exec -e PGPASSWORD='$($parts.Pass)' crm-postgres psql -U '$($parts.User)' -d '$($parts.Db)' -h localhost -tAc 'select 1' >/dev/null 2>&1 && echo PSQL_OK || echo PSQL_FAIL"
        $resp = ssh $Server $cmd 2>$null
        if (($resp | Out-String).Trim() -eq "PSQL_OK") {
            Ok "Credential-Probe: lokale DATABASE_URL erlaubt Zugriff auf Server-DB."
        } else {
            $exitCode = 2
            Warn "Credential-Probe FAIL: lokale DATABASE_URL erlaubt KEINEN Zugriff auf Server-DB."
            Warn "  -> Vor Deploy entweder DB-Rolle anpassen (ALTER USER ... PASSWORD ...) oder DATABASE_URL korrigieren."
        }
    }
}

# ---------------------------------------------------------------------------
# 3) HTTPS-Smoke (optional)
# ---------------------------------------------------------------------------

if ($CheckSmoke) {
    if (-not $Domain) {
        Warn "-CheckSmoke ohne -Domain -> uebersprungen."
    } else {
        foreach ($u in @("https://$Domain/","https://$Domain/api")) {
            try {
                $resp = Invoke-WebRequest -Uri $u -UseBasicParsing -TimeoutSec 10
                if ($resp.StatusCode -lt 500) {
                    Ok "Smoke ok: $u (HTTP $($resp.StatusCode))"
                } else {
                    $exitCode = 2
                    Warn "Smoke ungewoehnlich: $u (HTTP $($resp.StatusCode))"
                }
            } catch {
                $exitCode = 2
                Warn "Smoke fehlgeschlagen: $u  ($($_.Exception.Message))"
            }
        }
    }
}

# ---------------------------------------------------------------------------

Write-Host ""
if ($exitCode -eq 0) {
    Ok "Preflight gruen."
} else {
    Warn "Preflight: Auffaelligkeiten erkannt (Exit-Code $exitCode)."
}
exit $exitCode
