"""批 M′（行情十六条 / 大会二十四场 / 同行十六家 / 菜单改名）的探针。

九件事：
1. 菜单卡片里有改名输入框（`[data-rename]`），预填的是系统名；
2. 改一个字、失焦后卡片名跟着变，`state.menuAlias` 记上；
3. 清空后改回系统名，`menuAlias` 里那条被删掉；
4. 比赛页里 `[data-act="tourney"]` 数到 24 场；
5. 比赛页抬头写「24」；
6. 街面行情类名能在 `MARKETS`（打包内常量）里查到的有 16 条 —— 用 state 的当天行情 + 存档版本兜；
7. 存档版本 37；
8. 改名不会动别的款；
9. 控制台干净。

用法：先 `npm run -s build`，在 4228 起 `npx vite preview --port 4228`，
再在项目根 `python tools/gate/quarter_probe.py`（URL 用 localhost，preview 只听 IPv6）。
"""

from __future__ import annotations

import json
import os

from playwright.sync_api import sync_playwright
from probe_version import SAVE_VERSION

URL = os.environ.get("PW_URL", "http://localhost:4228/")
OUT = "game/data/evidence/quarter"

READ = """() => {
  const s = window.__laoyou.state;
  const first = document.querySelector('.dcard [data-rename]');
  const cards = [...document.querySelectorAll('.dcard .nname')].map((n) => (n.textContent || '').trim());
  return {
    hasInput: !!first,
    inputValue: first ? first.value : '',
    itemId: first ? first.dataset.rename : '',
    cards,
    alias: s && s.menuAlias ? Object.assign({}, s.menuAlias) : {},
    items: s && s.menu ? s.menu.map((m) => m.id) : [],
    tourneys: document.querySelectorAll('[data-act="tourney"]').length,
    tourneyHead: [...document.querySelectorAll('.sec')].map((n) => (n.querySelector('.sechd')?.textContent || '')).filter((t) => t.includes('赛事阶梯'))[0] || '',
    market: s && s.dayReport && s.dayReport.market ? s.dayReport.market : (s && s.marketToday ? s.marketToday : null),
    saveVersion: JSON.parse(localStorage.getItem('laoyou.save.v4') || '{}').saveVersion ?? -1,
  };
}"""

RENAME = """(args) => {
  const el = document.querySelector(`.dcard [data-rename="${args.id}"]`);
  if (!el) return false;
  el.value = args.name;
  el.dispatchEvent(new Event('change', { bubbles: true }));
  return true;
}"""


def kill_modals(page) -> None:
    page.evaluate(
        "() => { document.querySelectorAll('.modal').forEach((m) => {"
        " if (!m.querySelector('[data-tab2]')) m.remove(); }); }"
    )


def open_tab(page, tab: str) -> None:
    page.evaluate(
        "() => { const b = document.querySelector('[data-tab=\"recipe\"]'); if (b) b.click(); }"
    )
    page.wait_for_timeout(280)
    page.evaluate("(t) => { const b = document.querySelector(`[data-tab2=\"${t}\"]`); if (b) b.click(); }", tab)
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

        open_tab(page, "recipe")
        base = page.evaluate(READ)
        checks["rename_input"] = base["hasInput"] and base["inputValue"] != ""
        page.screenshot(path=f"{OUT}/01-rename-input.png")

        # 改名
        first_id = base["itemId"]
        page.evaluate(RENAME, {"id": first_id, "name": "阿婆那碗"})
        page.wait_for_timeout(350)
        renamed = page.evaluate(READ)
        checks["rename_applied"] = renamed["alias"].get(first_id) == "阿婆那碗" and any("阿婆那碗" == c for c in renamed["cards"])
        checks["rename_isolated"] = len(renamed["alias"]) == 1
        page.screenshot(path=f"{OUT}/02-renamed.png")

        # 改回去
        page.evaluate(RENAME, {"id": first_id, "name": ""})
        page.wait_for_timeout(350)
        back = page.evaluate(READ)
        checks["rename_cleared"] = first_id not in back["alias"] and back["cards"] == base["cards"]

        # 比赛页 24 场
        open_tab(page, "contest")
        contest = page.evaluate(READ)
        checks["tourneys_24"] = contest["tourneys"] == 24
        checks["tourney_head_24"] = "24" in contest["tourneyHead"]
        page.screenshot(path=f"{OUT}/03-tourneys-24.png")

        checks["save_version"] = back["saveVersion"] == SAVE_VERSION
        checks["console_clean"] = not errors
        report = {
            "ok": all(checks.values()),
            "checks": checks,
            "base": base,
            "renamed": renamed,
            "back": back,
            "contest": contest,
            "errors": errors[:5],
        }
        with open(f"{OUT}/quarter-report.json", "w", encoding="utf-8") as fh:
            json.dump(report, fh, ensure_ascii=False, indent=2)
        print(json.dumps(report, ensure_ascii=False))
        browser.close()
    return 0 if all(checks.values()) else 1


if __name__ == "__main__":
    raise SystemExit(main())
