# -*- coding: utf-8 -*-
"""批 BB′ 的探针：门路多了第三类「行情型」—— 买一段安稳，界面能不能看出来。

判据（对应 `docs/GAP四轮-2026-11-26.md` 第五节的 BB′）：
  1. 门路那一页多出两条：`跟监管所报个备`（¥300 · 管 15 天）、`跟菜贩子包个月`（¥220 · 管 15 天）；
  2. 每条的说明里写清「哪条行情抽不到」，并且**一个乘数都不许写**（纪律一：只买量不买乘数）；
  3. 两条都买得下（批 BC′ 之后底板是**两位**，不再按类互斥）—— 第一版这里断的是
     「买了一条另一条变『先等』」，那条口径已被 BC′ 换掉，留着它就是第二条在说假话；
  4. 真买下来：这半个月里那条行情一天都不出现，界面上的行情行也不再提它；
  5. 到点那一天打烊单报一句（`到点 · 跟监管所报个备 走完了（「创城检查」不上门）`）。

跑法（必须在仓库根，`OUT` 是相对路径；改面板文案后要先 `npm run -s build`）：
    PW_URL=http://localhost:4246/ python -X utf8 tools/gate/bb_probe.py
"""
import json
import os
import re
import sys

from playwright.sync_api import sync_playwright
from probe_version import SAVE_VERSION

URL = os.environ.get("PW_URL", "http://localhost:4246/")
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = os.path.join(ROOT, "game", "data", "evidence", "bb")
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

# 门路那一段的两行（只读，不动状态）
READ_INVEST = """
() => {
  const pane = document.querySelector('.pane[data-pane="shop"]');
  if (!pane) return { found: false };
  const sec = Array.from(pane.querySelectorAll('.sec')).find((x) => {
    const h = x.querySelector('.sechd');
    return h && h.textContent.includes('街上的门路');
  });
  if (!sec) return { found: false };
  const hint = sec.querySelector('.hint2');
  const rows = Array.from(sec.querySelectorAll('.lrow')).map((r) => {
    const name = r.querySelector('.lname');
    const metas = Array.from(r.querySelectorAll('.lmeta')).map((x) => x.textContent.replace(/\\s+/g, ' ').trim());
    const btn = r.querySelector('button[data-act="buyinvest"]');
    const tag = r.querySelector('.tag2');
    return {
      name: name ? name.textContent.trim() : '',
      // 批 BB′：认行靠 `data-invest-id`，不再靠「行里有没有买按钮」——
      // 买下之后按钮换成「在走 · 还剩 N 天」，靠按钮认行的写法会把买过的那一行整个漏掉。
      id: r.getAttribute('data-invest-id') || (btn ? btn.getAttribute('data-id') : '') || '',
      metas,
      btn: btn ? btn.textContent.trim() : '',
      tag: tag ? tag.textContent.trim() : '',
    };
  });
  return { found: true, hint: hint ? hint.textContent.replace(/\\s+/g, ' ').trim() : '', rows };
}
"""

# 买一条（走真按钮；买不动就直说，不在这里造假）
BUY = """
(id) => {
  const btn = document.querySelector(`button[data-act="buyinvest"][data-id="${id}"]`);
  if (!btn) return { clicked: false };
  btn.click();
  return { clicked: true, disabled: btn.disabled };
}
"""

# 把某一天摆出来，读界面上的行情行（用来「同一天买前买后」对照）
SET_DAY = """
([month, day]) => {
  const s = window.__laoyou.state;
  s.month = month;
  s.day = day;
  window.__laoyou.refresh();
  return true;
}
"""

READ_MARKET = """
() => {
  const el = document.querySelector('[data-market]');
  return el ? { text: el.textContent.replace(/\\s+/g, ' ').trim(), title: el.getAttribute('title') || '' } : { text: '', title: '' };
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
    investDone: ['跟监管所报个备'],
    investGain: ['「创城检查」不上门'],
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
    noise = []
    with sync_playwright() as pw:
        browser = pw.chromium.launch()
        page = browser.new_page(viewport={"width": 1440, "height": 900})
        errs = []
        page.on("console", lambda m: errs.append({"text": m.text, "url": (m.location or {}).get("url", "")}) if m.type == "error" else None)
        page.goto(URL, wait_until="load")
        page.evaluate(INIT)
        page.wait_for_timeout(400)

        # ── 一、第三类两条在页面上
        base = page.evaluate(READ_INVEST)
        checks["invest_found"] = base.get("found") is True
        rows = base.get("rows", [])
        names = [r["name"] for r in rows]
        checks["hedge_rows_present"] = "跟监管所报个备" in names and "跟菜贩子包个月" in names
        page.screenshot(path=os.path.join(OUT, "01-bb-invest.png"), full_page=False)

        # ── 二、说明里写清「哪条行情抽不到」，且不许出现乘数
        by_id = {r["id"]: r for r in rows if r["id"]}
        report = by_id.get("inspect_report", {})
        meat = by_id.get("meat_price_deal", {})
        report_text = " ".join(report.get("metas", []))
        meat_text = " ".join(meat.get("metas", []))
        checks["report_names_inspection"] = "创城检查" in report_text
        checks["report_says_not_drawn"] = "抽不到" in report_text
        checks["meat_names_pork"] = "猪肉起价" in meat_text
        checks["meat_says_not_drawn"] = "抽不到" in meat_text
        checks["hedge_days_fifteen"] = "管 15 天" in report_text and "管 15 天" in meat_text
        # 纪律一：这两条不许挂「+N%」「−N%」这种乘数说法
        multiplier_words = re.compile(r"[+\-−]\s*\d+\s*%")
        checks["hedge_no_multiplier"] = not multiplier_words.search(report_text) and not multiplier_words.search(meat_text)
        # 门路段的总说明要提一句第三类，别还写着「只有两件事」
        hint = base.get("hint", "")
        checks["hint_mentions_hedge"] = "烦人" in hint and "乘数" in hint
        checks["hint_not_two_only"] = "和「今天多进来几个人」，买不到乘数" not in hint
        # 批 BC′：这句总说明原来的尾巴是「同类只能走一条」，现在必须换成位子口径
        checks["hint_says_slots_not_class"] = "先撤一条" in hint and "同类只能走一条" not in hint

        # ── 三、先找一天本来是「创城检查」——**必须在买之前找**。
        #     首版把这段放在买之后，而买下的正是「创城检查不上门」，于是永远找不到那一天
        #     （`found_inspection_day_before` 红不是行情抽不到，是探针自己把要找的东西买掉了）。
        #     一天命中率约 2%（行情 34% × 16 条里一条），所以扫满 12 个月 × 30 天，别赌 4 月。
        target = None
        for month in range(1, 13):
            for day in range(1, 31):
                page.evaluate(SET_DAY, [month, day])
                page.wait_for_timeout(20)
                got = page.evaluate(READ_MARKET)
                if "创城检查" in got["text"]:
                    target = (month, day, got["text"])
                    break
            if target:
                break
        checks["found_inspection_day_before"] = target is not None

        # ── 四、批 BC′ 之后底板是两位：两条对冲都买得下（原来这里断的是「同类互斥」）
        before_meat = by_id.get("meat_price_deal", {})
        checks["both_affordable_first"] = before_meat.get("btn", "") != ""
        page.evaluate(BUY, "inspect_report")
        page.wait_for_timeout(500)
        after = page.evaluate(READ_INVEST)
        after_by_id = {r["id"]: r for r in after.get("rows", []) if r["id"]}
        report_after = after_by_id.get("inspect_report", {})
        meat_after = after_by_id.get("meat_price_deal", {})
        checks["report_shows_running"] = "在走" in (report_after.get("tag") or "")
        # 批 BC′：第二条**还买得下**（两位底板）。旧断言「先等『报个备』过去」是同类互斥时代的口径，
        # 口径换了这条就必须跟着换 —— 否则探针会一直替旧行为作证。
        checks["meat_still_affordable"] = meat_after.get("btn", "") != ""
        # 两位都占上之后，再看第三条（press）是不是「先撤一条」（满位才是真的拦）
        page.evaluate(BUY, "meat_price_deal")
        page.wait_for_timeout(400)
        full = page.evaluate(READ_INVEST)
        full_by_id = {r["id"]: r for r in full.get("rows", []) if r["id"]}
        press_full = full_by_id.get("press", {})
        checks["third_row_says_cancel_first"] = (
            "先撤一条" in (press_full.get("tag") or "") and press_full.get("btn", "") == ""
        )
        # 撤一条回去，好让后面「买前/买后」只挂着 inspect_report
        page.evaluate(
            """() => { const s = window.__laoyou.state; const n = { ...s.investments }; delete n.meat_price_deal; s.investments = n; window.__laoyou.refresh(); }"""
        )
        page.wait_for_timeout(200)
        page.screenshot(path=os.path.join(OUT, "02-bb-bought.png"), full_page=False)

        # ── 五、真买下来：这半个月里那条行情一天都不出现
        if target:
            month, day, _before_text = target
            page.evaluate(SET_DAY, [month, day])
            page.wait_for_timeout(150)
            after_text = page.evaluate(READ_MARKET)
            checks["same_day_no_inspection"] = "创城检查" not in after_text["text"] and after_text["text"] != ""
            checks["same_day_has_other_market"] = after_text["text"] != ""

            # 把对冲退掉，确认这一天原本真会出检查（不然「买后没出」说明不了任何事）
            page.evaluate(
                """() => { const s = window.__laoyou.state; s.investments = {}; window.__laoyou.refresh(); }"""
            )
            page.evaluate(SET_DAY, [month, day])
            page.wait_for_timeout(120)
            before2 = page.evaluate(READ_MARKET)
            checks["undo_gives_inspection_back"] = "创城检查" in before2["text"]
            # 重新买上：这里**直接摆状态**，不再点按钮。
            # 首版点按钮，但撤销时那次 refresh 不保证重绘（面板没打开时 render 直接 return），
            # DOM 里那一行还停在「在走」，找不到买按钮 → 点空 → 对冲没挂上，
            # 于是 `same_day_no_inspection` 与 `fifteen_days_clear` 两条假红（界面本身没问题）。
            # 「点按钮能买」这条路由上面第三段的 `report_shows_running` / `meat_still_affordable` 负责。
            page.evaluate(
                """() => {
                  const s = window.__laoyou.state;
                  s.cash = Math.max(s.cash, 5000);
                  s.investments = { inspect_report: s.days.length + 15 };
                  window.__laoyou.refresh();
                }"""
            )
            page.wait_for_timeout(200)

            # 买着的这十五天，一天都不许出现
            seen = 0
            for d in range(day, min(day + 15, 31)):
                page.evaluate(SET_DAY, [month, d])
                page.wait_for_timeout(24)
                if "创城检查" in page.evaluate(READ_MARKET)["text"]:
                    seen += 1
            checks["fifteen_days_clear"] = seen == 0
            page.screenshot(path=os.path.join(OUT, "03-bb-market.png"), full_page=False)

        # ── 六、到点那天打烊单报一句
        said = page.evaluate(SHOW_CLOSING)
        checks["closing_line_shows"] = "跟监管所报个备 走完了" in said
        checks["closing_line_says_hedge"] = "「创城检查」不上门" in said
        page.screenshot(path=os.path.join(OUT, "04-bb-closing.png"), full_page=False)

        checks["save_version"] = page.evaluate("() => window.__laoyou.state.saveVersion") == SAVE_VERSION
        # `/laoyou-api/` 的 404 是预览环境没有后端，不算这门的事
        noise = [e for e in errs if "laoyou-api" not in (e.get("url") or "")]
        checks["console_clean"] = len(noise) == 0
        if noise:
            checks["console_errors"] = [e["text"] for e in noise][:3]

        page.set_viewport_size({"width": 1440, "height": 900})
        page.wait_for_timeout(200)
        page.screenshot(path=os.path.join(OUT, "05-1440x900.png"), full_page=False)
        browser.close()

    ok = sum(1 for v in checks.values() if v is True)
    with open(os.path.join(OUT, "bb-report.json"), "w", encoding="utf-8") as fh:
        json.dump({"checks": checks, "ok": ok, "total": len(checks)}, fh, ensure_ascii=False, indent=1)
    print(json.dumps(checks, ensure_ascii=False, indent=1))
    print(f"{ok} / {len(checks)} true")
    return 0 if ok == len(checks) else 1


if __name__ == "__main__":
    sys.exit(main())
