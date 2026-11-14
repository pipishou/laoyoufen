# 不用 SSH：走云助手 RunCommand（阿里云现在推荐这条，SSH 直连不是默认路径）
#
# 依赖：aliyun CLI 3.5+ 已登录（aliyun configure --mode OAuth）
#   .\deploy\deploy-cli.ps1 -Health        # 只体检，不改任何东西
#   .\deploy\deploy-cli.ps1                # 构建 → 打包 → 分块上传 → 远程安装 → 外网验证
#
# 为什么分块 base64：RunCommand 走 cmd.exe，命令行总长约 5,000 字符上限（经验文档 §4.2），
# 4,000 字符一块实测最稳；0.36MB 的包 ≈ 120 块，约 3 分钟。

param(
  [string]$RegionId = "cn-guangzhou",
  [string]$InstanceId = "i-7xvhaqyhhht7o1nhag7w",
  [string]$Profile = "laoyou",
  [switch]$Health,
  [switch]$SkipBuild
)

$ErrorActionPreference = "Stop"
$env:Path = "C:\AliyunCLI;$env:Path"
$root = Split-Path -Parent $PSScriptRoot
$game = Join-Path $root "game"

function AL { param([string[]]$a) & "C:\AliyunCLI\aliyun.exe" @a "--profile" $Profile 2>&1 | Out-String }

function RC {
  param([string]$cmd, [int]$timeoutSec = 300)
  $e = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($cmd))
  $o = AL @("ecs", "RunCommand", "--RegionId", $RegionId, "--InstanceId.1", $InstanceId,
            "--Type", "RunShellScript", "--CommandContent", $e, "--ContentEncoding", "Base64",
            "--Timeout", "$timeoutSec")
  try { $id = ($o | ConvertFrom-Json).InvokeId } catch { return @{ ok = $false; out = $o } }
  if (-not $id) { return @{ ok = $false; out = $o } }
  for ($k = 0; $k -lt 200; $k++) {
    Start-Sleep -Milliseconds 700
    $r = AL @("ecs", "DescribeInvocationResults", "--RegionId", $RegionId,
              "--InstanceId", $InstanceId, "--InvokeId", $id)
    try { $res = ($r | ConvertFrom-Json).Invocation.InvocationResults.InvocationResult[0] } catch { continue }
    if ($res.InvocationStatus -in 'Success', 'Failed') {
      $txt = ''
      if ($res.Output) { $txt = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($res.Output)) }
      return @{ ok = ($res.InvocationStatus -eq 'Success'); out = $txt.Trim() }
    }
  }
  return @{ ok = $false; out = 'TIMEOUT' }
}

# ---------- 0. 身份与机器 ----------
Write-Host "[0/5] identity"
(AL @("sts", "GetCallerIdentity") | ConvertFrom-Json).Arn

if ($Health) {
  $h = RC "echo alive; hostname; cat /etc/os-release | head -2; nginx -v 2>&1; /usr/local/bin/python3 -V 2>&1; df -h / | tail -1; free -m | sed -n 2p; systemctl is-active nginx; ls /usr/share/nginx/html | head"
  "ok=$($h.ok)"; $h.out
  return
}

# ---------- 1. 构建 ----------
if (-not $SkipBuild) {
  Write-Host "[1/5] build"
  Push-Location $game
  npx tsc --noEmit; if ($LASTEXITCODE -ne 0) { Pop-Location; throw "typecheck failed" }
  npx vitest run | Select-Object -Last 3; if ($LASTEXITCODE -ne 0) { Pop-Location; throw "tests failed" }
  npx vite build; if ($LASTEXITCODE -ne 0) { Pop-Location; throw "build failed" }
  Pop-Location
}

# ---------- 2. 打包 ----------
Write-Host "[2/5] package"
$stage = Join-Path $env:TEMP "laoyoufen-stage"
$tgz = Join-Path $env:TEMP "laoyoufen-deploy.tar.gz"
if (Test-Path $stage) { Remove-Item $stage -Recurse -Force }
New-Item -ItemType Directory -Path $stage -Force | Out-Null
Copy-Item (Join-Path $game "dist") (Join-Path $stage "dist") -Recurse
New-Item -ItemType Directory -Path (Join-Path $stage "server") -Force | Out-Null
Copy-Item (Join-Path $root "server\app.py") (Join-Path $stage "server\app.py")
Copy-Item (Join-Path $root "server\events.json") (Join-Path $stage "server\events.json")
Copy-Item (Join-Path $root "deploy") (Join-Path $stage "deploy") -Recurse
Remove-Item (Join-Path $stage "deploy\ecs_ed25519") -Force -ErrorAction SilentlyContinue
if (Test-Path $tgz) { Remove-Item $tgz -Force }
Push-Location $stage
tar.exe -czf $tgz "dist" "server" "deploy"
Pop-Location
$md5 = (Get-FileHash $tgz -Algorithm MD5).Hash.ToLower()
Write-Host ("      tar = {0:N2} MB  md5 = {1}" -f ((Get-Item $tgz).Length / 1MB), $md5)

# ---------- 3. 分块上传 ----------
Write-Host "[3/5] upload (base64 4000/块)"
$b64 = [Convert]::ToBase64String([IO.File]::ReadAllBytes($tgz))
$CH = 4000
$chunks = @()
for ($i = 0; $i -lt $b64.Length; $i += $CH) { $chunks += $b64.Substring($i, [Math]::Min($CH, $b64.Length - $i)) }
Write-Host "      chunks = $($chunks.Count)"
$h = RC "rm -rf /tmp/sb /tmp/laoyoufen-deploy.tar.gz; mkdir -p /tmp/sb; echo ready"
if (-not $h.ok) { throw "远程准备失败：$($h.out)" }
$n = 0
foreach ($c in $chunks) {
  $n++
  $r = RC ("printf '%s' '" + $c + "' > /tmp/sb/{0:d3}.b64" -f $n) 300
  if (-not $r.ok) { throw "第 $n 块失败：$($r.out)" }
  if ($n % 20 -eq 0) { Write-Host "      $n / $($chunks.Count)" }
}
$j = RC "cat /tmp/sb/*.b64 > /tmp/lf.b64 && base64 -d /tmp/lf.b64 > /tmp/laoyoufen-deploy.tar.gz && md5sum /tmp/laoyoufen-deploy.tar.gz && rm -rf /tmp/sb"
$j.out
if ($j.out -notmatch [regex]::Escape($md5)) { Write-Host "      ⚠ md5 与本地不一致（本地 $md5），下面安装会失败" }

# ---------- 4. 远程安装 ----------
Write-Host "[4/5] install"
$inst = RC @"
set -e
rm -rf /tmp/lfd && mkdir -p /tmp/lfd
tar -xzf /tmp/laoyoufen-deploy.tar.gz -C /tmp/lfd
STAGE=/tmp/lfd bash /tmp/lfd/deploy/remote-install.sh
"@ 600
$inst.out

# ---------- 5. 外网验证 ----------
Write-Host "[5/5] verify"
$ip = "8.134.86.249"
foreach ($u in @("http://$ip/", "http://$ip/course-08.html", "http://$ip/laoyoufen/", "http://$ip/laoyou-api/health")) {
  try {
    $r = Invoke-WebRequest $u -UseBasicParsing -TimeoutSec 15
    "{0,-45} {1}  {2} B" -f $u, $r.StatusCode, $r.RawContentLength
  } catch { "{0,-45} {1}" -f $u, $_.Exception.Response.StatusCode }
}
Write-Host "`n游戏地址： http://$ip/laoyoufen/"
