<#
  Stops the Nakshatra server started by scripts\start-local.ps1.
  Finds the process listening on the recorded port and stops it only if it is the Nakshatra server
  (node running dist/server/main.js). Unrelated programs are never touched.
  Usage: powershell -ExecutionPolicy Bypass -File scripts\stop-local.ps1 [-Port 3000]
#>
param([int]$Port = 0)
$root = Split-Path -Parent $PSScriptRoot
$portFile = Join-Path $root '.data\server.port'
if ($Port -eq 0) { $Port = if (Test-Path $portFile) { [int](Get-Content $portFile) } else { 3000 } }
$listener = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
if (-not $listener) { Write-Host "Nothing is listening on port $Port."; if (Test-Path $portFile) { Remove-Item $portFile }; exit 0 }
$p = Get-CimInstance Win32_Process -Filter "ProcessId=$($listener.OwningProcess)"
if ($p.CommandLine -notmatch 'dist/server/main\.js') { Write-Host "Port $Port belongs to another program ($($p.Name)); leaving it alone."; exit 1 }
$parent = Get-CimInstance Win32_Process -Filter "ProcessId=$($p.ParentProcessId)" -ErrorAction SilentlyContinue
Stop-Process -Id $p.ProcessId -Confirm:$false
if ($parent -and $parent.Name -eq 'cmd.exe' -and $parent.CommandLine -match 'dist/server/main\.js') { Stop-Process -Id $parent.ProcessId -Confirm:$false -ErrorAction SilentlyContinue }
if (Test-Path $portFile) { Remove-Item $portFile }
Write-Host "Stopped Nakshatra on port $Port (pid $($p.ProcessId))."
