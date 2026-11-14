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

    @property
    def report_dir(self) -> pathlib.Path:
        return self.data / "reports"


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


def _boring_streak(days: list) -> int:
    """最长「碗数几乎不动」的连续天数（±5% 以内算没动）——就是玩家说的「在等」。

    这条判据来自验收：替身 36 月实测第 3 个月起营收 33 个月持平 ±0.5%，
    所以 ≥5 天不动就当作「中期没有决策点」（账本 P24）。
    """
    series = []
    for d in days:
        if isinstance(d, dict):
            try:
                series.append(float(d.get("bowls") or 0))
            except (TypeError, ValueError):
                series.append(0.0)
    best = run = 0
    base = None
    for v in series:
        if base is None:
            base, run, best = v, 1, max(best, 1)
            continue
        if abs(v - base) <= max(1.0, base * 0.05):
            run += 1
            best = max(best, run)
        else:
            base, run = v, 1
    return best


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


def digest_markdown(report: dict, reasons: list[dict]) -> str:
    """把 /report 的聚合结果写成人能读的一页日报（给定时任务用，也可 GET /digest 看）。"""
    stamp = now_iso()
    if not report.get("devices"):
        return f"# 老友粉店 · 试玩日报 {stamp[:10]}\n\n还没有任何试玩记录上传。\n"
    r4, r8 = 71.2, 113.4  # 4 座 / 8 座不操作局的产能基线（见 docs/验收-开罗标准对照）
    lines = [
        f"# 老友粉店 · 试玩日报 {stamp[:10]}",
        "",
        f"- 设备 **{report['devices']}** 台，记录 **{report['records']}** 条（同一设备多次上传按最新快照计）",
        f"- 累计试玩 **{report['minutes']}** 游戏分钟（≈ {report['minutes'] * 6 / 60:.1f} 现实小时）",
        f"- 日均碗数 **{report['bowls_per_day']}**（4 座基线 {r4} / 8 座 {r8}）",
        f"- 流失率 **{report['lost_rate'] * 100:.1f}%** ｜ 均价 **¥{report['avg_price']}** ｜ 味道 **{report['avg_taste']}**",
        "",
        "| 设备 | 上传 | 最后时间 | 天数 | 分钟 | 日均碗 | 流失 | 均价 | 味道 | 持平段 | 主要流失原因 |",
        "|---|---|---|---|---|---|---|---|---|---|---|",
    ]
    for row in report["rows"][:20]:
        flat = row["flat_streak"]
        flag = f"**{flat}**" + ("（≥5 天＝无聊区）" if flat >= 5 else "")
        lines.append(
            f"| `{row['device'][:10]}` | {row['uploads']} | {str(row['last_ts'])[5:16]} | {row['days']} | "
            f"{row['minutes']} | {row['bowls_per_day']} | {row['lost_rate'] * 100:.0f}% | ¥{row['avg_price']} | "
            f"{row['avg_taste']} | {flag} | {row['top_reason'] or '—'} |"
        )
    if reasons:
        lines += ["", "**流失原因合计**", ""]
        for it in reasons[:6]:
            lines.append(f"- {it['reason']}：{it['count']}")
    boring = [r for r in report["rows"] if r["flat_streak"] >= 5]
    lines += ["", "**本期结论**", ""]
    if boring:
        lines.append(
            f"- {len(boring)}/{len(report['rows'])} 台设备出现 ≥5 天零变化 —— 账本 P24「中期没有决策点」在真人盘面上复现了。"
        )
    else:
        lines.append("- 暂无 ≥5 天零变化的盘面；样本还不够，继续收。")
    lines.append(f"- 生成时间 {stamp}（`python3 app.py --digest` 产出，systemd timer 每天 03:10 自动跑）")
    return "\n".join(lines) + "\n"


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
        if CFG.allow_origin and any(origin.startswith(o.strip()) for o in CFG.allow_origin.split(",") if o.strip()):
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
        if path.endswith("/report") or path == "/report":
            if not self._admin():
                self._send(401, {"ok": False, "error": "unauthorized"})
                return
            self._send(200, {"ok": True, "report": self._report()})
            return
        if path.endswith("/digest") or path == "/digest":
            if not self._admin():
                self._send(401, {"ok": False, "error": "unauthorized"})
                return
            md = digest_markdown(self._report(), self._daily_reasons())
            self._send(200, md.encode("utf-8"), "text/markdown; charset=utf-8")
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
        device = "".join(ch for ch in str(payload.get("device") or "")[:40] if ch.isalnum() or ch in "-_") or "anon"
        reasons = summary.get("lostReasons") or []
        rec = {
            "id": pid,
            "ts": now_iso(),
            "device": device,
            "ip_hash": hashlib.sha256(ip.encode()).hexdigest()[:12],
            "days": len(days),
            "minutes": summary.get("minutes", 0),
            "bowls": summary.get("bowls", 0),
            "lost": summary.get("lost", 0),
            "lost_rate": summary.get("lostRate", 0),
            "avg_price": summary.get("avgPrice", 0),
            "avg_taste": summary.get("avgTaste", 0),
            "peak_waiting": summary.get("peakWaiting", 0),
            "top_reason": (reasons[0].get("reason", "")[:60] if reasons and isinstance(reasons[0], dict) else ""),
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

    def _daily_reasons(self) -> list[dict]:
        """把每份 payload 里 summary.lostReasons 加总，看这一批人到底为什么走。"""
        agg: dict[str, int] = {}
        for it in self._index():
            payload = self._payload(it.get("id", ""))
            summary = payload.get("summary") or {}
            for r in summary.get("lostReasons") or []:
                if isinstance(r, dict):
                    key = str(r.get("reason") or "")[:60]
                    if key:
                        agg[key] = agg.get(key, 0) + int(r.get("count") or 0)
        return [{"reason": k, "count": v} for k, v in sorted(agg.items(), key=lambda kv: -kv[1])]

    # ---------- 统计 ----------
    def _report(self) -> dict:
        """按设备聚合：每台机器只算「最新那一次快照」，避免同一局上传多次被重复计。"""
        items = self._index()
        if not items:
            return {"devices": 0, "records": 0, "rows": []}
        by_dev: dict[str, dict] = {}
        for it in items:
            dev = it.get("device") or "anon"
            cur = by_dev.get(dev)
            if cur is None:
                by_dev[dev] = {**it, "uploads": 1, "first_ts": it.get("ts"), "last_ts": it.get("ts")}
                continue
            cur["uploads"] += 1
            cur["last_ts"] = it.get("ts")
            if it.get("minutes", 0) >= cur.get("minutes", 0):
                keep = {k: cur[k] for k in ("uploads", "first_ts")}
                by_dev[dev] = {**it, **keep, "last_ts": it.get("ts")}
        rows = []
        for dev, r in by_dev.items():
            payload = self._payload(r.get("id", ""))
            days = payload.get("days") or []
            streaks = _boring_streak(days)
            by_day = [d.get("bowls", 0) for d in days] or [0]
            rows.append({
                "device": dev,
                "uploads": r.get("uploads", 1),
                "first_ts": r.get("first_ts"),
                "last_ts": r.get("last_ts"),
                "days": r.get("days", 0),
                "minutes": r.get("minutes", 0),
                "bowls": r.get("bowls", 0),
                "lost_rate": round(float(r.get("lost_rate") or 0), 4),
                "avg_price": r.get("avg_price", 0),
                "avg_taste": r.get("avg_taste", 0),
                "peak_waiting": r.get("peak_waiting", 0),
                "bowls_per_day": round(sum(by_day) / max(1, len(by_day)), 1),
                "flat_streak": streaks,
                "top_reason": r.get("top_reason", ""),
            })
        rows.sort(key=lambda x: -x["minutes"])
        return {
            "devices": len(rows),
            "records": len(items),
            "minutes": sum(r["minutes"] for r in rows),
            "bowls": sum(r["bowls"] for r in rows),
            "lost_rate": round(
                sum(r["lost_rate"] * (r["bowls"] + 1) for r in rows) / max(1, sum(r["bowls"] + 1 for r in rows)), 4
            ),
            "avg_price": round(sum(r["avg_price"] for r in rows) / max(1, len(rows)), 2),
            "avg_taste": round(sum(r["avg_taste"] for r in rows) / max(1, len(rows)), 1),
            "bowls_per_day": round(sum(r["bowls_per_day"] for r in rows) / max(1, len(rows)), 1),
            "rows": rows,
        }

    def _payload(self, pid: str) -> dict:
        f = CFG.playtest_dir / f"{pid}.json"
        if not f.exists():
            return {}
        try:
            return json.loads(f.read_text(encoding="utf-8"))
        except Exception:
            return {}

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
    ap.add_argument("--digest", action="store_true", help="只生成今天的试玩日报到 <data>/reports/，不起服务")
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

    if args.digest:
        h = Handler.__new__(Handler)  # 只用它的聚合方法，不建 socket
        md = digest_markdown(h._report(), h._daily_reasons())
        CFG.report_dir.mkdir(parents=True, exist_ok=True)
        out = CFG.report_dir / f"{time.strftime('%Y-%m-%d')}.md"
        out.write_text(md, encoding="utf-8")
        print(md)
        print(f"[digest] written {out}")
        return

    srv = ThreadingHTTPServer((args.host, args.port), Handler)
    print(f"[laoyoufen] listening {args.host}:{args.port}  data={CFG.data}  events={len(CFG.events)}  ai={'on' if CFG.ai_key and not CFG.offline_only else 'off'}")
    srv.serve_forever()


if __name__ == "__main__":
    main()
