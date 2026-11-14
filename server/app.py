#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""广西老友粉模拟器 · 服务端（飞轮的后半截）

三件事，只用标准库：
  1. 收试玩记录   POST /playtest      → /var/lib/laoyoufen/playtest/*.json + index.jsonl
  2. 出 AI 文案   POST /event         → DeepSeek 生成南宁味叙述（服务端持 key，带缓存）
  3. 给运营看数   GET  /health, GET /playtest, GET /stats（需 x-admin-token）

设计口径（照项目红线）：
  - AI 只写叙述，不产任何数值；输出里出现阿拉伯数字即丢弃，回落到本地模板。
  - 同一 eventId+month+day 只调一次模型，结果落 cache.jsonl（省钱、且同局文案稳定）。
  - 埋点上传失败不影响游戏：前端自己留 localStorage，Shift+E 还能导出。

用法：
  python3 app.py --host 127.0.0.1 --port 8767 --data /var/lib/laoyoufen \
      --events /opt/laoyoufen/events.json --env /etc/laoyoufen/api.env
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import pathlib
import random
import re
import threading
import time
import urllib.error
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

VERSION = "1.0.0"
MAX_BODY = 512 * 1024
DIGIT = re.compile(r"\d")

OPENERS = [
    "卷帘门推到一半，骑楼下的潮气先涌进来。",
    "锅里的水刚响，巷口已经有人探头。",
    "酸笋味先一步出了门，街坊跟着味道过来。",
    "早市散场，门口的水泥地还湿着。",
    "收音机里播着本地新闻，你把第一锅汤点上。",
]
TAILS = [
    "这条街的消息传得比粉还快。",
    "街坊把这事记在了心里。",
    "有人在本地的群里嘀咕了两句。",
    "日子照旧，锅气没断。",
]


class Cfg:
    def __init__(self) -> None:
        self.data = pathlib.Path(".")
        self.events: dict[str, dict] = {}
        self.ai_key = ""
        self.ai_model = "deepseek-chat"
        self.admin_token = ""
        self.allow_origin = ""
        self.offline_only = False

    @property
    def playtest_dir(self) -> pathlib.Path:
        return self.data / "playtest"

    @property
    def cache_file(self) -> pathlib.Path:
        return self.data / "ai_cache.jsonl"

    @property
    def index_file(self) -> pathlib.Path:
        return self.playtest_dir / "index.jsonl"


CFG = Cfg()
_LOCK = threading.Lock()
_RATE: dict[str, list[float]] = {}


def load_env(path: str) -> None:
    p = pathlib.Path(path)
    if not p.exists():
        return
    for line in p.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))


def load_events(path: str) -> dict[str, dict]:
    p = pathlib.Path(path)
    if not p.exists():
        return {}
    try:
        raw = json.loads(p.read_text(encoding="utf-8"))
    except Exception:
        return {}
    out: dict[str, dict] = {}
    items = raw if isinstance(raw, list) else raw.get("events", [])
    for it in items:
        if isinstance(it, dict) and isinstance(it.get("id"), str):
            out[it["id"]] = it
    return out


def now_iso() -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%S%z")


def short_id() -> str:
    return hashlib.sha1(f"{time.time()}-{random.random()}".encode()).hexdigest()[:8]


def jsonl_append(path: pathlib.Path, obj: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "a", encoding="utf-8") as f:
        f.write(json.dumps(obj, ensure_ascii=False) + "\n")


def rate_ok(ip: str, limit_per_min: int = 60) -> bool:
    now = time.time()
    with _LOCK:
        bucket = [t for t in _RATE.get(ip, []) if now - t < 60]
        if len(bucket) >= limit_per_min:
            _RATE[ip] = bucket
            return False
        bucket.append(now)
        _RATE[ip] = bucket
    return True


def sanitize_line(text: str, max_len: int = 240) -> str | None:
    """红线：不含阿拉伯数字、不是空串、不超长。"""
    if not isinstance(text, str):
        return None
    s = text.strip().replace("\n", " ").replace("\r", " ")
    if not s or DIGIT.search(s):
        return None
    return s[:max_len]


def local_narrative(event_id: str, month: int, day: int) -> dict:
    h = int(hashlib.md5(f"{event_id}:{month}:{day}".encode()).hexdigest()[:8], 16)
    return {"body": OPENERS[h % len(OPENERS)] + TAILS[(h >> 8) % len(TAILS)], "reactions": [], "source": "local"}


def cache_lookup(key: str) -> dict | None:
    f = CFG.cache_file
    if not f.exists():
        return None
    try:
        with open(f, "r", encoding="utf-8") as fh:
            for line in fh:
                line = line.strip()
                if not line:
                    continue
                try:
                    obj = json.loads(line)
                except Exception:
                    continue
                if obj.get("key") == key:
                    return obj.get("payload")
    except OSError:
        return None
    return None


def deepseek_narrative(event_id: str, month: int, day: int, tone: str) -> dict | None:
    if CFG.offline_only or not CFG.ai_key:
        return None
    ev = CFG.events.get(event_id, {})
    title = ev.get("title", event_id)
    body = ev.get("body", "")
    prompt = (
        "你在为一款广西老友粉老店的经营游戏写事件旁白。语气：南宁街坊口吻，短句，有锅气，"
        "不煽情、不说教。\n"
        f"第 {month} 月第 {day} 天发生的事：{title}。{body}\n"
        "要求：只输出一段叙述（60–120 个汉字），不要选项、不要解释、"
        "**绝对不要出现任何阿拉伯数字或金额**（这是硬性红线），不要出现真实机构全称。"
        f"风格参考：{tone}。"
    )
    req = {
        "model": CFG.ai_model,
        "messages": [
            {"role": "system", "content": "你是本地游戏文案写手，只输出正文，不加标题与引号。"},
            {"role": "user", "content": prompt},
        ],
        "temperature": 0.9,
        "max_tokens": 300,
    }
    data = json.dumps(req).encode()
    r = urllib.request.Request(
        "https://api.deepseek.com/chat/completions",
        data=data,
        headers={"content-type": "application/json", "authorization": f"Bearer {CFG.ai_key}"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(r, timeout=20) as resp:
            payload = json.loads(resp.read().decode())
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError, OSError):
        return None
    try:
        text = payload["choices"][0]["message"]["content"]
    except (KeyError, IndexError, TypeError):
        return None
    line = sanitize_line(text)
    if not line:
        return None
    return {"body": line, "reactions": [], "source": "remote"}


class Handler(BaseHTTPRequestHandler):
    server_version = f"laoyoufen/{VERSION}"
    protocol_version = "HTTP/1.1"

    # ---------- 基础 ----------
    def log_message(self, fmt: str, *args) -> None:  # 静音默认 stderr 噪声
        return

    def _send(self, code: int, obj: dict | bytes, ctype: str = "application/json; charset=utf-8") -> None:
        body = obj if isinstance(obj, bytes) else json.dumps(obj, ensure_ascii=False).encode()
        self.send_response(code)
        self.send_header("content-type", ctype)
        self.send_header("content-length", str(len(body)))
        self.send_header("cache-control", "no-store")
        origin = self.headers.get("origin", "")
        if CFG.allow_origin and origin.startswith(CFG.allow_origin):
            self.send_header("access-control-allow-origin", origin)
            self.send_header("vary", "origin")
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(body)

    def _body(self) -> bytes | None:
        try:
            n = int(self.headers.get("content-length") or 0)
        except ValueError:
            return None
        if n <= 0 or n > MAX_BODY:
            return None
        return self.rfile.read(n)

    def _ip(self) -> str:
        return self.headers.get("x-real-ip") or (self.client_address[0] if self.client_address else "?")

    def _admin(self) -> bool:
        tok = self.headers.get("x-admin-token", "")
        return bool(CFG.admin_token) and tok == CFG.admin_token

    # ---------- 路由 ----------
    def do_OPTIONS(self) -> None:  # noqa: N802
        self.send_response(204)
        self.send_header("access-control-allow-origin", self.headers.get("origin", "*"))
        self.send_header("access-control-allow-headers", "content-type,x-admin-token")
        self.send_header("access-control-allow-methods", "GET,POST,OPTIONS")
        self.send_header("content-length", "0")
        self.end_headers()

    def do_GET(self) -> None:  # noqa: N802
        path = self.path.split("?")[0].rstrip("/") or "/"
        if path.endswith("/health") or path == "/health":
            self._send(200, {
                "ok": True, "version": VERSION, "ai": bool(CFG.ai_key) and not CFG.offline_only,
                "events": len(CFG.events), "playtests": self._count_playtests(), "ts": now_iso(),
            })
            return
        if path.endswith("/playtest") or path == "/playtest":
            if not self._admin():
                self._send(401, {"ok": False, "error": "unauthorized"})
                return
            self._send(200, {"ok": True, "items": self._index()[-200:]})
            return
        if "/playtest/" in path:
            if not self._admin():
                self._send(401, {"ok": False, "error": "unauthorized"})
                return
            pid = path.rsplit("/", 1)[-1]
            f = CFG.playtest_dir / f"{pid}.json"
            if not f.exists():
                self._send(404, {"ok": False, "error": "not_found"})
                return
            self._send(200, f.read_bytes())
            return
        if path.endswith("/stats") or path == "/stats":
            if not self._admin():
                self._send(401, {"ok": False, "error": "unauthorized"})
                return
            self._send(200, {"ok": True, "stats": self._stats()})
            return
        self._send(404, {"ok": False, "error": "not_found"})

    def do_POST(self) -> None:  # noqa: N802
        path = self.path.split("?")[0].rstrip("/") or "/"
        ip = self._ip()
        if not rate_ok(ip):
            self._send(429, {"ok": False, "error": "too_many_requests"})
            return
        raw = self._body()
        if raw is None:
            self._send(413, {"ok": False, "error": "bad_body_or_oversize"})
            return
        try:
            payload = json.loads(raw.decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError):
            self._send(400, {"ok": False, "error": "invalid_json"})
            return

        if path.endswith("/playtest") or path == "/playtest":
            self._handle_playtest(payload, ip)
            return
        if path.endswith("/event") or path == "/event":
            self._handle_event(payload)
            return
        self._send(404, {"ok": False, "error": "not_found"})

    # ---------- 业务 ----------
    def _handle_playtest(self, payload: dict, ip: str) -> None:
        if not isinstance(payload, dict):
            self._send(400, {"ok": False, "error": "not_object"})
            return
        summary = payload.get("summary")
        days = payload.get("days")
        if not isinstance(summary, dict) or not isinstance(days, list):
            self._send(400, {"ok": False, "error": "missing_summary_or_days"})
            return
        if len(days) > 1200 or len(days) == 0:
            self._send(400, {"ok": False, "error": "days_out_of_range"})
            return
        pid = f"{time.strftime('%Y%m%d-%H%M%S')}-{short_id()}"
        rec = {
            "id": pid,
            "ts": now_iso(),
            "ip_hash": hashlib.sha256(ip.encode()).hexdigest()[:12],
            "days": len(days),
            "minutes": summary.get("minutes", 0),
            "bowls": summary.get("bowls", 0),
            "lost": summary.get("lost", 0),
            "lost_rate": summary.get("lostRate", 0),
            "avg_price": summary.get("avgPrice", 0),
            "avg_taste": summary.get("avgTaste", 0),
            "peak_waiting": summary.get("peakWaiting", 0),
            "payload": payload,
        }
        CFG.playtest_dir.mkdir(parents=True, exist_ok=True)
        (CFG.playtest_dir / f"{pid}.json").write_text(
            json.dumps(rec["payload"], ensure_ascii=False), encoding="utf-8"
        )
        jsonl_append(CFG.index_file, {k: v for k, v in rec.items() if k != "payload"})
        self._send(200, {"ok": True, "id": pid, "days": len(days)})

    def _handle_event(self, payload: dict) -> None:
        if not isinstance(payload, dict):
            self._send(400, {"ok": False, "error": "not_object"})
            return
        event_id = str(payload.get("eventId") or "")
        month = int(payload.get("month") or 0)
        day = int(payload.get("day") or 0)
        tone = str(payload.get("tone") or "nanning-hua")
        if not event_id:
            self._send(400, {"ok": False, "error": "missing_eventId"})
            return
        key = f"{event_id}:{month}:{day}"
        cached = cache_lookup(key)
        if cached:
            self._send(200, cached)
            return
        out = deepseek_narrative(event_id, month, day, tone) or local_narrative(event_id, month, day)
        if out.get("source") == "remote":
            jsonl_append(CFG.cache_file, {"key": key, "payload": out, "ts": now_iso()})
        self._send(200, out)

    # ---------- 统计 ----------
    def _index(self) -> list[dict]:
        f = CFG.index_file
        if not f.exists():
            return []
        items = []
        try:
            with open(f, "r", encoding="utf-8") as fh:
                for line in fh:
                    line = line.strip()
                    if line:
                        try:
                            items.append(json.loads(line))
                        except Exception:
                            continue
        except OSError:
            return []
        return items

    def _count_playtests(self) -> int:
        f = CFG.index_file
        if not f.exists():
            return 0
        try:
            return sum(1 for line in open(f, "r", encoding="utf-8") if line.strip())
        except OSError:
            return 0

    def _stats(self) -> dict:
        items = self._index()
        if not items:
            return {"n": 0}
        n = len(items)
        bowls = sum(i.get("bowls", 0) for i in items)
        lost = sum(i.get("lost", 0) for i in items)
        minutes = sum(i.get("minutes", 0) for i in items)
        return {
            "n": n,
            "minutes": minutes,
            "bowls": bowls,
            "lost": lost,
            "lost_rate": lost / max(1, bowls + lost),
            "avg_price": sum(i.get("avg_price", 0) for i in items) / n,
            "avg_taste": sum(i.get("avg_taste", 0) for i in items) / n,
            "bowls_per_day": bowls / max(1, sum(i.get("days", 0) for i in items)),
        }


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--host", default="127.0.0.1")
    ap.add_argument("--port", type=int, default=8767)
    ap.add_argument("--data", default=".")
    ap.add_argument("--events", default="")
    ap.add_argument("--env", default="")
    ap.add_argument("--offline", action="store_true", help="不调模型，全走本地模板（压测/降级用）")
    args = ap.parse_args()

    if args.env:
        load_env(args.env)
    CFG.data = pathlib.Path(args.data)
    CFG.data.mkdir(parents=True, exist_ok=True)
    CFG.playtest_dir.mkdir(parents=True, exist_ok=True)
    CFG.events = load_events(args.events) if args.events else {}
    CFG.ai_key = os.environ.get("DEEPSEEK_API_KEY", "")
    CFG.ai_model = os.environ.get("LAOYOU_AI_MODEL", "deepseek-chat")
    CFG.admin_token = os.environ.get("LAOYOU_ADMIN_TOKEN", "")
    CFG.allow_origin = os.environ.get("LAOYOU_ALLOW_ORIGIN", "")
    CFG.offline_only = args.offline

    srv = ThreadingHTTPServer((args.host, args.port), Handler)
    print(f"[laoyoufen] listening {args.host}:{args.port}  data={CFG.data}  events={len(CFG.events)}  ai={'on' if CFG.ai_key and not CFG.offline_only else 'off'}")
    srv.serve_forever()


if __name__ == "__main__":
    main()
