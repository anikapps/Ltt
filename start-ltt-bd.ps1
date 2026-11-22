$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot
$log = Join-Path $PSScriptRoot 'lttbd-startup.log'
"LTT BD startup log — $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')" | Set-Content -LiteralPath $log

Write-Host '============================================================================' -ForegroundColor Cyan
Write-Host '  LTT BD — GROUP LOCATION TRACKING & ASSISTANCE SYSTEM' -ForegroundColor Cyan
Write-Host '============================================================================' -ForegroundColor Cyan
Write-Host "[INFO] Project folder: $PSScriptRoot"
Write-Host "[INFO] Diagnostic log: $log"

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Write-Host '[ERROR] Node.js is not installed or is not in PATH. Install Node.js LTS from https://nodejs.org/.' -ForegroundColor Red
  Read-Host 'Press Enter to close'
  exit 1
}
if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
  Write-Host '[ERROR] npm is not available. Reinstall Node.js LTS.' -ForegroundColor Red
  Read-Host 'Press Enter to close'
  exit 1
}

Write-Host "[OK] Node.js $(node -v) | npm $(npm -v)" -ForegroundColor Green
Add-Content -LiteralPath $log -Value "Node.js $(node -v) | npm $(npm -v)"

Write-Host '[INFO] Preparing private local credentials and cryptographic secrets...' -ForegroundColor Cyan
node scripts/bootstrap-local-env.mjs
if ($LASTEXITCODE -ne 0) {
  Add-Content -LiteralPath $log -Value 'Local environment setup failed.'
  Read-Host 'Press Enter to close'
  exit $LASTEXITCODE
}

if (-not (Test-Path 'node_modules/.bin/next.cmd') -and -not (Test-Path 'node_modules/.bin/next')) {
  Write-Host '[INFO] Installing dependencies. Internet access is required; output is saved to lttbd-startup.log.' -ForegroundColor Cyan
  npm install --no-audit --no-fund --fetch-retries=3 --fetch-retry-mintimeout=10000 --fetch-retry-maxtimeout=60000 --fetch-timeout=120000 2>&1 | Tee-Object -FilePath $log -Append
  if ($LASTEXITCODE -ne 0) {
    Write-Host '[ERROR] npm install failed. Review lttbd-startup.log, check internet access, and retry.' -ForegroundColor Red
    Read-Host 'Press Enter to close'
    exit $LASTEXITCODE
  }
}

if (-not (Test-Path 'node_modules/.bin/next.cmd') -and -not (Test-Path 'node_modules/.bin/next')) {
  Write-Host '[ERROR] Next.js was not found after dependency installation.' -ForegroundColor Red
  Read-Host 'Press Enter to close'
  exit 1
}

Write-Host '[INFO] Running local verification checks...' -ForegroundColor Cyan
node scripts/run-verification-tests.mjs 2>&1 | Tee-Object -FilePath $log -Append

$port = 3000
while ($port -le 3010) {
  $listener = $null
  try {
    $listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, $port)
    $listener.Start()
    $listener.Stop()
    break
  } catch {
    $port++
  }
}
if ($port -gt 3010) {
  Write-Host '[ERROR] Ports 3000–3010 are all occupied. Close another local development server and retry.' -ForegroundColor Red
  Read-Host 'Press Enter to close'
  exit 1
}
if ($port -ne 3000) { Write-Host "[WARNING] Port 3000 is busy; using port $port instead." -ForegroundColor Yellow }
$env:PORT = "$port"
$url = "http://localhost:$port"

$browserJob = Start-Job -ArgumentList $url -ScriptBlock {
  param($target)
  for ($i = 0; $i -lt 60; $i++) {
    try {
      $response = Invoke-WebRequest -UseBasicParsing -Uri $target -TimeoutSec 2
      if ($response.StatusCode -ge 200) { Start-Process $target; break }
    } catch { }
    Start-Sleep -Seconds 1
  }
}

Write-Host "[INFO] Starting LTT BD at $url" -ForegroundColor Green
Write-Host '[IMPORTANT] Keep this PowerShell window open while using LTT BD.' -ForegroundColor Yellow
Write-Host "[INFO] Diagnostic log: $log"
npm run dev
$serverExit = $LASTEXITCODE
Stop-Job $browserJob -ErrorAction SilentlyContinue
Remove-Job $browserJob -Force -ErrorAction SilentlyContinue
Add-Content -LiteralPath $log -Value "Server exited with code $serverExit at $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')."
if ($serverExit -ne 0) { Write-Host "[ERROR] Server stopped. Review $log" -ForegroundColor Red }
Read-Host 'Press Enter to close'
exit $serverExit
