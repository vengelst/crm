param()

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
Set-Location $repoRoot

Write-Host ""
Write-Host "======================================="
Write-Host "             CRM Seed"
Write-Host "======================================="
Write-Host ""

pnpm db:seed

if ($LASTEXITCODE -ne 0) {
    Write-Host ""
    Write-Host "Seed FAILED"
    exit 1
}

Write-Host ""
Write-Host "Seed finished successfully"
Write-Host ""
