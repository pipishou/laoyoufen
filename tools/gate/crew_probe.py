# -*- coding: utf-8 -*-
"""批 AR′ 的探针：店面页说清「灶位只是上限，开火要有人掌勺」。

三态：
  1. 开局（灶 1 口、老板一个人）→ 不该出现「没人看」那一行；
  2. 把灶买到 3 口但不雇人 → 出现 `[data-crew-idle]`，且说「第 2 口起没人看」；
  3. 雇一个煮粉师傅 → 那行消失（人手够）。
另加一条：员工页也会说同一句话（两处同源，不是两套说法）。
"""
import json
import os
import re
import sys

from playwright.sync_api import sync_playwright

URL = os.environ.get("PW_URL", "http://localhost:4246/")
OUT = "game/data/evidence/crew"
if not os.path.isdir(OUT):
    os.makedirs(OUT)

INIT = """
(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  for (let i = 0; i < 60; i += 1) {
    if (window.__laoyou && window.__laoyou.state) break;
    await sleep(100);
  }
  const $ = (sel) => document.querySelector(sel);
  $('.sitecard[data-site="alley"]')?.click();
  await sleep(200);
  $('[data-chips] .chip')?.click();
  await sleep(200);
  $('[data-open]')?.click();
  await sleep(400);
  $('.gbtn.ghost')?.click();
  await sleep(600);
  $('[data-tab="recipe"]')?.click();
  await sleep(300);
  $('[data-tab2="shop"]')?.click();
  await sleep(400);
  return true;
})()
"""

SET_STOVES = """
(n) => {
  const s = window.__laoyou.state;
  s.venue.stoves = n;
  window.__laoyou.refresh();
}
"""

HIRE_COOK = """
() => {
  const s = window.__laoyou.state;
  s.staff.roster.push({
    uid: 'probe-cook-1', name: '试工师傅', role: 'cook', wage: 120,
    fatigue: 0, skill: 20, xp: 0, resting: false,
  });
  window.__laoyou.refresh();
}
"""

READ_SHOP = """
() => {
  const p = document.querySelector('.pane[data-pane="shop"]');
  const el = p && p.querySelector('[data-crew-idle]');
  return {
    has: !!el,
    text: el ? el.textContent.trim() : '',
    stoves: window.__laoyou.state.venue.stoves,
    seats: window.__laoyou.state.venue.seats,
  };
}
"""

READ_STAFF = """
() => {
  const p = document.querySelector('.pane[data-pane="staff"]');
  const el = p && p.querySelector('[data-crew-idle]');
  return { has: !!el, text: el ? el.textContent.trim() : '' };
}
"""


def main():
    checks = {}
    with sync_playwright() as pw:
        browser = pw.chromium.launch()
        page = browser.new_page(viewport={"width": 1440, "height": 900})
        errors = []
        page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
        page.goto(URL, wait_until="load")
        page.evaluate(INIT)
        page.wait_for_timeout(400)

        start = page.evaluate(READ_SHOP)
        checks["start_shows_facts"] = start["has"] is False
        checks["start_stoves_one"] = start["stoves"] == 1

        page.evaluate(SET_STOVES, 3)
        page.wait_for_timeout(300)
        three = page.evaluate(READ_SHOP)
        checks["three_stoves_warns"] = three["has"] is True
        checks["three_stoves_says_second"] = "第 2 口起没人看" in three["text"]
        checks["three_stoves_counts"] = "灶位 3 口" in three["text"] and "只有 1 个人掌勺" in three["text"]
        checks["three_stoves_no_price"] = not re.search(r"¥|元|买|推荐|建议", three["text"])

        page.screenshot(path=f"{OUT}/01-crew-idle.png", full_page=False)

        page.evaluate(HIRE_COOK)
        page.wait_for_timeout(300)
        hired = page.evaluate(READ_SHOP)
        checks["hired_moves_the_line"] = hired["has"] is True and "只有 2 个人掌勺" in hired["text"]
        checks["hired_says_third"] = "第 3 口起没人看" in hired["text"]

        page.evaluate(SET_STOVES, 2)
        page.wait_for_timeout(250)
        fit = page.evaluate(READ_SHOP)
        checks["two_stoves_two_cooks_quiet"] = fit["has"] is False

        page.evaluate(SET_STOVES, 3)
        page.wait_for_timeout(250)
        page.evaluate("() => document.querySelector('[data-tab2=\"staff\"]')?.click()")
        page.wait_for_timeout(400)
        staff = page.evaluate(READ_STAFF)
        checks["staff_page_same_line"] = staff["has"] is True and "没人看" in staff["text"]
        page.screenshot(path=f"{OUT}/02-crew-staff.png", full_page=False)

        checks["save_version"] = page.evaluate("() => window.__laoyou.state.saveVersion") == 37
        real = [e for e in errors if "Failed to load resource" not in e]
        checks["console_clean"] = len(real) == 0
        if real:
            checks["console_errors"] = real[:3]

        page.screenshot(path=f"{OUT}/03-1440x900.png", full_page=False)
        browser.close()

    ok = sum(1 for v in checks.values() if v is True)
    with open(f"{OUT}/crew-report.json", "w", encoding="utf-8") as fh:
        json.dump({"checks": checks, "ok": ok, "total": len(checks)}, fh, ensure_ascii=False, indent=1)
    print(json.dumps(checks, ensure_ascii=False, indent=1))
    print(f"{ok} / {len(checks)} true")
    return 0 if ok == len(checks) else 1


if __name__ == "__main__":
    sys.exit(main())
