# -*- coding: utf-8 -*-
"""批 BC′ 的探针：门路位随段位长 —— 面板上读得到位子数，位子满了按钮写「先撤一条」且一分不扣。

判据（对应 `docs/GAP四轮-2026-11-26.md` 第五节的 BC′）：
  1. 门路那段的抬头写着「挂了几条 / 一共几位」，开局是 `0 / 2 位`；
  2. 位子随段位长：第 5 段 `3 位`、第 8 段 `4 位`（两处门槛来自手艺树，不是写死的数）；
  3. 两位挂满之后，第三条那行没有买按钮，标签写「先撤一条（现在「X」占着）」；
  4. 那一下不扣钱：买之前与「被拦下」之后现金逐位相等；
  5. 正在走的行给「撤一条」按钮；撤掉之后位子空出来、**钱不退**（现金不变），
     并且原来被拦的那条立刻能买 —— 不撤就没法换，看着像死局；
  6. 手册「门路」那一页写着位子的事（玩家不进面板也查得到）。

跑法（必须在仓库根，`OUT` 是相对路径；改面板文案后要先 `npm run -s build`）：
    PW_URL=http://localhost:4246/ python -X utf8 tools/gate/bc_probe.py
"""
import json
import os

from playwright.sync_api import sync_playwright
from probe_version import SAVE_VERSION

URL = os.environ.get("PW_URL", "http://localhost:4246/")
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = os.path.join(ROOT, "game", "data", "evidence", "bc")
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

# 门路那一段：抬头（含位子数）、总说明、每行
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
    const tag = r.querySelector('.tag2');
    return {
      name: name ? name.textContent.trim() : '',
      id: r.getAttribute('data-invest-id') || (btn ? btn.getAttribute('data-id') : '') || '',
      btn: btn ? btn.textContent.trim() : '',
      cancel: cancel ? cancel.textContent.trim() : '',
      tag: tag ? tag.textContent.trim() : '',
    };
  });
  return {
    found: true,
    head: head ? head.textContent.replace(/\\s+/g, ' ').trim() : '',
    hint: hint ? hint.textContent.replace(/\\s+/g, ' ').trim() : '',
    rows,
    cash: window.__laoyou.state.cash,
    slotsText: (head ? head.textContent : '').match(/\\d+ \\/ \\d+ 位/) ? (head.textContent.match(/\\d+ \\/ \\d+ 位/)[0]) : '',
  };
}
"""

# 直接把段位摆上去（评段位那套会扣钱、要客人，与本批无关）
SET_GRADE = """
(level) => {
  const s = window.__laoyou.state;
  s.gradeLevel = level;
  window.__laoyou.refresh();
  return { grade: s.gradeLevel };
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

CANCEL = """
(id) => {
  const btn = document.querySelector(`button[data-act="cancelinvest"][data-id="${id}"]`);
  if (!btn) return { clicked: false };
  btn.click();
  return { clicked: true };
}
"""

READ_MANUAL = """
() => {
  const s = window.__laoyou.state;
  const page = (s.manual && typeof s.manual === 'object') ? null : null;
  return page;
}
"""

# 手册：直接把「门路」那一页的正文读出来（页面数据在 data/manual.ts，
# 运行时靠 manualRead 记读过哪些；这里只需要正文本身，所以从模块表里取不到时退回面板）
READ_MANUAL_PAGE = """
() => {
  const pane = document.querySelector('.pane[data-pane="collection"]');
  const secs = Array.from(document.querySelectorAll('.pane[data-pane="collection"] .sec'));
  const sec = secs.find((x) => {
    const h = x.querySelector('.sechd');
    return h && h.textContent.includes('手册');
  });
  if (!sec) return { found: false };
  return { found: true, text: sec.textContent.replace(/\\s+/g, ' ').trim() };
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

        # ── 一、开局两位，抬头写着「0 / 2 位」
        base = page.evaluate(READ_INVEST)
        checks["invest_found"] = base.get("found") is True
        checks["head_has_slots"] = base.get("slotsText", "") != ""
        checks["base_slots_two"] = base.get("slotsText", "").startswith("0 / 2 ")
        page.screenshot(path=os.path.join(OUT, "01-bc-two-slots.png"), full_page=False)

        rows = base.get("rows", [])
        by_id = {r["id"]: r for r in rows if r["id"]}
        # 开局三个类各挑一条：料商（make）、夜市（voice）、报个备（hedge）
        checks["rows_present"] = all(
            k in by_id for k in ("supplier", "night_market", "inspect_report")
        )

        # ── 二、位子随段位长：第 5 段 3 位、第 8 段 4 位（都要真的换出来，不是抄一个数）
        page.evaluate(SET_GRADE, 5)
        page.wait_for_timeout(250)
        g5 = page.evaluate(READ_INVEST)
        checks["grade5_three_slots"] = g5.get("slotsText", "").startswith("0 / 3 ")
        page.evaluate(SET_GRADE, 8)
        page.wait_for_timeout(250)
        g8 = page.evaluate(READ_INVEST)
        checks["grade8_four_slots"] = g8.get("slotsText", "").startswith("0 / 4 ")
        page.screenshot(path=os.path.join(OUT, "02-bc-four-slots.png"), full_page=False)
        # 回到开局那两位，后面「挂满」才好演
        page.evaluate(SET_GRADE, 0)
        page.wait_for_timeout(250)

        # ── 三、两位挂满：第三条没有买按钮，标签写「先撤一条」并且点名谁占着
        cash_before = page.evaluate("() => window.__laoyou.state.cash")
        page.evaluate(BUY, "supplier")
        page.wait_for_timeout(400)
        page.evaluate(BUY, "night_market")
        page.wait_for_timeout(400)
        full = page.evaluate(READ_INVEST)
        full_by_id = {r["id"]: r for r in full.get("rows", []) if r["id"]}
        checks["two_running"] = (
            "在走" in (full_by_id.get("supplier", {}).get("tag") or "")
            and "在走" in (full_by_id.get("night_market", {}).get("tag") or "")
        )
        checks["full_slots_read_two"] = full.get("slotsText", "").startswith("2 / 2 ")
        third = full_by_id.get("inspect_report", {})
        checks["third_says_cancel_first"] = "先撤一条" in (third.get("tag") or "")
        checks["third_has_no_buy_button"] = third.get("btn", "") == ""
        checks["third_names_holder"] = "占着" in (third.get("tag") or "")
        page.screenshot(path=os.path.join(OUT, "03-bc-full-slots.png"), full_page=False)

        # ── 四、被拦这一下不扣钱：现金必须等于「买完两条之后」那个数，而不是又少 ¥300
        cash_after_buys = page.evaluate("() => window.__laoyou.state.cash")
        page.evaluate(BUY, "inspect_report")  # 没按钮 → 点空，状态一分不动
        page.wait_for_timeout(300)
        cash_after_block = page.evaluate("() => window.__laoyou.state.cash")
        checks["blocked_costs_nothing"] = cash_after_block == cash_after_buys
        checks["buys_did_cost"] = cash_before - cash_after_buys > 0

        # ── 五、撤一条：位子空出来、钱不退、原来被拦的立刻能买
        checks["running_row_has_cancel"] = (
            full_by_id.get("supplier", {}).get("cancel", "") == "撤一条"
        )
        page.evaluate(CANCEL, "supplier")
        page.wait_for_timeout(400)
        freed = page.evaluate(READ_INVEST)
        freed_by_id = {r["id"]: r for r in freed.get("rows", []) if r["id"]}
        checks["cancel_frees_slot"] = freed.get("slotsText", "").startswith("1 / 2 ")
        checks["cancel_refunds_nothing"] = page.evaluate("() => window.__laoyou.state.cash") == cash_after_block
        checks["cancelled_row_buyable_again"] = freed_by_id.get("supplier", {}).get("btn", "") != ""
        checks["freed_third_now_buyable"] = freed_by_id.get("inspect_report", {}).get("btn", "") != ""
        page.screenshot(path=os.path.join(OUT, "04-bc-after-cancel.png"), full_page=False)

        # ── 六、手册里写着位子的事（不进面板也查得到）
        #     手册挂在「图鉴」那一页（`panels.ts:1916` 的 `manualSec` 在 collection 里），
        #     而 `render` 只在页签被打开过之后才画 —— 先切过去，否则 `.sec` 根本不在 DOM 里
        #     （首版没切，`manual_found` 红得毫无信息量）。
        # 用 evaluate 点，不用 `page.click`：面板开着时 `.modal` 盖住底栏，
        # `page.click` 会被「intercepts pointer events」卡到超时（首版就卡在这儿）。
        page.evaluate("() => document.querySelector('[data-tab=\"collection\"]')?.click()")
        page.wait_for_timeout(500)
        man = page.evaluate(READ_MANUAL_PAGE)
        checks["manual_found"] = man.get("found") is True
        man_text = man.get("text", "")
        checks["manual_says_slots"] = "门路位" in man_text
        checks["manual_says_cancel"] = "撤一条" in man_text

        # ── 七、存档版本与本页控制台
        checks["save_version"] = page.evaluate("() => window.__laoyou.state.saveVersion") == SAVE_VERSION
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
