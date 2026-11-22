"""批 C′（解读层）的探针。

八件事：
1. 打烊单上多出 `.daywhy` 两行，且都不是空的；
2. 「为什么」那行带人数（本地算的数字，AI 只补口气）；
3. 队满为主因时，那行说的是门口，不是价签；
4. 「菜单」那行说得出一款卖得动、一款一碗没动；
5. 这一片吃腻了（把搬进来的月份往前推十八个月）时，街坊会说一句；
6. 同一个月不会反复念（`lastAppetiteMonth` 记上了）；
7. 存档版本还是 36；
8. 控制台干净。

用法：先 `npm run -s build`，在 4219 起 `npx vite preview --port 4219`，
再在项目根 `python tools/gate/advice_probe.py`（URL 用 localhost，preview 只听 IPv6）。
"""

from __future__ import annotations

import json
import os

from playwright.sync_api import sync_playwright

URL = os.environ.get("PW_URL", "http://localhost:4219/")
OUT = "game/data/evidence/advice"

READ = """() => {
  const q = (sel) => {
    const n = document.querySelector(sel);
    return n ? (n.textContent || '').replace(/\\s+/g, ' ').trim() : '';
  };
  const s = window.__laoyou.state;
  return {
    rows: document.querySelectorAll('.daywhy span').length,
    loss: q('[data-loss-line]'),
    menu: q('[data-menu-line]'),
    toasts: [...document.querySelectorAll('.toast')].map((n) => (n.textContent || '')),
    said: s && s.flow ? s.flow.lastAppetiteMonth ?? -1 : -1,
    month: s ? s.month : -1,
    saveVersion: JSON.parse(localStorage.getItem('laoyou.save.v4') || '{}').saveVersion ?? -1,
  };
}"""

# 造一份「今天队满为主、菜单一冷一热」的打烊单
ENTRY = """(cfg) => {
  const s = window.__laoyou.state;
  s.phase = "closing";
  s.cash = 200000;
  s.gradeLevel = 6;
  // 菜单凑到两款：第二款是第一款的样子货，只为「一碗没动」那句能说出口
  if (s.menu.length < 2) {
    const clone = JSON.parse(JSON.stringify(s.menu[0]));
    clone.id = 99;
    clone.on = true;
    clone.sold = 0;
    s.menu.push(clone);
  }
  s.menu[0].sold = 40;
  s.menu[1].sold = 0;
  s.dayReport = {
    month: s.month, day: s.day, revenue: 320, served: 40,
    lost: cfg.q + cfg.p + cfg.w,
    lostQueue: cfg.q, lostPrice: cfg.p, lostWait: cfg.w,
    avgSat: 62, price: s.price, taste: 66, cash: s.cash,
    menuSold: { [String(s.menu[0].id)]: 12, [String(s.menu[1].id)]: 0 },
  };
  s.flow.lostQueue = cfg.q; s.flow.lostPrice = cfg.p; s.flow.lostWait = cfg.w;
  s.pendingTrophies = [];
  if (cfg.dry) s.districtSince = s.month - 18;
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

        page.evaluate(ENTRY, {"q": 9, "p": 1, "w": 0, "dry": False})
        page.wait_for_timeout(400)
        base = page.evaluate(READ)
        checks["rows_present"] = base["rows"] >= 2 and bool(base["loss"]) and bool(base["menu"])
        checks["loss_has_number"] = any(ch.isdigit() for ch in base["loss"])
        checks["loss_says_queue"] = "门口" in base["loss"]
        checks["menu_says_cold"] = "一碗没动" in base["menu"]
        checks["save_version"] = base["saveVersion"] == 36
        page.screenshot(path=f"{OUT}/01-advice-dayreport.png")

        # 吃腻了的那一句：把搬进来的月份往前推十八个月
        page.evaluate(ENTRY, {"q": 2, "p": 3, "w": 1, "dry": True})
        page.wait_for_timeout(500)
        told = page.evaluate(READ)
        checks["appetite_spoken"] = any("街坊说" in t for t in told["toasts"])
        checks["appetite_marked"] = told["said"] == told["month"]
        page.screenshot(path=f"{OUT}/02-advice-appetite.png")

        checks["console_clean"] = not errors
        report = {"ok": all(checks.values()), "checks": checks, "base": base, "told": told, "errors": errors[:5]}
        with open(f"{OUT}/advice-report.json", "w", encoding="utf-8") as fh:
            json.dump(report, fh, ensure_ascii=False, indent=2)
        print(json.dumps({"ok": report["ok"], "checks": checks, "errors": errors[:3]}, ensure_ascii=False))
        browser.close()
    return 0 if all(checks.values()) else 1


if __name__ == "__main__":
    raise SystemExit(main())
