# -*- coding: utf-8 -*-
"""试玩二轮 F12 验收：引导卡不能压在配方的滑条与价牌上。

判据不看像素，看几何：引导卡的外框与
  · 配方页的「售价」滑条（`input[type=range]` 的第一个）
  · `.scorebig` 评分卡
必须不相交。改前是 `left:50% + bottom:308px`，与这两块几乎正对；改成贴右侧窄栏后应当完全让开。

跑法：
  npx vite preview --port 4196 --strictPort --host 127.0.0.1   （在 game/ 下）
  python tools/gate/guide_probe.py
"""

from __future__ import annotations

import json
import pathlib

from playwright.sync_api import sync_playwright

URL = "http://127.0.0.1:4196/"
OUT = pathlib.Path("game/data/evidence/f12")
OUT.mkdir(parents=True, exist_ok=True)


def rects(page) -> dict:
    return page.evaluate(
        """() => {
            const g = document.querySelector('.guide');
            if (!g) return { guide: null };
            const gr = g.getBoundingClientRect();
            const ranges = [...document.querySelectorAll('input[type=range]')];
            const big = document.querySelector('.scorebig');
            const rb = ranges.length ? ranges[0].getBoundingClientRect() : null;
            const bb = big ? big.getBoundingClientRect() : null;
            const hit = (a, b) =>
                !!a && !!b && !(a.right <= b.left || a.left >= b.right || a.bottom <= b.top || a.top >= b.bottom);
            return {
                guide: { x: Math.round(gr.left), y: Math.round(gr.top), w: Math.round(gr.width), h: Math.round(gr.height) },
                range: rb ? { x: Math.round(rb.left), y: Math.round(rb.top), w: Math.round(rb.width) } : null,
                big: bb ? { x: Math.round(bb.left), y: Math.round(bb.top), w: Math.round(bb.width) } : null,
                hitsRange: hit(gr, rb),
                hitsBig: hit(gr, bb),
                zGuide: getComputedStyle(g).zIndex,
            };
        }"""
    )


def main() -> dict:
    steps: list[dict] = []
    errors: list[str] = []
    with sync_playwright() as pw:
        browser = pw.chromium.launch()
        page = browser.new_page(viewport={"width": 1440, "height": 900})
        page.on("pageerror", lambda e: errors.append(str(e)))
        page.goto(URL, wait_until="load")
        page.evaluate("() => localStorage.clear()")
        page.reload(wait_until="load")

        # 建店，但**不收引导**（引导卡还在）
        page.wait_for_selector('[data-site="alley"]')
        page.click('[data-site="alley"]')
        page.click("[data-chips] .chip")
        page.wait_for_selector("[data-open]")
        page.evaluate("() => document.querySelector('[data-open]').click()")
        page.wait_for_timeout(900)

        # 打开配方页，让滑条与评分卡都渲染出来
        page.evaluate("() => document.querySelector('[data-tab=recipe]').click()")
        page.wait_for_timeout(700)

        first = rects(page)
        steps.append({"step": "guide_vs_recipe", **first})
        page.screenshot(path=str(OUT / "01-guide-right.png"))

        # 换一个窄视口：引导卡按 56% 宽度，最容易撞上滑条
        page.set_viewport_size({"width": 390, "height": 844})
        page.wait_for_timeout(500)
        narrow = rects(page)
        steps.append({"step": "guide_narrow", **narrow})
        page.screenshot(path=str(OUT / "02-guide-narrow.png"))

        browser.close()

    checks = {
        "guide_visible": steps[0]["guide"] is not None,
        "no_overlap_range": steps[0]["hitsRange"] is False,
        "no_overlap_big": steps[0]["hitsBig"] is False,
        "right_side": (steps[0]["guide"] or {}).get("x", 0) > 700,
        "narrow_still_visible": steps[1]["guide"] is not None,
        "narrow_no_overlap_range": steps[1]["hitsRange"] is False,
        "narrow_no_overlap_big": steps[1]["hitsBig"] is False,
        "console_clean": not errors,
    }
    report = {"ok": all(checks.values()), "checks": checks, "steps": steps, "console_errors": errors}
    (OUT / "guide-report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return report


if __name__ == "__main__":
    r = main()
    raise SystemExit(0 if r["ok"] else 1)
