param(
  [int]$ProxyPort = 19080,
  [int]$GatewayPort = 18789
)

$ErrorActionPreference = "Stop"

$homeDir = $env:USERPROFILE
$openclawDir = Join-Path $homeDir ".openclaw"
$logPath = Join-Path $openclawDir "autostart.log"
$repoRoot = Split-Path $PSScriptRoot -Parent

New-Item -ItemType Directory -Path $openclawDir -Force | Out-Null

function Write-Log([string]$message) {
  $line = "[{0}] {1}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"), $message
  Add-Content -Path $logPath -Value $line -Encoding UTF8
}

function Test-PortListening([int]$Port) {
  $listener = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
  return $null -ne $listener
}

function Wait-Listen([int]$Port, [int]$TimeoutSeconds = 20) {
  $sw = [System.Diagnostics.Stopwatch]::StartNew()
  while ($sw.Elapsed.TotalSeconds -lt $TimeoutSeconds) {
    if (Test-PortListening -Port $Port) {
      return $true
    }
    Start-Sleep -Milliseconds 500
  }
  return $false
}

try {
  Write-Log "autostart begin"

  $proxyCandidates = @(
    (Join-Path $openclawDir "local-proxy-capture.js"),
    (Join-Path $repoRoot "local-proxy-capture.js")
  )
  $proxyScript = $proxyCandidates | Where-Object { Test-Path $_ } | Select-Object -First 1

  if (-not $proxyScript) {
    Write-Log "proxy script missing, skipped"
  } elseif (Test-PortListening -Port $ProxyPort) {
    Write-Log "proxy already listening on $ProxyPort"
  } else {
    Start-Process node -ArgumentList "`"$proxyScript`"" -WindowStyle Hidden
    if (Wait-Listen -Port $ProxyPort -TimeoutSeconds 20) {
      Write-Log "proxy started on $ProxyPort ($proxyScript)"
    } else {
      Write-Log "proxy failed to listen on $ProxyPort"
    }
  }

  if (Test-PortListening -Port $GatewayPort) {
    Write-Log "gateway already listening on $GatewayPort"
  } else {
    Start-Process openclaw -ArgumentList "gateway run" -WindowStyle Hidden
    if (Wait-Listen -Port $GatewayPort -TimeoutSeconds 25) {
      Write-Log "gateway started on $GatewayPort"
    } else {
      Write-Log "gateway failed to listen on $GatewayPort"
    }
  }

  Write-Log "autostart end"
} catch {
  Write-Log ("autostart error: " + $_.Exception.Message)
  exit 1
}
