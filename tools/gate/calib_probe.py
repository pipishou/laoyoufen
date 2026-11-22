"""数值校准（2026-11-22）的探针。

五件事，都盯着「界面上的钱对不对」：
1. 配方页「浇头」三十七枚都在，chip 上只写名字（加价藏在提示里，不糊在脸上）；
2. 加一份牛腩：成本按新表涨 ¥2.50（不是校准前的 ¥5.00），售价不动 —— 加料是料钱，不是改价签；
3. 价签抬 ¥2：状态、菜单、面板一起动；
4. 店铺页写的是新评定费表（第 1 段 ¥4,000，不是降费时代的 ¥500）；
5. 存档版本 35、控制台干净。

用法：先在 4217 起 preview，再在项目根 `python tools/gate/calib_probe.py`。
"""

from __future__ import annotations

import json
import os
import re

from playwright.sync_api import sync_playwright

URL = os.environ.get("PW_URL", "http://localhost:4217/")
OUT = "game/data/evidence/calib"

PAGE_TEXT = "() => (document.body.innerText || '').replace(/\\s+/g, ' ')"

STATE = """() => {
  const s = window.__laoyou.state;
  return {
    price: s.price,
    menus: s.menu.map((m) => ({ price: m.price, live: m.live !== false })),
    toppings: (s.menu[0] && s.menu[0].recipe.toppings) || [],
  };
}"""

MONEY = r"售价 ¥([\d.]+) · 成本 ¥([\d.]+) · 毛利 ¥([\d.]+)"


def kill_modals(page) -> None:
    page.evaluate(
        "() => { document.querySelectorAll('.modal').forEach((m) => {"
        " if (!m.querySelector('[data-tab2]')) m.remove(); }); }"
    )


def open_recipe(page) -> str:
    kill_modals(page)
    page.click('[data-tab="recipe"]', force=True)
    page.wait_for_timeout(500)
    kill_modals(page)
    return page.evaluate(PAGE_TEXT)


def main() -> int:
    os.makedirs(OUT, exist_ok=True)
    checks: dict[str, bool] = {}
    detail: dict[str, object] = {}
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
        page.wait_for_timeout(900)
        page.click('.sitecard[data-site="alley"]')
        page.click("[data-chips] .chip")
        page.click("[data-open]")
        page.wait_for_timeout(600)
        try:
            page.locator(".gbtn.ghost").click(timeout=1200)
        except Exception:
            pass

        text = open_recipe(page)
        m0 = re.search(MONEY, text)
        chips = page.evaluate(
            "() => [...document.querySelectorAll('[data-top]')]"
            ".map((n) => (n.textContent || '').trim())"
        )
        detail["chips_n"] = len(chips)
        detail["chips_sample"] = chips[:6]
        detail["money0"] = m0.groups() if m0 else None
        checks["chips_37"] = len(chips) == 37
        checks["chips_no_price"] = bool(chips) and all("¥" not in c for c in chips)
        checks["money_shown"] = bool(m0)
        page.screenshot(path=f"{OUT}/01-calib-recipe.png")

        # ② 加一份牛腩：成本应 +¥2.50
        cost0 = float(m0.group(2)) if m0 else -1
        page.evaluate(
            """() => {
              const chip = document.querySelector('[data-top="top.brisket"]');
              if (chip) chip.dispatchEvent(new MouseEvent('click', { bubbles: true }));
            }"""
        )
        page.wait_for_timeout(500)
        text2 = page.evaluate(PAGE_TEXT)
        m1 = re.search(MONEY, text2)
        cost1 = float(m1.group(2)) if m1 else -1
        price1 = float(m1.group(1)) if m1 else -1
        detail["money1"] = m1.groups() if m1 else None
        detail["delta"] = round(cost1 - cost0, 2)
        checks["brisket_costs_2_5"] = abs((cost1 - cost0) - 2.5) <= 0.11
        checks["price_unchanged"] = m0 is not None and abs(price1 - float(m0.group(1))) < 0.001
        on = page.evaluate(
            "() => { const c = document.querySelector('[data-top=\"top.brisket\"]');"
            " return !!(c && c.classList.contains('on')); }"
        )
        checks["chip_turns_on"] = bool(on)
        page.screenshot(path=f"{OUT}/02-calib-brisket.png")

        # ③ 价签抬 ¥2
        before = page.evaluate(STATE)
        page.evaluate(
            """() => {
              const s = window.__laoyou.state;
              s.price = s.price + 2;
              s.menu[0].price = s.menu[0].price + 2;
              window.__laoyou.refresh();
            }"""
        )
        page.wait_for_timeout(400)
        after = page.evaluate(STATE)
        checks["price_moves"] = after["price"] == before["price"] + 2
        checks["menu_price_moves"] = after["menus"][0]["price"] == before["menus"][0]["price"] + 2

        # ④ 店铺页评定费
        kill_modals(page)
        page.click('[data-tab="recipe"]', force=True)
        page.wait_for_timeout(300)
        page.evaluate(
            "() => { const b = document.querySelector('[data-tab2=\"shop\"]'); if (b) b.click(); }"
        )
        page.wait_for_timeout(600)
        shop = page.evaluate(PAGE_TEXT)
        row = re.search(r"评定 · 现在第 \d+ 段[^§]{0,80}", shop)
        detail["grade_row"] = row.group(0) if row else ""
        checks["grade_fee_new"] = "评定费 ¥4,000" in shop
        page.screenshot(path=f"{OUT}/03-calib-grade.png")

        ver = page.evaluate(
            "() => JSON.parse(localStorage.getItem('laoyou.save.v4') || '{}').saveVersion ?? -1"
        )
        checks["save_version"] = ver == 35
        checks["console_clean"] = not errors

        browser.close()

    ok = all(checks.values())
    print(json.dumps({"ok": ok, "checks": checks, "detail": detail, "errors": errors[:5]}, ensure_ascii=False))
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
