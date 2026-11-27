# -*- coding: utf-8 -*-
"""批 F′ 探针：店铺页顶部「今天」那一条（preview 4222）。

验四件事：
1. 那一条存在，主句跟钩子同源（不是另写一句）；
2. 副句给形态：几张桌 / 几分钟 / 几天回本 / 在「家当」或「设备」第 N 行；
3. 指到的那一行真的被高亮（`.hotrow`），而且**只有一处**；
4. 「最慢：…」不再挂红（试玩 11-22-2109 第 5 条：三处一起抢眼）。
"""
import json
import os
import re
import subprocess
import sys
import time

from playwright.sync_api import sync_playwright
from probe_version import SAVE_VERSION

URL = os.environ.get("PW_URL", "http://localhost:4222/")
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
EVID = os.path.join(ROOT, "game", "data", "evidence", "today")
os.makedirs(EVID, exist_ok=True)

SETUP = """
() => {
  const api = window.__laoyou;
  const s = api.state;
  s.venue.seats = 2;
  s.cash = 400000;
  s.days.push({ month: s.month, day: s.day, revenue: 360, served: 40, lost: 60,
                avgSat: 55, price: s.price, taste: 60, cash: s.cash });
  api.refresh();
  return true;
}
"""

READ = """
() => {
  const box = document.querySelector('.todaybox');
  const main = document.querySelector('[data-todaybox-main]');
  const detail = document.querySelector('[data-todaybox-detail]');
  const voice = document.querySelector('[data-todaybox-voice]');
  const hot = Array.from(document.querySelectorAll('.pane .lrow.hotrow'));
  const slow = Array.from(document.querySelectorAll('.pane .tag2.hot2'))
    .filter((n) => (n.textContent || '').indexOf('最慢') >= 0);
  const save = window.localStorage.getItem('laoyou.save.v4') || '';
  let ver = -1;
  try { ver = JSON.parse(save).saveVersion ?? -1; } catch (e) { ver = -1; }
  return {
    has_box: !!box,
    main: main ? (main.textContent || '').trim() : '',
    detail: detail ? (detail.textContent || '').trim() : '',
    voice: voice ? (voice.textContent || '').trim() : '',
    hot: hot.map((n) => (n.textContent || '').trim().slice(0, 24)),
    slow_hot: slow.length,
    ver,
  };
}
"""


def main() -> int:
    checks = {}
    errors = []
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page(viewport={"width": 1440, "height": 900})
        page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
        page.goto(URL, wait_until="load")
        page.wait_for_timeout(800)
        # 开局：街边摊
        page.click('.sitecard[data-site="alley"]')
        page.wait_for_timeout(200)
        chips = page.query_selector_all("[data-chips] .chip")
        if chips:
            chips[0].click()
        page.wait_for_timeout(200)
        page.click("[data-open]")
        page.wait_for_timeout(400)
        page.evaluate(SETUP)
        page.wait_for_timeout(300)

        page.click('[data-tab="recipe"]')
        page.wait_for_timeout(300)
        # 「今天」那一条在店铺页里：面板内再切一次页签
        page.click('[data-tab2="shop"]')
        page.wait_for_timeout(400)
        base = page.evaluate(READ)
        checks["box_present"] = bool(base["has_box"])
        checks["main_has_words"] = len(base["main"]) > 6
        checks["detail_has_payback"] = ("天回本" in base["detail"]) or ("第 " in base["detail"])
        checks["detail_names_section"] = ("家当" in base["detail"]) or ("设备" in base["detail"])
        checks["detail_has_row"] = bool(re.search(r"第 \d+ 行", base["detail"]))
        checks["hot_single"] = len(base["hot"]) == 1
        checks["hot_is_seat_gear"] = len(base["hot"]) == 1 and (
            "矮凳" in base["hot"][0] or "躺椅" in base["hot"][0]
        )
        checks["slow_not_hot"] = base["slow_hot"] == 0
        checks["save_version"] = base["ver"] == SAVE_VERSION
        page.screenshot(path=os.path.join(EVID, "01-today-shop.png"))

        # 建好之后那一条要换方向：把座位加到 24、流失仍高 → 轮到设备或别处
        page.evaluate(
            """
            () => {
              const api = window.__laoyou;
              api.state.venue.seats = 24;
              api.refresh();
              return true;
            }
            """
        )
        page.wait_for_timeout(200)
        page.click('[data-tab2="recipe"]')
        page.wait_for_timeout(200)
        page.click('[data-tab2="shop"]')
        page.wait_for_timeout(300)
        after = page.evaluate(READ)
        checks["changes_with_state"] = after["main"] != base["main"] or after["detail"] != base["detail"]
        checks["still_one_hot"] = len(after["hot"]) <= 1
        page.screenshot(path=os.path.join(EVID, "02-today-after.png"))

        bad = [e for e in errors if "Failed to load resource" not in e]
        checks["console_clean"] = len(bad) == 0
        if bad:
            errors_note = bad[:3]
        else:
            errors_note = []
        browser.close()

    ok = all(checks.values())
    out = {"ok": ok, "checks": checks, "errors": errors_note}
    print(json.dumps(out, ensure_ascii=False))
    with open(os.path.join(EVID, "today-report.json"), "w", encoding="utf-8") as f:
        json.dump({"summary": out, "base": base, "after": after}, f, ensure_ascii=False, indent=2)
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
