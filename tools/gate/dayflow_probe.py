# -*- coding: utf-8 -*-
"""一天三态的玩家路径验收（对应玩家实测反馈 m03752 第 1、2 条）。

走的是玩家真路径，不调内部函数：
  1. 全新一局必须停在「准备」：钟面 06:00、按钮写「开门营业」、时间不走、没人来；
  2. 引导必须跟着阶段：首屏第 ① 步是「调味道」，三个按钮（先关掉 / 不用教了 / 下一步）；
  3. 「先关掉」能收起来，右下角出现「? 引导」且能再打开；
  4. 按「开门营业」后时钟才走，到 14:00 出日结单；
  5. 「明天继续」进次日准备。

产出：game/data/evidence/dayflow/06..09-*.png + 控制台错误数。
用法（仓库根目录，先起 preview）：
    python tools/gate/dayflow_probe.py
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

URL = "http://127.0.0.1:4173/"
ROOT = Path(__file__).resolve().parents[2]
OUTDIR = ROOT / "game" / "data" / "evidence" / "dayflow"
OUT: dict = {"console_errors": [], "steps": []}


def snap(page, name: str) -> None:
    OUTDIR.mkdir(parents=True, exist_ok=True)
    path = OUTDIR / name
    page.screenshot(path=str(path))
    OUT["steps"].append({"shot": path.name})


def txt(page, sel: str) -> str:
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
    page.wait_for_timeout(2000)

    # 1) 全新一局停在准备
    OUT["fresh"] = page.evaluate(
        "() => ({phase: window.__laoyou.state.phase, minute: window.__laoyou.state.flow.minuteOfDay,"
        " day: window.__laoyou.state.day, served: window.__laoyou.state.flow.servedToday})"
    )
    OUT["clock"] = txt(page, "[data-clock]")
    OUT["pill"] = txt(page, "[data-openpill]")
    OUT["guide_title"] = txt(page, ".guide .gtitle")
    OUT["guide_buttons"] = page.evaluate(
        "() => Array.from(document.querySelectorAll('.guide .gbtn')).map(b => b.textContent.trim())"
    )
    page.wait_for_timeout(6000)  # 六秒不动：时间不该走
    OUT["after_6s"] = page.evaluate(
        "() => ({phase: window.__laoyou.state.phase, minute: window.__laoyou.state.flow.minuteOfDay,"
        " customers: window.__laoyou.state.flow.customers.length})"
    )
    snap(page, "06-prep.png")

    # 2) 先关掉 → 右下角出现恢复入口 → 再打开
    page.click("[data-guide-hide]")
    page.wait_for_timeout(300)
    OUT["hidden"] = {
        "guide_hidden": page.evaluate("() => document.querySelector('.guide').hidden"),
        "restore_visible": page.evaluate("() => !document.querySelector('.guiderestore').hidden"),
        "state": page.evaluate("() => window.__laoyou.guide()"),
    }
    snap(page, "07-guide-hidden.png")
    page.click(".guiderestore")
    page.wait_for_timeout(300)
    OUT["reopened"] = {
        "guide_hidden": page.evaluate("() => document.querySelector('.guide').hidden"),
        "restore_visible": page.evaluate("() => !document.querySelector('.guiderestore').hidden"),
    }

    # 3) 开门 → 时钟走 → 日结单
    page.click("[data-openpill]")
    page.wait_for_timeout(1500)
    OUT["after_open"] = page.evaluate(
        "() => ({phase: window.__laoyou.state.phase, minute: window.__laoyou.state.flow.minuteOfDay})"
    )
    OUT["clock_open"] = txt(page, "[data-clock]")
    OUT["pill_open"] = txt(page, "[data-openpill]")
    OUT["pill_disabled"] = page.evaluate("() => document.querySelector('[data-openpill]').disabled")
    page.evaluate("() => { const b = document.querySelector('button.spd[data-speed=\"16\"]'); if (b) b.click(); }")

    # 16 倍速跑完一天（120 游戏分钟 ≈ 7.5 秒），途中把事件弹窗点掉
    report = None
    for _ in range(120):
        page.wait_for_timeout(500)
        page.evaluate(
            "() => { const m = document.querySelector('.eventmodal');"
            " if (m) { const b = m.querySelector('button'); if (b) b.click(); } }"
        )
        report = page.evaluate("() => window.__laoyou.state.dayReport")
        if report:
            break
    OUT["dayreport"] = report
    OUT["dayreport_visible"] = page.evaluate(
        "() => { const e = document.querySelector('.dayreport'); return !!e && !e.hidden; }"
    )
    OUT["dayreport_text"] = txt(page, ".dayreport .daybox")
    OUT["clock_closing"] = txt(page, "[data-clock]")
    snap(page, "08-dayreport.png")

    # 4) 明天继续 → 次日准备
    page.click("[data-day-next]")
    page.wait_for_timeout(800)
    OUT["next_day"] = page.evaluate(
        "() => ({phase: window.__laoyou.state.phase, day: window.__laoyou.state.day,"
        " minute: window.__laoyou.state.flow.minuteOfDay, report: window.__laoyou.state.dayReport})"
    )
    OUT["clock_next"] = txt(page, "[data-clock]")
    snap(page, "09-nextday.png")
    b.close()

OUT["console_error_count"] = len(OUT["console_errors"])
print(json.dumps(OUT, ensure_ascii=False, indent=1))
sys.exit(0 if OUT["console_error_count"] == 0 else 3)
