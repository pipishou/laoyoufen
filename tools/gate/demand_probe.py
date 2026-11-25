# -*- coding: utf-8 -*-
"""批 AO′ 探针：来客封顶时，设备段不许再喊「添最慢那一段」（P446）。

批 AN′ 把「来客天花板」算进容量模型之后，出现一个新的说法问题：
座位加到 8 座以后，灶 360 碗、座位 131 碗、备料 200 碗，而来客只有 70 碗 ——
今天卖多少全看街上进来多少人。这时设备段若还写「哪一段最慢就添哪一段」，
玩家会照买，买完一碗不多（这正是 P443 之前的病根换了个地方长出来）。

这一批只换说法、不动数值：`capacityGain().demandBlocked` 为真时，
设备段那句提示换成「卡不在店里」，并指出真正能抬来客量的几处。

用法（先起 preview）：
    cd game && npx vite preview --port 4246 --strictPort
    PW_URL=http://localhost:4246/ python -X utf8 tools/gate/demand_probe.py
"""
import json
import os

from playwright.sync_api import sync_playwright

URL = os.environ.get("PW_URL", "http://localhost:4246/")
OUT = os.path.join("game", "data", "evidence", "demand")
os.makedirs(OUT, exist_ok=True)

checks = {}


def note(name, ok, detail=""):
    checks[name] = {"ok": bool(ok), "detail": str(detail)[:200]}


def open_game(pg):
    pg.goto(URL, wait_until="networkidle")
    pg.wait_for_timeout(700)
    pg.evaluate("() => localStorage.clear()")
    pg.reload(wait_until="networkidle")
    pg.wait_for_timeout(700)
    pg.evaluate("() => document.querySelector('.sitecard[data-site=\"alley\"]')?.click()")
    pg.wait_for_timeout(200)
    pg.evaluate("() => document.querySelector('[data-chips] .chip')?.click()")
    pg.wait_for_timeout(200)
    pg.evaluate("() => document.querySelector('[data-open]')?.click()")
    pg.wait_for_timeout(400)
    pg.evaluate("() => document.querySelector('.gbtn.ghost')?.click()")
    pg.wait_for_timeout(600)
    pg.evaluate("() => document.querySelector('[data-tab=\"recipe\"]')?.click()")
    pg.wait_for_timeout(300)
    pg.evaluate("() => document.querySelector('[data-tab2=\"shop\"]')?.click()")
    pg.wait_for_timeout(400)


SET_SEATS = """(n) => {
  const s = window.__laoyou.state;
  s.venue.seats = n;
  window.__laoyou.refresh();
}"""

READ_JS = """() => {
  const pane = document.querySelector('.pane');
  const hint = document.querySelector('.pane [data-demand-blocked]');
  const tight = document.querySelector('.pane [data-tight]');
  const meta = [...document.querySelectorAll('.pane .sec .lmeta')]
    .map((x) => (x.textContent || '').trim())
    .filter((t) => t.includes('一段') || t.includes('卖不动'));
  const rows = [...document.querySelectorAll('.pane [data-act="buyequip"]')].length;
  return {
    blockedText: hint ? (hint.textContent || '').trim() : '',
    tight: tight ? (tight.textContent || '').trim() : '',
    hint: meta.join(' / '),
    equipRows: rows,
    paneLen: pane ? (pane.textContent || '').length : 0,
  };
}"""

# 批 AP′（P448）：造一张「八座 + 昨天走了四十位」的日结单，看打烊单说哪一句
SET_REPORT = """(seats) => {
  const s = window.__laoyou.state;
  s.venue.seats = seats;
  s.dayReport = {
    month: s.month, day: s.day, revenue: 200, served: 20, lost: 40,
    avgSat: 62, price: 10, taste: 60, cash: s.cash,
    lostQueue: 40, lostPrice: 0, lostWait: 0,
  };
  window.__laoyou.refresh();
}"""

READ_DAY = """() => {
  const line = document.querySelector('[data-demand-line]');
  const hook = document.querySelector('[data-hook-main]');
  const panel = document.querySelector('.pane [data-demand-blocked]');
  return {
    line: line ? (line.textContent || '').trim() : '',
    hook: hook ? (hook.textContent || '').trim() : '',
    panel: panel ? (panel.textContent || '').trim() : '',
  };
}"""


with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_page(viewport={"width": 1440, "height": 900})
    errors = []
    page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
    page.on("pageerror", lambda e: errors.append(str(e)))

    open_game(page)

    # ① 开局四座：座位闸压在来客量下面，提示照旧「添最慢那一段」
    start = page.evaluate(READ_JS)
    note("start_no_block", start["blockedText"] == "", start["blockedText"])
    note("start_says_pick_slowest", "哪一段最慢就添哪一段" in start["hint"], start["hint"])
    # 面板 [data-tight] 这一行在座位紧时会写成「今天卡在座位：塑料矮凳 ¥150 …」
    note("start_tight_is_seats", "座位" in start["tight"], start["tight"])
    note("start_keeps_equipment", start["equipRows"] == 4, start["equipRows"])
    page.screenshot(path=os.path.join(OUT, "01-demand-normal.png"))

    # ② 八座：灶 360、座位 131、备料 200，来客 70 —— 卡的是街上的人
    page.evaluate(SET_SEATS, 8)
    page.wait_for_timeout(400)
    eight = page.evaluate(READ_JS)
    note("blocked_appears_at_eight", eight["blockedText"] != "", eight["blockedText"])
    note("blocked_says_street", "街上" in eight["blockedText"], eight["blockedText"])
    note("blocked_no_buy_imperative", "添哪一段" not in eight["blockedText"], eight["blockedText"])
    note(
        "blocked_points_where_to_go",
        any(w in eight["blockedText"] for w in ("街面", "口碑", "换区", "比赛")),
        eight["blockedText"],
    )
    note("tightline_says_street", "街上就这么多人" in eight["tight"], eight["tight"])
    note("still_shows_equipment", eight["equipRows"] == 4, eight["equipRows"])
    page.screenshot(path=os.path.join(OUT, "02-demand-blocked.png"))

    # ③ 退回四座：提示必须跟着退回（缓存键要能察觉这个翻转）
    page.evaluate(SET_SEATS, 4)
    page.wait_for_timeout(400)
    back = page.evaluate(READ_JS)
    note("back_to_normal", back["blockedText"] == "", back["blockedText"])
    note("back_says_pick_slowest", "哪一段最慢就添哪一段" in back["hint"], back["hint"])

    # ④ 打烊单也说同一句（批 AP′，解 P448）：八座 + 昨天走了一半
    page.evaluate(SET_REPORT, 8)
    page.wait_for_timeout(500)
    day = page.evaluate(READ_DAY)
    note("day_line_shows", "卖不动" in day["line"] or "街上" in day["line"], day["line"])
    note("day_line_no_price", "¥" not in day["line"], day["line"])
    note("day_line_matches_panel", day["panel"] != "" and "街上" in day["panel"], day["panel"])
    note("day_hook_says_demand", "街" in day["hook"], day["hook"])
    page.screenshot(path=os.path.join(OUT, "03-demand-day.png"))

    # ⑤ 四座同样流失：打烊单不许出这句（座位是真闸，添凳有用）
    page.evaluate(SET_REPORT, 4)
    page.wait_for_timeout(500)
    day4 = page.evaluate(READ_DAY)
    note("day_line_quiet_at_four", "卖不动" not in day4["line"], day4["line"])
    # 关掉日结，后面还要读存档
    page.evaluate("() => { window.__laoyou.state.dayReport = null; window.__laoyou.refresh(); }")
    page.wait_for_timeout(300)

    st = page.evaluate("() => ({ v: window.__laoyou.state.saveVersion, n: window.__laoyou.state.shopName })")
    note("save_version_37", st.get("v") == 37, st)

    real = [e for e in errors if "Failed to load resource" not in e and "laoyou-api" not in e]
    note("console_clean", len(real) == 0, real[:2])

    browser.close()

passed = sum(1 for c in checks.values() if c["ok"])
report = {"url": URL, "passed": passed, "total": len(checks), "checks": checks}
with open(os.path.join(OUT, "demand-report.json"), "w", encoding="utf-8") as f:
    json.dump(report, f, ensure_ascii=False, indent=2)

for name, c in checks.items():
    print(("PASS " if c["ok"] else "FAIL ") + name + ("  " + c["detail"] if c["detail"] else ""))
print("%d / %d" % (passed, len(checks)))
