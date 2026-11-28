# -*- coding: utf-8 -*-
"""批 BG′ + BH′ 的探针：日结单不再教错人（解 P546）+ 免费 2 座不再是陷阱（解 P545/P547/P548）。

判据（写进 `docs/两窗并行BG′-BH′-2026-11-28.md` 与 ACCEPTANCE 五·三十二）：
  1. 建店卡三档各有一枚「一天最多约 N 碗」（街边摊 33 / 巷内 65 / 临街 98），
     而且这个数是从 `sim/bottleneck.ts` 的座位闸算出来的同一个算式，不是另抄一份；
  2. 2 座那档卡片带「起步档」，4 座 / 6 座不带（不能把三档都打上标签，那等于没标）；
  3. 日结单的主因读**三条计数**：队满最多就说「门口站满了」，价牌最多才说「看价牌」，
     等太久最多就说「等不及」—— 三种输入必须给出三种不同的句子（这就是 P546 的病）；
  4. 三条计数为 0（老存档、没流失）时不许把责任推给价牌；
  5. `summary()` 输出的 `lostSplit` 三个键都在、都是数，且 `lostReasons` 的三条说法固定；
  6. 座位系数在产物里可读：`spawnSeatFactor` 的等价断言走 `summary`/`state` 拿不到，
     所以改由 `setup.test.ts` 的单测钉（4 座及以上恒 1.0），本探针只钉界面与文案。

跑法（仓库根，先 `npm run -s build` 再起 preview）：
    PW_URL=http://localhost:4246/ python -X utf8 tools/gate/bg_bh_probe.py
"""
from __future__ import annotations

import json
import os
import sys

from playwright.sync_api import sync_playwright

URL = os.environ.get("PW_URL", "http://localhost:4246/")
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = os.path.join(ROOT, "game", "data", "evidence", "bg-bh-2026-11-28")
os.makedirs(OUT, exist_ok=True)

# 三张建店卡：名字 / 座位 / 灶 / 日产能那一格 / 底部小字
READ_CARDS = """() => {
  const cards = [...document.querySelectorAll('.sitecard')];
  return cards.map((c) => ({
    site: c.getAttribute('data-site') || '',
    name: (c.querySelector('.sname') || {}).textContent || '',
    stats: [...c.querySelectorAll('.sstats span')].map((s) => (s.textContent || '').trim()),
    bowls: (c.querySelector('.sbowls') || {}).textContent || '',
    badge: (c.querySelector('[data-badge]') || {}).textContent || '',
  }));
}"""

# 进店：巷内小店 + 随机店名 + 开门 + 收掉引导
ENTER = """(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  for (let i = 0; i < 60; i += 1) {
    if (window.__laoyou && window.__laoyou.state) break;
    await sleep(100);
  }
  document.querySelector('.sitecard[data-site="alley"]')?.click();
  await sleep(200);
  document.querySelector('[data-chips] .chip')?.click();
  await sleep(200);
  document.querySelector('[data-open]')?.click();
  await sleep(500);
  document.querySelector('.gbtn.ghost')?.click();
  await sleep(600);
  return !!(window.__laoyou && window.__laoyou.state);
})()"""

# 造一天打烊单：只给三条计数，看日结单说哪句话
PUT_DAY = """(cfg) => {
  const s = window.__laoyou.state;
  s.phase = 'closing';
  s.dayReport = {
    month: s.month, day: s.day,
    revenue: 320, served: 40,
    lost: cfg.q + cfg.p + cfg.w,
    lostQueue: cfg.q, lostPrice: cfg.p, lostWait: cfg.w,
    avgSat: 44, price: 9, taste: 62, cash: s.cash,
  };
  s.flow.lostQueue = cfg.q; s.flow.lostPrice = cfg.p; s.flow.lostWait = cfg.w;
  s.flow.lostToday = cfg.q + cfg.p + cfg.w; s.flow.servedToday = 40;
  s.pendingTrophies = [];
  window.__laoyou.refresh();
  return true;
}"""

READ_NOTE = """() => {
  const n = document.querySelector('[data-day-note]');
  const s = window.__laoyou.state;
  return {
    note: n ? (n.textContent || '').trim() : '',
    closing: s.phase === 'closing',
    rep: s.dayReport ? {
      lost: s.dayReport.lost,
      queue: s.dayReport.lostQueue,
      price: s.dayReport.lostPrice,
      wait: s.dayReport.lostWait,
    } : null,
  };
}"""

READ_SUMMARY = """() => {
  const out = { ok: false };
  try {
    const sum = window.__laoyou.summary();
    const days = window.__laoyou.days();
    out.ok = true;
    out.lostSplit = sum.lostSplit || null;
    out.lostReasons = (sum.lostReasons || []).map((r) => ({ reason: r.reason, count: r.count }));
    out.dayKeys = days.length ? Object.keys(days[days.length - 1]).sort() : [];
    out.daySplit = days.length ? {
      queue: days[days.length - 1].lostQueue,
      price: days[days.length - 1].lostPrice,
      wait: days[days.length - 1].lostWait,
    } : null;
  } catch (e) {
    out.error = String(e);
  }
  return out;
}"""


def main() -> int:
    checks: dict[str, bool] = {}
    detail: dict = {}
    errors: list[str] = []
    with sync_playwright() as pw:
        browser = pw.chromium.launch()
        page = browser.new_page(viewport={"width": 1440, "height": 900})
        page.on("pageerror", lambda e: errors.append(str(e)))
        page.goto(URL, wait_until="networkidle")
        page.evaluate("() => { localStorage.clear(); location.reload(); }")
        page.wait_for_timeout(1200)

        # —— BH′：建店卡三档 ——
        cards = page.evaluate(READ_CARDS)
        detail["cards"] = cards
        page.screenshot(path=f"{OUT}/01-setup-cards-1440x900.png")

        by_site = {c["site"]: c for c in cards}
        checks["three_cards"] = sorted(by_site) == ["alley", "stall", "streetfront"]
        bowls = {k: (v.get("bowls") or "") for k, v in by_site.items()}
        checks["card_bowls_stall"] = "一天最多约 33 碗" in bowls.get("stall", "")
        checks["card_bowls_alley"] = "一天最多约 65 碗" in bowls.get("alley", "")
        checks["card_bowls_street"] = "一天最多约 98 碗" in bowls.get("streetfront", "")
        checks["card_bowls_keeps_old_stats"] = all(
            len(by_site.get(k, {}).get("stats") or []) >= 4 for k in ("stall", "alley", "streetfront")
        )
        checks["badge_stall_start"] = (by_site.get("stall", {}).get("badge") or "").strip() == "起步档"
        checks["badge_alley_empty"] = (by_site.get("alley", {}).get("badge") or "").strip() == ""
        checks["badge_street_empty"] = (by_site.get("streetfront", {}).get("badge") or "").strip() == ""

        # 375 宽也看一张（2 座那档在最上面，被挡住就等于没写）
        small = browser.new_page(viewport={"width": 375, "height": 667})
        small.goto(URL, wait_until="networkidle")
        small.wait_for_timeout(900)
        small.screenshot(path=f"{OUT}/02-setup-cards-375x667.png")
        small_cards = small.evaluate(READ_CARDS)
        checks["mobile_bowls_visible"] = any("一天最多约 33 碗" in (c.get("bowls") or "") for c in small_cards)
        small.close()

        # —— 进店，走到打烊单 ——
        entered = page.evaluate(ENTER)
        checks["entered"] = bool(entered)
        page.wait_for_timeout(400)

        # ① 队满为主：不能说「看价牌」
        page.evaluate(PUT_DAY, {"q": 44, "p": 2, "w": 3})
        page.wait_for_timeout(450)
        q_note = page.evaluate(READ_NOTE)
        detail["note_queue"] = q_note
        checks["note_queue_says_jammed"] = "门口站满了" in q_note["note"]
        checks["note_queue_not_price"] = "看价牌" not in q_note["note"]
        page.screenshot(path=f"{OUT}/03-day-note-queue.png")

        # ② 价牌为主
        page.evaluate(PUT_DAY, {"q": 2, "p": 41, "w": 3})
        page.wait_for_timeout(450)
        p_note = page.evaluate(READ_NOTE)
        detail["note_price"] = p_note
        checks["note_price_says_board"] = "看价牌" in p_note["note"]
        checks["note_price_not_jammed"] = "门口站满了" not in p_note["note"]
        page.screenshot(path=f"{OUT}/04-day-note-price.png")

        # ③ 等太久为主
        page.evaluate(PUT_DAY, {"q": 3, "p": 2, "w": 40})
        page.wait_for_timeout(450)
        w_note = page.evaluate(READ_NOTE)
        detail["note_wait"] = w_note
        checks["note_wait_says_wait"] = "等不及" in w_note["note"]
        checks["note_wait_not_price"] = "看价牌" not in w_note["note"]
        page.screenshot(path=f"{OUT}/05-day-note-wait.png")

        # ④ 三条全零：不能说成看价牌
        page.evaluate(PUT_DAY, {"q": 0, "p": 0, "w": 0})
        page.wait_for_timeout(450)
        z_note = page.evaluate(READ_NOTE)
        detail["note_zero"] = z_note
        checks["note_zero_not_price"] = "看价牌" not in z_note["note"]

        # —— BG′：summary / days 的结构 ——
        summary = page.evaluate(READ_SUMMARY)
        detail["summary"] = summary
        checks["summary_ok"] = bool(summary.get("ok"))
        split = summary.get("lostSplit") or {}
        checks["summary_lost_split_keys"] = sorted(split.keys()) == ["price", "queue", "wait"]
        checks["summary_lost_split_numbers"] = all(
            isinstance(split.get(k), (int, float)) for k in ("queue", "price", "wait")
        )
        labels = [r["reason"] for r in (summary.get("lostReasons") or [])]
        allowed = {"门口站满了没进来", "看价牌掉头（一款都买不起）", "等不及走了"}
        checks["summary_labels_fixed"] = set(labels).issubset(allowed)
        day_keys = set(summary.get("dayKeys") or [])
        checks["day_has_three_counters"] = {"lostQueue", "lostPrice", "lostWait"}.issubset(day_keys)
        checks["day_no_reasons_map"] = "reasons" not in day_keys

        checks["console_clean"] = len(errors) == 0
        browser.close()

    report = {
        "ok": all(checks.values()),
        "checks": checks,
        "detail": detail,
        "pageerrors": errors,
    }
    with open(os.path.join(OUT, "probe.json"), "w", encoding="utf-8") as f:
        json.dump(report, f, ensure_ascii=False, indent=2)
    print(json.dumps({k: v for k, v in checks.items()}, ensure_ascii=False, indent=2))
    bad = [k for k, v in checks.items() if not v]
    print("FAIL: " + ", ".join(bad) if bad else "ALL PASS")
    return 0 if report["ok"] else 1


if __name__ == "__main__":
    sys.exit(main())
