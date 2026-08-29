param(
  [switch]$SkipFrontend = $false
)

# Builds the production artifacts for the single-port "prod" flow:
#   1) builds the React frontend  -> frontend/dist
#   2) packages the Spring Boot fat jar -> backend/target/*.jar
# Run this after changing frontend or backend code. The dev flow (start-dev.cmd)
# is unaffected — this only produces the artifacts that start-prod.cmd runs.

$ErrorActionPreference = 'Stop'

$scriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$backendDir = Join-Path $scriptRoot 'backend'
$frontendDir = Join-Path $scriptRoot 'frontend'

if (-not (Test-Path $backendDir)) { throw "Backend directory not found: $backendDir" }
if (-not (Test-Path $frontendDir)) { throw "Frontend directory not found: $frontendDir" }

if (-not $SkipFrontend) {
  Write-Host "Building frontend..."
  Push-Location $frontendDir
  try {
    if (-not (Test-Path 'node_modules')) { & npm install }
    & npm run build
    if ($LASTEXITCODE -ne 0) { throw "Frontend build failed" }
  } finally {
    Pop-Location
  }
} else {
  Write-Host "Skipping frontend build (-SkipFrontend)."
}

Write-Host "Packaging backend fat jar..."
Push-Location $backendDir
try {
  & mvn -q -DskipTests clean package
  if ($LASTEXITCODE -ne 0) { throw "Backend package failed" }
} finally {
  Pop-Location
}

$jar = Get-ChildItem (Join-Path $backendDir 'target') -Filter 'stock-classifier-*.jar' -ErrorAction SilentlyContinue |
  Where-Object { $_.Name -notlike '*.original' } |
  Select-Object -First 1
if (-not $jar) { throw "Jar not found under backend/target" }

Write-Host ""
Write-Host "==============================================="
Write-Host " Production artifacts ready"
Write-Host "   Jar     : $($jar.FullName)"
Write-Host "   Frontend: $(Join-Path $frontendDir 'dist')"
Write-Host " Launch with start-prod.cmd"
Write-Host "==============================================="
