"""P44 分店（S6）验收：注入段位与现金 → 店铺页签里真点「选区 → 开店 → 关店」→ 断言与截图。

用法（先 npm run build；另开 `npx vite preview --port 4173`）：
    python tools/gate/branch_probe.py
"""

from __future__ import annotations

import json
import pathlib

from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parents[2]
URL = "http://127.0.0.1:4173/"
SHOT_DIR = ROOT / "game" / "data" / "evidence" / "p44"
OUT: dict[str, object] = {}


def click_js(page, selector: str) -> None:
    """面板每秒重渲染，Playwright 的 actionability 会因节点被换掉而超时，统一用 DOM click。"""
    page.evaluate(
        """(sel) => { const el = document.querySelector(sel); if (el) el.click(); }""",
        selector,
    )


def main() -> int:
    SHOT_DIR.mkdir(parents=True, exist_ok=True)
    with sync_playwright() as p:
        browser = p.chromium.launch(channel="msedge", headless=True, args=["--disable-extensions"])
        page = browser.new_page(viewport={"width": 1440, "height": 900})
        errors: list[str] = []
        page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
        page.goto(URL, wait_until="load", timeout=30000)
        page.evaluate("() => localStorage.clear()")
        page.reload(wait_until="load")
        page.wait_for_timeout(600)

        # 过建店
        page.click('.sitecard[data-site="alley"]')
        page.click("[data-chips] .chip")
        page.click("[data-open]")
        page.wait_for_timeout(500)

        # 真玩要攒到第 8 段 + ¥20 万，验收只验「能不能开、开完账对不对」
        page.evaluate("() => { const s = window.__laoyou.state; s.gradeLevel = 8; s.cash = 200000; }")
        click_js(page, '[data-tab="shop"]')
        page.wait_for_timeout(700)

        sec = """() => {
          const secs = [...document.querySelectorAll('.sec')];
          return secs.find((s) => (s.querySelector('.sechd')||{}).textContent?.includes('分店')) || null;
        }"""

        page.evaluate(
            """() => {
              const secs = [...document.querySelectorAll('.sec')];
              const b = secs.find((s) => (s.querySelector('.sechd')||{}).textContent?.includes('分店'));
              if (b) b.scrollIntoView({ block: 'center' });
              document.querySelectorAll('.toast').forEach((t) => t.remove());
            }"""
        )
        page.wait_for_timeout(300)

        before = page.evaluate(
            """() => {
              const secs = [...document.querySelectorAll('.sec')];
              const b = secs.find((s) => (s.querySelector('.sechd')||{}).textContent?.includes('分店'));
              if (!b) return { found: false };
              const rows = [...b.querySelectorAll('.lrow')];
              const opts = [...b.querySelectorAll('[data-act="openbranch"]')];
              return {
                found: true,
                header: b.querySelector('.sechd').textContent.trim(),
                picks: [...b.querySelectorAll('.dpick')].map((d) => d.dataset.id),
                sizes: opts.map((o) => o.dataset.id),
                locked: rows.filter((r) => r.classList.contains('locked')).length,
                hasKairo: b.textContent.includes('Buy'),
                cash: Math.round(window.__laoyou.state.cash),
              };
            }"""
        )
        page.screenshot(path=str(SHOT_DIR / "06-branch-panel.png"))

        # 选区：青秀（日客流最大），再开一家小档口
        click_js(page, '.dpick[data-id="qingxiu"]')
        page.wait_for_timeout(600)
        picked = page.evaluate(
            """() => {
              const on = document.querySelector('.dpick.on');
              return on ? on.dataset.id : null;
            }"""
        )
        click_js(page, '[data-act="openbranch"][data-id="small"]')
        page.wait_for_timeout(700)

        after_open = page.evaluate(
            """() => {
              const s = window.__laoyou.state;
              return {
                branches: s.branches.map((b) => ({ id: b.id, district: b.district, size: b.size, warmth: b.warmth })),
                cash: Math.round(s.cash),
              };
            }"""
        )
        page.evaluate(
            """() => {
              const secs = [...document.querySelectorAll('.sec')];
              const b = secs.find((s) => (s.querySelector('.sechd')||{}).textContent?.includes('分店'));
              if (b) b.scrollIntoView({ block: 'center' });
              document.querySelectorAll('.toast').forEach((t) => t.remove());
            }"""
        )
        page.wait_for_timeout(300)
        page.screenshot(path=str(SHOT_DIR / "07-branch-open.png"))

        # 关店：退半个月租
        click_js(page, '[data-act="closebranch"]')
        page.wait_for_timeout(600)
        after_close = page.evaluate(
            """() => {
              const s = window.__laoyou.state;
              return { branches: s.branches.length, cash: Math.round(s.cash) };
            }"""
        )

        OUT.update(
            {
                "ok": bool(before.get("found"))
                and len(before.get("sizes") or []) == 4
                and picked == "qingxiu"
                and len(after_open["branches"]) == 1
                and after_open["branches"][0]["district"] == "qingxiu"
                and after_close["branches"] == 0
                and errors == [],
                "before": before,
                "picked": picked,
                "after_open": after_open,
                "after_close": after_close,
                "console_errors": errors[:5],
            }
        )
        browser.close()

    print(json.dumps(OUT, ensure_ascii=False, indent=2))
    return 0 if OUT.get("ok") else 1


if __name__ == "__main__":
    raise SystemExit(main())
