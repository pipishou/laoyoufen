"""批 L'（店员成长）的探针。

九件事：
1. 面板里有「员工」页签，能打开；
2. 在职那一行多出一行成长（`.lmeta.grow`）；
3. 那一行写得出四项属性（火候 / 待客 / 脚力 / 耐磨）；
4. 写得出「再干 N 天升一级」；
5. 干到 3 天（xp=3）就学会「看火」——手艺是打工打出来的，不用点；
6. 干到 24 天（xp=24）火候到 3；
7. 干到 168 天（xp=168）出毕业技「多下一份」；
8. 存档版本还是 37（xp 是可选字段，老档不缺就不升版本）；
9. 控制台干净。

用法：先 `npm run -s build`，在 4227 起 `npx vite preview --port 4227`，
再在项目根 `python tools/gate/staff_probe.py`（URL 用 localhost，preview 只听 IPv6）。
"""

from __future__ import annotations

import json
import os

from playwright.sync_api import sync_playwright

URL = os.environ.get("PW_URL", "http://localhost:4227/")
OUT = "game/data/evidence/staff"

READ = """() => {
  const s = window.__laoyou.state;
  const rows = [...document.querySelectorAll('.lmeta.grow')];
  const text = rows.map((n) => (n.textContent || '').replace(/\\s+/g, ' ').trim());
  return {
    staffTab: !!document.querySelector('[data-tab2="staff"]'),
    rows: text,
    xp: s && s.staff && s.staff.roster[0] ? (s.staff.roster[0].xp ?? 0) : -1,
    roster: s && s.staff ? s.staff.roster.length : -1,
    saveVersion: JSON.parse(localStorage.getItem('laoyou.save.v4') || '{}').saveVersion ?? -1,
  };
}"""

SET_XP = """(xp) => {
  const s = window.__laoyou.state;
  s.staff.roster = [{
    uid: 'probe-1', templateId: 'st.aqiang', name: '阿强', role: 'cook',
    skill: 3, wage: 150, fatigue: 0, resting: false, xp: xp,
  }];
  window.__laoyou.refresh();
  return s.staff.roster[0].xp;
}"""


def kill_modals(page) -> None:
    page.evaluate(
        "() => { document.querySelectorAll('.modal').forEach((m) => {"
        " if (!m.querySelector('[data-tab2]')) m.remove(); }); }"
    )


def open_staff(page) -> None:
    page.evaluate(
        "() => { const b = document.querySelector('[data-tab=\"recipe\"]'); if (b) b.click(); }"
    )
    page.wait_for_timeout(280)
    page.evaluate(
        "() => { const b = document.querySelector('[data-tab2=\"staff\"]'); if (b) b.click(); }"
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

        # ① 新来的：四属性都 1 级
        page.evaluate(SET_XP, 0)
        open_staff(page)
        base = page.evaluate(READ)
        text0 = base["rows"][0] if base["rows"] else ""
        checks["staff_tab"] = base["staffTab"]
        checks["grow_row"] = bool(base["rows"])
        checks["four_attrs"] = all(w in text0 for w in ("火候", "待客", "脚力", "耐磨"))
        checks["next_level"] = "再干" in text0 and "升一级" in text0

        # ② 干到 3 天：火候 2，学会「看火」
        page.evaluate(SET_XP, 3)
        open_staff(page)
        three = page.evaluate(READ)
        text3 = three["rows"][0] if three["rows"] else ""
        checks["learns_at_3"] = "看火" in text3 and "火候 2" in text3
        page.screenshot(path=f"{OUT}/01-staff-grow.png")

        # ③ 干到 24 天：火候 3
        page.evaluate(SET_XP, 24)
        open_staff(page)
        mid = page.evaluate(READ)
        text24 = mid["rows"][0] if mid["rows"] else ""
        checks["attr_up"] = "火候 3" in text24

        # ④ 干到 168 天：毕业技
        page.evaluate(SET_XP, 168)
        open_staff(page)
        vet = page.evaluate(READ)
        text168 = vet["rows"][0] if vet["rows"] else ""
        checks["finish_shows"] = "毕业技" in text168 and "多下一份" in text168
        page.screenshot(path=f"{OUT}/02-staff-veteran.png")

        checks["save_version"] = vet["saveVersion"] == 37
        checks["console_clean"] = not errors

        report = {
            "ok": all(checks.values()),
            "checks": checks,
            "base": base,
            "three": three,
            "mid": mid,
            "vet": vet,
            "errors": errors[:5],
        }
        with open(f"{OUT}/staff-report.json", "w", encoding="utf-8") as fh:
            json.dump(report, fh, ensure_ascii=False, indent=2)
        print(json.dumps(report, ensure_ascii=False))
        browser.close()
    return 0 if all(checks.values()) else 1


if __name__ == "__main__":
    raise SystemExit(main())
