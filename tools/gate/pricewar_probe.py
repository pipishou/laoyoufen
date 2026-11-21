"""批次 4.5（同行菜单两款 + 比价）的探针。

七件事：
1. 同条街那一段里有比价那句 `[data-pricewar]`；
2. 那句话带「你 ¥N」与「贵/便宜」；
3. 每家同行都写出两款与两个价（「菜单：猪杂粉 ¥9 ／ 牛腩粉 ¥12」）；
4. 把价牌压到比最便宜那家还低：那句话改口说「便宜」；
5. 抬到贵：那句话改口说「贵」；
6. 存档版本仍是 31（这一批不改存档形状）；
7. 控制台干净。

用法：先在 4209 起 preview，再 `python tools/gate/pricewar_probe.py`。
"""

from __future__ import annotations

import json
import os
import re

from playwright.sync_api import sync_playwright

URL = os.environ.get("PW_URL", "http://127.0.0.1:4209/")
OUT = "game/data/evidence/pricewar"

READ = """() => {
  const s = window.__laoyou.state;
  const pw = document.querySelector('[data-pricewar]');
  const secs = [...document.querySelectorAll('.sec')];
  const box = secs.find((x) => (x.textContent || '').includes('同条街'));
  const menus = box ? [...box.querySelectorAll('.lmeta')]
    .map((n) => (n.textContent || '').replace(/\\s+/g, ' ').trim())
    .filter((t) => t.startsWith('菜单：')) : [];
  return {
    pw: pw ? (pw.textContent || '').replace(/\\s+/g, ' ').trim() : '',
    found: !!box,
    menus,
    price: s ? s.menu[0].price : -1,
    saveVersion: JSON.parse(localStorage.getItem('laoyou.save.v4') || '{}').saveVersion ?? -1,
  };
}"""

SET_PRICE = """(price) => {
  const s = window.__laoyou.state;
  s.menu[0].price = price;
  s.price = price;
  window.__laoyou.refresh();
  return true;
}"""


def kill_modals(page) -> None:
    page.evaluate(
        "() => { document.querySelectorAll('.modal').forEach((m) => {"
        " if (!m.querySelector('[data-tab2]')) m.remove(); }); }"
    )


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
        page.wait_for_timeout(900)
        page.click('.sitecard[data-site="alley"]')
        page.click("[data-chips] .chip")
        page.click("[data-open]")
        page.wait_for_timeout(600)
        try:
            page.locator(".gbtn.ghost").click(timeout=1200)
        except Exception:
            pass
        kill_modals(page)

        page.click('[data-tab="shop"]', force=True)
        page.wait_for_timeout(400)
        kill_modals(page)
        page.evaluate(
            "() => { const b = document.querySelector('[data-tab2=\"shop\"]'); if (b) b.click(); }"
        )
        page.wait_for_timeout(400)

        page.evaluate(SET_PRICE, 10)
        page.wait_for_timeout(250)
        base = page.evaluate(READ)
        checks["section_found"] = bool(base["found"])
        checks["pricewar_present"] = bool(base["pw"])
        checks["pricewar_has_mine"] = "¥10" in base["pw"]
        checks["pricewar_says_dear"] = "贵" in base["pw"]
        checks["menu_two_dishes"] = len(base["menus"]) >= 1 and all("／" in m for m in base["menus"])
        checks["menu_has_prices"] = all(len(re.findall(r"¥\d+", m)) >= 2 for m in base["menus"]) if base["menus"] else False
        checks["save_version"] = base["saveVersion"] == 31
        page.screenshot(path=f"{OUT}/01-pricewar-dear.png")

        page.evaluate(SET_PRICE, 4)
        page.wait_for_timeout(250)
        cheap = page.evaluate(READ)
        checks["pricewar_says_cheap"] = "便宜" in cheap["pw"]
        page.screenshot(path=f"{OUT}/02-pricewar-cheap.png")

        checks["console_clean"] = not errors
        report = {
            "ok": all(checks.values()),
            "checks": checks,
            "base": base,
            "cheap": cheap,
            "errors": errors[:5],
        }
        with open(f"{OUT}/pricewar-report.json", "w", encoding="utf-8") as fh:
            json.dump(report, fh, ensure_ascii=False, indent=2)
        print(json.dumps(report, ensure_ascii=False))
        browser.close()
    return 0 if all(checks.values()) else 1


if __name__ == "__main__":
    raise SystemExit(main())
