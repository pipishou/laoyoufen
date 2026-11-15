"""主料与份量（P46）真点验收：十张主料卡 + 二两/三两，点完看存档。

跑法（先起 preview）：
    python tools/gate/main_probe.py
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

URL = "http://127.0.0.1:4180/"
OUT = Path(__file__).resolve().parents[2] / "game" / "data" / "evidence" / "p46"


def open_shop(page) -> None:
    """清档 → 过建店 → 到准备阶段（门还没开）。"""
    page.goto(URL, wait_until="networkidle")
    page.evaluate("localStorage.clear()")
    page.reload(wait_until="networkidle")
    page.wait_for_selector(".setup", timeout=15000)
    page.click('.sitecard[data-site="alley"]')
    page.wait_for_selector("[data-chips] .chip")
    page.click("[data-chips] .chip")
    page.click("[data-open]")
    page.wait_for_selector("[data-openpill]", timeout=10000)


def main() -> int:
    OUT.mkdir(parents=True, exist_ok=True)
    errors: list[str] = []
    report: dict[str, object] = {}

    with sync_playwright() as p:
        browser = p.chromium.launch(channel="msedge")
        page = browser.new_page(viewport={"width": 1440, "height": 900})
        page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
        page.on("pageerror", lambda e: errors.append(str(e)))

        open_shop(page)
        # 注入客流解锁主料（真机不注入也能玩，这里为了验十张卡）
        page.evaluate("window.__laoyou.state.totalCustomers = 2000")
        page.click('[data-tab="recipe"]')
        page.wait_for_selector(".mcard", timeout=8000)

        report["mainCards"] = page.eval_on_selector_all(".mcard", "els => els.length")
        report["portionBtns"] = page.eval_on_selector_all(".pbtn", "els => els.length")
        report["lockedMains"] = page.eval_on_selector_all(".mcard.locked", "els => els.length")
        report["defaultMain"] = page.evaluate("window.__laoyou.state.main")
        report["defaultPortion"] = page.evaluate("window.__laoyou.state.portion")
        report["summary"] = page.text_content("[data-mainsum]")

        # 选牛肉做主料
        page.evaluate("document.querySelector('.mcard[data-id=\"beef\"]').click()")
        page.wait_for_timeout(400)
        report["afterMain"] = page.evaluate("window.__laoyou.state.main")
        report["dishName"] = page.text_content("[data-dishname]")

        # 换成三两
        page.evaluate("document.querySelector('.pbtn[data-id=\"3\"]').click()")
        page.wait_for_timeout(400)
        report["afterPortion"] = page.evaluate("window.__laoyou.state.portion")
        report["dishName3"] = page.text_content("[data-dishname]")
        report["econ"] = page.text_content("[data-econ2]")
        report["portionOn"] = page.eval_on_selector_all(".pbtn.on", "els => els.map(e => e.dataset.id)")

        page.evaluate("document.querySelectorAll('.toast').forEach(t => t.remove())")
        page.evaluate("document.querySelector('.mains').scrollIntoView({block:'start'})")
        page.wait_for_timeout(250)
        page.screenshot(path=str(OUT / "06-mains-portions.png"))
        # 份量那一行单独拍一张（离主料卡有一段距离）
        page.evaluate("document.querySelector('.portions').scrollIntoView({block:'center'})")
        page.wait_for_timeout(250)
        page.screenshot(path=str(OUT / "07-portions.png"))

        # 存档往返：主料/份量要写进 localStorage
        page.wait_for_timeout(1200)
        raw = page.evaluate("localStorage.getItem('laoyou.save.v4')")
        saved = json.loads(raw) if raw else {}
        report["savedMain"] = saved.get("main")
        report["savedPortion"] = saved.get("portion")
        report["saveVersion"] = saved.get("saveVersion")

        browser.close()

    report["console_errors"] = errors
    report["ok"] = (
        not errors
        and report["mainCards"] == 10
        and report["portionBtns"] == 2
        and report["afterMain"] == "beef"
        and report["afterPortion"] == 3
        and report["savedMain"] == "beef"
        and report["savedPortion"] == 3
    )
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0 if report["ok"] else 1


if __name__ == "__main__":
    sys.exit(main())
