"""批次二（产能三段）的探针：一碗拆成炒锅 / 汤锅 / 粉篓之后，面板与浮层是不是真的在报这三段。

六件事：
1. 店铺页「设备」段有一行三段读数（炒锅 / 汤锅 / 粉篓，各带分钟数与口数）；
2. 段标题上说得出「最慢是哪一段」；
3. 四件设备各一行（猛火灶 / 汤锅 / 粉篓与汤勺 / 案台），每行写出「现在几口」；
4. 买一档猛火灶：炒锅的口数涨、那一分钟数降，别段不动；
5. HUD 的毛利条 title 里也有三段；
6. 存档版本仍是 31（这一批不升版本）。

用法：先在 4206 起 preview，再 `python tools/gate/stage_probe.py`。
"""

from __future__ import annotations

import json
import os

from playwright.sync_api import sync_playwright

URL = "http://127.0.0.1:4206/"
OUT = "game/data/evidence/stage"

READ = """() => {
  const pane = document.querySelector('[data-pane="shop"]');
  if (!pane) return { found: false };
  const secs = [...pane.querySelectorAll('.sec')];
  const sec = secs.find((x) => {
    const h = x.querySelector('.sechd');
    return h && (h.textContent || '').includes('设备');
  });
  const econ = document.querySelector('[data-econ]');
  return {
    found: !!sec,
    head: sec ? (sec.querySelector('.sechd').textContent || '') : '',
    metas: sec ? [...sec.querySelectorAll('.lmeta')].map((m) => m.textContent || '') : [],
    names: sec ? [...sec.querySelectorAll('.lname')].map((n) => n.textContent || '') : [],
    buys: sec ? sec.querySelectorAll('[data-act="buyequip"]').length : 0,
    econTitle: econ ? econ.getAttribute('title') || '' : '',
    version: (window.__laoyou && window.__laoyou.state && window.__laoyou.state.saveVersion) || 0,
  };
}"""


def kill_modals(page) -> None:
    page.evaluate(
        "() => { document.querySelectorAll('.modal').forEach((m) => {"
        " if (!m.querySelector('[data-tab2]')) m.remove(); }); }"
    )


def minutes_of(meta: str, label: str) -> float | None:
    """从「炒锅 2.2 分/2 口」这样的串里取分钟数。"""
    idx = meta.find(label)
    if idx < 0:
        return None
    tail = meta[idx + len(label):]
    num = ""
    for ch in tail.strip():
        if ch.isdigit() or ch == ".":
            num += ch
        elif num:
            break
    try:
        return float(num)
    except ValueError:
        return None


def main() -> int:
    os.makedirs(OUT, exist_ok=True)
    checks: dict[str, bool] = {}
    with sync_playwright() as pw:
        browser = pw.chromium.launch()
        page = browser.new_page(viewport={"width": 1440, "height": 900})
        errors: list[str] = []
        page.on("pageerror", lambda e: errors.append(str(e)))
        page.goto(URL, wait_until="networkidle")
        page.evaluate("() => { localStorage.clear(); location.reload(); }")
        page.wait_for_timeout(1200)
        page.click('.sitecard[data-site="alley"]')
        page.click("[data-chips] .chip")
        page.click("[data-open]")
        page.wait_for_timeout(600)
        try:
            page.locator(".gbtn.ghost").click(timeout=1200)
        except Exception:
            pass
        page.wait_for_timeout(400)

        page.evaluate("() => { window.__laoyou.state.cash = 400000; window.__laoyou.refresh(); }")
        kill_modals(page)
        page.click('[data-tab="shop"]')
        page.wait_for_timeout(600)

        base = page.evaluate(READ)
        stage_meta = base["metas"][0] if base["metas"] else ""
        checks["section_found"] = base["found"]
        checks["stage_line_three"] = all(k in stage_meta for k in ("炒锅", "汤锅", "粉篓"))
        checks["slowest_shown"] = "最慢" in base["head"]
        checks["four_equip_rows"] = base["buys"] == 4
        checks["row_names"] = sum(1 for n in base["names"] if any(k in n for k in ("猛火灶", "汤锅", "粉篓", "案台"))) == 4
        checks["row_shows_count"] = any("现在" in m and "口" in m for m in base["metas"][1:])
        checks["econ_title_stages"] = all(k in base["econTitle"] for k in ("炒锅", "汤锅", "粉篓"))
        page.screenshot(path=f"{OUT}/01-stage-shop.png")

        wok0 = minutes_of(stage_meta, "炒锅")
        pot0 = minutes_of(stage_meta, "汤锅")
        page.click('[data-act="buyequip"][data-id="stove"]')
        page.wait_for_timeout(500)
        after = page.evaluate(READ)
        stage_meta2 = after["metas"][0] if after["metas"] else ""
        wok1 = minutes_of(stage_meta2, "炒锅")
        pot1 = minutes_of(stage_meta2, "汤锅")
        checks["buy_lowers_wok"] = wok0 is not None and wok1 is not None and wok1 < wok0
        checks["buy_keeps_pot"] = pot0 is not None and pot1 is not None and abs(pot1 - pot0) < 0.05
        checks["buy_raises_count"] = "2 口" in stage_meta2
        page.screenshot(path=f"{OUT}/02-stage-after-stove.png")

        checks["save_version"] = base["version"] == 31
        checks["console_clean"] = len(errors) == 0
        browser.close()

    ok = all(checks.values())
    report = {"ok": ok, "checks": checks, "errors": errors, "base": base, "stage_meta": stage_meta}
    with open(f"{OUT}/stage-report.json", "w", encoding="utf-8") as fh:
        json.dump(report, fh, ensure_ascii=False, indent=2)
    print(json.dumps({"ok": ok, "checks": checks}, ensure_ascii=False, indent=2))
    if not ok:
        print(json.dumps({"base": base, "stage_meta": stage_meta}, ensure_ascii=False)[:1500])
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
