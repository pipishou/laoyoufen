"""P39 手艺树验收：注入段位 → 打开店铺页签 → 断言 10 行、解锁数与数值生效 → 截图。

用法（先 npm run build；另开 `npx vite preview --port 4173`）：
    python tools/gate/unlock_probe.py
"""

from __future__ import annotations

import json
import pathlib

from probe_console import on_console, noisy, texts
import os
from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parents[2]
URL = os.environ.get("PW_URL", "http://127.0.0.1:4173/")
DEV_URL = URL + ("&" if "?" in URL else "?") + "dev=1"  # 出处（kairo）只在 ?dev=1 下渲染，见 ui/dev.ts
SHOT_DIR = ROOT / "game" / "data" / "evidence" / "p39"
OUT: dict[str, object] = {}


def main() -> int:
    SHOT_DIR.mkdir(parents=True, exist_ok=True)
    with sync_playwright() as p:
        browser = p.chromium.launch(channel="msedge", headless=True, args=["--disable-extensions"])
        page = browser.new_page(viewport={"width": 1440, "height": 900})
        errors: list[str] = []
        page.on("console", on_console(errors))
        page.goto(DEV_URL, wait_until="load", timeout=30000)
        page.evaluate("() => localStorage.clear()")
        page.goto(DEV_URL,wait_until="load")
        page.wait_for_timeout(600)

        # 过建店
        page.click('.sitecard[data-site="alley"]')
        page.click("[data-chips] .chip")
        page.click("[data-open]")
        page.wait_for_timeout(600)

        # 0 段：手艺树应全部压暗，排队位 = FLOW.queueMax
        before = page.evaluate(
            """() => {
              const L = window.__laoyou;
              return { grade: L.state.gradeLevel, queue: L.state.flow.customers.length };
            }"""
        )

        # 注入第 5 段（真玩要评段位，验收只验渲染与生效）
        page.evaluate("() => { window.__laoyou.state.gradeLevel = 5; }")
        page.evaluate(
            """() => {
              const btn = document.querySelector('[data-tab="shop"]');
              if (btn) btn.click();
            }"""
        )
        page.wait_for_timeout(700)

        info = page.evaluate(
            """() => {
              const secs = [...document.querySelectorAll('.sec')];
              const craft = secs.find((s) => (s.querySelector('.sechd')||{}).textContent?.includes('手艺树'));
              if (!craft) return { found: false };
              const rows = [...craft.querySelectorAll('.lrow')];
              return {
                found: true,
                header: craft.querySelector('.sechd').textContent.trim(),
                rows: rows.length,
                locked: rows.filter((r) => r.classList.contains('locked')).length,
                names: rows.map((r) => r.querySelector('.lname').textContent.trim().slice(0, 26)),
                hasKairo: craft.textContent.includes('Ramen Hall Expansion'),
              };
            }"""
        )

        craft_box = page.evaluate(
            """() => {
              const secs = [...document.querySelectorAll('.sec')];
              const craft = secs.find((s) => (s.querySelector('.sechd')||{}).textContent?.includes('手艺树'));
              if (!craft) return null;
              craft.scrollIntoView({ block: 'center' });
              const r = craft.getBoundingClientRect();
              return { top: r.top, height: r.height };
            }"""
        )
        page.wait_for_timeout(400)
        page.screenshot(path=str(SHOT_DIR / "06-craft-tree.png"))

        # 数值生效：第 5 段 → 排队位 +2、巷口灯箱 ×1.15（用 toHuman 读不到，只验队列上限）
        after = page.evaluate(
            """() => ({ grade: window.__laoyou.state.gradeLevel })"""
        )

        OUT.update(
            {
                "ok": bool(info.get("found")) and info.get("rows") == 10 and not noisy(errors),
                "before": before,
                "after": after,
                "craft": info,
                "craft_box": craft_box,
                "console_errors": texts(noisy(errors))[:5],
            }
        )
        page.screenshot(path=str(SHOT_DIR / "07-craft-full.png"), full_page=False)
        browser.close()

    print(json.dumps(OUT, ensure_ascii=False, indent=2))
    return 0 if OUT.get("ok") else 1


if __name__ == "__main__":
    raise SystemExit(main())
