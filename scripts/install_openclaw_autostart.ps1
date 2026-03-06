param(
  [switch]$RunNow
)

$ErrorActionPreference = "Stop"

$startupDir = [Environment]::GetFolderPath("Startup")
$scriptPath = Join-Path $PSScriptRoot "openclaw_autostart.ps1"
$proxySourcePath = Join-Path (Split-Path $PSScriptRoot -Parent) "local-proxy-capture.js"
$cmdPath = Join-Path $startupDir "openclaw_autostart.cmd"
$openclawDir = Join-Path $env:USERPROFILE ".openclaw"
$deployedScriptPath = Join-Path $openclawDir "openclaw_autostart.ps1"
$deployedProxyPath = Join-Path $openclawDir "local-proxy-capture.js"
$logPath = Join-Path $openclawDir "autostart.log"

if (-not (Test-Path $scriptPath)) {
  throw "Script not found: $scriptPath"
}

New-Item -ItemType Directory -Path $openclawDir -Force | Out-Null
Copy-Item -Path $scriptPath -Destination $deployedScriptPath -Force
if (Test-Path $proxySourcePath) {
  Copy-Item -Path $proxySourcePath -Destination $deployedProxyPath -Force
}

$cmd = @"
@echo off
powershell -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "$deployedScriptPath" >> "$logPath" 2>&1
"@

Set-Content -Path $cmdPath -Value $cmd -Encoding ASCII
Write-Host "[OK] Startup entry installed: $cmdPath"

if ($RunNow) {
  Write-Host "[STEP] Running autostart script now..."
  & powershell -NoProfile -ExecutionPolicy Bypass -File $deployedScriptPath
  Write-Host "[OK] Autostart script run complete"
}

Write-Host "[INFO] Log file: $logPath"
