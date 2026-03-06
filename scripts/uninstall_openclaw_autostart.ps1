$ErrorActionPreference = "Stop"

$startupDir = [Environment]::GetFolderPath("Startup")
$cmdPath = Join-Path $startupDir "openclaw_autostart.cmd"

if (Test-Path $cmdPath) {
  Remove-Item $cmdPath -Force
  Write-Host "[OK] Startup entry removed: $cmdPath"
} else {
  Write-Host "[INFO] Startup entry not found: $cmdPath"
}
