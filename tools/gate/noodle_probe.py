"""P42 粉型验收：粉型卡片能点、换粉生效、套餐能开、截图。

用法（先 `npm run build`，另开 `npx vite preview --port 4173`）：
    python tools/gate/noodle_probe.py

断言的是一条真链路：DOM 里那张卡 → 面板 action → sim 状态 → 面板重渲染，
不是只看函数返回值。
"""

from __future__ import annotations

import json
import pathlib

from probe_console import on_console, noisy, texts
from probe_source import NOODLE_TOTAL
import os
from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parents[2]
URL = os.environ.get("PW_URL", "http://127.0.0.1:4173/")
SHOT_DIR = ROOT / "game" / "data" / "evidence" / "p42"
OUT: dict[str, object] = {}


def main() -> int:
    SHOT_DIR.mkdir(parents=True, exist_ok=True)
    with sync_playwright() as p:
        browser = p.chromium.launch(channel="msedge", headless=True, args=["--disable-extensions"])
        page = browser.new_page(viewport={"width": 1440, "height": 900})
        errors: list[str] = []
        page.on("console", on_console(errors))
        page.goto(URL, wait_until="load", timeout=30000)
        page.evaluate("() => localStorage.clear()")
        page.reload(wait_until="load")
        page.wait_for_timeout(600)

        # 过建店：巷内小店 → 挑个店名 → 开张
        page.click('.sitecard[data-site="alley"]')
        page.click("[data-chips] .chip")
        page.click("[data-open]")
        page.wait_for_timeout(500)

        # 打开配方页（粉型卡片就在这一页）
        page.evaluate("""() => document.querySelector('[data-tab="recipe"]')?.click()""")
        page.wait_for_timeout(500)

        locked_view = page.evaluate(
            """(n) => {
              // 批 BB1′：`.ncard` 后来被汤底卡（bcard）与款卡（mcard）共用，
              // 直接数 `.ncard` 会数到十九张 —— 这里只数粉型卡，条数取 data/noodles.ts
              const cards = [...document.querySelectorAll('.ncard:not(.bcard):not(.mcard)')];
              return {
                count: cards.length,
                total: n,
                on: cards.filter((c) => c.classList.contains('on')).map((c) => c.dataset.id),
                locked: cards.filter((c) => c.disabled).map((c) => c.dataset.id),
                summary: (document.querySelector('[data-noodlesum]') || {}).textContent || '',
              };
            }""",
            NOODLE_TOTAL,
        )
        OUT["locked"] = locked_view

        # 注入客流把它全解锁（真玩要一件件攒）；准备阶段时间不走，
        # 面板不会自己重渲染，所以切一下页签触发 refresh，再回配方页。
        page.evaluate("() => { window.__laoyou.state.totalCustomers = 2000; }")
        page.evaluate("""() => document.querySelector('[data-tab=shop]')?.click()""")
        page.wait_for_timeout(300)
        page.evaluate("""() => document.querySelector('[data-tab=recipe]')?.click()""")
        page.wait_for_timeout(500)
        page.evaluate(
            """() => {
              const card = document.querySelector('.ncard[data-id="claypot"]');
              if (card) card.click();
            }"""
        )
        page.wait_for_timeout(600)

        after = page.evaluate(
            """() => {
              const s = window.__laoyou.state;
              const cards = [...document.querySelectorAll('.ncard')];
              return {
                noodle: s.noodle,
                on: cards.filter((c) => c.classList.contains('on')).map((c) => c.dataset.id),
                summary: (document.querySelector('[data-noodlesum]') || {}).textContent || '',
                fits: cards.map((c) => (c.querySelector('.nfit') || {}).textContent || ''),
              };
            }"""
        )
        OUT["after"] = after

        # 店铺页：开套餐
        page.evaluate("""() => document.querySelector('[data-tab=shop]')?.click()""")
        page.wait_for_timeout(600)
        page.evaluate(
            """() => {
              const b = document.querySelector('[data-act="mealdeal"]');
              if (b) b.click();
            }"""
        )
        page.wait_for_timeout(500)
        OUT["meal"] = page.evaluate("() => ({ mealDeal: window.__laoyou.state.sides.mealDeal })")

        # 回配方页截图（配方页是粉型卡片的家）
        page.evaluate("""() => document.querySelector('[data-tab2=recipe]')?.click()""")
        page.wait_for_timeout(500)
        page.evaluate(
            """() => {
              document.querySelectorAll('.toast').forEach((t) => t.remove());
              const el = document.querySelector('.noodles');
              if (el) el.scrollIntoView({ block: 'center' });
            }"""
        )
        page.wait_for_timeout(300)
        page.screenshot(path=str(SHOT_DIR / "06-noodle-cards.png"))

        OUT["consoleErrors"] = errors
        OUT["ok"] = (
            locked_view["count"] == locked_view["total"]
            and locked_view["total"] == NOODLE_TOTAL
            and "flat" in locked_view["on"]
            and after["noodle"] == "claypot"
            and "claypot" in after["on"]
            and OUT["meal"]["mealDeal"] is True
            and len(noisy(errors)) == 0
        )
        browser.close()

    print(json.dumps(OUT, ensure_ascii=False, indent=2))
    return 0 if OUT.get("ok") else 1


if __name__ == "__main__":
    raise SystemExit(main())
