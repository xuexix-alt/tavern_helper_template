param(
  [string]$ApiKey = $env:OPENCLAW_API_KEY,
  [string]$ProviderBaseUrl = "https://apiport.cc.cd",
  [string]$ProviderName = "codex-vip",
  [string]$ModelId = "gpt-5.3-codex",
  [int]$GatewayPort = 18789,
  [int]$ProxyPort = 19080,
  [string]$WorkspaceName = "workspace-lite",
  [switch]$SkipInstall
)

$ErrorActionPreference = "Stop"

function Write-Step([string]$msg) {
  Write-Host "[STEP] $msg" -ForegroundColor Cyan
}

function Write-Ok([string]$msg) {
  Write-Host "[OK] $msg" -ForegroundColor Green
}

function Write-Warn([string]$msg) {
  Write-Host "[WARN] $msg" -ForegroundColor Yellow
}

function Invoke-Checked([scriptblock]$script, [string]$errorText) {
  & $script
  if ($LASTEXITCODE -ne 0) {
    throw $errorText
  }
}

function Set-ConfigString([string]$path, [string]$value) {
  Invoke-Checked { & openclaw config set $path $value | Out-Null } "config set failed: $path"
}

function Set-ConfigJson([string]$path, [string]$jsonText) {
  Invoke-Checked { & openclaw config set --strict-json $path $jsonText | Out-Null } "config set --strict-json failed: $path"
}

function Wait-Port([int]$Port, [int]$TimeoutSeconds = 20) {
  $sw = [System.Diagnostics.Stopwatch]::StartNew()
  while ($sw.Elapsed.TotalSeconds -lt $TimeoutSeconds) {
    $listener = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
    if ($listener) { return $true }
    Start-Sleep -Milliseconds 500
  }
  return $false
}

if ([string]::IsNullOrWhiteSpace($ApiKey)) {
  $ApiKey = Read-Host "请输入 $ProviderName 的 API Key"
}
if ([string]::IsNullOrWhiteSpace($ApiKey)) {
  throw "API Key 不能为空。可传参 -ApiKey 或设置环境变量 OPENCLAW_API_KEY。"
}

$userHome = $env:USERPROFILE
$openclawDir = Join-Path $userHome ".openclaw"
$workspaceDir = Join-Path $openclawDir $WorkspaceName
$proxyScriptPath = Join-Path $openclawDir "local-proxy-capture.js"
$proxyCaptureDir = Join-Path $openclawDir "proxy-capture"
$proxyBaseUrl = "http://127.0.0.1:$ProxyPort"
$agentModelsPath = Join-Path $openclawDir "agents\main\agent\models.json"

Write-Step "检查 Node.js"
Invoke-Checked { & node -v | Out-Null } "未检测到 Node.js，请先安装 Node.js 22+。"
Write-Ok "Node.js 可用"

Write-Step "检查 OpenClaw"
$openclawExists = $null -ne (Get-Command openclaw -ErrorAction SilentlyContinue)
if (-not $openclawExists) {
  if ($SkipInstall) {
    throw "未检测到 openclaw，且你传了 -SkipInstall。"
  }
  Write-Step "自动安装 OpenClaw"
  Invoke-Expression (Invoke-WebRequest -UseBasicParsing https://molt.bot/install.ps1).Content
}
Invoke-Checked { & openclaw --version | Out-Null } "openclaw 不可用，安装失败。"
Write-Ok "OpenClaw 可用"

Write-Step "创建工作区目录"
New-Item -ItemType Directory -Path $workspaceDir -Force | Out-Null
Set-Content -Path (Join-Path $workspaceDir "AGENTS.md") -Value "Keep replies concise. Use tools only when needed." -Encoding UTF8
Write-Ok "工作区已创建: $workspaceDir"

Write-Step "写入本地兼容代理脚本"
New-Item -ItemType Directory -Path $proxyCaptureDir -Force | Out-Null
$proxyScript = @"
const http = require("http");
const fs = require("fs");
const { URL } = require("url");
const path = require("path");

const PORT = $ProxyPort;
const TARGET = "$ProviderBaseUrl";
const outDir = path.join(process.env.USERPROFILE || ".", ".openclaw", "proxy-capture");
fs.mkdirSync(outDir, { recursive: true });

let seq = 0;
const server = http.createServer((req, res) => {
  const chunks = [];
  req.on("data", (c) => chunks.push(c));
  req.on("end", async () => {
    seq += 1;
    const id = String(seq).padStart(4, "0");
    const bodyBuf = Buffer.concat(chunks);
    const bodyText = bodyBuf.toString("utf8");
    fs.writeFileSync(
      path.join(outDir, `req-${id}.json`),
      JSON.stringify(
        {
          time: new Date().toISOString(),
          method: req.method,
          path: req.url,
          headers: req.headers,
          bodyBytes: bodyBuf.length,
          bodyPreview: bodyText.slice(0, 20000),
        },
        null,
        2
      ),
      "utf8"
    );
    try {
      const upstreamUrl = new URL(req.url, TARGET).toString();
      const headers = { ...req.headers };
      delete headers.host;
      delete headers.connection;
      delete headers["content-length"];
      delete headers["user-agent"];
      for (const k of Object.keys(headers)) {
        if (k.startsWith("x-stainless-")) delete headers[k];
      }
      headers["user-agent"] = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) OpenClawProxy/1.0";

      const upstream = await fetch(upstreamUrl, {
        method: req.method,
        headers,
        body: req.method === "GET" || req.method === "HEAD" ? undefined : bodyBuf,
      });
      const respBuf = Buffer.from(await upstream.arrayBuffer());
      const respText = respBuf.toString("utf8");
      fs.writeFileSync(
        path.join(outDir, `resp-${id}.json`),
        JSON.stringify(
          {
            time: new Date().toISOString(),
            status: upstream.status,
            statusText: upstream.statusText,
            headers: Object.fromEntries(upstream.headers.entries()),
            bodyBytes: respBuf.length,
            bodyPreview: respText.slice(0, 50000),
          },
          null,
          2
        ),
        "utf8"
      );
      res.writeHead(upstream.status, Object.fromEntries(upstream.headers.entries()));
      res.end(respBuf);
    } catch (err) {
      fs.writeFileSync(path.join(outDir, `err-${id}.txt`), String(err && err.stack ? err.stack : err), "utf8");
      res.writeHead(502, { "content-type": "text/plain; charset=utf-8" });
      res.end("proxy error");
    }
  });
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`proxy listening on http://127.0.0.1:${PORT}`);
});
"@
Set-Content -Path $proxyScriptPath -Value $proxyScript -Encoding UTF8
Write-Ok "代理脚本已写入: $proxyScriptPath"

Write-Step "写入 OpenClaw 配置"
Set-ConfigString "models.mode" "merge"
Set-ConfigString "models.providers.$ProviderName.baseUrl" $proxyBaseUrl
Set-ConfigString "models.providers.$ProviderName.apiKey" $ApiKey
Set-ConfigString "models.providers.$ProviderName.api" "openai-responses"
Set-ConfigString "models.providers.$ProviderName.models[0].id" $ModelId
Set-ConfigString "models.providers.$ProviderName.models[0].name" $ModelId
Set-ConfigJson "models.providers.$ProviderName.models[0].reasoning" "false"
Set-ConfigJson "models.providers.$ProviderName.models[0].input" "[`"text`"]"
Set-ConfigJson "models.providers.$ProviderName.models[0].contextWindow" "40000"
Set-ConfigJson "models.providers.$ProviderName.models[0].maxTokens" "8192"
Set-ConfigJson "models.providers.$ProviderName.models[0].cost" "{`"input`":1.75,`"output`":14.0,`"cacheRead`":0.175,`"cacheWrite`":0}"

Set-ConfigString "agents.defaults.model.primary" "$ProviderName/$ModelId"
Set-ConfigString "agents.defaults.workspace" $workspaceDir
Set-ConfigJson "agents.defaults.skipBootstrap" "true"

Set-ConfigString "gateway.mode" "local"
Set-ConfigJson "gateway.port" "$GatewayPort"
Set-ConfigString "gateway.bind" "auto"
Set-ConfigJson "gateway.auth.rateLimit" "{`"maxAttempts`":10,`"windowMs`":60000,`"lockoutMs`":300000}"
Set-ConfigJson "gateway.controlUi.allowedOrigins" "[`"http://127.0.0.1:$GatewayPort`",`"http://localhost:$GatewayPort`",`"https://127.0.0.1:$GatewayPort`",`"https://localhost:$GatewayPort`"]"
Write-Ok "主配置写入完成"

Write-Step "同步 agent 侧 models.json（避免新机首次运行读取旧源）"
$agentModelsDir = Split-Path $agentModelsPath -Parent
New-Item -ItemType Directory -Path $agentModelsDir -Force | Out-Null
if (Test-Path $agentModelsPath) {
  $agentModels = Get-Content $agentModelsPath -Raw | ConvertFrom-Json
} else {
  $agentModels = [pscustomobject]@{
    providers = [pscustomobject]@{}
  }
}
if (-not $agentModels.PSObject.Properties["providers"]) {
  $agentModels | Add-Member -NotePropertyName "providers" -NotePropertyValue ([pscustomobject]@{}) -Force
}
$codexProvider = [pscustomobject]@{
  baseUrl = $proxyBaseUrl
  apiKey = $ApiKey
  api = "openai-responses"
  models = @(
    [pscustomobject]@{
      id = $ModelId
      name = $ModelId
      reasoning = $false
      input = @("text")
      cost = [pscustomobject]@{
        input = 1.75
        output = 14.0
        cacheRead = 0.175
        cacheWrite = 0
      }
      contextWindow = 40000
      maxTokens = 8192
      api = "openai-responses"
    }
  )
}
if ($agentModels.providers.PSObject.Properties[$ProviderName]) {
  $agentModels.providers.$ProviderName = $codexProvider
} else {
  $agentModels.providers | Add-Member -NotePropertyName $ProviderName -NotePropertyValue $codexProvider
}
$agentModels | ConvertTo-Json -Depth 20 | Set-Content -Path $agentModelsPath -Encoding UTF8
Write-Ok "agent models.json 已同步: $agentModelsPath"

Write-Step "启动/重启本地代理"
$proxyListeners = Get-NetTCPConnection -LocalPort $ProxyPort -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique
if ($proxyListeners) {
  foreach ($procId in $proxyListeners) {
    Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue
  }
}
Start-Process node -ArgumentList "`"$proxyScriptPath`"" -WindowStyle Hidden
if (-not (Wait-Port -Port $ProxyPort -TimeoutSeconds 20)) {
  throw "本地代理启动失败，端口 $ProxyPort 未监听。"
}
Write-Ok "本地代理在线: $proxyBaseUrl"

Write-Step "启动/重启 OpenClaw 网关"
$gwListeners = Get-NetTCPConnection -LocalPort $GatewayPort -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique
if ($gwListeners) {
  foreach ($procId in $gwListeners) {
    Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue
  }
}
Start-Process openclaw -ArgumentList "gateway run" -WindowStyle Hidden
if (-not (Wait-Port -Port $GatewayPort -TimeoutSeconds 25)) {
  throw "OpenClaw 网关启动失败，端口 $GatewayPort 未监听。"
}
Write-Ok "网关在线: http://127.0.0.1:$GatewayPort/"

Write-Step "执行自检"
Invoke-Checked { & openclaw config validate | Out-Null } "config validate 失败"
$modelStatus = & openclaw models status --plain
Write-Host "当前默认模型: $modelStatus" -ForegroundColor Gray

$probe = & openclaw agent --agent main -m "初始化连通性测试，请简短回复OK" --json 2>&1 | Out-String
if ($probe -match "blocked|403") {
  Write-Warn "检测到 403/blocked。请将 ~/.openclaw/proxy-capture 下最近 req/resp 发给供应商排查。"
} elseif ($probe -match "timed out") {
  Write-Warn "检测到超时。可能是上游拥堵或网络抖动，可稍后重试。"
} else {
  Write-Ok "连通性测试通过"
}

Write-Host ""
Write-Host "初始化完成。" -ForegroundColor Green
Write-Host "聊天页: http://127.0.0.1:$GatewayPort/chat?session=agent%3Amain%3Amain" -ForegroundColor Cyan
Write-Host "控制台: http://127.0.0.1:$GatewayPort/" -ForegroundColor Cyan
