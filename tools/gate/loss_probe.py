"""试玩 11-21 第 1–4 批的真点探针：钩子会不会点名真原因。

三件事：
1. 打烊单在「看价牌走的人最多」那天点名压价，不是加灶；
2. 日注按真实原因分流（四天同一句模板是上一轮的问题）；
3. 红标只标一段（不再店面和设备同时亮）。

用法：先起 preview 4204，再 python tools/gate/loss_probe.py
"""

from __future__ import annotations

import json
import sys

from playwright.sync_api import sync_playwright

URL = "http://127.0.0.1:4204/"
OUT = "game/data/evidence/loss"

READ = """() => {
  const q = (s) => document.querySelector(s);
  const hook = q("[data-day-hook]");
  return {
    main: (q("[data-hook-main]") || {}).textContent || "",
    why: (q("[data-hook-why]") || {}).textContent || "",
    kind: hook ? hook.dataset.hookKind || "" : "",
    bad: hook ? hook.classList.contains("bad") : false,
    hidden: hook ? hook.hidden : true,
    note: (q("[data-day-note]") || {}).textContent || "",
    hot: document.querySelectorAll(".sechd.hot").length,
    hotText: [...document.querySelectorAll(".sechd.hot")].map((e) => e.textContent || "").join(" | "),
    version: (window.__laoyou && window.__laoyou.state && window.__laoyou.state.saveVersion) || 0,
  };
}"""

ENTRY = """(cfg) => {
  const s = window.__laoyou.state;
  s.phase = "closing";
  s.cash = 200000;
  s.price = cfg.price;
  for (const item of s.menu) item.price = cfg.price;
  s.dayReport = {
    month: s.month, day: s.day, revenue: 320, served: 40, lost: cfg.q + cfg.p + cfg.w,
    lostQueue: cfg.q, lostPrice: cfg.p, lostWait: cfg.w,
    avgSat: 44, price: cfg.price, taste: 62, cash: s.cash,
  };
  s.flow.lostQueue = cfg.q; s.flow.lostPrice = cfg.p; s.flow.lostWait = cfg.w;
  s.flow.lostToday = cfg.q + cfg.p + cfg.w; s.flow.servedToday = 40;
  s.pendingTrophies = [];
  window.__laoyou.refresh();
  return true;
}"""


def main() -> int:
    checks: dict[str, bool] = {}
    shots: list[str] = []
    with sync_playwright() as pw:
        browser = pw.chromium.launch()
        page = browser.new_page(viewport={"width": 1440, "height": 900})
        errors: list[str] = []
        page.on("pageerror", lambda e: errors.append(str(e)))
        page.goto(URL, wait_until="networkidle")
        page.evaluate("() => { localStorage.clear(); location.reload(); }")
        page.wait_for_timeout(1200)
        page.click('[data-site="alley"]')
        page.click("[data-chips] .chip")
        page.click("[data-open]")
        page.wait_for_timeout(600)
        try:
            page.click(".gbtn.ghost", timeout=1500)
        except Exception:
            pass
        page.wait_for_timeout(400)

        # ① 看价牌走的人最多
        page.evaluate(ENTRY, {"q": 2, "p": 44, "w": 4, "price": 10})
        page.wait_for_timeout(500)
        price = page.evaluate(READ)
        checks["price_kind"] = price["kind"] == "price"
        checks["price_says_cut"] = "降到" in price["main"]
        checks["price_why_counts"] = "看价牌" in price["why"]
        checks["note_names_price"] = "看价牌" in price["note"]
        checks["no_stove_when_price"] = "猛火灶" not in price["main"]
        page.screenshot(path=f"{OUT}/01-price-hook.png")

        # ② 门口站满没人进来
        page.evaluate(ENTRY, {"q": 45, "p": 3, "w": 2, "price": 9})
        page.wait_for_timeout(500)
        queue = page.evaluate(READ)
        checks["queue_kind"] = queue["kind"] == "capacity"
        checks["note_names_queue"] = "站满" in queue["note"]
        page.screenshot(path=f"{OUT}/02-queue-hook.png")

        # ③ 红标只标一段（打烊单是模态，会拦住页签点击 → 先把浮层收掉）
        page.evaluate(
            "() => { const m = document.querySelector('.modal.dayreport'); if (m) { m.hidden = true; m.style.display = 'none'; } }"
        )
        page.click('[data-tab="shop"]')
        page.wait_for_timeout(500)
        shop = page.evaluate(READ)
        checks["hot_at_most_one"] = shop["hot"] <= 1
        page.screenshot(path=f"{OUT}/03-shop-one-red.png")

        checks["console_clean"] = len(errors) == 0
        browser.close()

    report = {
        "ok": all(checks.values()),
        "checks": checks,
        "price": price if "price" in dir() else None,
        "queue": queue if "queue" in dir() else None,
        "shop_hot": shop if "shop" in dir() else None,
        "pageerrors": errors,
    }
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0 if report["ok"] else 1


if __name__ == "__main__":
    sys.exit(main())
