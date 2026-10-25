<#
  Nakshatra local launcher (Windows PowerShell 5.1+).
  Serves the API and the built website from ONE process at http://localhost:<Port> (default 3000).

  Usage:   powershell -ExecutionPolicy Bypass -File scripts\start-local.ps1 [-Port 3000] [-Rebuild] [-Foreground]
  Stop:    powershell -ExecutionPolicy Bypass -File scripts\stop-local.ps1

  - Never stops unrelated processes: if the port is taken by something else it exits with a clear message.
  - Does not start a duplicate: if Nakshatra is already serving on the port it just reports the URL.
  - Builds only when dist/ is missing or older than the sources (or with -Rebuild).
  - Logs go to .data\logs\server.log; the process id is kept in .data\server.pid.
#>
param(
  [int]$Port = 3000,
  [switch]$Rebuild,
  [switch]$Foreground
)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root
$url = "http://localhost:$Port"
# Windows PowerShell resolves "localhost" to ::1 first and does not fall back to IPv4; the server listens on 127.0.0.1.
$probe = "http://127.0.0.1:$Port"

function Fail($msg) { Write-Host "ERROR: $msg" -ForegroundColor Red; exit 1 }
function Info($msg) { Write-Host $msg -ForegroundColor Cyan }

# 1. Runtime
$nodeVersion = (& node -v) 2>$null
if (-not $nodeVersion) { Fail 'Node.js is not installed or not on PATH. Install Node 22.12+ from https://nodejs.org.' }
$major = [int]($nodeVersion.TrimStart('v').Split('.')[0])
if ($major -lt 22) { Fail "Node $nodeVersion found; Nakshatra needs Node 22.12 or newer." }
if (-not (Test-Path 'node_modules')) { Info 'Installing dependencies (npm ci)...'; & npm ci; if ($LASTEXITCODE -ne 0) { Fail 'npm ci failed.' } }

# 2. Environment file (values are never printed)
if (-not (Test-Path '.env')) { Copy-Item '.env.example' '.env'; Info 'Created .env from .env.example (local defaults).' }
$envText = Get-Content '.env' -Raw
if ($envText -match '(?m)^\s*NODE_ENV\s*=\s*production') { Info 'Note: .env sets NODE_ENV=production; the launcher runs in local mode (NODE_ENV=development).' }

# 3. Port check: reuse our own server, refuse to touch anything else
$listener = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
if ($listener) {
  try { $h = Invoke-RestMethod "$probe/api/health" -TimeoutSec 3 } catch { $h = $null }
  if ($h -and $h.status) { Write-Host "Nakshatra is already running at $url (database: $($h.database), status: $($h.status))." -ForegroundColor Green; exit 0 }
  $owner = Get-CimInstance Win32_Process -Filter "ProcessId=$($listener.OwningProcess)"
  Fail "Port $Port is used by another program ($($owner.Name), pid $($listener.OwningProcess)). Close it or run: scripts\start-local.ps1 -Port 3100"
}

# 4. Build if needed
$distServer = 'dist\server\main.js'; $distWeb = 'dist\web\index.html'
$needBuild = $Rebuild -or -not (Test-Path $distServer) -or -not (Test-Path $distWeb)
if (-not $needBuild) {
  $built = [Math]::Min((Get-Item $distServer).LastWriteTimeUtc.Ticks, (Get-Item $distWeb).LastWriteTimeUtc.Ticks)
  $newest = (Get-ChildItem src, drizzle, index.html, package.json -Recurse -File | Sort-Object LastWriteTimeUtc -Descending | Select-Object -First 1).LastWriteTimeUtc.Ticks
  if ($newest -gt $built) { $needBuild = $true; Info 'Sources changed since the last build.' }
}
if ($needBuild) { Info 'Building (npm run build)...'; & npm run build; if ($LASTEXITCODE -ne 0) { Fail 'Build failed; see output above.' } }

# 5. Start (migrations run automatically before the server listens)
New-Item -ItemType Directory -Force '.data\logs' | Out-Null
$env:NODE_ENV = 'development'
$env:PORT = "$Port"
$env:HOST = '127.0.0.1'
$env:APP_ORIGIN = $url
if ($Foreground) { Info "Starting in the foreground at $url (Ctrl+C to stop)..."; & node --enable-source-maps dist/server/main.js; exit $LASTEXITCODE }

$log = Join-Path $root '.data\logs\server.log'
$err = Join-Path $root '.data\logs\server.err.log'
# Win32_Process.Create starts a fully detached process that inherits no handles, so this script (and `npm run local`)
# returns immediately and the server keeps running after the terminal closes. Start-Process with redirection would
# leak the caller's pipe handles to the server and keep the caller waiting until the server exits.
$nodeExe = (Get-Command node).Source
$cmdLine = "cmd.exe /d /c `"set NODE_ENV=development&& set PORT=$Port&& set HOST=127.0.0.1&& set APP_ORIGIN=$url&& `"$nodeExe`" --enable-source-maps dist/server/main.js 1>`"$log`" 2>`"$err`"`""
$res = Invoke-CimMethod -ClassName Win32_Process -MethodName Create -Arguments @{ CommandLine = $cmdLine; CurrentDirectory = $root }
if ($res.ReturnValue -ne 0) { Fail "Could not start the server process (Win32 error $($res.ReturnValue))." }
Set-Content '.data\server.port' $Port

# 6. Wait for readiness
Info "Starting Nakshatra..."
$ok = $false
for ($i = 0; $i -lt 90; $i++) {
  Start-Sleep -Seconds 1
  if (-not (Get-CimInstance Win32_Process -Filter "ProcessId=$($res.ProcessId)" -ErrorAction SilentlyContinue)) { break }
  try { $h = Invoke-RestMethod "$probe/api/health" -TimeoutSec 2; if ($h.status -eq 'ok') { $ok = $true; break } } catch { }
}
if (-not $ok) {
  Write-Host '--- last log lines ---'; if (Test-Path $err) { Get-Content $err -Tail 20 }; if (Test-Path $log) { Get-Content $log -Tail 20 }
  Fail "Nakshatra did not become healthy. Full logs: $log"
}
$page = Invoke-WebRequest "$probe/" -UseBasicParsing -TimeoutSec 5
Write-Host ''
Write-Host "Nakshatra is running:  $url" -ForegroundColor Green
Write-Host "  API health:          $url/api/health  -> $($h.status) (database: $($h.database))"
Write-Host "  Homepage:            HTTP $($page.StatusCode)"
Write-Host "  Dev mailbox:         $url/dev/mailbox"
Write-Host "  Logs:                $log"
Write-Host '  Stop with:           powershell -ExecutionPolicy Bypass -File scripts\stop-local.ps1'
