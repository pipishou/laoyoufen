"""S4 设备验收：真点买灶，看钱是否扣、出碗时间是否降、HUD 是否跟着变。

用法（先 npm run build，再在仓库根跑）：
    python tools/gate/equip_probe.py
"""

from __future__ import annotations

import json
import pathlib
import sys

from probe_console import on_console, noisy, texts
import os
from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parents[2]
URL = os.environ.get("PW_URL", "http://127.0.0.1:4173/")
SHOT_DIR = ROOT / "game" / "data" / "evidence" / "equip"

OUT: dict[str, object] = {}


def main() -> int:
    url = URL
    SHOT_DIR.mkdir(parents=True, exist_ok=True)
    with sync_playwright() as p:
        browser = p.chromium.launch(channel="msedge", headless=True, args=["--disable-extensions"])
        page = browser.new_page(viewport={"width": 1440, "height": 900})
        errors: list[str] = []
        page.on("console", on_console(errors))
        page.goto(url, wait_until="load", timeout=30000)
        page.evaluate("() => localStorage.clear()")
        page.reload(wait_until="load")
        page.wait_for_timeout(1600)

        # 跳过建店：选巷内小店 + 第一个候选名
        page.wait_for_selector('.sitecard[data-site="alley"]', timeout=20000)
        page.click('.sitecard[data-site="alley"]')
        page.click("[data-chips] .chip")
        page.click("[data-open]")
        page.wait_for_timeout(700)
        page.click("[data-openpill]")
        page.wait_for_timeout(500)

        before = page.evaluate(
            """() => {
              const s = window.__laoyou.state;
              return { cash: s.cash, stove: s.equipment.stove ?? 0,
                       caprow: document.querySelector('[data-caprow]')?.textContent ?? '' };
            }"""
        )
        OUT["before"] = before

        # 打开「店铺」页签（HUD 底部主按钮是 data-tab，面板内页签是 data-tab2）
        page.click('[data-tab="shop"]')
        page.wait_for_timeout(600)
        OUT["panel_serve_line"] = page.evaluate(
            """() => {
              const hs = Array.from(document.querySelectorAll('.sechd'));
              const h = hs.find((e) => e.textContent.includes('设备'));
              return h ? h.textContent.trim() : '';
            }"""
        )
        page.screenshot(path=str(SHOT_DIR / "01-shop-panel.png"))

        # 点第一个设备按钮（猛火灶 Lv0 → Lv1，¥1,500）
        page.click('button[data-act="buyequip"][data-id="stove"]')
        page.wait_for_timeout(500)

        after = page.evaluate(
            """() => {
              const s = window.__laoyou.state;
              const hs = Array.from(document.querySelectorAll('.sechd'));
              const h = hs.find((e) => e.textContent.includes('设备'));
              return { cash: s.cash, stove: s.equipment.stove ?? 0,
                       caprow: document.querySelector('[data-caprow]')?.textContent ?? '',
                       serveLine: h ? h.textContent.trim() : '' };
            }"""
        )
        OUT["after"] = after
        page.screenshot(path=str(SHOT_DIR / "02-after-stove.png"))

        # 再买案台：日上限 +40，HUD 产能行要跟着变
        page.click('button[data-act="buyequip"][data-id="bench"]')
        page.wait_for_timeout(500)
        after_bench = page.evaluate(
            """() => {
              const s = window.__laoyou.state;
              return { capacity: s.capacity, bench: s.equipment.bench ?? 0,
                       caprow: document.querySelector('[data-caprow]')?.textContent ?? '' };
            }"""
        )
        OUT["after_bench"] = after_bench
        page.screenshot(path=str(SHOT_DIR / "03-after-bench.png"))

        OUT["cash_spent"] = before["cash"] - after["cash"]  # type: ignore[index]
        OUT["serve_minutes_dropped"] = before["caprow"] != after["caprow"]  # type: ignore[index]
        OUT["console_error_count"] = len(noisy(errors))
        OUT["console_errors"] = texts(noisy(errors))[:5]
        browser.close()

    # 买灶要花 ¥1,500；期间店铺仍在营业会有进账，所以「净支出」只会更小
    spent = float(OUT["cash_spent"])  # type: ignore[arg-type]
    ab = OUT["after_bench"]  # type: ignore[index]
    ok = (
        1400 <= spent <= 1500
        and OUT["after"]["stove"] == 1  # type: ignore[index]
        and OUT["serve_minutes_dropped"]
        and ab["bench"] == 1
        and ab["capacity"] == 240
        and "日上限 240 碗" in ab["caprow"]
        and OUT["console_error_count"] == 0
    )
    OUT["ok"] = ok
    (SHOT_DIR / "probe.json").write_text(json.dumps(OUT, ensure_ascii=False, indent=1), encoding="utf-8")
    sys.stdout.reconfigure(encoding="utf-8")
    print(json.dumps(OUT, ensure_ascii=False, indent=1))
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
