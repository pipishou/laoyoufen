"""批 K′（手艺点数树）的探针。

十一件事：
1. 面板里有第七个页签「手艺」（`[data-tab2="perk"]`）；
2. 页签横向可滚（`.mtabs` 的 `overflow-x` 是 auto，375 宽放得下七个）；
3. 页内四块（`.pblock` 4 个）、十六格（`.ptree .pc` 16 个）；
4. 抬头写「还剩 N 点手艺」；
5. 零段位时点不动：toast 说「还差」，`perks` 还是空的；
6. 抬到第 5 段（28 点）后点第一项：`perks` 记上、剩余点数变少；
7. 点过的那一格有 `.on` 状态；
8. 存档版本 37；
9. 再点同一项：toast 说「点过」，点数不再变；
10. 控制台干净；
11. 截图两张（默认 / 点过一项）。

用法：先 `npm run -s build`，在 4226 起 `npx vite preview --port 4226`，
再在项目根 `python tools/gate/perk_probe.py`（URL 用 localhost，preview 只听 IPv6）。
"""

from __future__ import annotations

import json
import os

from playwright.sync_api import sync_playwright

URL = os.environ.get("PW_URL", "http://localhost:4226/")
OUT = "game/data/evidence/perk"

READ = """() => {
  const s = window.__laoyou.state;
  const box = [...document.querySelectorAll('.sec')].find((x) => x.querySelector('.ptree'));
  const tabs = document.querySelector('.mtabs');
  return {
    tab: !!document.querySelector('[data-tab2="perk"]'),
    blocks: box ? box.querySelectorAll('.pblock').length : 0,
    cells: box ? box.querySelectorAll('.ptree .pc').length : 0,
    ownedCells: box ? box.querySelectorAll('.ptree .pc.on').length : 0,
    points: box ? (box.querySelector('.ppoints')?.textContent || '').replace(/\\s+/g, ' ').trim() : '',
    perks: s && s.perks ? Object.keys(s.perks) : [],
    grade: s ? s.gradeLevel : -1,
    overflowX: tabs ? getComputedStyle(tabs).overflowX : '',
    saveVersion: JSON.parse(localStorage.getItem('laoyou.save.v4') || '{}').saveVersion ?? -1,
  };
}"""

SET_GRADE = """(lv) => {
  const s = window.__laoyou.state;
  s.gradeLevel = lv;
  window.__laoyou.refresh();
  return s.gradeLevel;
}"""

TOASTS = "() => [...document.querySelectorAll('.toast')].map((n) => (n.textContent || '').replace(/\\s+/g, ' ').trim())"

CLICK_CELL = """(idx) => {
  const cells = [...document.querySelectorAll('.ptree .pc')];
  const n = cells[idx];
  if (n) n.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  return !!n;
}"""

CLICK_CELL_ID = """(id) => {
  const n = document.querySelector(`.ptree .pc[data-id="${id}"]`);
  if (n) n.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  return !!n;
}"""

FIRST_CELL = "() => { const n = document.querySelector('.ptree .pc'); return n ? n.getAttribute('data-id') : ''; }"

CHAIN = """() => {
  const cells = [...document.querySelectorAll('.ptree .pc')];
  const blk = cells.filter((c) => c.classList.contains('blk'));
  const second = cells.find((c) => c.classList.contains('blk'));
  return {
    cells: cells.length,
    blocked: blk.length,
    title: second ? second.getAttribute('title') ?? '' : '',
    id: second ? second.getAttribute('data-id') ?? '' : '',
  };
}"""


def kill_modals(page) -> None:
    page.evaluate(
        "() => { document.querySelectorAll('.modal').forEach((m) => {"
        " if (!m.querySelector('[data-tab2]')) m.remove(); }); }"
    )


def open_perk(page) -> None:
    page.evaluate(
        "() => { const b = document.querySelector('[data-tab=\"recipe\"]'); if (b) b.click(); }"
    )
    page.wait_for_timeout(300)
    page.evaluate(
        "() => { const b = document.querySelector('[data-tab2=\"perk\"]'); if (b) b.click(); }"
    )
    page.wait_for_timeout(350)


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

        page.evaluate(SET_GRADE, 0)
        open_perk(page)
        base = page.evaluate(READ)
        chain0 = page.evaluate(CHAIN)
        checks["tab_present"] = base["tab"]
        checks["tabs_scroll"] = base["overflowX"] == "auto"
        checks["four_blocks"] = base["blocks"] == 4
        checks["sixteen_cells"] = base["cells"] == 16
        checks["points_shown"] = "点手艺" in base["points"]
        checks["chain_blocked_twelve"] = chain0["blocked"] == 12
        checks["chain_title_says_first"] = "先点「" in chain0["title"]
        page.screenshot(path=f"{OUT}/01-perk-tree.png")

        # 零段位：点不动
        first_id = page.evaluate(FIRST_CELL)
        page.evaluate(CLICK_CELL, 0)
        page.wait_for_timeout(300)
        toasts = page.evaluate(TOASTS)
        zero = page.evaluate(READ)
        checks["cannot_buy_at_zero"] = zero["perks"] == [] and any("还差" in t for t in toasts)

        # 零段位点被挡住的那一格：说「先点「X」」，一样不买
        page.evaluate(CLICK_CELL_ID, chain0["id"])
        page.wait_for_timeout(300)
        blocked_toasts = page.evaluate(TOASTS)
        blocked_now = page.evaluate(READ)
        checks["chain_refuses"] = blocked_now["perks"] == [] and any(
            "先点" in t for t in blocked_toasts
        )

        # 抬到第 5 段：28 点
        page.evaluate(SET_GRADE, 5)
        open_perk(page)
        before = page.evaluate(READ)
        page.evaluate(CLICK_CELL_ID, first_id)
        page.wait_for_timeout(350)
        after = page.evaluate(READ)
        checks["buy_one"] = first_id in after["perks"] and len(after["perks"]) == len(before["perks"]) + 1
        checks["owned_style"] = after["ownedCells"] == before["ownedCells"] + 1
        checks["save_version"] = after["saveVersion"] == 37

        again = page.evaluate(TOASTS)
        page.evaluate(CLICK_CELL_ID, first_id)
        page.wait_for_timeout(300)
        twice = page.evaluate(READ)
        toasts2 = page.evaluate(TOASTS)
        checks["cannot_buy_twice"] = len(twice["perks"]) == len(after["perks"]) and any(
            "点过" in t for t in toasts2
        )
        page.screenshot(path=f"{OUT}/02-perk-pointed.png")

        checks["console_clean"] = not errors
        report = {
            "ok": all(checks.values()),
            "checks": checks,
            "base": base,
            "before": before,
            "after": after,
            "toasts": toasts[:3] + again[:3] + toasts2[:3],
            "first_id": first_id,
            "chain": chain0,
            "errors": errors[:5],
        }
        with open(f"{OUT}/perk-report.json", "w", encoding="utf-8") as fh:
            json.dump(report, fh, ensure_ascii=False, indent=2)
        print(json.dumps(report, ensure_ascii=False))
        browser.close()
    return 0 if all(checks.values()) else 1


if __name__ == "__main__":
    raise SystemExit(main())
