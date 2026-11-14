# -*- coding: utf-8 -*-
"""证明「飞轮能自己转」：本地跑同一份构建，指着线上 API，全程不碰 Shift+E / Shift+U。

判据：
  1. localStorage 里出现 laoyou.device.v1（匿名设备号）
  2. 至少一次 POST /playtest 成功（页面自己发的，不是我们手动点的）
  3. pending 为 None（没有积压）
"""
import json
import sys
from playwright.sync_api import sync_playwright

URL = "http://127.0.0.1:4173/"
OUT = {"posts": [], "console_errors": []}

with sync_playwright() as pw:
    b = pw.chromium.launch(headless=True, channel="msedge", args=["--disable-extensions"])
    ctx = b.new_context(viewport={"width": 1440, "height": 900})
    page = ctx.new_page()
    page.on("console", lambda m: OUT["console_errors"].append(m.text) if m.type == "error" else None)
    page.on("requestfinished", lambda r: OUT["posts"].append(
        {"url": r.url, "status": r.response().status if r.response() else None}
    ) if "/playtest" in r.url and r.method == "POST" else None)
    page.goto(URL, wait_until="load", timeout=30000)
    page.evaluate("() => localStorage.clear()")
    page.reload(wait_until="load")
    page.wait_for_timeout(2500)
    page.evaluate("() => { const g = document.querySelector('.guide .dismiss'); if (g) g.click(); }")
    page.evaluate("() => { const b = document.querySelector('button.spd[data-speed=\"16\"]'); if (b) b.click(); }")
    for _ in range(95):
        page.wait_for_timeout(1000)
        page.evaluate("() => { const m = document.querySelector('.eventmodal'); if (m) { const b = m.querySelector('button'); if (b) b.click(); } }")
    OUT["device"] = page.evaluate("() => localStorage.getItem('laoyou.device.v1')")
    OUT["pending"] = page.evaluate("() => window.__laoyou.pending()")
    OUT["summary"] = page.evaluate("() => window.__laoyou.summary()")
    b.close()

print(json.dumps(OUT, ensure_ascii=False, indent=1))
