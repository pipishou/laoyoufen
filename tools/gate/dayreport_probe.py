# -*- coding: utf-8 -*-
"""批 I′ 探针：打烊单压住 toast、红标与钩子同源、「为什么」改口语。

preview: npx vite preview --port 4224   →   PW_URL=http://localhost:4224/
"""
import json
import os
import re
import sys

from playwright.sync_api import sync_playwright
from probe_version import SAVE_VERSION

URL = os.environ.get("PW_URL", "http://localhost:4224/")
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
EVID = os.path.join(ROOT, "game", "data", "evidence", "dayreport")
os.makedirs(EVID, exist_ok=True)

checks = {}
errors = []


def main() -> int:
    with sync_playwright() as pw:
        b = pw.chromium.launch()
        pg = b.new_page(viewport={"width": 1440, "height": 900})
        pg.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
        pg.on("pageerror", lambda e: errors.append(str(e)))
        pg.goto(URL, wait_until="load")
        pg.wait_for_timeout(700)

        # 开局
        pg.click('.sitecard[data-site="alley"]')
        pg.wait_for_timeout(200)
        pg.click("[data-chips] .chip")
        pg.wait_for_timeout(150)
        pg.click("[data-open]")
        pg.wait_for_timeout(600)
        if pg.query_selector(".gbtn.ghost"):
            pg.click(".gbtn.ghost")
            pg.wait_for_timeout(600)

        # 造一天的高流失打烊单（队列主因）+ 富现金，然后重绘
        pg.evaluate(
            """() => {
              const api = window.__laoyou;
              const s = api.state;
              s.cash = 60_000;
              s.venue.seats = 2;
              s.days.push({
                month: s.month, day: s.day, served: 34, lost: 29, revenue: 306,
                wages: 0, rent: 0, profit: 306, sat: 62, lostQueue: 24, lostPrice: 0, lostWait: 5,
              });
              s.flow.lostToday = 29; s.flow.lostQueue = 24; s.flow.lostPrice = 0; s.flow.lostWait = 5;
              s.dayReport = {
                month: s.month, day: s.day, served: 34, lost: 29, revenue: 306,
                wages: 0, rent: 0, profit: 306, sat: 62, lostQueue: 24, lostPrice: 0, lostWait: 5,
              };
              api.refresh();
            }"""
        )
        pg.wait_for_timeout(400)

        # 1) 打烊单与 toast 的层叠：dayreport 必须压住 #toasts
        pg.evaluate(
            """() => {
              const d = document.querySelector('.modal.dayreport');
              if (d) d.hidden = false;
            }"""
        )
        pg.wait_for_timeout(300)
        zi = pg.evaluate(
            """() => {
              const d = document.querySelector('.modal.dayreport');
              const t = document.querySelector('#toasts');
              const g = (el) => (el ? parseInt(getComputedStyle(el).zIndex || '0', 10) : -1);
              return { day: g(d), toast: g(t) };
            }"""
        )
        checks["dayreport_exists"] = zi["day"] > 0
        checks["dayreport_above_toast"] = zi["day"] > zi["toast"]

        # 2) 打烊单开着时 toast 挪到上方（不再压「明天继续」）
        pos = pg.evaluate(
            """() => {
              const t = document.querySelector('#toasts');
              const cs = getComputedStyle(t);
              return { top: cs.top, bottom: cs.bottom };
            }"""
        )
        checks["toast_moved_up"] = pos["top"] == "16px" and pos["bottom"] != "128px"

        pg.screenshot(path=os.path.join(EVID, "01-dayreport-on-top.png"))

        # 3) 红标与钩子同源：店铺页热行必须就是钩子点名的那一件
        hook = pg.evaluate(
            """() => {
              const m = document.querySelector('[data-hook-main]');
              return m ? m.textContent.trim() : '';
            }"""
        )
        pg.evaluate("() => { const d = document.querySelector('.modal.dayreport'); if (d) d.hidden = true; }")
        pg.evaluate("() => document.querySelector('[data-tab=\"recipe\"]')?.click()")
        pg.wait_for_timeout(500)
        pg.evaluate("() => document.querySelector('[data-tab2=\"shop\"]')?.click()")
        pg.wait_for_timeout(500)
        rows = pg.evaluate(
            """() => Array.from(document.querySelectorAll('.pane .lrow.hotrow')).map((r) => r.textContent.trim())"""
        )
        checks["hook_names_one_thing"] = bool(hook)
        checks["hot_row_exists"] = len(rows) >= 1
        checks["hot_row_matches_hook"] = bool(rows) and any(
            ("塑料矮凳" in hook and "塑料矮凳" in rows[0]) or ("竹躺椅" in hook and "竹躺椅" in rows[0])
            for _ in [0]
        )
        checks["hot_row_single"] = len(rows) == 1

        # 4) 「为什么」的口语：不能再是「一天最多接得住 N 碗」这种系统话
        why = pg.evaluate(
            """() => {
              const el = document.querySelector('[data-loss-line]');
              return el ? el.textContent.trim() : '';
            }"""
        )
        checks["why_has_shape"] = ("张桌" in why) and ("分钟" in why)
        checks["why_is_colloquial"] = any(k in why for k in ("撑死", "顶到边", "手是要停一下", "哪有那么好性子"))
        checks["why_not_system"] = "最多接得住" not in why

        # 5) 存档版本没被这一批带跑
        ver = pg.evaluate(
            """() => { try { return JSON.parse(localStorage.getItem('laoyou.save.v4') || '{}').saveVersion ?? 0; } catch (e) { return -1; } }"""
        )
        checks["save_version"] = ver == SAVE_VERSION

        clean = [e for e in errors if "laoyou-api" not in e and "Failed to load resource" not in e]
        checks["console_clean"] = not clean

        b.close()

    ok = all(checks.values())
    print(json.dumps({"ok": ok, "checks": checks, "hook": hook, "why": why, "rows": len(rows), "errors": errors[:5]}, ensure_ascii=False))
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
