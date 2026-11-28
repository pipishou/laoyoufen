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

# ---------- 1.5 服务端事件表对账 ----------
# server/events.json 是喂模型用的副本；游戏里加了事件而忘了重导，线上就会悄悄退回旧表
# （批 N 之后 health 一直是 events 32 就是这么来的，P420）。每次打包前跑一遍生成器：
# 一致就不写盘，不一致就当场重写；生成器自己会断言写完的行数与 EVENTS 相同。
Write-Host "[1.5/5] server table"
Push-Location $game
npm run -s gen:server 2>&1 | Select-Object -Last 2
if ($LASTEXITCODE -ne 0) { Pop-Location; throw "server/events.json is out of sync with the game" }
Pop-Location

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

# ---------- 5. 外网验证（P549：这里以前只断言 http，2026-11-27 站点 404 了一整天它还报成功） ----------
#
# 那次事故的形态：同机另一个项目加了 conf.d 的 80 全站 301，而 443 上没有本站的 location。
# 于是 `http://IP/laoyoufen/` → 301 → `https://IP/laoyoufen/` → 404。
# 旧代码用 Invoke-WebRequest（默认跟随 301），拿到的 404 被 catch 成一行抱怨、退出码仍是 0
# —— 部署脚本说成功，站点其实打不开。现在改成：每条都断言确切状态码，任何一条不中就把
# 退出码置 1，并直接指向站点门。
Write-Host "[5/5] verify"
$ip = "8.134.86.249"
$bad = @()

function Check {
  param([string]$label, [string]$url, [int]$want, [switch]$Insecure)

  # 为什么不用 Invoke-WebRequest（都实测过，PS 5.1 上两处会骗人）：
  #   1. `-MaximumRedirection 0` 遇到 301 不返回 Response，而是抛
  #      InvalidOperationException「对象的当前状态使该操作无效」，且 Exception.Response 是 null
  #      —— 我们的 catch 只能拿到 -1，301 和「连不上」分不开。
  #   2. `-SkipCertificateCheck` 是 PS 6+ 的参数，5.1 上根本没有；而 5.1 默认还只开 TLS 1.0，
  #      打 https 会报「基础连接已经关闭: 发送时发生错误」。
  # HttpWebRequest 允许 AllowAutoRedirect=$false，拿得到 301 + Location，稳。
  if ($Insecure) {
    # 证书 CN 是 8-134-86-249.sslip.io，用 IP 访问必然告警，所以 beta 那条要跳过校验
    [System.Net.ServicePointManager]::ServerCertificateValidationCallback = { $true }
  }
  [System.Net.ServicePointManager]::SecurityProtocol = [System.Net.SecurityProtocolType]::Tls12

  $got = -1; $len = 0; $loc = ''
  try {
    $req = [System.Net.HttpWebRequest]::Create($url)
    $req.AllowAutoRedirect = $false      # 301 就是 301，不许被悄悄跟到 404 上去
    $req.Timeout = 15000
    $req.ReadWriteTimeout = 15000
    $req.UserAgent = 'laoyoufen-deploy/1'
    $resp = $req.GetResponse()
    $got = [int]$resp.StatusCode
    $loc = [string]$resp.Headers['Location']
    try { $len = [int]$resp.ContentLength } catch { $len = 0 }
    $resp.Close()
  } catch [System.Net.WebException] {
    if ($_.Exception.Response) {
      $got = [int]$_.Exception.Response.StatusCode
      $loc = [string]$_.Exception.Response.Headers['Location']
    }
  } finally {
    if ($Insecure) { [System.Net.ServicePointManager]::ServerCertificateValidationCallback = $null }
  }

  $mark = if ($got -eq $want) { "ok  " } else { "FAIL" }
  $tail = if ($loc) { "  -> $loc" } elseif ($len) { "  $len B" } else { "" }
  "{0}  {1,-46} {2} (期望 {3}){4}" -f $mark, $label, $got, $want, $tail
  if ($got -ne $want) { $script:bad += "$label -> $got (期望 $want)" }
}

Check "home 目录页"            "http://$ip/"                 200
Check "game 首页"              "http://$ip/laoyoufen/"       200
Check "game api health"        "http://$ip/laoyou-api/health" 200
Check "course-08"              "http://$ip/course-08.html"   200
Check "ai-course"              "http://$ip/ai-course/"       200
Check "beta http 必须跳 https" "http://$ip/x7k2beta/"        301
Check "beta https 可达"        "https://$ip/x7k2beta/"       200 -Insecure

if ($bad.Count -gt 0) {
  Write-Host "`n站点验证失败（$($bad.Count) 条）：" -ForegroundColor Red
  $bad | ForEach-Object { Write-Host "  - $_" -ForegroundColor Red }
  Write-Host "`n定位：python -X utf8 tools/gate/site_gate.py   # 全矩阵，含资产与缓存头" -ForegroundColor Yellow
  Write-Host "常见根因：conf.d 里别的项目写了 listen 80 + location / 的 301（会抢走默认 server），" -ForegroundColor Yellow
  Write-Host "          或 443 的 server 没 include 本站的 default.d 片段。" -ForegroundColor Yellow
  Write-Host "`n游戏地址： http://$ip/laoyoufen/  （当前不可用）"
  exit 1
}
Write-Host "`n游戏地址： http://$ip/laoyoufen/"
