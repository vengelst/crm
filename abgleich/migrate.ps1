param()

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
Set-Location $repoRoot

Write-Host ""
Write-Host "======================================="
Write-Host "          CRM DB Migration"
Write-Host "======================================="
Write-Host ""

pnpm db:migrate

if ($LASTEXITCODE -ne 0) {
    Write-Host ""
    Write-Host "Migration FAILED"
    exit 1
}

Write-Host ""
Write-Host "Migration finished successfully"
Write-Host ""
