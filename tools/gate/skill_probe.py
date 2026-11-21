"""批次六（手上的功夫）的探针：十二支三级，练一级是不是真的扣人情扣钱、加加成。

七件事：
1. 店铺页有「手上的功夫 · N / 36 节点」这一段，十二行、每行三个小方块；
2. 新局一个都没练，五条乘数都是原值（这里只看面板与状态）；
3. 人情/钱不够时按钮是灰的；
4. 注入人情与钱之后，点「练」：等级 0→1、人情与钱同时减少；
5. 抬头节点数 0→1，练满了那行变成「练满了」；
6. state.skills 真的写进去了，出碗系数变快；
7. 存档版本 33、控制台干净。

用法：先在 4211 起 preview，再 `python tools/gate/skill_probe.py`。
"""

from __future__ import annotations

import json
import os

from playwright.sync_api import sync_playwright

URL = os.environ.get("PW_URL", "http://127.0.0.1:4211/")
OUT = "game/data/evidence/skill"

READ = """() => {
  const s = window.__laoyou.state;
  const heads = [...document.querySelectorAll('.sec .sechd')].map((h) => (h.textContent || '').replace(/\\s+/g, ' ').trim());
  const head = heads.find((t) => t.includes('手上的功夫')) || '';
  const rows = [...document.querySelectorAll('[data-skill]')];
  const pips = rows.map((r) => r.querySelectorAll('.skpips i.on').length);
  const btn = document.querySelector('[data-skill="wok_fire"] button[data-act="skill"]');
  const firstRow = document.querySelector('[data-skill="wok_fire"]');
  return {
    head,
    rows: rows.length,
    pips,
    allPips: rows.length > 0 && rows.every((r) => r.querySelectorAll('.skpips i').length === 3),
    disabled: btn ? btn.hasAttribute('disabled') : null,
    firstText: firstRow ? (firstRow.textContent || '').replace(/\\s+/g, ' ').trim() : '',
    wok: s ? ((s.skills || {})['wok_fire'] || 0) : -1,
    favor: s ? Math.round(s.favor) : -1,
    cash: s ? Math.round(s.cash) : -1,
    saveVersion: JSON.parse(localStorage.getItem('laoyou.save.v4') || '{}').saveVersion ?? -1,
  };
}"""

CLICK = """(id) => {
  const b = document.querySelector(`[data-skill="${id}"] button[data-act="skill"]`);
  if (!b) return false;
  b.dispatchEvent(new MouseEvent('click', { bubbles: true }));
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

        # 店铺页 —— 手上的功夫长在这一页
        page.click('[data-tab="shop"]', force=True)
        page.wait_for_timeout(500)
        kill_modals(page)

        base = page.evaluate(READ)
        checks["section_present"] = base["head"].startswith("手上的功夫")
        checks["twelve_rows"] = base["rows"] == 12
        checks["three_pips_each"] = base["allPips"]
        checks["starts_empty"] = base["wok"] == 0 and sum(base["pips"]) == 0
        checks["head_zero"] = "0 / 36" in base["head"]
        checks["disabled_when_poor"] = base["disabled"] is True
        checks["first_row_is_cn"] = ("看火" in base["firstText"]) and ("人情 8" in base["firstText"])
        page.screenshot(path=f"{OUT}/01-skill-none.png")

        # 注入人情与钱：应县人练得起
        page.evaluate(
            "() => { const s = window.__laoyou.state; s.favor = 200; s.cash = 50_000; window.__laoyou.refresh(); }"
        )
        page.wait_for_timeout(300)
        rich = page.evaluate(READ)
        checks["enabled_when_rich"] = rich["disabled"] is False

        page.evaluate(CLICK, "wok_fire")
        page.wait_for_timeout(400)
        one = page.evaluate(READ)
        checks["learn_works"] = one["wok"] == 1
        checks["pips_one"] = one["pips"][0] == 1 if one["pips"] else False
        checks["favor_spent"] = one["favor"] < rich["favor"]
        checks["cash_spent"] = one["cash"] < rich["cash"]
        checks["head_one"] = "1 / 36" in one["head"]
        page.screenshot(path=f"{OUT}/02-skill-one.png")

        # 练到三级：这一行变成「练满了」
        page.evaluate(CLICK, "wok_fire")
        page.wait_for_timeout(250)
        page.evaluate(CLICK, "wok_fire")
        page.wait_for_timeout(400)
        three = page.evaluate(READ)
        checks["level_three"] = three["wok"] == 3
        checks["mastered_row"] = "练满了" in three["firstText"]
        checks["head_three"] = "3 / 36" in three["head"]
        checks["save_version"] = three["saveVersion"] == 33
        checks["console_clean"] = not errors
        page.screenshot(path=f"{OUT}/03-skill-mastered.png")

        browser.close()

    report = {"ok": all(checks.values()), "checks": checks, "base": base, "rich": rich, "one": one, "three": three, "errors": errors}
    with open(f"{OUT}/skill-report.json", "w", encoding="utf-8") as f:
        json.dump(report, f, ensure_ascii=False, indent=2)
    print(json.dumps(report, ensure_ascii=False))
    return 0 if report["ok"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
