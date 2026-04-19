param(
  [switch]$SkipInstall,
  [switch]$SkipSeed
)

$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$backendDir = Join-Path $repoRoot 'backend'
$frontendDir = Join-Path $repoRoot 'frontend'

Write-Host 'Starting WINterview local dev environment...' -ForegroundColor Cyan
Write-Host "Repo: $repoRoot"

if (-not $SkipInstall) {
  Write-Host 'Installing/syncing backend dependencies (uv sync)...' -ForegroundColor Yellow
  Push-Location $backendDir
  try {
    uv sync
  }
  finally {
    Pop-Location
  }

  Write-Host 'Installing frontend dependencies (npm install)...' -ForegroundColor Yellow
  Push-Location $frontendDir
  try {
    npm install
  }
  finally {
    Pop-Location
  }
}

if (-not $SkipSeed) {
  Write-Host 'Seeding questions (safe to run repeatedly)...' -ForegroundColor Yellow
  Push-Location $backendDir
  try {
    uv run python scripts/seed.py
  }
  finally {
    Pop-Location
  }
}

$backendCommand = "Set-Location '$backendDir'; uv run uvicorn app.main:app --reload --host 0.0.0.0 --port 8000"
$frontendCommand = "Set-Location '$frontendDir'; npm run dev"

Write-Host 'Launching backend on http://localhost:8000 ...' -ForegroundColor Green
Start-Process powershell -ArgumentList @('-NoExit', '-Command', $backendCommand)

Write-Host 'Launching frontend on http://localhost:5173 ...' -ForegroundColor Green
Start-Process powershell -ArgumentList @('-NoExit', '-Command', $frontendCommand)

Write-Host ''
Write-Host 'Done. Two new PowerShell windows were opened.' -ForegroundColor Cyan
Write-Host 'Frontend: http://localhost:5173'
Write-Host 'Backend : http://localhost:8000/health'
Write-Host ''
Write-Host 'Tip: use -SkipInstall and/or -SkipSeed for faster startup once set up.'
