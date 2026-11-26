# -*- coding: utf-8 -*-
"""批 AZ′ 的探针：四条「预告」接进模拟之后，界面上能不能看见。

四条判据（对应 `docs/GAP四轮-2026-11-26.md` 第五节的 AZ′）：
  1. `stove5`（第 8 段）：设备行「Lv 4/4」+ 按钮「段位没到」+ 理由说「第 8 段」；
     评到第 8 段之后变成「Lv 4/5」+ 按钮报出 ¥68,000 的真价钱。**两句话不许混**：
     段位没到时按钮绝不能写「已到顶档」。
  2. `takeaway`（第 9 段）：手艺树上第 9 段那张牌不再标「预告」，写「已会」。
  3. `branch`（第 10 段）：同上，第 10 段那张牌写「已会」。
  4. `legend`（第 11 段）：换区那一段的说明从「本区客流每季度 −9%」变成「不再往下掉」，
     并且「这一片：客流 ×1.00」不再是破产的 ×0.55。

另外两条基础判据：整页一个「预告」都不许剩（十条全接了）、控制台干净。

跑法（必须在仓库根，`OUT` 是相对路径）：
    python -X utf8 tools/gate/az_probe.py
"""
import json
import os
import re
import sys

from playwright.sync_api import sync_playwright

URL = os.environ.get("PW_URL", "http://localhost:4246/")
OUT = "game/data/evidence/az"
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
  // 店面页（设备在这一页）
  $('[data-tab2="shop"]')?.click();
  await sleep(400);
  return true;
})()
"""

# 直接摆段位：本批只关心「段位到了之后界面上有什么不一样」
SET_GRADE = """
(n) => {
  const s = window.__laoyou.state;
  s.gradeLevel = n;
  window.__laoyou.refresh();
}
"""

# 把案台摆到「前四档都买了」的样子。
# 不走按钮点击（会被「今天只动一件」的裁定挡住），也不走 `__laoyou` 的新出口
# （调试出口白名单只认 `__laoyou` / `__gameState` / `__autoplay` / `__probeReady` 四个键，
# 往里加方法等于扩了出口）；直接摆状态，探针验的是「界面读到的数」与「模拟允许的上限」一致。
MAX_OUT_BENCH = """
() => {
  const s = window.__laoyou.state;
  s.cash = 1000000;
  s.equipment.bench = 4;
  s.capacity = s.capacity + 160;
  window.__laoyou.refresh();
  return { level: s.equipment.bench, cash: s.cash };
}
"""

# 住久一点：让本区能量掉下去（第 11 段之前会掉）
AGE_DISTRICT = """
(n) => {
  const s = window.__laoyou.state;
  s.districtSince = 0;
  s.month = n;
  window.__laoyou.refresh();
}
"""

READ_EQUIP = """
() => {
  const rows = Array.from(document.querySelectorAll('.pane[data-pane="shop"] .lrow'));
  const hit = rows.find((r) => {
    const n = r.querySelector('.lname');
    return n && n.textContent.includes('案台');
  });
  if (!hit) return { found: false };
  const name = hit.querySelector('.lname');
  const tags = Array.from(name ? name.querySelectorAll('.tag2') : []).map((x) => x.textContent.trim());
  const meta = Array.from(hit.querySelectorAll('.lmeta')).map((x) => x.textContent.trim()).join(' ');
  const btn = hit.querySelector('button[data-act="buyequip"]');
  return {
    found: true,
    tags,
    meta,
    btn: btn ? btn.textContent.trim() : '',
    disabled: btn ? btn.disabled : null,
    cash: window.__laoyou.state.cash,
    grade: window.__laoyou.state.gradeLevel,
    bench: window.__laoyou.state.equipment.bench ?? 0,
  };
}
"""

READ_CRAFT = """
() => {
  const pane = document.querySelector('.pane[data-pane="shop"]');
  if (!pane) return { found: false };
  const secs = Array.from(pane.querySelectorAll('.sec'));
  const sec = secs.find((x) => {
    const h = x.querySelector('.sechd');
    return h && h.textContent.includes('手艺树');
  });
  if (!sec) return { found: false };
  const rows = Array.from(sec.querySelectorAll('.lrow')).map((r) => {
    const tags = Array.from(r.querySelectorAll('.tag2')).map((t) => t.textContent.trim());
    return { text: r.textContent.replace(/\\s+/g, ' ').trim(), tags };
  });
  return { found: true, head: sec.querySelector('.sechd').textContent.trim(), rows };
}
"""

READ_DISTRICT = """
() => {
  const pane = document.querySelector('.pane[data-pane="shop"]');
  if (!pane) return { found: false };
  const secs = Array.from(pane.querySelectorAll('.sec'));
  const sec = secs.find((x) => {
    const h = x.querySelector('.sechd');
    return h && h.textContent.includes('换区');
  });
  if (!sec) return { found: false };
  return { found: true, text: sec.textContent.replace(/\\s+/g, ' ').trim() };
}
"""

BUY_BENCH = """
() => {
  const s = window.__laoyou.state;
  const before = s.equipment.bench ?? 0;
  s.equipment.bench = before + 1;
  s.capacity = s.capacity + 200;
  window.__laoyou.refresh();
  return { bought: 1, level: s.equipment.bench };
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

        # ── 一、第 7 段：第五档锁着，按钮必须说「段位没到」而不是「已到顶档」
        page.evaluate(SET_GRADE, 7)
        page.evaluate(MAX_OUT_BENCH)
        page.wait_for_timeout(450)
        low = page.evaluate(READ_EQUIP)
        checks["low_found"] = low.get("found") is True
        checks["low_maxed_four"] = low.get("bench") == 4
        checks["low_tag_lv44"] = any(re.fullmatch(r"Lv 4/4", t or "") for t in low.get("tags", []))
        checks["low_btn_not_top"] = "顶档" not in (low.get("btn") or "")
        checks["low_btn_says_grade"] = "段位" in (low.get("btn") or "")
        checks["low_meta_says_grade8"] = "第 8 段" in (low.get("meta") or "")
        checks["low_disabled"] = low.get("disabled") is True
        page.screenshot(path=f"{OUT}/01-az-locked.png", full_page=False)

        # ── 二、第 8 段：第五档开了，标签「Lv 4/5」，按钮报真价钱
        page.evaluate(SET_GRADE, 8)
        page.wait_for_timeout(450)
        high = page.evaluate(READ_EQUIP)
        checks["high_tag_lv45"] = any(re.fullmatch(r"Lv 4/5", t or "") for t in high.get("tags", []))
        checks["high_btn_reports_price"] = "¥68,000" in (high.get("btn") or "")
        checks["high_enabled"] = high.get("disabled") is False
        checks["high_meta_no_lock"] = "第 8 段" not in (high.get("meta") or "")
        page.screenshot(path=f"{OUT}/02-az-unlocked.png", full_page=False)

        # ── 三、手艺树：十条里一个「预告」都不许剩（第 11 段全亮）
        page.evaluate(SET_GRADE, 11)
        page.wait_for_timeout(400)
        craft = page.evaluate(READ_CRAFT)
        checks["craft_found"] = craft.get("found") is True
        allTags = [t for r in craft.get("rows", []) for t in r.get("tags", [])]
        checks["craft_no_pending_tag"] = not any(t == "预告" for t in allTags)
        checks["craft_all_known"] = all(t == "已会" for t in allTags) and len(allTags) >= 10
        ninth = [r for r in craft.get("rows", []) if "第 9 段" in r.get("text", "")]
        checks["craft_takeaway_known"] = bool(ninth) and "已会" in ninth[0].get("tags", [])
        tenth = [r for r in craft.get("rows", []) if "第 10 段" in r.get("text", "")]
        checks["craft_branch_known"] = bool(tenth) and "已会" in tenth[0].get("tags", [])
        page.screenshot(path=f"{OUT}/03-az-craft.png", full_page=False)

        # ── 四、换区那一段：第 11 段之前说「每季度 −9%」，之后说「不再往下掉」
        page.evaluate(SET_GRADE, 6)
        page.evaluate(AGE_DISTRICT, 12)
        page.wait_for_timeout(400)
        before = page.evaluate(READ_DISTRICT)
        checks["district_found"] = before.get("found") is True
        checks["district_decays_before"] = "每季度" in (before.get("text") or "") and "−9%" in (before.get("text") or "")
        # 已经住了 4 个季度：能量该掉到 1 − 0.09×4 = 0.64
        checks["district_energy_dropped"] = bool(re.search(r"客流 ×0\.\d\d", before.get("text") or ""))

        page.evaluate(SET_GRADE, 11)
        page.wait_for_timeout(450)
        after = page.evaluate(READ_DISTRICT)
        checks["district_no_decay_after"] = "不再往下掉" in (after.get("text") or "")
        checks["district_no_minus9"] = "−9%" not in (after.get("text") or "")
        checks["district_energy_full"] = "客流 ×1.00" in (after.get("text") or "")
        page.screenshot(path=f"{OUT}/04-az-district.png", full_page=False)

        checks["save_version"] = page.evaluate("() => window.__laoyou.state.saveVersion") == 37
        real = [e for e in errors if "Failed to load resource" not in e]
        checks["console_clean"] = len(real) == 0
        if real:
            checks["console_errors"] = real[:3]

        page.screenshot(path=f"{OUT}/05-1440x900.png", full_page=False)
        browser.close()

    ok = sum(1 for v in checks.values() if v is True)
    with open(f"{OUT}/az-report.json", "w", encoding="utf-8") as fh:
        json.dump({"checks": checks, "ok": ok, "total": len(checks)}, fh, ensure_ascii=False, indent=1)
    print(json.dumps(checks, ensure_ascii=False, indent=1))
    print(f"{ok} / {len(checks)} true")
    return 0 if ok == len(checks) else 1


if __name__ == "__main__":
    sys.exit(main())
