# -*- coding: utf-8 -*-
"""线上真机自检：打开 http://8.134.86.249/laoyoufen/ ，玩两分钟，全程不按 Shift+E / Shift+U。

判据（三条同时成立才算飞轮自己转起来）：
  1. 页面能渲染（截图非空白、无 console error）
  2. localStorage 出现 laoyou.device.v1
  3. 服务端 /report 里出现这个 device 的上传记录
"""
import json
import sys
from playwright.sync_api import sync_playwright

URL = "http://8.134.86.249/laoyoufen/"
SHOT = "game/data/evidence/live-play/01-live-1440x900.png"
OUT = {"posts": [], "console_errors": [], "device": None, "summary": None}

with sync_playwright() as pw:
    b = pw.chromium.launch(headless=True, channel="msedge", args=["--disable-extensions"])
    ctx = b.new_context(viewport={"width": 1440, "height": 900})
    page = ctx.new_page()
    page.on("console", lambda m: OUT["console_errors"].append(m.text[:160]) if m.type == "error" else None)
    page.on("requestfinished", lambda r: OUT["posts"].append(
        {"status": r.response().status if r.response() else None}
    ) if "/playtest" in r.url and r.method == "POST" else None)
    page.goto(URL, wait_until="load", timeout=45000)
    page.evaluate("() => localStorage.clear()")
    page.reload(wait_until="load", timeout=45000)
    page.wait_for_timeout(3000)
    page.evaluate("() => { const g = document.querySelector('.guide .dismiss'); if (g) g.click(); }")
    page.evaluate("() => { const b = document.querySelector('button.spd[data-speed=\"16\"]'); if (b) b.click(); }")
    for _ in range(130):
        page.wait_for_timeout(1000)
        page.evaluate("() => { const m = document.querySelector('.eventmodal'); if (m) { const b = m.querySelector('button'); if (b) b.click(); } }")
    OUT["device"] = page.evaluate("() => localStorage.getItem('laoyou.device.v1')")
    OUT["pending"] = page.evaluate("() => window.__laoyou.pending()")
    OUT["summary"] = page.evaluate("() => { const s = window.__laoyou.summary(); return {minutes: s.minutes, days: s.days, bowls: s.bowls, lostRate: Math.round(s.lostRate*1000)/10}; }")
    import os
    os.makedirs(os.path.dirname(SHOT), exist_ok=True)
    page.screenshot(path=SHOT)
    b.close()

print(json.dumps(OUT, ensure_ascii=False, indent=1))
