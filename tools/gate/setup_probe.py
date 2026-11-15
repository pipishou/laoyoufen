# -*- coding: utf-8 -*-
"""建店（S0）的玩家路径验收 —— 六阶第一批 P1。

走玩家真路径，不调内部函数：
  1. 全新一局停在「开张」界面：phase=setup、没铺位、没店名、时间不走；
  2. 三张铺位卡都在，转让费与月租写得出来；
  3. 点「巷内小店」→ 现金预告改变、按钮变亮；
  4. 点一个候选店名 → 输入框跟着变；
  5. 点「开张营业」→ 界面消失、phase=prep、座位/灶台换成该铺位的值、招牌换成店名；
  6. 再点「开门营业」→ 时钟才开始走。

产出：game/data/evidence/setup/01..05-*.png + 控制台错误数。
用法（仓库根目录，先 `npm run build` 并起 preview 4173）：
    python tools/gate/setup_probe.py
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

URL = "http://127.0.0.1:4173/"
ROOT = Path(__file__).resolve().parents[2]
OUTDIR = ROOT / "game" / "data" / "evidence" / "setup"
OUT: dict = {"console_errors": [], "steps": []}


def snap(page, name: str) -> None:
    OUTDIR.mkdir(parents=True, exist_ok=True)
    path = OUTDIR / name
    page.screenshot(path=str(path))
    OUT["steps"].append({"shot": path.name})


def txt(page, sel: str) -> str | None:
    return page.evaluate(
        "(s) => { const e = document.querySelector(s); return e ? e.textContent.trim() : null; }", sel
    )


with sync_playwright() as pw:
    b = pw.chromium.launch(headless=True, channel="msedge", args=["--disable-extensions"])
    ctx = b.new_context(viewport={"width": 1440, "height": 900})
    page = ctx.new_page()
    page.on("console", lambda m: OUT["console_errors"].append(m.text) if m.type == "error" else None)
    page.goto(URL, wait_until="load", timeout=30000)
    page.evaluate("() => localStorage.clear()")
    page.reload(wait_until="load")
    page.wait_for_timeout(1500)

    # 1) 全新一局：开张界面在，时间不走
    OUT["fresh"] = page.evaluate(
        "() => { const s = window.__laoyou.state; return {phase: s.phase, site: s.site,"
        " name: s.shopName, minute: s.flow.minuteOfDay, cash: s.cash}; }"
    )
    OUT["setup_visible"] = page.evaluate(
        "() => { const e = document.querySelector('.setup'); return !!e && !e.hidden; }"
    )
    OUT["site_cards"] = page.evaluate(
        "() => Array.from(document.querySelectorAll('.sitecard')).map(c => ({"
        " id: c.dataset.site, name: c.querySelector('.sname').textContent.trim(),"
        " fee: c.querySelector('.sfee').textContent.trim(),"
        " stats: c.querySelector('.sstats').textContent.replace(/\\s+/g, ' ').trim()}))"
    )
    OUT["open_disabled"] = page.evaluate("() => document.querySelector('[data-open]').disabled")
    OUT["pill"] = txt(page, "[data-openpill]")
    page.wait_for_timeout(4000)
    OUT["after_4s"] = page.evaluate(
        "() => ({minute: window.__laoyou.state.flow.minuteOfDay,"
        " customers: window.__laoyou.state.flow.customers.length})"
    )
    snap(page, "01-setup.png")

    # 2) 选巷内小店
    page.click('.sitecard[data-site="alley"]')
    page.wait_for_timeout(300)
    OUT["after_pick"] = {
        "picked": page.evaluate(
            "() => Array.from(document.querySelectorAll('.sitecard.picked')).map(c => c.dataset.site)"
        ),
        "cash_hint": txt(page, "[data-cash]"),
        "open_disabled": page.evaluate("() => document.querySelector('[data-open]').disabled"),
        "note": txt(page, "[data-note]"),
    }
    snap(page, "02-picked.png")

    # 3) 点候选店名
    OUT["chips"] = page.evaluate(
        "() => Array.from(document.querySelectorAll('[data-chips] .chip')).map(c => c.textContent.trim())"
    )
    page.click("[data-chips] .chip")
    page.wait_for_timeout(200)
    OUT["name_after_chip"] = page.input_value("[data-name]")
    snap(page, "03-named.png")

    # 4) 开张
    page.click("[data-open]")
    page.wait_for_timeout(800)
    OUT["after_open"] = page.evaluate(
        "() => { const s = window.__laoyou.state; return {phase: s.phase, site: s.site,"
        " name: s.shopName, cash: s.cash, seats: s.venue.seats, stoves: s.venue.stoves,"
        " capacity: s.capacity}; }"
    )
    OUT["setup_gone"] = page.evaluate("() => !document.querySelector('.setup')")
    OUT["logo"] = txt(page, "[data-shopname]")
    OUT["pill_after"] = txt(page, "[data-openpill]")
    snap(page, "04-opened.png")

    # 5) 开门才走时间
    page.click("[data-openpill]")
    page.wait_for_timeout(1500)
    OUT["after_open_shop"] = page.evaluate(
        "() => ({phase: window.__laoyou.state.phase, minute: window.__laoyou.state.flow.minuteOfDay})"
    )
    OUT["clock"] = txt(page, "[data-clock]")
    snap(page, "05-open.png")
    b.close()

OUT["console_error_count"] = len(OUT["console_errors"])
print(json.dumps(OUT, ensure_ascii=False, indent=1))
sys.exit(0 if OUT["console_error_count"] == 0 else 3)
