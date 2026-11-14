# -*- coding: utf-8 -*-
"""线上环境实测：真的走一遍玩家路径，验证埋点能不能回到服务器。"""
import json
import sys
from playwright.sync_api import sync_playwright

URL = "http://8.134.86.249/laoyoufen/"
OUT = {}

def launch(pw):
    for how in ("bundled", "msedge", "chrome"):
        try:
            if how == "bundled":
                return pw.chromium.launch(headless=True)
            return pw.chromium.launch(headless=True, channel=how)
        except Exception:
            continue
    raise RuntimeError("no browser")

with sync_playwright() as pw:
    b = launch(pw)
    ctx = b.new_context(viewport={"width": 1440, "height": 900})
    page = ctx.new_page()
    errors = []
    page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.goto(URL, wait_until="load", timeout=30000)
    page.evaluate("() => localStorage.clear()")
    page.reload(wait_until="load")
    page.wait_for_timeout(3000)
    OUT["title"] = page.title()
    OUT["guide_visible"] = page.evaluate("() => !!document.querySelector('.guide')")
    OUT["has_laoyou"] = page.evaluate("() => !!window.__laoyou")
    OUT["online"] = page.evaluate("() => (window.__laoyou && window.__laoyou.online) ? window.__laoyou.online() : null")

    # 跳引导 + 16 倍速 + 每秒点掉事件弹窗
    try:
        page.evaluate("() => { const g = document.querySelector('.guide .dismiss'); if (g) g.click(); }")
    except Exception:
        pass
    page.evaluate("() => { const b = document.querySelector('button.spd[data-speed=\"16\"]'); if (b) b.click(); }")
    for _ in range(30):
        page.wait_for_timeout(1000)
        page.evaluate(
            "() => { const m = document.querySelector('.eventmodal'); if (m) { const b = m.querySelector('button'); if (b) b.click(); } }"
        )
    OUT["local_key_bytes"] = page.evaluate(
        "() => { const v = localStorage.getItem('laoyou.telemetry.v2'); return v ? v.length : 0; }"
    )
    OUT["summary"] = page.evaluate("() => { try { return window.__laoyou.summary(); } catch (e) { return String(e); } }")
    OUT["upload"] = page.evaluate("() => window.__laoyou.upload(true)")
    page.wait_for_timeout(1500)
    page.screenshot(path="game/data/evidence/live/live-1440x900.png", full_page=False)

    page.set_viewport_size({"width": 375, "height": 667})
    page.wait_for_timeout(1200)
    page.screenshot(path="game/data/evidence/live/live-375x667.png", full_page=False)
    OUT["console_errors"] = errors[:8]
    OUT["error_count"] = len(errors)
    b.close()

print(json.dumps(OUT, ensure_ascii=False, indent=1))
