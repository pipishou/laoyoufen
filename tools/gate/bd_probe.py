# -*- coding: utf-8 -*-
"""批 BD′ 的探针：门路第四类「趁势」—— 花钱把那条好行情叫到门口。

判据（`docs/GAP四轮-2026-11-26.md` 第四节 B 条的另一半：
「BB′ 只做了挡坏事（hedge），没做趁势加码（lean）」+ 第五节 BC′ 之后留下的口子）：
  1. 门路面板上四类并存，第四类两条（圩日摆摊 / 发薪日多备）都在，各带价钱与「管 3 天」；
  2. 那两行的说明写的是「一定来」，不是「进店 +N%」—— 这一类不挂乘数；
  3. 买了「圩日去巷口摆一摊」之后，**本来就有行情**的日子一律变成「赶圩日」；
  4. 本来**没有行情**的日子仍然没有 —— 趁势是换行情，不是凭空加一天（否则等于买天数）；
  5. 打烊单在到期那天报一句「「赶圩日」一定会来」（`investGainOf` 那一支）；
  6. 抬头那句「挂了几条 / 一共几位」照旧读得到（BC′ 的口径没被这一批碰坏）。

跑法（必须在仓库根，`OUT` 是相对路径；改面板文案后要先 `npm run -s build`）：
    PW_URL=http://localhost:4246/ python -X utf8 tools/gate/bd_probe.py
"""
import json
import os

from playwright.sync_api import sync_playwright
from probe_version import SAVE_VERSION

URL = os.environ.get("PW_URL", "http://localhost:4246/")
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = os.path.join(ROOT, "game", "data", "evidence", "bd")
os.makedirs(OUT, exist_ok=True)

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

READ_INVEST = """
() => {
  const pane = document.querySelector('.pane[data-pane="shop"]');
  if (!pane) return { found: false };
  const sec = Array.from(pane.querySelectorAll('.sec')).find((x) => {
    const h = x.querySelector('.sechd');
    return h && h.textContent.includes('街上的门路');
  });
  if (!sec) return { found: false };
  const head = sec.querySelector('.sechd');
  const hint = sec.querySelector('.hint2');
  const rows = Array.from(sec.querySelectorAll('.lrow')).map((r) => {
    const name = r.querySelector('.lname');
    const btn = r.querySelector('button[data-act="buyinvest"]');
    const tag = r.querySelector('.tag2');
    const metas = Array.from(r.querySelectorAll('.lmeta')).map((m) => m.textContent.replace(/\\s+/g, ' ').trim());
    return {
      name: name ? name.textContent.trim() : '',
      id: r.getAttribute('data-invest-id') || (btn ? btn.getAttribute('data-id') : '') || '',
      btn: btn ? btn.textContent.trim() : '',
      tag: tag ? tag.textContent.trim() : '',
      metas,
    };
  });
  const t = head ? head.textContent : '';
  const slots = t.match(/\\d+ \\/ \\d+ 位/);
  return {
    found: true,
    head: t.replace(/\\s+/g, ' ').trim(),
    slotsText: slots ? slots[0] : '',
    hint: hint ? hint.textContent.replace(/\\s+/g, ' ').trim() : '',
    rows,
    cash: window.__laoyou.state.cash,
  };
}
"""

BUY = """
(id) => {
  const btn = document.querySelector(`button[data-act="buyinvest"][data-id="${id}"]`);
  if (!btn) return { clicked: false };
  btn.click();
  return { clicked: true };
}
"""

# 摆一天，读界面上的行情行（同一天买前买后对照用）
SET_DAY_READ = """
([month, day]) => {
  const s = window.__laoyou.state;
  s.month = month;
  s.day = day;
  window.__laoyou.refresh();
  const el = document.querySelector('[data-market]');
  const txt = el ? el.textContent.replace(/\\s+/g, ' ').trim() : '';
  return { has: !!(el && el.className.includes('on')), text: txt };
}
"""

# 打烊单：门路到点那一行（把单据摆出来，验界面读到的字）
SHOW_CLOSING = """
() => {
  const s = window.__laoyou.state;
  s.dayReport = {
    month: s.month, day: s.day, served: 42, lost: 3, revenue: 630,
    wages: 0, rent: 0, profit: 630, sat: 70,
    lostQueue: 2, lostPrice: 0, lostWait: 1,
    investDone: ['圩日去巷口摆一摊'],
    investGain: ['「赶圩日」一定会来'],
  };
  window.__laoyou.refresh();
  const d = document.querySelector('.modal.dayreport');
  if (d) d.hidden = false;
  const line = document.querySelector('[data-invest-line]');
  return line ? line.textContent.replace(/\\s+/g, ' ').trim() : '';
}
"""


def main() -> int:
    checks = {}
    with sync_playwright() as pw:
        browser = pw.chromium.launch()
        page = browser.new_page(viewport={"width": 1440, "height": 900})
        errs = []
        page.on(
            "console",
            lambda m: errs.append({"text": m.text, "url": (m.location or {}).get("url", "")})
            if m.type == "error"
            else None,
        )
        page.goto(URL, wait_until="load")
        page.evaluate(INIT)
        page.wait_for_timeout(400)

        # ── 一、四条路都在，第四类两条读得到
        base = page.evaluate(READ_INVEST)
        checks["invest_found"] = base.get("found") is True
        by_id = {r["id"]: r for r in base.get("rows", []) if r["id"]}
        checks["four_classes_present"] = all(
            k in by_id
            for k in ("supplier", "press", "inspect_report", "stall_at_market", "wage_day_spread")
        )
        stall = by_id.get("stall_at_market", {})
        wage = by_id.get("wage_day_spread", {})
        checks["stall_names_rush_day"] = "圩日" in (stall.get("name") or "")
        checks["stall_says_must_come"] = "一定" in " ".join(stall.get("metas") or [])
        checks["stall_says_rush_day"] = "赶圩日" in " ".join(stall.get("metas") or [])
        checks["stall_three_days"] = "管 3 天" in " ".join(stall.get("metas") or [])
        checks["wage_names_payday"] = "发薪" in " ".join(wage.get("metas") or [])
        checks["wage_says_payday"] = "发薪日" in " ".join(wage.get("metas") or [])
        checks["stall_has_price"] = stall.get("btn", "").startswith("¥")
        # 这一类不挂乘数：说明里不许出现「进店 +」
        lean_metas = " ".join((stall.get("metas") or []) + (wage.get("metas") or []))
        checks["lean_no_multiplier"] = "进店 +" not in lean_metas and "产能 +" not in lean_metas
        # BC′ 的抬头没被碰坏
        checks["head_has_slots"] = (base.get("slotsText") or "").startswith("0 / 2 ")
        page.screenshot(path=os.path.join(OUT, "01-bd-panel.png"), full_page=False)
        # hint 要把「好事一定来」说出来（不然界面只承认一半的钱花在哪）
        checks["hint_says_lean"] = "好事一定来" in (base.get("hint") or "")

        # ── 二、买之前先把 4 月 30 天的「本来有没有行情」抄下来（买之后要拿它对照）
        before = []
        for d in range(1, 31):
            before.append(page.evaluate(SET_DAY_READ, [4, d]))
        with_market = [d + 1 for d, r in enumerate(before) if r["has"]]
        checks["found_baseline_days"] = len(with_market) > 0

        # 回到开局那天，买「圩日去巷口摆一摊」
        page.evaluate(SET_DAY_READ, [4, 1])
        page.wait_for_timeout(200)
        page.evaluate("() => { const s = window.__laoyou.state; s.month = 4; s.day = 1; window.__laoyou.refresh(); }")
        page.wait_for_timeout(200)
        bought = page.evaluate(BUY, "stall_at_market")
        page.wait_for_timeout(400)
        after_buy = page.evaluate(READ_INVEST)
        after_by_id = {r["id"]: r for r in after_buy.get("rows", []) if r["id"]}
        checks["buy_clicked"] = bought.get("clicked") is True
        checks["row_now_running"] = "在走" in (after_by_id.get("stall_at_market", {}).get("tag") or "")
        page.screenshot(path=os.path.join(OUT, "02-bd-bought.png"), full_page=False)

        # ── 三、买之后：本来有行情的日子一律变成「赶圩日」；本来没行情的仍然没有
        wrong = []
        invented = []
        for d in range(1, 31):
            r = page.evaluate(SET_DAY_READ, [4, d])
            if before[d - 1]["has"]:
                if "赶圩日" not in (r["text"] or ""):
                    wrong.append({"day": d, "text": r["text"]})
            elif r["has"]:
                invented.append({"day": d, "text": r["text"]})
        checks["lean_forces_rush_day"] = len(wrong) == 0 and len(with_market) > 0
        checks["lean_does_not_invent_days"] = len(invented) == 0
        # 存一张「趁势生效」的截图：挑一个本来就该有行情的日子
        if with_market:
            page.evaluate(SET_DAY_READ, [4, with_market[0]])
            page.wait_for_timeout(200)
            page.screenshot(path=os.path.join(OUT, "03-bd-rush-day.png"), full_page=False)

        # ── 四、打烊单到点报一句（`investGainOf` 的第四支）
        said = page.evaluate(SHOW_CLOSING)
        checks["closing_line_shows"] = said != ""
        checks["closing_line_says_must_come"] = "一定会来" in said and "赶圩日" in said
        page.screenshot(path=os.path.join(OUT, "04-bd-closing.png"), full_page=False)

        # ── 五、存档版本与本页控制台
        checks["save_version"] = page.evaluate("() => window.__laoyou.state.saveVersion") == SAVE_VERSION
        noisy = [e for e in errs if "laoyou-api" not in (e.get("url") or "")]
        checks["console_clean"] = len(noisy) == 0
        page.screenshot(path=os.path.join(OUT, "05-1440x900.png"), full_page=False)
        browser.close()

    total = len(checks)
    ok = sum(1 for v in checks.values() if v)
    print(json.dumps(checks, ensure_ascii=False, indent=1))
    print(f"{ok} / {total} true")
    if not checks["lean_forces_rush_day"]:
        print("wrong:", json.dumps(wrong[:6], ensure_ascii=False))
    if not checks["lean_does_not_invent_days"]:
        print("invented:", json.dumps(invented[:6], ensure_ascii=False))
    if noisy:
        print("console:", json.dumps(noisy[:5], ensure_ascii=False))
    return 0 if ok == total else 3


if __name__ == "__main__":
    raise SystemExit(main())
