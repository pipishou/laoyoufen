"""P0 验收：默认倍速 / 招牌不折行 / 排队分母 / 新开一局入口 / 引导不被秒过。

每一项都对着一份试玩报告里的编号：
  I-16 默认 ×4      → 开门后 6.5 秒，游戏内分钟应当是 5–9（1 倍），不是 20+
  I-15 店名折行      → `.logo` 的 computedStyle.whiteSpace 必须是 nowrap
  I-18 排队 9/8      → 排队分母必须等于 queueMaxOf（基础 12），不是写死的 8
  I-20 无重开入口    → 店铺面板底部必须有 [data-act="restart"]
  I-02 引导被秒过    → 打开配方面板后，引导仍停在「① 」，不会自己跳到下一步

用法：
    python tools/gate/probe_p0.py
前置：`npx vite preview --port 4182 --strictPort --host 127.0.0.1`
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

URL = "http://127.0.0.1:4182/"
ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "game" / "data" / "evidence" / "p0"


def js_click(page, selector: str) -> bool:
    return bool(
        page.evaluate(
            """(sel) => { const el = document.querySelector(sel); if (!el) return false; el.click(); return true; }""",
            selector,
        )
    )


def bootstrap(page) -> None:
    page.goto(URL, wait_until="networkidle")
    page.evaluate("localStorage.clear()")
    page.reload(wait_until="networkidle")
    page.wait_for_timeout(1000)
    js_click(page, '.sitecard[data-site="alley"]')
    page.wait_for_timeout(150)
    js_click(page, "[data-chips] .chip")
    page.wait_for_timeout(150)
    js_click(page, "[data-open]")
    page.wait_for_timeout(500)
    js_click(page, "[data-guide-hide]")
    page.wait_for_timeout(200)


def main() -> int:
    OUT.mkdir(parents=True, exist_ok=True)
    report: dict = {"url": URL, "checks": {}, "errors": []}
    ok = True

    with sync_playwright() as pw:
        browser = pw.chromium.launch(channel="msedge", headless=True)
        page = browser.new_page(viewport={"width": 1440, "height": 900})
        page.on("console", lambda m: report["errors"].append(m.text) if m.type == "error" else None)
        bootstrap(page)

        # I-02 引导不被秒过：先把引导收起来再点开恢复，然后切到配方页
        js_click(page, "[data-guide-hide]")
        page.wait_for_timeout(150)
        js_click(page, ".guiderestore")
        page.wait_for_timeout(250)
        js_click(page, '[data-tab="recipe"]')
        page.wait_for_timeout(600)
        guide = page.evaluate(
            """() => {
                const el = document.querySelector('.guide');
                const t = document.querySelector('.gtitle');
                return { visible: !!el && !el.hidden, title: t ? t.textContent.trim() : null };
            }"""
        )
        report["checks"]["引导停在第一步"] = guide
        if not guide["visible"] or not (guide["title"] or "").startswith("①"):
            ok = False

        # I-15 招牌不折行
        ws = page.evaluate(
            """() => getComputedStyle(document.querySelector('.logo')).whiteSpace"""
        )
        report["checks"]["招牌 white-space"] = ws
        if ws != "nowrap":
            ok = False

        # 收掉引导，便于观测
        js_click(page, "[data-guide-hide]")
        page.wait_for_timeout(150)

        # I-16 默认倍速：开门后等 6.5 秒
        js_click(page, "[data-openpill]")
        page.wait_for_timeout(6500)
        snap = page.evaluate(
            """() => {
                const s = window.__laoyou && window.__laoyou.state;
                return {
                    phase: s ? s.phase : null,
                    minuteOfDay: s ? s.flow.minuteOfDay : null,
                    clock: (document.querySelector('[data-clock]') || {}).textContent,
                    queue: (document.querySelector('[data-queue]') || {}).textContent,
                };
            }"""
        )
        report["checks"]["开门 6.5 秒后的游戏分钟"] = snap
        # 实测 1 倍下 6.5 秒 ≈ 6 游戏分钟；×4 会到 24 左右。
        # 卡「明显不是 ×4」即可：<= 10 视为 1 倍。
        if snap["phase"] != "open" or snap["minuteOfDay"] is None or snap["minuteOfDay"] > 10:
            ok = False

        # I-18 排队分母
        denom = (snap["queue"] or "").split("/")
        report["checks"]["排队分母"] = denom[1] if len(denom) > 1 else None
        if len(denom) < 2 or denom[1].strip() != "12":
            ok = False

        # I-20 新开一局入口
        js_click(page, '[data-tab="shop"]')
        page.wait_for_timeout(500)
        has_restart = page.evaluate(
            """() => !!document.querySelector('[data-act="restart"]')"""
        )
        report["checks"]["店铺底部有新开一局"] = has_restart
        if not has_restart:
            ok = False

        page.screenshot(path=str(OUT / "01-p0-shop.png"))

        browser.close()

    report["ok"] = ok
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
