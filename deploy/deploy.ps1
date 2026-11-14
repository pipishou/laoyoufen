# 一键部署到阿里云 ECS（8.134.86.249）
#
# 前提：SSH 能进（公钥已加到服务器）。第一次用：
#   .\deploy\deploy.ps1 -Bootstrap       # 只打印要粘到云助手那行命令
#   在阿里云「云助手 / RunCommand」里粘那行 → 之后 .\deploy\deploy.ps1 就能自己上线
#
# 日常更新：
#   .\deploy\deploy.ps1                  # 构建 → 打包 → 上传 → 远程安装 → 外网验证

param(
  [string]$Server = "8.134.86.249",
  [string]$User   = "root",
  [int]$Port      = 22,
  [string]$Key    = "$PSScriptRoot\ecs_ed25519",
  [switch]$Bootstrap,
  [switch]$SkipBuild
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$game = Join-Path $root "game"
$stage = Join-Path $env:TEMP "laoyoufen-stage"
$tgz = Join-Path $env:TEMP "laoyoufen-deploy.tar.gz"

$pub = (Get-Content "$Key.pub" -Raw).Trim()
if ($Bootstrap) {
  Write-Host "把下面这一行粘到 阿里云 → ECS → 云助手(RunCommand, RunShellScript)：`n"
  Write-Host "mkdir -p /root/.ssh && chmod 700 /root/.ssh && grep -q 'laoyoufen-deploy' /root/.ssh/authorized_keys 2>/dev/null || echo '$pub' >> /root/.ssh/authorized_keys; chmod 600 /root/.ssh/authorized_keys; echo OK"
  Write-Host ""
  return
}

# 1) 构建
if (-not $SkipBuild) {
  Write-Host "[1/5] build"
  Push-Location $game
  npx tsc --noEmit
  if ($LASTEXITCODE -ne 0) { Pop-Location; throw "typecheck failed" }
  npx vitest run | Select-Object -Last 3
  if ($LASTEXITCODE -ne 0) { Pop-Location; throw "tests failed" }
  npx vite build
  if ($LASTEXITCODE -ne 0) { Pop-Location; throw "build failed" }
  Pop-Location
}

# 2) 打包（tar 必须 Push-Location，不能 -C）
Write-Host "[2/5] package"
if (Test-Path $stage) { Remove-Item $stage -Recurse -Force }
New-Item -ItemType Directory -Path $stage -Force | Out-Null
Copy-Item (Join-Path $game "dist") (Join-Path $stage "dist") -Recurse
New-Item -ItemType Directory -Path (Join-Path $stage "server") -Force | Out-Null
Copy-Item (Join-Path $root "server\app.py") (Join-Path $stage "server\app.py")
if (Test-Path (Join-Path $root "server\events.json")) {
  Copy-Item (Join-Path $root "server\events.json") (Join-Path $stage "server\events.json")
}
Copy-Item (Join-Path $root "deploy") (Join-Path $stage "deploy") -Recurse
if (Test-Path $tgz) { Remove-Item $tgz -Force }
Push-Location $stage
tar.exe -czf $tgz "dist" "server" "deploy"
Pop-Location
$md5 = (Get-FileHash $tgz -Algorithm MD5).Hash.ToLower()
Write-Host "      tar = $([Math]::Round((Get-Item $tgz).Length/1MB,2)) MB  md5 = $md5"

$ssh = @("-i", $Key, "-p", $Port, "-o", "StrictHostKeyChecking=accept-new", "-o", "ConnectTimeout=15", "$User@$Server")

# 3) 上传
Write-Host "[3/5] upload"
& scp.exe @("-i", $Key, "-P", $Port, "-o", "StrictHostKeyChecking=accept-new", $tgz, "${User}@${Server}:/tmp/laoyoufen-deploy.tar.gz")
if ($LASTEXITCODE -ne 0) { throw "scp failed" }

# 4) 远程安装
Write-Host "[4/5] install"
$remote = @"
set -e
cd /tmp
md5sum laoyoufen-deploy.tar.gz
rm -rf laoyoufen-deploy && mkdir -p laoyoufen-deploy
tar -xzf laoyoufen-deploy.tar.gz -C laoyoufen-deploy
bash laoyoufen-deploy/deploy/remote-install.sh
"@
$remote | & ssh.exe @ssh "bash -s"
if ($LASTEXITCODE -ne 0) { throw "remote install failed" }

# 5) 外网验证
Write-Host "[5/5] verify"
$checks = @(
  "http://$Server/",
  "http://$Server/course-08.html",
  "http://$Server/laoyoufen/",
  "http://$Server/laoyou-api/health"
)
foreach ($u in $checks) {
  try {
    $r = Invoke-WebRequest $u -UseBasicParsing -TimeoutSec 15
    "{0,-45} {1}  {2} B" -f $u, $r.StatusCode, $r.RawContentLength
  } catch {
    "{0,-45} {1}" -f $u, $_.Exception.Response.StatusCode
  }
}
Write-Host "`n游戏地址： http://$Server/laoyoufen/"
