# -*- coding: utf-8 -*-
"""批 T′ 探针：店铺四档成长 + 96 格铺面面积。

preview: npx vite preview --port 4235   →   PW_URL=http://localhost:4235/
"""
import json
import os

from playwright.sync_api import sync_playwright
from probe_version import SAVE_VERSION

URL = os.environ.get("PW_URL", "http://localhost:4235/")
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
EVID = os.path.join(ROOT, "game", "data", "evidence", "store")
os.makedirs(EVID, exist_ok=True)

checks = {}
errors = []

READ = """() => {
  const secs = Array.from(document.querySelectorAll('.pane .sec'));
  const sec = secs.find((x) => !!x.querySelector('.g96'));
  const floorEl = sec ? sec.querySelector('[data-floor]') : null;
  const cells = sec ? Array.from(sec.querySelectorAll('.g96 .gc')) : [];
  const bare = cells.filter(
    (c) => c.getAttribute('data-bare') === '1' || c.getAttribute('data-out') === '1',
  );
  const bareTitle = bare[0] ? bare[0].getAttribute('title') || '' : '';
  const expRows = document.querySelectorAll('.pane .lrow.expdone');
  const allExp = Array.from(document.querySelectorAll('.pane .lrow')).filter((r) =>
    /座位 \\+\\d+/.test(r.textContent || ''),
  );
  return {
    floorText: floorEl ? floorEl.textContent.trim() : '',
    cells: cells.length,
    bare: bare.length,
    bareTitle: bareTitle,
    expDone: expRows.length,
    expRows: allExp.length,
    seats: window.__laoyou.state.venue.seats,
    expansion: window.__laoyou.state.venue.expansion,
    ver: window.__laoyou.state.saveVersion,
  };
}"""


def open_shop(pg):
    pg.evaluate("() => document.querySelector('[data-tab=\"recipe\"]')?.click()")
    pg.wait_for_timeout(250)
    pg.evaluate("() => document.querySelector('[data-tab2=\"shop\"]')?.click()")
    pg.wait_for_timeout(450)


def main() -> int:
    with sync_playwright() as pw:
        b = pw.chromium.launch()
        pg = b.new_page(viewport={"width": 1440, "height": 900})
        pg.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
        pg.on("pageerror", lambda e: errors.append(str(e)))
        pg.goto(URL, wait_until="load")
        pg.wait_for_timeout(700)

        pg.click('.sitecard[data-site="alley"]')
        pg.wait_for_timeout(200)
        pg.click("[data-chips] .chip")
        pg.wait_for_timeout(150)
        pg.click("[data-open]")
        pg.wait_for_timeout(600)
        if pg.query_selector(".gbtn.ghost"):
            pg.click(".gbtn.ghost")
            pg.wait_for_timeout(600)

        pg.evaluate("() => { window.__laoyou.state.cash = 400_000; window.__laoyou.state.gradeLevel = 9; }")
        open_shop(pg)

        l0 = pg.evaluate(READ)
        checks["floor_label"] = "铺开了" in l0["floorText"] and "格" in l0["floorText"]
        checks["floor_starts_48"] = "48 / 48" in l0["floorText"]
        checks["grid_96"] = l0["cells"] == 96
        checks["bare_48"] = l0["bare"] == 96 - 48
        checks["bare_title_names_next"] = "还没铺开" in l0["bareTitle"] and "打通隔墙" in l0["bareTitle"]
        checks["no_exp_done_yet"] = l0["expDone"] == 0
        checks["ladder_lists_four"] = l0["expRows"] >= 4
        pg.screenshot(path=os.path.join(EVID, "01-store-level-0.png"))

        # 一级一级买过去，读铺面格数
        ladder = []
        for step in range(1, 5):
            pg.evaluate(
                """() => {
                  const s = window.__laoyou.state;
                  s.cash = 400_000;
                  s.gradeLevel = 9;
                  window.__laoyou.refresh();
                }"""
            )
            pg.wait_for_timeout(150)
            open_shop(pg)
            pg.evaluate(
                """() => {
                  const btn = document.querySelector('[data-act="buildexpand"]');
                  if (btn) btn.click();
                }"""
            )
            pg.wait_for_timeout(400)
            open_shop(pg)
            got = pg.evaluate(READ)
            ladder.append(
                {
                    "step": step,
                    "text": got["floorText"],
                    "bare": got["bare"],
                    "expDone": got["expDone"],
                    "expansion": got["expansion"],
                    "seats": got["seats"],
                }
            )
        print(json.dumps(ladder, ensure_ascii=False, indent=2))

        import re

        nums = []
        totals = []
        for row in ladder:
            m = re.search(r"铺开了 (\d+) / (\d+)", row["text"])
            nums.append(int(m.group(1)) if m else -1)
            totals.append(int(m.group(2)) if m else -1)
        checks["ladder_grows"] = all(totals[i] > totals[i - 1] for i in range(1, len(totals))) and totals[0] == 60
        checks["ladder_total_120"] = totals[-1] == 120
        checks["ladder_visible_caps_at_96"] = nums[-1] == 96
        checks["upstairs_named"] = "楼上" in ladder[-1]["text"]
        checks["bare_shrinks"] = ladder[-1]["bare"] == 0
        checks["expanded_rows_marked"] = ladder[-1]["expDone"] == 4
        checks["seats_grew_by_expansion"] = ladder[-1]["seats"] > ladder[0]["seats"]
        checks["save_version"] = l0["ver"] == SAVE_VERSION
        pg.screenshot(path=os.path.join(EVID, "02-store-level-4.png"))

        bad = [
            e
            for e in errors
            if "Failed to load resource" not in e and "laoyou-api" not in e and "404" not in e
        ]
        checks["console_clean"] = len(bad) == 0

        report = {"url": URL, "checks": checks, "ladder": ladder, "errors": bad[:8]}
        with open(os.path.join(EVID, "store-report.json"), "w", encoding="utf-8") as f:
            json.dump(report, f, ensure_ascii=False, indent=2)

        b.close()

    for k, v in checks.items():
        print(("true " if v else "FALSE") + "  " + k)
    print("---")
    print(json.dumps(checks, ensure_ascii=False))
    return 0 if all(checks.values()) else 1


if __name__ == "__main__":
    raise SystemExit(main())
