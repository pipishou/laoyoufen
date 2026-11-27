# -*- coding: utf-8 -*-
"""批 U′ 探针：前三十天十二幕 —— 打烊单上那行「功课」。

preview: npx vite preview --port 4236   →   PW_URL=http://localhost:4236/
"""
import json
import os
import sys

from playwright.sync_api import sync_playwright
from probe_version import SAVE_VERSION

URL = os.environ.get("PW_URL", "http://localhost:4236/")
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
EVID = os.path.join(ROOT, "game", "data", "evidence", "script")
os.makedirs(EVID, exist_ok=True)

checks = {}
errors = []

REPORT = """() => {
  const api = window.__laoyou;
  const s = api.state;
  s.cash = 60_000;
  s.players ??= {};
  s.month = 0;
  s.day = 1;
  s.flow.servedToday = 22;
  s.flow.lostToday = 6;
  s.flow.lostQueue = 4;
  s.flow.lostPrice = 0;
  s.flow.lostWait = 2;
  s.flow.actToday = "a_open";
  s.dayReport = {
    month: 0, day: 1, revenue: 220, served: 22, lost: 6, avgSat: 61,
    price: 10, taste: 62, cash: 60_220,
    lostQueue: 4, lostPrice: 0, lostWait: 2,
    menuSold: { "1": 20, "2": 3 },
    act: "a_open",
  };
  api.refresh();
}"""


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

        pg.evaluate(REPORT)
        pg.wait_for_timeout(400)
        pg.evaluate(
            """() => {
              const d = document.querySelector('.modal.dayreport');
              if (d) d.hidden = false;
            }"""
        )
        pg.wait_for_timeout(300)

        line = pg.evaluate(
            """() => {
              const el = document.querySelector('[data-act-line]');
              if (!el) return null;
              const cs = getComputedStyle(el, '::before');
              return { text: el.textContent || '', before: cs.content };
            }"""
        )
        checks["act_line_present"] = line is not None
        checks["act_says_title"] = bool(line and "先把锅烧热" in line["text"])
        checks["act_says_body"] = bool(line and "锅烧到冒青烟" in line["text"])
        checks["act_prefix_css"] = bool(line and "功课" in (line["before"] or ""))

        pg.screenshot(path=os.path.join(EVID, "01-script-dayreport.png"), full_page=False)

        # 换一幕：打烊单那行跟着换，不是写死的
        pg.evaluate(
            """() => {
              const api = window.__laoyou;
              const s = api.state;
              s.flow.actToday = "a_rival";
              s.dayReport.act = "a_rival";
              api.refresh();
            }"""
        )
        pg.wait_for_timeout(300)
        line2 = pg.evaluate(
            "() => (document.querySelector('[data-act-line]') || {}).textContent || ''"
        )
        checks["act_follows_day"] = "别家也在做" in line2 and "先把锅烧热" not in line2

        # 没有那一幕的日子：整行不占地方
        pg.evaluate(
            """() => {
              const api = window.__laoyou;
              const s = api.state;
              s.flow.actToday = "";
              s.dayReport.act = undefined;
              api.refresh();
            }"""
        )
        pg.wait_for_timeout(300)
        empty = pg.evaluate(
            """() => {
              const el = document.querySelector('[data-act-line]');
              if (!el) return { text: 'MISSING', shown: true };
              const cs = getComputedStyle(el);
              return { text: el.textContent || '', shown: cs.display !== 'none' };
            }"""
        )
        checks["act_empty_when_none"] = empty["text"] == ""
        checks["act_empty_hidden"] = empty["shown"] is False

        # 存档版本：十二幕只挂在可选字段上，不该改版本号
        ver = pg.evaluate(
            """() => {
              for (let i = 0; i < localStorage.length; i++) {
                const k = localStorage.key(i);
                if (!k || !k.startsWith('laoyou.save')) continue;
                try {
                  const v = JSON.parse(localStorage.getItem(k) || '{}');
                  if (v && v.saveVersion) return v.saveVersion;
                } catch (e) { /* 跳过坏档 */ }
              }
              return null;
            }"""
        )
        checks["save_version"] = ver == SAVE_VERSION or ver is None

        real = [
            e
            for e in errors
            if "Failed to load resource" not in e and "404" not in e and "400" not in e
        ]
        checks["console_clean"] = len(real) == 0
        if real:
            print("console errors:", real[:3])

        b.close()

    ok = all(checks.values())
    with open(os.path.join(EVID, "script-report.json"), "w", encoding="utf-8") as f:
        json.dump({"ok": ok, "checks": checks, "release": sys.version}, f, ensure_ascii=False, indent=2)
    for k, v in checks.items():
        print(("PASS " if v else "FAIL ") + k)
    print("ok:", ok)
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
