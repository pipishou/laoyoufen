# 部署手册 · 广西老友粉模拟器 → 阿里云 ECS

目标机：`8.134.86.249`（cn-guangzhou，`i-7xvhaqyhhht7o1nhag7w`，Alibaba Cloud Linux 3，2C2G，已有 nginx 1.24 + `/usr/local/bin/python3` 3.11）。
参考：`阿里云ECS部署经验-20261110.md`（§4 的坑全部适用：Base64 传命令、tar 必须 Push-Location、default.d 只放 location、别 yum update、别碰 `/course-08.html` 与 8765 的 aimicro）。

## 0. 这台机器上最终会长成这样

```
/usr/share/nginx/html/laoyoufen/          游戏静态站点（Vite 产物，含 assets/）
/usr/share/nginx/html/laoyoufen.prev/     上一版（回滚用）
/opt/laoyoufen/app.py                     服务端（标准库 HTTP，无第三方依赖）
/opt/laoyoufen/events.json                32 条事件表（喂给 AI 当上下文，免模型瞎编）
/etc/laoyoufen/api.env                    密钥与令牌（0640 root:laoyoufen）
/var/lib/laoyoufen/playtest/*.json        每份试玩记录（一份一个文件）
/var/lib/laoyoufen/playtest/index.jsonl   试玩记录索引（追加写）
/var/lib/laoyoufen/ai_cache.jsonl         AI 文案缓存（eventId:month:day → 文案）
/etc/systemd/system/laoyoufen-api.service
/etc/nginx/default.d/laoyoufen.conf       两个 location：静态 + 反代
```

外网入口：

| 路径 | 说明 |
|---|---|
| `http://8.134.86.249/laoyoufen/` | 游戏（手机/PC 都能开） |
| `http://8.134.86.249/laoyou-api/health` | 健康检查（`ai:true/false` 表示 key 是否生效） |
| `POST /laoyou-api/playtest` | 试玩记录上传（游戏自己调，无需人管） |
| `POST /laoyou-api/event` | AI 事件文案（服务端持 key，浏览器里看不到） |
| `GET /laoyou-api/playtest`、`/stats` | 需要 `x-admin-token`，无 token 返回 401 |

## 1. 第一次：把公钥装上（唯一需要人手动做的一步）

ECS 只开 publickey 登录，本机没有它的私钥。已生成一对部署专用密钥：

- 私钥 `deploy/ecs_ed25519`（**已在 .gitignore 里，别提交**）
- 公钥 `deploy/ecs_ed25519.pub`

把它贴到 ECS 上——阿里云控制台 → 该实例 → 远程命令/云助手（RunShellScript），粘贴：

```bash
mkdir -p /root/.ssh && chmod 700 /root/.ssh && grep -q 'laoyoufen-deploy' /root/.ssh/authorized_keys 2>/dev/null || echo 'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAINFXAdV1aZ0Ng5bD9l7ry9FrAhhlImRP2Pdy51nG3n8l laoyoufen-deploy' >> /root/.ssh/authorized_keys; chmod 600 /root/.ssh/authorized_keys; echo OK
```

想自己确认这行是什么：`.\deploy\deploy.ps1 -Bootstrap` 会打印同一条（带上真实公钥）。

## 2. 之后每次上线：一条命令

```powershell
cd D:\项目\REA\REA\重构\老友粉店
.\deploy\deploy.ps1
```

它做五件事：tsc + vitest + vite build → 打包 `dist/ server/ deploy/`（约 0.36 MB，md5 打印出来对账）→ scp 到 `/tmp` → 远程跑 `deploy/remote-install.sh` → 外网验 `/`、`/course-08.html`（老页面必须还 200）、`/laoyoufen/`、`/laoyou-api/health`。

只想发前端、不改后端：`.\deploy\deploy.ps1 -SkipBuild`（用现有 `dist/`）。

## 3. 首次部署后要填两个值

`/etc/laoyoufen/api.env`（安装脚本会生成模板，已存在则不覆盖）：

```ini
DEEPSEEK_API_KEY=sk-...        # 服务端 AI 文案用；没有就退化为本地模板，游戏照常能玩
LAOYOU_ADMIN_TOKEN=随机串       # 拉试玩记录/统计要用
LAOYOU_ALLOW_ORIGIN=http://8.134.86.249
LAOYOU_AI_MODEL=deepseek-chat
```

改完 `systemctl restart laoyoufen-api`，然后 `curl http://127.0.0.1:8767/health` 看 `ai` 是否为 `true`。

## 4. 埋点与飞轮在线之后怎么转

1. 玩家在 `http://8.134.86.249/laoyoufen/` 玩，**每跨一天自动 POST 一次**（前端 90 秒节流，关页用 `sendBeacon` 兜底；不足 60 分钟游戏时间的会话不上传）。
2. 服务端落到 `/var/lib/laoyoufen/playtest/<id>.json` + `index.jsonl`，`GET /laoyou-api/stats` 立刻能看到人数化的均值。
3. 拉回来做本地报告：

```powershell
$t = "REPLACE_ADMIN_TOKEN"
Invoke-RestMethod "http://8.134.86.249/laoyou-api/playtest" -Headers @{"x-admin-token"=$t} |
  ConvertTo-Json -Depth 6 | Out-File playtest-index.json -Encoding utf8
# 单份详情：GET /laoyou-api/playtest/<id>
D:\tools\anaconda\python.exe tools\reviewer\playtest_ingest.py --file game\data\playtest\playtest-YYYYMMDD.json
```

`playtest_ingest.py` 会判 P24 无聊区（连续 ≥5 天营收持平）、流失原因构成、日均碗数 vs 4 座 71.2 / 8 座 113.4 产能线。

4. AI 文案这一齿：`game/.env.production` 里 `VITE_AI_PROXY_URL=/laoyou-api/event`，前端 800ms 超时；服务端带缓存（同 `eventId:month:day` 只调一次），输出含阿拉伯数字即丢弃回落本地模板——红线 C9「AI 不产数字」在服务端也守。

## 5. 回滚

```bash
# 前端
rm -rf /usr/share/nginx/html/laoyoufen && mv /usr/share/nginx/html/laoyoufen.prev /usr/share/nginx/html/laoyoufen
# nginx
cp /etc/nginx/default.d/laoyoufen.conf.bak.YYYYMMDDHHMM /etc/nginx/default.d/laoyoufen.conf && nginx -t && systemctl reload nginx
# 服务
systemctl disable --now laoyoufen-api
```

数据永远在 `/var/lib/laoyoufen/`，回滚不动它。

## 6. 交付前检查（照抄经验文档 §5.4）

- [ ] 本地 `dist/` 字节数 = 线上 `Content-Length`
- [ ] `nginx -t` 通过
- [ ] `/course-08.html` 仍 200（老页面没被弄坏）
- [ ] `/laoyoufen/` 与 `/laoyoufen`（不带斜杠）都能开
- [ ] 手机浏览器能开（375×667 竖屏有「把手机横过来」提示）
- [ ] 页面里没有 `localhost` / `127.0.0.1`
- [ ] `GET /laoyou-api/playtest` 无 token → **401**（不是 200）
- [ ] 上传超 512KB → **413**
- [ ] 部署包 md5 本地与服务器一致
