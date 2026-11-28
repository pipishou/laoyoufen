#!/usr/bin/env bash
# 在 ECS 上跑：把 /tmp/laoyoufen-deploy/ 里的产物装到位。
# 幂等：重复执行只更新文件，不重建用户、不重复改 nginx。
set -euo pipefail

STAGE=${STAGE:-/tmp/laoyoufen-deploy}
WEBROOT=/usr/share/nginx/html/laoyoufen
APP=/opt/laoyoufen
DATA=/var/lib/laoyoufen
ETC=/etc/laoyoufen
SVC=laoyoufen-api

log() { printf '[deploy] %s\n' "$*"; }

[ -d "$STAGE" ] || { echo "stage $STAGE 不存在"; exit 1; }

# 0) 前置检查（这台机器已有 nginx，别重装）
command -v nginx >/dev/null || { echo "没有 nginx，先 dnf install -y nginx"; exit 1; }
PY=/usr/local/bin/python3
[ -x "$PY" ] || PY=$(command -v python3.11 || command -v python3)
log "python = $PY ($($PY -V 2>&1))"

# 1) 用户与目录（先建组：部分发行版 useradd --system 不自动建组）
id laoyoufen >/dev/null 2>&1 || {
  groupadd --system laoyoufen 2>/dev/null || true
  useradd --system -g laoyoufen -d "$APP" -s /sbin/nologin laoyoufen
  log "created user laoyoufen"
}
mkdir -p "$APP" "$DATA/playtest" "$ETC" "$WEBROOT"

# 2) 静态站点：全量替换（保留上一版备份，方便回滚）
if [ -d "$WEBROOT" ]; then
  rm -rf "${WEBROOT}.prev"
  cp -a "$WEBROOT" "${WEBROOT}.prev"
fi
rm -rf "$WEBROOT"
mkdir -p "$WEBROOT"
cp -a "$STAGE/dist/." "$WEBROOT/"
find "$WEBROOT" -type d -exec chmod 755 {} \;
find "$WEBROOT" -type f -exec chmod 644 {} \;
chown -R nginx:nginx "$WEBROOT"
log "static -> $WEBROOT ($(find "$WEBROOT" -type f | wc -l) files)"

# 3) 服务端代码
cp -a "$STAGE/server/app.py" "$APP/app.py"
[ -f "$STAGE/server/events.json" ] && cp -a "$STAGE/server/events.json" "$APP/events.json"
chown -R laoyoufen:laoyoufen "$APP" "$DATA"
chmod 750 "$DATA"
log "app -> $APP/app.py"

# 4) 配置（已存在就不覆盖，免得把 key 冲掉）
if [ ! -f "$ETC/api.env" ]; then
  cat > "$ETC/api.env" <<'ENVEOF'
# 服务端持 key，浏览器里不出现
DEEPSEEK_API_KEY=
# 管理端点令牌：GET /laoyou-api/playtest 与 /stats 需要它
LAOYOU_ADMIN_TOKEN=CHANGE_ME
# 只允许线上站点跨域（同源其实用不到）
LAOYOU_ALLOW_ORIGIN=http://8.134.86.249
LAOYOU_AI_MODEL=deepseek-chat
ENVEOF
  chmod 640 "$ETC/api.env"
  chown root:laoyoufen "$ETC/api.env" 2>/dev/null || true
  log "写入 $ETC/api.env（DEEPSEEK_API_KEY 与 LAOYOU_ADMIN_TOKEN 需要你填）"
fi

# 5) systemd
cp -a "$STAGE/deploy/laoyoufen-api.service" "/etc/systemd/system/${SVC}.service"
sed -i "s#/usr/local/bin/python3#${PY}#" "/etc/systemd/system/${SVC}.service"
systemctl daemon-reload
systemctl enable --now "$SVC" >/dev/null
systemctl restart "$SVC"
sleep 1
log "service: $(systemctl is-active $SVC)"

# 5b) 每日试玩日报（飞轮第 5 齿：采集到的东西得自己变成能读的东西）
if [ -f "$STAGE/deploy/laoyoufen-digest.service" ]; then
  cp -a "$STAGE/deploy/laoyoufen-digest.service" /etc/systemd/system/laoyoufen-digest.service
  cp -a "$STAGE/deploy/laoyoufen-digest.timer" /etc/systemd/system/laoyoufen-digest.timer
  sed -i "s#/usr/local/bin/python3#${PY}#" /etc/systemd/system/laoyoufen-digest.service
  systemctl daemon-reload
  systemctl enable --now laoyoufen-digest.timer >/dev/null
  log "digest timer: $(systemctl is-active laoyoufen-digest.timer)  next: $(systemctl show -p NextElapseUSecRealtime --value laoyoufen-digest.timer 2>/dev/null)"
fi

# 6) nginx（default.d 只加 location；写 conf.d 会报 location not allowed）
if [ -f /etc/nginx/default.d/laoyoufen.conf ]; then
  cp -a /etc/nginx/default.d/laoyoufen.conf "/etc/nginx/default.d/laoyoufen.conf.bak.$(date +%Y%m%d%H%M)"
fi
# 我们的 conf 文件是完整的 server{} 包装；default.d 里只能放 location，剥壳
{
  echo "# managed by laoyoufen deploy $(date +%Y-%m-%d)"
  sed -n '/^    location = \/laoyoufen/,$p' "$STAGE/deploy/nginx-laoyoufen.conf" | sed '$d'
} > /etc/nginx/default.d/laoyoufen.conf
nginx -t
systemctl reload nginx
log "nginx reloaded"

# 7) 自检
#
# P549：以前这里只查 127.0.0.1 且**不带 Host 头**，于是 nginx 用默认 server 回答，
# 恰好是 80 上第一个 server —— 2026-11-27 那次那个 server 是别的项目的「全站 301」，
# 结果本脚本说 reload 成功、curl 说 200，外网用户看到的是 404。
#
# 现在查三件事：
#   a) 带真实 Host 访问三条路径 —— 必须 200（不允许 301/404）
#   b) 带一个**不存在的 Host** 访问 /laoyoufen/ —— 也必须 200。
#      这一条才是真正的防线：它证明我们的 location 挂在「80 的默认 server」里。
#      11-27 的坏配置在 (a) 上可能侥幸过关（server_name 恰好匹配），但在 (b) 上必红。
#   c) 443 上 beta 仍然 200（-k：证书 CN 是 sslip.io，IP 访问必然告警；这条只证明没弄坏别人）
sleep 1
curl -fsS http://127.0.0.1:8767/health && echo
HOSTHDR="Host: 8.134.86.249"
for p in / /laoyoufen/ /laoyou-api/health; do
  code=$(curl -sS -o /dev/null -m 8 -w '%{http_code}' -H "$HOSTHDR" "http://127.0.0.1$p" || echo 000)
  echo "  host-routed $p -> $code"
  case "$code" in
    200) ;;
    301|302|404|000) log "✗ $p 返回 $code —— 80 的默认 server 被别的项目抢走了（conf.d 里的 301），或本站 location 没挂上"; exit 8 ;;
    *) log "✗ $p 返回 $code"; exit 8 ;;
  esac
done

# b) 默认 server 归属
BO=$(curl -sS -o /dev/null -m 8 -w '%{http_code}' -H "Host: laoyoufen-deploy-gate.invalid" http://127.0.0.1/laoyoufen/ || echo 000)
echo "  default-server /laoyoufen/ -> $BO"
if [ "$BO" != "200" ]; then
  log "✗ 用一个不存在的 Host 访问 /laoyoufen/ 得到 $BO。"
  log "  说明 80 上第一个 server（默认 server）不是你，或者它把路径 301 走了。"
  log "  查：grep -rl 'listen.*80' /etc/nginx/conf.d/ | xargs grep -l 'return 301'"
  log "  典型元凶：别的项目的 conf.d 文件写了 listen 80 + location / { return 301 https://...; }"
  exit 8
fi

# c) 443 没被弄坏
BW=$(curl -sS -k -o /dev/null -m 8 -w '%{http_code}' -H "Host: 8-134-86-249.sslip.io" https://127.0.0.1/x7k2beta/ || echo 000)
echo "  https /x7k2beta/ -> $BW"
[ "$BW" = "200" ] || log "⚠ 443 上 beta 返回 $BW（不是本站的事，但同机共享 nginx，提醒去看一眼）"

echo
log "done. 外网检查： http://8.134.86.249/laoyoufen/  与  http://8.134.86.249/laoyou-api/health"
