"""P43 验收：这碗粉叫什么 + 饮料冰热。

清 localStorage → 过建店 → 注入客流解锁加料 → 配方页读品名 → 上架猪杂 → 换砂锅粉 → 看名字变；
店铺页把饮料切热的。截图落 `game/data/evidence/p43/`。

用法（先 npm run build；另开 `npx vite preview --port 4173`）：
    python tools/gate/dish_probe.py
"""

from __future__ import annotations

import json
import pathlib

from probe_console import on_console, noisy, texts
import os
from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parents[2]
URL = os.environ.get("PW_URL", "http://127.0.0.1:4173/")
SHOT_DIR = ROOT / "game" / "data" / "evidence" / "p43"
OUT: dict[str, object] = {}


def click_js(page, selector: str) -> None:
    """面板每秒重渲染，Playwright 的 actionability 会超时，统一用 DOM click。"""
    page.evaluate(
        """(sel) => { const el = document.querySelector(sel); if (el) el.click(); }""",
        selector,
    )


def dish(page) -> dict[str, str]:
    return page.evaluate(
        """() => ({
          name: (document.querySelector('[data-dishname]') || {}).textContent || '',
          note: (document.querySelector('[data-dishnote]') || {}).textContent || '',
        })"""
    )


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

        page.click('.sitecard[data-site="alley"]')
        page.click("[data-chips] .chip")
        page.click("[data-open]")
        page.wait_for_timeout(500)

        # 加料按累计客流解锁（猪杂 150 / 腐竹 600 / 青菜 1000），验收直接给客流
        page.evaluate("() => { window.__laoyou.state.totalCustomers = 3000; }")
        click_js(page, '[data-tab="recipe"]')
        page.wait_for_timeout(600)
        base = dish(page)

        # 上架猪杂 → 名字该从「老友粉」变成「老友猪杂粉」
        click_js(page, '[data-tab="shop"]')
        page.wait_for_timeout(500)
        click_js(page, '[data-act="toggleside"][data-id="zhuzai"]')
        page.wait_for_timeout(500)
        click_js(page, '[data-tab="recipe"]')
        page.wait_for_timeout(600)
        with_offal = dish(page)

        # 换砂锅粉 → 做法进名字
        click_js(page, '.ncard[data-id="claypot"]')
        page.wait_for_timeout(600)
        sandpot = dish(page)
        page.evaluate(
            """() => {
              const b = document.querySelector('[data-dishname]');
              if (b) b.scrollIntoView({ block: 'center' });
              document.querySelectorAll('.toast').forEach((t) => t.remove());
            }"""
        )
        page.wait_for_timeout(300)
        page.screenshot(path=str(SHOT_DIR / "06-dish-name.png"))

        # 饮料冰热：切热的
        click_js(page, '[data-tab="shop"]')
        page.wait_for_timeout(500)
        click_js(page, '[data-act="drinktemp"][data-id="hot"]')
        page.wait_for_timeout(500)
        temp = page.evaluate(
            """() => {
              const s = window.__laoyou.state;
              const secs = [...document.querySelectorAll('.sec')];
              const b = secs.find((x) => (x.querySelector('.sechd')||{}).textContent?.includes('加料台'));
              return {
                drinkTemp: s.sides.drinkTemp,
                row: b ? b.textContent.includes('饮料冰热') : false,
                on: [...document.querySelectorAll('[data-act="drinktemp"].on')].map((x) => x.dataset.id),
              };
            }"""
        )
        page.evaluate(
            """() => {
              const row = [...document.querySelectorAll('.lrow')].find((x) => x.textContent.includes('饮料冰热'));
              if (row) row.scrollIntoView({ block: 'center' });
              document.querySelectorAll('.toast').forEach((t) => t.remove());
            }"""
        )
        page.wait_for_timeout(300)
        page.screenshot(path=str(SHOT_DIR / "07-drink-temp.png"))

        OUT.update(
            {
                "ok": base["name"] == "老友粉"
                and "猪杂" in with_offal["name"]
                and sandpot["name"].startswith("砂锅")
                and temp["drinkTemp"] == "hot"
                and temp["row"] is True
                and not noisy(errors),
                "base": base,
                "with_offal": with_offal,
                "sandpot": sandpot,
                "temp": temp,
                "console_errors": texts(noisy(errors))[:5],
            }
        )
        browser.close()

    print(json.dumps(OUT, ensure_ascii=False, indent=2))
    return 0 if OUT.get("ok") else 1


if __name__ == "__main__":
    raise SystemExit(main())
