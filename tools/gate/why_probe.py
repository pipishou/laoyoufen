"""批 E′（为什么那行 + 左下角口径 + 副行不重样）的探针。

七件事：
1. 打烊单上还是两行（`.daywhy` 没被改坏）；
2. 「为什么」那行给的是具体的形：几张桌；
3. 它和日注不是同一句（试玩 11-22-2109 第 4 条）；
4. 左下角「一碗约 N 分钟」读的是模拟里真的出碗间隔（`flow.serveInterval`），
   不再写死 6.0（同报告备注：两边口径不一致）；
5. 往 `flow.serveInterval` 里塞一个 3.4，左下角跟着写 3.4 —— 证明它读的是模拟，不是常量；
6. 存档版本还是 36；
7. 控制台干净。

用法：先 `npm run -s build`，在 4221 起 `npx vite preview --port 4221`，
再在项目根 `python tools/gate/why_probe.py`（URL 用 localhost，preview 只听 IPv6）。
"""

from __future__ import annotations

import json
import os

from playwright.sync_api import sync_playwright
from probe_version import SAVE_VERSION

URL = os.environ.get("PW_URL", "http://localhost:4221/")
OUT = "game/data/evidence/why"

READ = """() => {
  const q = (sel) => {
    const n = document.querySelector(sel);
    return n ? (n.textContent || '').replace(/\\s+/g, ' ').trim() : '';
  };
  const s = window.__laoyou.state;
  const span = q('[data-cooknow]').match(/一碗约\\s*([\\d.]+)\\s*分钟/);
  return {
    rows: document.querySelectorAll('.daywhy span').length,
    why: q('[data-loss-line]'),
    note: q('[data-day-note]'),
    cooknow: q('[data-cooknow]'),
    spanText: span ? Number(span[1]) : -1,
    interval: s && s.flow && s.flow.serveInterval ? Number(s.flow.serveInterval) : -1,
    saveVersion: JSON.parse(localStorage.getItem('laoyou.save.v4') || '{}').saveVersion ?? -1,
  };
}"""

ENTRY = """(cfg) => {
  const s = window.__laoyou.state;
  s.phase = "closing";
  s.cash = 200000;
  s.gradeLevel = 6;
  s.dayReport = {
    month: s.month, day: s.day, revenue: 320, served: 40,
    lost: cfg.q + cfg.p + cfg.w,
    lostQueue: cfg.q, lostPrice: cfg.p, lostWait: cfg.w,
    avgSat: 62, price: s.price, taste: 66, cash: s.cash,
    menuSold: { [String(s.menu[0].id)]: 12 },
  };
  s.flow.lostQueue = cfg.q; s.flow.lostPrice = cfg.p; s.flow.lostWait = cfg.w;
  s.pendingTrophies = [];
  window.__laoyou.refresh();
  return true;
}"""


def main() -> int:
    os.makedirs(OUT, exist_ok=True)
    checks: dict[str, bool] = {}
    errors: list[str] = []
    with sync_playwright() as pw:
        browser = pw.chromium.launch()
        page = browser.new_page(viewport={"width": 1440, "height": 900})
        page.on("pageerror", lambda e: errors.append(str(e)))
        page.on(
            "console",
            lambda m: errors.append(m.text)
            if m.type == "error" and "/laoyou-api/" not in (m.location or {}).get("url", "")
            else None,
        )

        page.goto(URL, wait_until="networkidle")
        page.evaluate("() => { localStorage.clear(); location.reload(); }")
        page.wait_for_timeout(1000)
        page.click('.sitecard[data-site="alley"]')
        page.click("[data-chips] .chip")
        page.click("[data-open]")
        page.wait_for_timeout(600)
        try:
            page.locator(".gbtn.ghost").click(timeout=1200)
        except Exception:
            pass
        page.wait_for_timeout(400)

        page.evaluate(ENTRY, {"q": 12, "p": 1, "w": 0})
        page.wait_for_timeout(500)
        base = page.evaluate(READ)
        checks["why_rows"] = base["rows"] >= 2 and bool(base["why"])
        checks["why_says_tables"] = "张桌" in base["why"]
        checks["why_differs_from_note"] = bool(base["note"]) and base["why"] != base["note"] and (
            "两头看一眼" not in base["why"]
        )
        checks["save_version"] = base["saveVersion"] == SAVE_VERSION
        page.screenshot(path=f"{OUT}/01-why-report.png")

        # 回到营业、让 HUD 停在一碗的时间上，读左下角
        page.evaluate("() => { const s = window.__laoyou.state; s.phase = 'open'; window.__laoyou.refresh(); }")
        page.wait_for_timeout(700)
        before = page.evaluate(READ)
        # 没出过碗时 serveInterval 还是 -1（走 SERVE_MINUTES 兜底），这时只看它有没有数字
        checks["cooknow_uses_interval"] = before["spanText"] > 0 and (
            before["interval"] <= 0 or abs(before["spanText"] - round(before["interval"], 1)) <= 0.11
        )
        page.screenshot(path=f"{OUT}/02-why-cooknow.png")

        # 塞一个 3.4 分钟的出碗间隔：左下角应当跟着写 3.4（不是写死的 6.0）
        page.evaluate("() => { const s = window.__laoyou.state; s.flow.serveInterval = 3.4; window.__laoyou.refresh(); }")
        page.wait_for_timeout(500)
        after = page.evaluate(READ)
        checks["cooknow_follows_interval"] = (
            after["spanText"] > 0 and abs(after["spanText"] - 3.4) <= 0.11
        )
        page.screenshot(path=f"{OUT}/03-why-cooknow-34.png")

        checks["console_clean"] = not errors
        report = {
            "ok": all(checks.values()),
            "checks": checks,
            "before": before,
            "after": after,
            "base": base,
            "errors": errors[:5],
        }
        with open(f"{OUT}/why-report.json", "w", encoding="utf-8") as fh:
            json.dump(report, fh, ensure_ascii=False, indent=2)
        print(json.dumps({"ok": report["ok"], "checks": checks, "errors": errors[:3]}, ensure_ascii=False))
        browser.close()
    return 0 if all(checks.values()) else 1


if __name__ == "__main__":
    raise SystemExit(main())
