param(
  # Ports to probe for a running instance (prod default 8080, dev default 8085).
  [int[]]$Ports = @(),
  # Where offline backups go (same folder the app uses for its automatic backups).
  [string]$BackupDir = ''
)

# Backs up the H2 database.
#  - App running  -> asks it to run H2 "BACKUP TO" (online, transactionally consistent).
#  - App stopped  -> zips backend/data/stockdb.mv.db directly.
# The app also backs itself up automatically (see app.backup.* in application.properties).
# Restore: stop the app, then extract the zip's stockdb.mv.db into backend/data/.

$ErrorActionPreference = 'Stop'

$scriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$dataDir = Join-Path $scriptRoot 'backend\data'
if (-not $BackupDir) { $BackupDir = Join-Path $dataDir 'backups' }

if (-not $Ports -or $Ports.Count -eq 0) {
  $Ports = @()
  $stateFile = Join-Path $scriptRoot '.stockcard-prod-state.json'
  if (Test-Path $stateFile) {
    try { $Ports += [int]((Get-Content $stateFile -Raw | ConvertFrom-Json).port) } catch { }
  }
  $Ports += 8080, 8085
  $Ports = $Ports | Select-Object -Unique
}

foreach ($port in $Ports) {
  $listening = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
  if (-not $listening) { continue }
  try {
    $result = Invoke-RestMethod -Method Post -Uri "http://127.0.0.1:$port/api/admin/backups" -TimeoutSec 60
    Write-Host "Online backup created by the running app (port $port):"
    Write-Host "  $($result.fileName)  ($([math]::Round($result.sizeBytes / 1KB)) KB)"
    Write-Host "  in $(Join-Path $dataDir 'backups') (or app.backup.dir if customised)"
    exit 0
  } catch {
    Write-Host "Port $port is listening but the backup API did not respond: $($_.Exception.Message)"
  }
}

$dbFile = Join-Path $dataDir 'stockdb.mv.db'
if (-not (Test-Path $dbFile)) { throw "Database file not found: $dbFile" }

if (-not (Test-Path $BackupDir)) { New-Item -ItemType Directory -Path $BackupDir | Out-Null }
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$target = Join-Path $BackupDir "stockdb-$stamp.zip"

try {
  Compress-Archive -Path $dbFile -DestinationPath $target -CompressionLevel Optimal
} catch {
  throw "Offline backup failed (is the app still running on another port? stop it first): $($_.Exception.Message)"
}

Write-Host "Offline backup created: $target"
