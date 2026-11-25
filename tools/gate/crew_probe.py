# -*- coding: utf-8 -*-
"""批 AR′ / AS′ 的探针：店面页说清「灶位只是上限，开火要有人掌勺」，并且说清补一个人要多少钱。

四态：
  1. 开局（灶 1 口、老板一个人）→ 不该出现那一块；
  2. 把灶买到 3 口但不雇人 → 出现 `[data-crew-idle]`：主句说「第 2 口起没人看」，
     副句说「今天卡的不是灶」，价钱句按人手槽给（差多少位 / 日薪与介绍费）；
  3. 雇一个煮粉师傅 → 主句跟着改成「只有 2 个人掌勺 / 第 3 口起没人看」；
  4. 灶 2 口 + 2 个人 → 整块消失（没缺口就不说话）。

另外三条：
  - 员工页说同一句（两处同源，不是两套说法）；
  - 打烊单也有一行（批 AS′ 解 P460），且四座时不出现；
  - 主句里不许出现价钱与「买 / 推荐」（价钱只许在第三行）。

批 AT′ 加两条（P461 / P463）：
  - 价钱句要报技能等级（「技能 3」），不然「挑最便宜」等于「挑最弱」看不出来；
  - 介绍费要标「（一次）」，不然玩家以为按月收。
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

# 人手槽没开的时候，候选池里有人也雇不进来 —— 探针要能把这一档也摆出来
SET_BUSY = """
(n) => {
  const s = window.__laoyou.state;
  s.totalCustomers = n;
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
  const box = p && p.querySelector('[data-crew-idle]');
  const pick = (sel) => {
    const el = p && p.querySelector(sel);
    return el ? el.textContent.trim() : '';
  };
  return {
    has: !!box,
    all: box ? box.textContent.trim() : '',
    words: pick('[data-crew-idle] .crewline'),
    why: pick('[data-crew-why]'),
    cost: pick('[data-crew-cost]'),
    stoves: window.__laoyou.state.venue.stoves,
    seats: window.__laoyou.state.venue.seats,
    total: window.__laoyou.state.totalCustomers,
    roster: window.__laoyou.state.staff.roster.length,
  };
}
"""

READ_STAFF = """
() => {
  const p = document.querySelector('.pane[data-pane="staff"]');
  const box = p && p.querySelector('[data-crew-idle]');
  const el = p && p.querySelector('[data-crew-idle] .crewline');
  return { has: !!box, words: el ? el.textContent.trim() : '' };
}
"""

# 打烊单：塞一份日结，看 `[data-crew-line]`
SET_REPORT = """
(n) => {
  const s = window.__laoyou.state;
  s.venue.stoves = n;
  s.dayReport = {
    month: s.month, day: s.day, revenue: 200, served: 20, lost: 40,
    avgSat: 62, price: 10, taste: 60, cash: s.cash,
    lostQueue: 40, lostPrice: 0, lostWait: 0,
  };
  window.__laoyou.refresh();
}
"""

READ_DAY = """
() => {
  const el = document.querySelector('[data-crew-line]');
  const tip = document.querySelector('[data-day-hook]');
  return {
    has: !!el && (el.textContent || '').trim() !== '',
    text: el ? el.textContent.trim() : '',
    hidden: el ? el.hidden : null,
    hook: tip ? tip.textContent.trim() : '',
  };
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

        # 三态一：灶 3 口、人手槽没开（累计接待 0）→ 差多少位先说
        page.evaluate(SET_STOVES, 3)
        page.wait_for_timeout(300)
        three = page.evaluate(READ_SHOP)
        checks["three_stoves_warns"] = three["has"] is True
        checks["three_stoves_says_second"] = "第 2 口起没人看" in three["words"]
        checks["three_stoves_counts"] = "灶位 3 口" in three["words"] and "只有 1 个人掌勺" in three["words"]
        checks["words_no_price"] = not re.search(r"¥|元|买|推荐|建议", three["words"])
        checks["why_says_not_kitchen"] = "卡的不是灶" in three["why"]
        checks["gate_says_short"] = "还差" in three["cost"] and "累计接待" in three["cost"]
        checks["gate_no_price"] = not re.search(r"¥", three["cost"])

        page.screenshot(path=f"{OUT}/01-crew-idle.png", full_page=False)

        # 三态二：把人手槽打开（累计接待 3000）→ 该报今天最便宜那个煮粉的价钱
        page.evaluate(SET_BUSY, 3000)
        page.wait_for_timeout(350)
        rich = page.evaluate(READ_SHOP)
        checks["rich_still_warns"] = rich["has"] is True
        checks["rich_costs_money"] = ("日薪" in rich["cost"] and "¥" in rich["cost"]) or "没有煮粉的来问工" in rich["cost"]
        checks["rich_says_fee"] = "介绍费" in rich["cost"] or "没有煮粉的来问工" in rich["cost"]
        # 批 AT′（P461 / P463）：报技能等级，并且说清介绍费只收一次
        checks["rich_says_skill"] = bool(re.search(r"技能\s*\d+", rich["cost"])) or "没有煮粉的来问工" in rich["cost"]
        checks["rich_fee_one_off"] = "（一次）" in rich["cost"] or "没有煮粉的来问工" in rich["cost"]

        # 三态三：雇一个煮粉师傅 → 主句跟着变
        page.evaluate(HIRE_COOK)
        page.wait_for_timeout(350)
        hired = page.evaluate(READ_SHOP)
        checks["hired_moves_the_line"] = hired["has"] is True and "只有 2 个人掌勺" in hired["words"]
        checks["hired_says_third"] = "第 3 口起没人看" in hired["words"]

        # 三态四：灶 2 口 + 2 个人 → 整块消失
        page.evaluate(SET_STOVES, 2)
        page.wait_for_timeout(300)
        fit = page.evaluate(READ_SHOP)
        checks["two_stoves_two_cooks_quiet"] = fit["has"] is False

        # 员工页同一句
        page.evaluate(SET_STOVES, 3)
        page.wait_for_timeout(300)
        page.evaluate("() => document.querySelector('[data-tab2=\"staff\"]')?.click()")
        page.wait_for_timeout(400)
        staff = page.evaluate(READ_STAFF)
        checks["staff_page_same_line"] = staff["has"] is True and "没人看" in staff["words"]
        page.screenshot(path=f"{OUT}/02-crew-staff.png", full_page=False)

        # 打烊单那一行（批 AS′，解 P460）：三灶一人时要说；四座一人时不说
        page.evaluate(SET_REPORT, 3)
        page.wait_for_timeout(400)
        day = page.evaluate(READ_DAY)
        checks["day_line_shows"] = day["has"] is True
        checks["day_line_says_stoves"] = "灶 3 口" in day["text"] and "掌勺" in day["text"]
        checks["day_line_no_price"] = not re.search(r"¥", day["text"])
        page.screenshot(path=f"{OUT}/03-crew-day.png", full_page=False)

        page.evaluate(SET_REPORT, 1)
        page.wait_for_timeout(400)
        dayQuiet = page.evaluate(READ_DAY)
        checks["day_line_quiet_when_fit"] = dayQuiet["has"] is False

        checks["save_version"] = page.evaluate("() => window.__laoyou.state.saveVersion") == 37
        real = [e for e in errors if "Failed to load resource" not in e]
        checks["console_clean"] = len(real) == 0
        if real:
            checks["console_errors"] = real[:3]

        page.screenshot(path=f"{OUT}/04-1440x900.png", full_page=False)
        browser.close()

    ok = sum(1 for v in checks.values() if v is True)
    with open(f"{OUT}/crew-report.json", "w", encoding="utf-8") as fh:
        json.dump({"checks": checks, "ok": ok, "total": len(checks)}, fh, ensure_ascii=False, indent=1)
    print(json.dumps(checks, ensure_ascii=False, indent=1))
    print(f"{ok} / {len(checks)} true")
    return 0 if ok == len(checks) else 1


if __name__ == "__main__":
    sys.exit(main())
