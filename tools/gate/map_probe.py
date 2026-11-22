"""批次九（地图四圈与物产）的探针。

七件事：
1. 图鉴页有「南宁 · 在…看得见 N / 4 圈」那一段；
2. 新局（段 0）只看得见第一圈：十二格里八个是空框，写着「第 2 / 4 / 6 段」；
3. 空框里的名字是「?」，不是区名（没揭开就不该知道叫什么）；
4. 把段位抬到 6：十二格全开，空框一个不剩；
5. 搬到马山：提示行写「这一片产马山八角」，格子上出现物产小字；
6. 存档版本是 35；
7. 控制台干净。

用法：先在 4214 起 preview，再在项目根 `python -X utf8 tools/gate/map_probe.py`。
"""

from __future__ import annotations

import json
import os

from playwright.sync_api import sync_playwright

URL = os.environ.get("PW_URL", "http://127.0.0.1:4214/")
OUT = "game/data/evidence/map9"

READ = """() => {
  const secs = [...document.querySelectorAll('.sec')];
  const box = secs.find((x) => (x.textContent || '').includes('南宁 ·'));
  const head = box ? (box.querySelector('.sechd')?.textContent || '').replace(/\\s+/g, ' ').trim() : '';
  const cells = box ? [...box.querySelectorAll('.mcell')].map((n) => ({
    text: (n.textContent || '').replace(/\\s+/g, ' ').trim(),
    locked: n.classList.contains('lock'),
    title: n.getAttribute('title') || '',
    prod: (n.querySelector('.mprod')?.textContent || '').trim(),
  })) : [];
  const hint = box ? (box.querySelector('.hint')?.textContent || '').replace(/\\s+/g, ' ').trim() : '';
  return {
    found: !!box,
    head,
    hint,
    cells,
    saveVersion: JSON.parse(localStorage.getItem('laoyou.save.v4') || '{}').saveVersion ?? -1,
  };
}"""

SET_GRADE = """(g) => {
  const s = window.__laoyou.state;
  s.gradeLevel = g;
  window.__laoyou.refresh();
  return s.gradeLevel;
}"""

SET_DISTRICT = """(d) => {
  const s = window.__laoyou.state;
  s.district = d;
  window.__laoyou.refresh();
  return s.district;
}"""


def kill_modals(page) -> None:
    page.evaluate(
        "() => { document.querySelectorAll('.modal').forEach((m) => {"
        " if (!m.querySelector('[data-tab2]')) m.remove(); }); }"
    )


def open_collection(page) -> None:
    page.click('[data-tab="recipe"]', force=True)
    page.wait_for_timeout(400)
    kill_modals(page)
    page.evaluate("() => { const b = document.querySelector('[data-tab2=\"collection\"]'); if (b) b.click(); }")
    page.wait_for_timeout(500)


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
        kill_modals(page)
        open_collection(page)

        base = page.evaluate(READ)
        locked = [c for c in base["cells"] if c["locked"]]
        detail["base"] = {"head": base["head"], "locked": len(locked), "cells": base["cells"][:4]}
        checks["section_found"] = bool(base["found"])
        checks["head_has_rings"] = "1 / 4 圈" in base["head"]
        checks["twelve_cells"] = len(base["cells"]) == 12
        checks["eight_locked"] = len(locked) == 8
        checks["locked_is_question"] = all(c["text"].startswith("?") for c in locked)
        checks["locked_names_gate"] = all("段" in c["text"] for c in locked)
        page.screenshot(path=f"{OUT}/01-map-ring1.png")

        page.evaluate(SET_GRADE, 6)
        page.wait_for_timeout(500)
        full = page.evaluate(READ)
        detail["full"] = {"head": full["head"], "locked": sum(1 for c in full["cells"] if c["locked"])}
        checks["all_open"] = sum(1 for c in full["cells"] if c["locked"]) == 0
        checks["three_local_cells"] = len([c for c in full["cells"] if c["prod"]]) == 3
        checks["head_four_rings"] = "4 / 4 圈" in full["head"]
        page.screenshot(path=f"{OUT}/02-map-all.png")

        page.evaluate(SET_DISTRICT, "mashan")
        page.wait_for_timeout(500)
        mashan = page.evaluate(READ)
        detail["mashan"] = {"head": mashan["head"], "hint": mashan["hint"], "prods": [c["prod"] for c in mashan["cells"] if c["prod"]]}
        checks["local_in_hint"] = "马山八角" in mashan["hint"]
        checks["local_on_cell"] = any(c["prod"] for c in mashan["cells"])
        checks["local_cell_still"] = len([c for c in mashan["cells"] if c["prod"]]) == 3
        page.screenshot(path=f"{OUT}/03-map-mashan.png")

        checks["save_version"] = mashan["saveVersion"] == 35
        checks["console_clean"] = not errors

        browser.close()

    ok = all(checks.values())
    print(json.dumps({"ok": ok, "checks": checks, "detail": detail, "errors": errors[:5]}, ensure_ascii=False))
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
