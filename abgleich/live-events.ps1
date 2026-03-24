param(
    [ValidateSet("dashboard", "api", "web", "docker")]
    [string]$Mode = "dashboard"
)

function Header {
    Clear-Host
    Write-Host ""
    Write-Host "========================================"
    Write-Host "           CRM OPERATIONS VIEW"
    Write-Host "========================================"
    Write-Host ("Mode: {0}" -f $Mode)
    Write-Host ""
}

function Watch-Api {
    Header
    Write-Host "Streaming API logs..."
    Write-Host ""
    docker logs -f crm-api
}

function Watch-Web {
    Header
    Write-Host "Streaming Web logs..."
    Write-Host ""
    docker logs -f crm-web
}

function Watch-Docker {
    Header
    Write-Host "Streaming docker compose logs..."
    Write-Host ""
    docker compose logs -f
}

function Show-Dashboard {
    while ($true) {
        Header

        Write-Host "SYSTEM STATUS"
        Write-Host "--------------------------------"
        try {
            docker info 2>$null | Out-Null
            Write-Host "Docker: OK" -ForegroundColor Green
        } catch {
            Write-Host "Docker: ERROR" -ForegroundColor Red
        }

        Write-Host ""
        Write-Host "CONTAINERS"
        Write-Host "--------------------------------"
        docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"

        Write-Host ""
        Write-Host "API"
        Write-Host "--------------------------------"
        try {
            Invoke-WebRequest -Uri "http://localhost:3801/api" -UseBasicParsing -TimeoutSec 5 | Out-Null
            Write-Host "API: OK" -ForegroundColor Green
        } catch {
            Write-Host "API: ERROR" -ForegroundColor Red
        }

        Write-Host ""
        Write-Host "WEB"
        Write-Host "--------------------------------"
        try {
            Invoke-WebRequest -Uri "http://localhost:3800" -UseBasicParsing -TimeoutSec 5 | Out-Null
            Write-Host "Web: OK" -ForegroundColor Green
        } catch {
            Write-Host "Web: ERROR" -ForegroundColor Red
        }

        Write-Host ""
        Write-Host "Refreshing in 5 seconds..."
        Start-Sleep 5
    }
}

switch ($Mode.ToLower()) {
    "api" { Watch-Api }
    "web" { Watch-Web }
    "docker" { Watch-Docker }
    "dashboard" { Show-Dashboard }
}
