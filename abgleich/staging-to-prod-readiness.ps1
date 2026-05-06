#Requires -Version 5.1
<#
.SYNOPSIS
  Konsistenz-/Freigabecheck STAGING -> PROD. Nicht-destruktiv.

.DESCRIPTION
  Zweck: VOR einem PROD-Deploy nachweisbar bestaetigen, dass STAGING und PROD
  konsistent sind und dieselbe Software-Basis bereitstehen.

  Geprueft wird:
    1) STAGING-Erreichbarkeit + Server-Commit + Git-Drift gegen lokales 'main'.
    2) Container-Status auf STAGING (web/api/postgres laufen).
    3) Optional: HTTPS-Smoke gegen STAGING-Domain (/, /api).
    4) Optional: HTTPS-Smoke gegen PROD-Domain (/, /api).
    5) Optional: ENV-Schluesselmenge .env.staging vs. .env.prod
       (gleiche Variablen, aber Werte MUESSEN sich unterscheiden).
    6) Optional: PROD-Server-Erreichbarkeit + Snapshot-Verzeichnis beschreibbar.

  Es werden keine Migrationen, Builds oder Restarts ausgefuehrt.

.PARAMETER StagingServer
  SSH-Ziel STAGING (Pflicht).

.PARAMETER StagingRemoteRepo
  Repo-Pfad auf STAGING (Pflicht).

.PARAMETER StagingDomain
  STAGING-Domain (optional fuer Smoke).

.PARAMETER ProdServer
  SSH-Ziel PROD (optional, fuer Server-Erreichbarkeit + Snapshot-Pruefung).

.PARAMETER ProdRemoteRepo
  Repo-Pfad auf PROD (optional, zusammen mit -ProdServer).

.PARAMETER ProdDomain
  PROD-Domain (optional fuer Smoke).

.PARAMETER StagingEnvFile
  Pfad zur lokalen .env.staging. Default: ".env.staging".

.PARAMETER ProdEnvFile
  Pfad zur lokalen .env.prod. Default: ".env.prod".

.NOTES
  Exit-Codes:
    0 = Go (alle harten Kriterien gruen)
    2 = No-Go (mind. ein hartes Kriterium fail)
    3 = Aufruffehler / fehlende Pflichtparameter
#>
param(
    [Parameter(Mandatory)]
    [string]$StagingServer,

    [Parameter(Mandatory)]
    [string]$StagingRemoteRepo,

    [string]$StagingDomain,

    [string]$ProdServer,
    [string]$ProdRemoteRepo,
    [string]$ProdDomain,

    [string]$StagingEnvFile,
    [string]$ProdEnvFile
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

$scriptDir = $PSScriptRoot
$repoRoot  = (Resolve-Path (Join-Path $scriptDir "..")).Path
if (-not $StagingEnvFile) { $StagingEnvFile = Join-Path $repoRoot ".env.staging" }
if (-not $ProdEnvFile)    { $ProdEnvFile    = Join-Path $repoRoot ".env.prod" }

# Hard-Blocks: STAGING darf nicht TEST sein.
$forbiddenStagingDomain = @("crm.vivahome.de")
$forbiddenStagingRepo   = @("/opt/crm","/opt/crm-prod")
if ($StagingDomain -and ($forbiddenStagingDomain -contains $StagingDomain)) {
    Err "StagingDomain '$StagingDomain' wird auf TEST verwendet und ist hier ausgeschlossen."
    exit 3
}
if ($forbiddenStagingRepo -contains $StagingRemoteRepo) {
    Err "StagingRemoteRepo '$StagingRemoteRepo' ist als TEST/PROD-Pfad reserviert."
    exit 3
}
if ($ProdRemoteRepo -and ($ProdRemoteRepo -match '(?i)staging')) {
    Err "ProdRemoteRepo '$ProdRemoteRepo' enthaelt 'staging'. Mit STAGING verwechselt?"
    exit 3
}

Write-Host ""
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "   STAGING -> PROD READINESS CHECK" -ForegroundColor Cyan
Write-Host ("   StagingServer     : {0}" -f $StagingServer)     -ForegroundColor White
Write-Host ("   StagingRemoteRepo : {0}" -f $StagingRemoteRepo) -ForegroundColor White
if ($StagingDomain) { Write-Host ("   StagingDomain     : {0}" -f $StagingDomain) -ForegroundColor White }
if ($ProdServer)    { Write-Host ("   ProdServer        : {0}" -f $ProdServer)    -ForegroundColor White }
if ($ProdRemoteRepo){ Write-Host ("   ProdRemoteRepo    : {0}" -f $ProdRemoteRepo)-ForegroundColor White }
if ($ProdDomain)    { Write-Host ("   ProdDomain        : {0}" -f $ProdDomain)    -ForegroundColor White }
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host ""

$failures = New-Object System.Collections.Generic.List[string]
$warnings = New-Object System.Collections.Generic.List[string]
$checks   = @()

# ---------------------------------------------------------------------------
# 1) Lokaler Stand
# ---------------------------------------------------------------------------

$localBranch = (git rev-parse --abbrev-ref HEAD 2>$null | Out-String).Trim()
$localCommit = (git rev-parse --short HEAD 2>$null | Out-String).Trim()
if (-not $localCommit) {
    Err "Kein git-Repo / Commit am Arbeitsplatz."
    exit 3
}
Ok "Lokaler Stand: $localBranch @ $localCommit"
$checks += "lokaler Stand"

# ---------------------------------------------------------------------------
# 2) STAGING erreichen + Git-Stand vergleichen
# ---------------------------------------------------------------------------

Info "STAGING-Server erreichen: $StagingServer ..."
$stagPing = ssh $StagingServer "echo STAGING_OK" 2>$null
if (($stagPing | Out-String).Trim() -ne "STAGING_OK") {
    $failures.Add("STAGING-Server $StagingServer nicht per SSH erreichbar.")
} else {
    Ok "SSH zu STAGING ok."
    $checks += "ssh staging"

    $stagBranch = (ssh $StagingServer "cd '$StagingRemoteRepo' && git rev-parse --abbrev-ref HEAD" 2>$null | Out-String).Trim()
    $stagCommit = (ssh $StagingServer "cd '$StagingRemoteRepo' && git rev-parse --short HEAD" 2>$null | Out-String).Trim()
    if (-not $stagCommit) {
        $failures.Add("STAGING-RemoteRepo '$StagingRemoteRepo' enthaelt kein git-Repo.")
    } else {
        Ok "STAGING-Stand: $stagBranch @ $stagCommit"
        if ($stagCommit -ne $localCommit) {
            $warnings.Add("Git-Drift: STAGING ($stagCommit) != lokal ($localCommit). Pruefen, ob STAGING den Stand reflektiert, der nach PROD soll.")
        } else {
            Ok "Git-Drift: STAGING == lokal."
            $checks += "git-konsistenz staging"
        }
    }

    Info "STAGING-Container-Status..."
    $containers = ssh $StagingServer "cd '$StagingRemoteRepo' && docker compose -f docker-compose.yml ps --format '{{.Service}}|{{.State}}'" 2>$null
    if (-not $containers) {
        $failures.Add("Konnte STAGING docker compose ps nicht lesen.")
    } else {
        $expected = @('postgres','minio','api','web')
        $running  = @{}
        foreach ($l in ($containers -split "`r?`n")) {
            if ($l -match '^([^|]+)\|(.+)$') {
                $running[$Matches[1].Trim()] = $Matches[2].Trim()
            }
        }
        $stoppedCritical = @()
        foreach ($svc in $expected) {
            if (-not $running.ContainsKey($svc)) {
                $stoppedCritical += "$svc (nicht vorhanden)"
            } elseif ($running[$svc] -notmatch 'running|Up') {
                $stoppedCritical += "$svc=$($running[$svc])"
            }
        }
        if ($stoppedCritical.Count -gt 0) {
            $failures.Add("STAGING-Container nicht alle 'running': " + ($stoppedCritical -join ', '))
        } else {
            Ok "STAGING-Container alle 'running'."
            $checks += "container staging"
        }
    }
}

# ---------------------------------------------------------------------------
# 3) STAGING HTTPS-Smoke
# ---------------------------------------------------------------------------

if ($StagingDomain) {
    foreach ($u in @("https://$StagingDomain/","https://$StagingDomain/api")) {
        try {
            $resp = Invoke-WebRequest -Uri $u -UseBasicParsing -TimeoutSec 10
            if ($resp.StatusCode -lt 500) {
                Ok "Smoke STAGING ok: $u (HTTP $($resp.StatusCode))"
            } else {
                $failures.Add("Smoke STAGING ungewoehnlich: $u (HTTP $($resp.StatusCode))")
            }
        } catch {
            $failures.Add("Smoke STAGING fehlgeschlagen: $u ($($_.Exception.Message))")
        }
    }
    $checks += "smoke staging"
}

# ---------------------------------------------------------------------------
# 4) PROD-Server (optional)
# ---------------------------------------------------------------------------

if ($ProdServer) {
    Info "PROD-Server erreichen..."
    $prodPing = ssh $ProdServer "echo PROD_OK" 2>$null
    if (($prodPing | Out-String).Trim() -ne "PROD_OK") {
        $failures.Add("PROD-Server $ProdServer nicht per SSH erreichbar.")
    } else {
        Ok "SSH zu PROD ok."
        $checks += "ssh prod"

        if ($ProdRemoteRepo) {
            $prodWritable = ssh $ProdServer "mkdir -p '$ProdRemoteRepo/backups' && touch '$ProdRemoteRepo/backups/.write_probe' && rm -f '$ProdRemoteRepo/backups/.write_probe' && echo OK" 2>$null
            if (($prodWritable | Out-String).Trim() -eq "OK") {
                Ok "PROD-Snapshot-Verzeichnis '$ProdRemoteRepo/backups' beschreibbar."
                $checks += "snapshot-pfad prod"
            } else {
                $failures.Add("PROD-Snapshot-Verzeichnis '$ProdRemoteRepo/backups' nicht beschreibbar.")
            }
        }
    }
}

# ---------------------------------------------------------------------------
# 5) PROD HTTPS-Smoke (informativ, vor Deploy)
# ---------------------------------------------------------------------------

if ($ProdDomain) {
    Info "PROD-Smoke (Vor-Deploy-Stand) ..."
    foreach ($u in @("https://$ProdDomain/","https://$ProdDomain/api")) {
        try {
            $resp = Invoke-WebRequest -Uri $u -UseBasicParsing -TimeoutSec 10
            Ok "Smoke PROD: $u (HTTP $($resp.StatusCode))"
        } catch {
            $warnings.Add("PROD-Smoke nicht moeglich (oft erwartet vor Erst-Inbetriebnahme): $u")
        }
    }
}

# ---------------------------------------------------------------------------
# 6) ENV-Vergleich .env.staging vs .env.prod
# ---------------------------------------------------------------------------

if ((Test-Path $StagingEnvFile) -and (Test-Path $ProdEnvFile)) {
    Info "ENV-Vergleich .env.staging vs .env.prod ..."
    $sMap = Get-EnvMap $StagingEnvFile
    $pMap = Get-EnvMap $ProdEnvFile

    $sKeys = @($sMap.Keys)
    $pKeys = @($pMap.Keys)
    $onlyInStaging = $sKeys | Where-Object { $_ -notin $pKeys }
    $onlyInProd    = $pKeys | Where-Object { $_ -notin $sKeys }

    if ($onlyInStaging.Count -gt 0) {
        $warnings.Add("ENV-Schluessel nur in STAGING: " + ($onlyInStaging -join ', '))
    }
    if ($onlyInProd.Count -gt 0) {
        $warnings.Add("ENV-Schluessel nur in PROD: " + ($onlyInProd -join ', '))
    }
    if ($onlyInStaging.Count -eq 0 -and $onlyInProd.Count -eq 0) {
        Ok "ENV-Schluesselmenge identisch."
        $checks += "env-keys identisch"
    }

    $secretKeysMustDiffer = @('JWT_SECRET','POSTGRES_PASSWORD','MINIO_ROOT_PASSWORD','SMTP_PASS')
    foreach ($k in $secretKeysMustDiffer) {
        if ($sMap.ContainsKey($k) -and $pMap.ContainsKey($k)) {
            if ($sMap[$k] -eq $pMap[$k] -and $sMap[$k] -notmatch '^CHANGE_ME') {
                $failures.Add("Sicherheitsfehler: '$k' ist in STAGING und PROD identisch.")
            }
        }
    }

    $sDb = $sMap['DATABASE_URL']
    $pDb = $pMap['DATABASE_URL']
    if ($sDb -and $pDb -and ($sDb -eq $pDb) -and ($sDb -notmatch 'CHANGE_ME')) {
        $failures.Add("DATABASE_URL ist in STAGING und PROD identisch -> beide Umgebungen wuerden auf derselben DB arbeiten.")
    } else {
        if ($sDb -and $pDb) {
            Ok "DATABASE_URL trennt STAGING und PROD."
            $checks += "db-url getrennt"
        }
    }
} else {
    if (-not (Test-Path $StagingEnvFile)) { $warnings.Add("Lokale .env.staging fehlt: $StagingEnvFile") }
    if (-not (Test-Path $ProdEnvFile))    { $warnings.Add("Lokale .env.prod fehlt: $ProdEnvFile") }
}

# ---------------------------------------------------------------------------
# Zusammenfassung
# ---------------------------------------------------------------------------

Write-Host ""
Write-Host "------------------------------------------------------------" -ForegroundColor DarkGray
Write-Host "  Ergebnis" -ForegroundColor Cyan
Write-Host "------------------------------------------------------------" -ForegroundColor DarkGray
Write-Host "  Geprueft : $($checks.Count) Punkt(e)" -ForegroundColor White
Write-Host "  Warnings : $($warnings.Count)"        -ForegroundColor Yellow
Write-Host "  Failures : $($failures.Count)"        -ForegroundColor $( if ($failures.Count -gt 0) { 'Red' } else { 'Green' } )

if ($warnings.Count -gt 0) {
    Write-Host ""
    Write-Host "  Warnungen:" -ForegroundColor Yellow
    foreach ($w in $warnings) { Write-Host "    - $w" -ForegroundColor Yellow }
}
if ($failures.Count -gt 0) {
    Write-Host ""
    Write-Host "  Fehler (No-Go):" -ForegroundColor Red
    foreach ($f in $failures) { Write-Host "    - $f" -ForegroundColor Red }
    Write-Host ""
    Err "Readiness: NO-GO."
    exit 2
}

Write-Host ""
Ok "Readiness: GO. PROD-Deploy darf gestartet werden."
exit 0
