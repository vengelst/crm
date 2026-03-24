param()

Write-Host ""
Write-Host "======================================="
Write-Host "         CRM Environment Check"
Write-Host "======================================="
Write-Host ""

Write-Host "Checking Docker..."
try {
    docker info | Out-Null
    Write-Host "Docker: OK"
}
catch {
    Write-Host "Docker: NOT RUNNING"
}

Write-Host ""
Write-Host "Checking pnpm..."
try {
    pnpm --version | Out-Null
    Write-Host "pnpm: OK"
}
catch {
    Write-Host "pnpm: NOT AVAILABLE"
}

Write-Host ""
Write-Host "Running Containers:"
docker ps --format "table {{.Names}}\t{{.Status}}"

Write-Host ""
Write-Host "Checking PostgreSQL container..."
$postgres = docker ps --filter "name=crm-postgres" --format "{{.Names}}"
if ($postgres) {
    try {
        docker exec $postgres pg_isready -U postgres -d crm_monteur | Out-Null
        Write-Host "Postgres: OK ($postgres)"
    }
    catch {
        Write-Host "Postgres: NOT READY ($postgres)"
    }
}
else {
    Write-Host "Postgres: NOT RUNNING"
}

Write-Host ""
Write-Host "Checking MinIO container..."
$minio = docker ps --filter "name=crm-minio" --format "{{.Names}}"
if ($minio) {
    Write-Host "MinIO: OK ($minio)"
}
else {
    Write-Host "MinIO: NOT RUNNING"
}

Write-Host ""
Write-Host "Checking local API..."
try {
    $api = Invoke-WebRequest -Uri "http://localhost:3801/api" -UseBasicParsing -TimeoutSec 3
    if ($api.StatusCode -ge 200 -and $api.StatusCode -lt 300) {
        Write-Host "API: OK"
    } else {
        Write-Host "API: RESPONDED BUT STATUS NOT 2XX"
    }
}
catch {
    Write-Host "API: NOT REACHABLE"
}

Write-Host ""
Write-Host "Checking local Web..."
try {
    $web = Invoke-WebRequest -Uri "http://localhost:3800" -UseBasicParsing -TimeoutSec 3
    if ($web.StatusCode -ge 200 -and $web.StatusCode -lt 400) {
        Write-Host "Web: OK"
    } else {
        Write-Host "Web: RESPONDED BUT STATUS NOT OK"
    }
}
catch {
    Write-Host "Web: NOT REACHABLE"
}

Write-Host ""
Write-Host "======================================="
Write-Host "Environment check finished"
Write-Host "======================================="
Write-Host ""
