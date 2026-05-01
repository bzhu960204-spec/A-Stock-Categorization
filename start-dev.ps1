param(
  [int]$BackendPort = 8085,
  [int]$FrontendPort = 5173,
  [switch]$StopExisting = $true
)

$ErrorActionPreference = 'Stop'

function Stop-ListeningProcessByPort {
  param([int]$Port)

  $connections = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
  if (-not $connections) {
    Write-Host "No listening process on port $Port"
    return
  }

  $processIds = $connections | Select-Object -ExpandProperty OwningProcess -Unique
  foreach ($processId in $processIds) {
    try {
      Stop-Process -Id $processId -Force -ErrorAction Stop
      Write-Host "Stopped process $processId on port $Port"
    } catch {
      Write-Host "Failed to stop process $processId on port ${Port}: $($_.Exception.Message)"
    }
  }
}

$scriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$backendDir = Join-Path $scriptRoot 'backend'
$frontendDir = Join-Path $scriptRoot 'frontend'

if (-not (Test-Path $backendDir)) {
  throw "Backend directory not found: $backendDir"
}

if (-not (Test-Path $frontendDir)) {
  throw "Frontend directory not found: $frontendDir"
}

if ($StopExisting) {
  Stop-ListeningProcessByPort -Port $BackendPort
  Stop-ListeningProcessByPort -Port $FrontendPort
}

$backendCommand = "`$env:SERVER_PORT='$BackendPort'; `$env:APP_CORS_ALLOWED_ORIGINS='http://localhost:$FrontendPort'; mvn spring-boot:run"
$frontendCommand = "`$env:BACKEND_PORT='$BackendPort'; npm run dev -- --host 0.0.0.0 --port $FrontendPort"

Start-Process -FilePath 'powershell.exe' -WorkingDirectory $backendDir -ArgumentList @(
  '-NoExit',
  '-ExecutionPolicy', 'Bypass',
  '-Command', $backendCommand
) | Out-Null

Write-Host "Waiting for backend to be ready on port $BackendPort..."
$maxWait = 120
$waited = 0
$ready = $false
while ($waited -lt $maxWait) {
  $conn = Get-NetTCPConnection -LocalPort $BackendPort -State Listen -ErrorAction SilentlyContinue
  if ($conn) { $ready = $true; break }
  Start-Sleep -Seconds 1
  $waited++
  if ($waited % 10 -eq 0) { Write-Host "  still waiting... ($waited s)" }
}

if (-not $ready) {
  Write-Host "Backend did not start within $maxWait seconds. Starting frontend anyway."
} else {
  Write-Host "Backend is ready after ${waited}s."
}

Start-Process -FilePath 'powershell.exe' -WorkingDirectory $frontendDir -ArgumentList @(
  '-NoExit',
  '-ExecutionPolicy', 'Bypass',
  '-Command', $frontendCommand
) | Out-Null

Write-Host "Started backend on http://localhost:$BackendPort"
Write-Host "Started frontend on http://localhost:$FrontendPort"
Write-Host 'Close each opened PowerShell window to stop the services, or run .\stop-dev.ps1'
