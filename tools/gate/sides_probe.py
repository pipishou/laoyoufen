"""P41 加料台验收：过建店 → 注入累计客流解锁后段 → 打开店铺页签 → 上架卤蛋，断言行数与在架状态 → 截图。

用法（先 npm run build；另开 `npx vite preview --port 4173`）：
    python tools/gate/sides_probe.py
"""

from __future__ import annotations

import json
import pathlib

from probe_console import on_console, noisy, texts
from probe_source import SIDE_DRINK_IDS, SIDE_TOP_IDS
import os
from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parents[2]
URL = os.environ.get("PW_URL", "http://127.0.0.1:4173/")
DEV_URL = URL + ("&" if "?" in URL else "?") + "dev=1"  # 出处（kairo）只在 ?dev=1 下渲染，见 ui/dev.ts
SHOT_DIR = ROOT / "game" / "data" / "evidence" / "p41"
SIDE_IDS = SIDE_TOP_IDS + SIDE_DRINK_IDS


def main() -> int:
    SHOT_DIR.mkdir(parents=True, exist_ok=True)
    out: dict[str, object] = {}
    with sync_playwright() as p:
        browser = p.chromium.launch(
            channel="msedge", headless=True, args=["--disable-extensions"]
        )
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

        # 真玩要攒客流，验收只验墨染与生效：注入累计 700 位（此时加料解锁到腐竹）
        page.evaluate("() => { window.__laoyou.state.totalCustomers = 700; }")
        page.evaluate(
            """() => {
              const btn = document.querySelector('[data-tab="shop"]');
              if (btn) btn.click();
            }"""
        )
        page.wait_for_timeout(700)

        before = page.evaluate(
            """(all) => {
              const secs = [...document.querySelectorAll('.sec')];
              const sec = secs.find((x) => (x.querySelector('.sechd') || {}).textContent?.includes('加料台'));
              if (!sec) return { found: false };
              const rows = [...sec.querySelectorAll('.lrow')];
              const on = rows.filter((r) => (r.textContent || '').includes('在架')).length;
              const locked = rows.filter((r) => r.classList.contains('locked')).length;
              // 批 BB1′：不再写死「12 行」——表里每一条都得渲染出来（见 probe_source）
              const ids = [...sec.querySelectorAll('[data-id]')].map((e) => e.dataset.id);
              return {
                found: true,
                header: (sec.querySelector('.sechd') || {}).textContent || '',
                rows: rows.length,
                missing: all.filter((id) => !ids.includes(id)),
                on,
                locked,
                hasKairo: (sec.textContent || '').includes('开罗：'),
                hasComboLine: (sec.textContent || '').includes('凑出组合'),
              };
            }""",
            SIDE_IDS,
        )

        # 上架卤蛋：面板每秒重渲染，用 DOM click 避免 actionability 卡住
        page.evaluate(
            """() => {
              const btn = document.querySelector('button[data-act="toggleside"][data-id="ludan"]');
              if (btn && !btn.disabled) btn.click();
            }"""
        )
        page.wait_for_timeout(700)

        after = page.evaluate(
            """() => {
              const secs = [...document.querySelectorAll('.sec')];
              const sec = secs.find((x) => (x.querySelector('.sechd') || {}).textContent?.includes('加料台'));
              if (!sec) return { found: false };
              const btn = sec.querySelector('button[data-act="toggleside"][data-id="ludan"]');
              const rows = [...sec.querySelectorAll('.lrow')];
              return {
                header: (sec.querySelector('.sechd') || {}).textContent || '',
                ludanBtn: (btn || {}).textContent || '',
                on: rows.filter((r) => (r.textContent || '').includes('在架')).length,
                active: window.__laoyou.state.sides.active,
              };
            }"""
        )

        # 面板很长（店面→设备→摆件→加料台），截图前把加料台滚到视口中间
        page.evaluate(
            """() => {
              const secs = [...document.querySelectorAll('.sec')];
              const sec = secs.find((x) => (x.querySelector('.sechd') || {}).textContent?.includes('加料台'));
              if (sec) sec.scrollIntoView({ block: 'center' });
              const toast = document.querySelector('.toast');
              if (toast) toast.remove();
            }"""
        )
        page.wait_for_timeout(400)
        page.screenshot(path=str(SHOT_DIR / "06-sides.png"))
        out = {"before": before, "after": after, "errors": texts(errors)[:5]}
        browser.close()

    print(json.dumps(out, ensure_ascii=False, indent=2))
    ok = (
        bool(out["before"])  # type: ignore[index]
        and out["before"]["found"]  # type: ignore[index]
        and not out["before"]["missing"]  # type: ignore[index]
        and out["before"]["on"] == 3  # type: ignore[index]
        and out["after"]["ludanBtn"] == "下架"  # type: ignore[index]
        and "ludan" in out["after"]["active"]  # type: ignore[index]
        and not noisy(errors)
    )
    print(json.dumps({"ok": ok}))
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
