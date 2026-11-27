# -*- coding: utf-8 -*-
"""批 BE′ 的探针：一步换掉一条门路（解 P505）、门路位在账本与打烊单上看得见（解 P506）。

判据（这一批自己定的，写进 `docs/一步换掉BE′-2026-11-27.md`）：
  1. 位子挂满之后，买不起位子的那一行**同时给出两条路**：标签里既有「先撤一条」
     也有「直接换」，并且多了一个「换掉「X」· ¥N」按钮 —— 那句话不能只说一半；
  2. 那个按钮名里点的是**剩余天数最少**的那条（替它损失的剩余天数最少），
     价钱写的是**新那条**的价，不是两条加起来；
  3. 点一下：现金**只减新那条的价**（旧的不退、也不会再扣一遍），
     位子数从头到尾**不空**（换完仍是 `2 / 2 位`），新的在走、旧的重回可买；
  4. 钱不够时不画「换一条」（只有真买得起才给这条路，免得点下去才发现差钱）；
  5. 位子数在**打烊单脚注**上也能读到（判据②：一关面板就忘，打烊这一刻正是要决定的时候）；
  6. 位子数与挂着哪几条在**账本页**也有一格（「门路 · 2 / 2 位」+ 每条剩几天）。

跑法（必须在仓库根，`OUT` 是相对路径；改面板文案后要先 `npm run -s build`）：
    PW_URL=http://localhost:4246/ python -X utf8 tools/gate/be_probe.py
"""
import json
import os

from playwright.sync_api import sync_playwright
from probe_version import SAVE_VERSION

URL = os.environ.get("PW_URL", "http://localhost:4246/")
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = os.path.join(ROOT, "game", "data", "evidence", "be")
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

# 门路那一段：抬头（含位子数）、总说明、每行（含「换掉「X」」按钮）
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
    const cancel = r.querySelector('button[data-act="cancelinvest"]');
    const swap = r.querySelector('button[data-act="swapinvest"]');
    const tag = r.querySelector('.tag2');
    return {
      name: name ? name.textContent.trim() : '',
      id: r.getAttribute('data-invest-id') || '',
      btn: btn ? btn.textContent.trim() : '',
      cancel: cancel ? cancel.textContent.trim() : '',
      swap: swap ? swap.textContent.trim() : '',
      swapId: swap ? swap.getAttribute('data-id') : '',
      tag: tag ? tag.textContent.trim() : '',
    };
  });
  const slots = head ? head.textContent.match(/\\d+ \\/ \\d+ 位/) : null;
  return {
    found: true,
    head: head ? head.textContent.replace(/\\s+/g, ' ').trim() : '',
    hint: hint ? hint.textContent.replace(/\\s+/g, ' ').trim() : '',
    rows,
    cash: window.__laoyou.state.cash,
    slotsText: slots ? slots[0] : '',
  };
}
"""

SET_GRADE = """
(level) => {
  const s = window.__laoyou.state;
  s.gradeLevel = level;
  window.__laoyou.refresh();
  return { grade: s.gradeLevel };
}
"""

SET_CASH = """
(v) => {
  const s = window.__laoyou.state;
  s.cash = v;
  window.__laoyou.refresh();
  return { cash: s.cash };
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

# 「换掉「X」」那一下：data-id 是 `旧|新` 两段拼起来的
SWAP = """
(pair) => {
  const btn = document.querySelector(`button[data-act="swapinvest"][data-id="${pair}"]`);
  if (!btn) return { clicked: false };
  btn.click();
  return { clicked: true };
}
"""

# 打烊单脚注（判据②）：把单据摆出来，读脚注那一格
READ_CLOSING_FOOT = """
() => {
  const s = window.__laoyou.state;
  s.dayReport = {
    month: s.month, day: s.day, served: 42, lost: 3, revenue: 630,
    wages: 0, rent: 0, profit: 630, sat: 70,
    lostQueue: 2, lostPrice: 0, lostWait: 1,
  };
  window.__laoyou.refresh();
  const d = document.querySelector('.modal.dayreport');
  if (d) d.hidden = false;
  const foot = document.querySelector('[data-invest-slots]');
  const line = document.querySelector('[data-invest-line]');
  return {
    foot: foot ? foot.textContent.replace(/\\s+/g, ' ').trim() : '',
    line: line ? line.textContent.replace(/\\s+/g, ' ').trim() : '',
    visible: foot ? foot.offsetParent !== null : false,
  };
}
"""

# 账本页末尾的门路那一格（判据③）
READ_LEDGER_INVEST = """
() => {
  const sec = document.querySelector('[data-ledger-invest]');
  if (!sec) return { found: false };
  const head = sec.querySelector('.sechd');
  const rows = Array.from(sec.querySelectorAll('.lrow')).map((r) => ({
    id: r.getAttribute('data-ledger-invest-id') || '',
    name: (r.querySelector('.lname') || {}).textContent || '',
    meta: (r.querySelector('.lmeta') || {}).textContent || '',
  }));
  return {
    found: true,
    head: head ? head.textContent.replace(/\\s+/g, ' ').trim() : '',
    rows,
    empty: sec.querySelector('.empty2') ? sec.querySelector('.empty2').textContent.trim() : '',
  };
}
"""


def main() -> int:
    checks = {}
    noisy = []
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

        # ── 一、开局两位，先把两位挂满（料商 ¥50 一天、夜市 ¥300 两天）
        base = page.evaluate(READ_INVEST)
        checks["invest_found"] = base.get("found") is True
        checks["base_two_slots"] = base.get("slotsText", "").startswith("0 / 2 ")

        cash_start = page.evaluate("() => window.__laoyou.state.cash")
        page.evaluate(BUY, "supplier")
        page.wait_for_timeout(350)
        page.evaluate(BUY, "night_market")
        page.wait_for_timeout(350)
        full = page.evaluate(READ_INVEST)
        full_by_id = {r["id"]: r for r in full.get("rows", []) if r["id"]}
        checks["two_running"] = (
            "在走" in (full_by_id.get("supplier", {}).get("tag") or "")
            and "在走" in (full_by_id.get("night_market", {}).get("tag") or "")
        )
        checks["full_slots_two"] = full.get("slotsText", "").startswith("2 / 2 ")

        # ── 二、判据①：第三条那行两条路都给出来（不能只说「先撤一条」）
        third = full_by_id.get("master", {})
        checks["third_says_cancel_first"] = "先撤一条" in (third.get("tag") or "")
        checks["third_says_swap_too"] = "直接换" in (third.get("tag") or "")
        checks["third_has_swap_button"] = (third.get("swap") or "") != ""
        checks["third_no_buy_button"] = (third.get("btn") or "") == ""
        # 按钮点的是「剩余天数最少」的那条：料商 1 天 < 夜市 2 天
        checks["swap_points_at_shortest"] = (third.get("swapId") or "") == "supplier|master"
        checks["swap_button_names_victim"] = (
            "跟料商多留一筐" in (third.get("swap") or "")
        )
        # 价钱写的是新那条（老师傅 ¥120），不是两条加起来
        checks["swap_button_shows_new_price"] = "¥120" in (third.get("swap") or "")
        page.screenshot(path=os.path.join(OUT, "01-be-swap-button.png"), full_page=False)

        # ── 三、判据②：点一下只扣新那条的钱，位子不空
        cash_before_swap = page.evaluate("() => window.__laoyou.state.cash")
        clicked = page.evaluate(SWAP, "supplier|master")
        page.wait_for_timeout(400)
        checks["clicked_swap"] = clicked.get("clicked") is True
        after = page.evaluate(READ_INVEST)
        after_by_id = {r["id"]: r for r in after.get("rows", []) if r["id"]}
        cash_after_swap = page.evaluate("() => window.__laoyou.state.cash")
        # 只减老师傅那 ¥120：旧的 ¥50 不退、也不会再扣一遍
        checks["cash_cut_only_new_price"] = round(cash_before_swap - cash_after_swap, 2) == 120
        checks["slots_never_empty"] = after.get("slotsText", "").startswith("2 / 2 ")
        checks["new_one_running"] = "在走" in (after_by_id.get("master", {}).get("tag") or "")
        # 换下来的那条回到「可以再换进来」的状态。位子仍满，所以它显示的是
        # 「换掉「X」」而不是买按钮 —— 这正是位子满时唯一诚实的入口。
        # 此刻挂着的是老师傅（1 天）与夜市（2 天），所以这一行点的是**老师傅**：
        # 又是「剩余天数最少」那把尺子，换一次只白丢一天的活。
        old_row = after_by_id.get("supplier", {})
        checks["old_one_back_on_menu"] = (old_row.get("swap") or "") != "" and (
            "请老师傅来看一天" in (old_row.get("swap") or "")
        )
        checks["bystander_untouched"] = (
            "在走" in (after_by_id.get("night_market", {}).get("tag") or "")
        )
        checks["buys_did_cost"] = cash_start - cash_before_swap > 0
        page.screenshot(path=os.path.join(OUT, "02-be-after-swap.png"), full_page=False)

        # ── 四、判据④：钱不够时不画「换一条」（只有真买得起才给这条路）
        page.evaluate(SET_CASH, 10)
        page.wait_for_timeout(300)
        poor = page.evaluate(READ_INVEST)
        poor_by_id = {r["id"]: r for r in poor.get("rows", []) if r["id"]}
        expensive = poor_by_id.get("tourism", {})
        checks["poor_has_no_swap_button"] = (expensive.get("swap") or "") == ""
        checks["poor_still_says_cancel"] = "先撤一条" in (expensive.get("tag") or "")
        checks["poor_does_not_say_swap"] = "直接换" not in (expensive.get("tag") or "")
        page.evaluate(SET_CASH, 15000)
        page.wait_for_timeout(300)

        # ── 五、判据⑤：位子数在打烊单脚注上也读得到
        closing = page.evaluate(READ_CLOSING_FOOT)
        checks["closing_foot_shows_slots"] = "门路" in (closing.get("foot") or "") and (
            "2 / 2 位" in (closing.get("foot") or "")
        )
        checks["closing_foot_visible"] = closing.get("visible") is True
        page.screenshot(path=os.path.join(OUT, "03-be-closing-foot.png"), full_page=False)

        # ── 六、判据⑥：账本页末尾的门路那一格（挂着哪几条、还剩几天、几位）
        #     面板开着时 `.modal` 盖住底栏，`page.click` 会被「intercepts pointer events」
        #     卡到超时 —— 一律用 evaluate 点（批 BC′ 踩过）。
        page.evaluate("() => document.querySelector('[data-tab=\"ledger\"]')?.click()")
        page.wait_for_timeout(450)
        led = page.evaluate(READ_LEDGER_INVEST)
        checks["ledger_section_found"] = led.get("found") is True
        checks["ledger_shows_slots"] = "2 / 2 位" in (led.get("head") or "")
        led_ids = [r["id"] for r in led.get("rows", [])]
        checks["ledger_lists_running"] = "master" in led_ids and "night_market" in led_ids
        led_meta = " ".join(r["meta"] for r in led.get("rows", []))
        checks["ledger_says_days_left"] = "还剩" in led_meta
        page.screenshot(path=os.path.join(OUT, "04-be-ledger.png"), full_page=False)

        # ── 七、存档版本与本页控制台
        checks["save_version"] = (
            page.evaluate("() => window.__laoyou.state.saveVersion") == SAVE_VERSION
        )
        noisy = [e for e in errs if "laoyou-api" not in (e.get("url") or "")]
        checks["console_clean"] = len(noisy) == 0
        page.screenshot(path=os.path.join(OUT, "05-1440x900.png"), full_page=False)
        browser.close()

    total = len(checks)
    ok = sum(1 for v in checks.values() if v)
    print(json.dumps(checks, ensure_ascii=False, indent=1))
    print(f"{ok} / {total} true")
    if noisy:
        print("console:", json.dumps(noisy[:5], ensure_ascii=False))
    return 0 if ok == total else 3


if __name__ == "__main__":
    raise SystemExit(main())
