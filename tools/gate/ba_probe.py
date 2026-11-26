# -*- coding: utf-8 -*-
"""批 BA′ 的探针：买断的上限（店底子）在界面上到底通不通。

判据（对应 `docs/GAP四轮-2026-11-26.md` 第五节的 BA′，以及 `sim/custom.ts` 的两个出口）：
  1. 店面页有一段「店底子」，段头两处数字（卖相 +0% / 料钱 −0%），两行各五级；
  2. 按钮三态：**标价（买得起）/ 已买满（disabled）**，拒绝时不扣钱、toast 说「还差」；
  3. 点一次「手艺的底子」：角标 Lv 1/5、段头 +10%、按钮换成下一级的价钱、现金少 ¥12,000；
  4. 点一次「料钱的底子」：段头 −3%，并且**这一碗料钱那行数字当场变小**
     （这一条是「买断真的接进了报价」的唯一可见证据 —— 模型侧由 `sim/custom.test.ts` ③ 钉住）；
  5. 买满之后段头报 +50%，按钮变「已买满」且 disabled。

跑法（必须在仓库根，`OUT` 是相对路径）：
    python -X utf8 tools/gate/ba_probe.py
"""
import json
import os
import re
import sys

from playwright.sync_api import sync_playwright

URL = os.environ.get("PW_URL", "http://localhost:4246/")
OUT = "game/data/evidence/ba"
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
  // 店面页（店底子在这一页）
  $('[data-tab2="shop"]')?.click();
  await sleep(400);
  return true;
})()
"""

# 摆现金：这一批要走「买得起 → 买满 → 钱不够」三段，直接摆比攒快
SET_CASH = """
(n) => {
  const s = window.__laoyou.state;
  s.cash = n;
  window.__laoyou.refresh();
  return s.cash;
}
"""

# 开局那份配方的「配料料钱」是零（三件基础味型记在 sides 里，不在 toppings 表里），
# 拿它测「料钱 −3%」会被两位小数吞掉 —— 先摆两样真配料，让那一段有数可降。
# 这不是为探针造假：中期玩家的菜单本来就有加料，这一格验的就是那种菜单。
ADD_TOPPINGS = """
() => {
  const s = window.__laoyou.state;
  s.recipe.toppings = ['top.sourbamboo', 'top.douchi'];
  window.__laoyou.refresh();
  return s.recipe.toppings.slice();
}
"""

READ_CUSTOM = """
() => {
  const pane = document.querySelector('.pane[data-pane="shop"]');
  if (!pane) return { found: false };
  const secs = Array.from(pane.querySelectorAll('.sec'));
  const sec = secs.find((x) => {
    const h = x.querySelector('.sechd');
    return h && h.textContent.includes('店底子');
  });
  if (!sec) return { found: false };
  const rows = Array.from(sec.querySelectorAll('[data-custom-row]')).map((r) => {
    const name = r.querySelector('.lname');
    const btn = r.querySelector('button[data-act="buycustom"]');
    return {
      id: r.getAttribute('data-custom-row'),
      tags: Array.from(name ? name.querySelectorAll('.tag2') : []).map((t) => t.textContent.trim()),
      meta: Array.from(r.querySelectorAll('.lmeta')).map((x) => x.textContent.trim()).join(' '),
      btn: btn ? btn.textContent.trim() : '',
      disabled: btn ? btn.disabled : null,
    };
  });
  const costLine = sec.querySelector('[data-custom-bowlcost]');
  return {
    found: true,
    head: sec.querySelector('.sechd').textContent.trim(),
    rows,
    bowlCost: costLine ? costLine.textContent.trim() : '',
    cash: window.__laoyou.state.cash,
    custom: window.__laoyou.state.custom ?? {},
  };
}
"""

# 点某一行的按钮（真点击：这一条要验的就是接线，不是读数）
CLICK_ROW = """
(id) => {
  const btn = document.querySelector(`[data-custom-row="${id}"] button[data-act="buycustom"]`);
  if (!btn) return { clicked: false };
  btn.click();
  return { clicked: true, disabled: btn.disabled };
}
"""

READ_TOAST = """
() => {
  const nodes = Array.from(document.querySelectorAll('#toasts .toast'));
  return nodes.map((n) => n.textContent.trim());
}
"""


def bowl_cost_number(text):
    m = re.search(r"¥(\d+\.\d\d)", text or "")
    return float(m.group(1)) if m else None


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

        # ── 一、一级都没买的样子：段头 +0% / −0%，两行五级，按钮报第一级的价钱
        page.evaluate(SET_CASH, 1_000_000)
        page.evaluate(ADD_TOPPINGS)
        page.wait_for_timeout(450)
        zero = page.evaluate(READ_CUSTOM)
        checks["custom_found"] = zero.get("found") is True
        checks["custom_two_rows"] = len(zero.get("rows", [])) == 2
        checks["custom_head_zero"] = "卖相 +0%" in (zero.get("head") or "") and "料钱 −0%" in (zero.get("head") or "")
        tags0 = [t for r in zero.get("rows", []) for t in r.get("tags", [])]
        checks["custom_lv_zero"] = sum(1 for t in tags0 if re.fullmatch(r"Lv 0/5", t or "")) == 2
        by_id = {r.get("id"): r for r in zero.get("rows", [])}
        checks["custom_price_taste"] = "¥12,000" in ((by_id.get("taste") or {}).get("btn") or "")
        checks["custom_price_cost"] = "¥18,000" in ((by_id.get("cost") or {}).get("btn") or "")
        checks["custom_rows_not_disabled"] = all(r.get("disabled") is False for r in zero.get("rows", []))
        checks["custom_bowlcost_shows"] = bowl_cost_number(zero.get("bowlCost")) is not None
        cost0 = bowl_cost_number(zero.get("bowlCost"))
        page.screenshot(path=f"{OUT}/01-ba-custom-zero.png", full_page=False)

        # ── 二、买一级「手艺的底子」：真点按钮（接线：panel → main.ts → sim/custom.ts）
        page.evaluate(CLICK_ROW, "taste")
        page.wait_for_timeout(450)
        one = page.evaluate(READ_CUSTOM)
        toasts = page.evaluate(READ_TOAST)
        checks["buy_taste_toast"] = any("已置办" in t for t in toasts)
        checks["buy_taste_lv1"] = (one.get("custom") or {}).get("taste") == 1
        checks["buy_taste_tag"] = any(re.fullmatch(r"Lv 1/5", t or "") for t in (one.get("rows") or [{}])[0].get("tags", []))
        checks["buy_taste_head"] = "卖相 +10%" in (one.get("head") or "")
        checks["buy_taste_next_price"] = "¥28,000" in (((one.get("rows") or [{}])[0]).get("btn") or "")
        checks["buy_taste_cash"] = one.get("cash") == 1_000_000 - 12_000
        page.screenshot(path=f"{OUT}/02-ba-taste-one.png", full_page=False)

        # ── 三、买一级「料钱的底子」：段头 −3%，且这一碗料钱当场变小
        page.evaluate(CLICK_ROW, "cost")
        page.wait_for_timeout(450)
        two = page.evaluate(READ_CUSTOM)
        cost1 = bowl_cost_number(two.get("bowlCost"))
        checks["buy_cost_head"] = "料钱 −3%" in (two.get("head") or "")
        checks["buy_cost_bowlcost"] = cost0 is not None and cost1 is not None and cost1 < cost0
        checks["buy_cost_cash"] = two.get("cash") == 1_000_000 - 12_000 - 18_000
        page.screenshot(path=f"{OUT}/03-ba-cost-one.png", full_page=False)

        # ── 四、买满「手艺的底子」：段头 +50%，按钮「已买满」且 disabled
        for _ in range(4):
            page.evaluate(CLICK_ROW, "taste")
            page.wait_for_timeout(320)
        full = page.evaluate(READ_CUSTOM)
        taste_row = (full.get("rows") or [{}])[0]
        checks["full_head"] = "卖相 +50%" in (full.get("head") or "")
        checks["full_lv5"] = any(re.fullmatch(r"Lv 5/5", t or "") for t in taste_row.get("tags", []))
        checks["full_btn_maxed"] = "已买满" in (taste_row.get("btn") or "")
        checks["full_disabled"] = taste_row.get("disabled") is True
        checks["full_cost_still_open"] = ((full.get("rows") or [{}, {}])[1]).get("disabled") is False
        page.screenshot(path=f"{OUT}/04-ba-taste-full.png", full_page=False)

        # ── 五、钱不够：拒绝要说「还差」，且**不扣钱、不升级**
        page.evaluate(SET_CASH, 0)
        page.wait_for_timeout(350)
        broke_cash = (page.evaluate(READ_CUSTOM)).get("cash")
        page.evaluate(CLICK_ROW, "cost")
        page.wait_for_timeout(450)
        poor = page.evaluate(READ_CUSTOM)
        poor_toasts = page.evaluate(READ_TOAST)
        checks["poor_toast_says_short"] = any("还差" in t for t in poor_toasts)
        checks["poor_cash_unchanged"] = poor.get("cash") == broke_cash == 0
        checks["poor_level_unchanged"] = (poor.get("custom") or {}).get("cost") == 1
        page.screenshot(path=f"{OUT}/05-ba-poor.png", full_page=False)

        checks["save_version"] = page.evaluate("() => window.__laoyou.state.saveVersion") == 37
        real = [e for e in errors if "Failed to load resource" not in e]
        checks["console_clean"] = len(real) == 0
        if real:
            checks["console_errors"] = real[:3]

        page.screenshot(path=f"{OUT}/06-1440x900.png", full_page=False)
        browser.close()

    ok = sum(1 for v in checks.values() if v is True)
    with open(f"{OUT}/ba-report.json", "w", encoding="utf-8") as fh:
        json.dump({"checks": checks, "ok": ok, "total": len(checks)}, fh, ensure_ascii=False, indent=1)
    print(json.dumps(checks, ensure_ascii=False, indent=1))
    print(f"{ok} / {len(checks)} true")
    return 0 if ok == len(checks) else 1


if __name__ == "__main__":
    sys.exit(main())
