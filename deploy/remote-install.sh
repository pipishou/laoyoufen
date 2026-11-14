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
sleep 1
curl -fsS http://127.0.0.1:8767/health && echo
curl -fsS -o /dev/null -w 'static %{http_code}\n' http://127.0.0.1/laoyoufen/
echo
log "done. 外网检查： http://8.134.86.249/laoyoufen/  与  http://8.134.86.249/laoyou-api/health"
