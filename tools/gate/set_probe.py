# -*- coding: utf-8 -*-
"""批 P′ 探针：成套凑齐之后不再白送座位，改给耐心，并挂一个金色勾。

preview: npx vite preview --port 4230   →   PW_URL=http://localhost:4230/
"""
import json
import os

from playwright.sync_api import sync_playwright

URL = os.environ.get("PW_URL", "http://localhost:4230/")
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
EVID = os.path.join(ROOT, "game", "data", "evidence", "set")
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

        # 六张桌（凑齐 room_done），然后开店铺页
        pg.evaluate(
            """() => {
              const api = window.__laoyou;
              const s = api.state;
              s.cash = 60_000;
              s.venue.seats = 6;
              s.venue.stoves = 2;
              s.flow.slotsAnnounced = [];
              api.refresh();
            }"""
        )
        pg.wait_for_timeout(300)
        pg.evaluate("() => document.querySelector('[data-tab=\"recipe\"]')?.click()")
        pg.wait_for_timeout(300)
        pg.evaluate("() => document.querySelector('[data-tab2=\"shop\"]')?.click()")
        pg.wait_for_timeout(500)

        base = pg.evaluate(
            """() => {
              const secs = Array.from(document.querySelectorAll('.pane .sec'));
              const sec = secs.find((x) => !!x.querySelector('.g96'));
              const rows = sec ? Array.from(sec.querySelectorAll('.lrow')) : [];
              const done = rows.filter((r) => r.classList.contains('setdone'));
              const first = done[0] || null;
              const name = first ? first.querySelector('.lname') : null;
              const before = name ? getComputedStyle(name, '::before').content : '';
              const hint = sec ? (sec.querySelectorAll('.sechint')[1] || {}).textContent || '' : '';
              return {
                rows: rows.length,
                doneRows: done.length,
                doneText: first ? first.textContent.trim() : '',
                before: before,
                hint: hint,
                seats: window.__laoyou.state.venue.seats,
                ver: window.__laoyou.state.saveVersion,
              };
            }"""
        )

        checks["setdone_row"] = base["doneRows"] == 1
        checks["setdone_check_mark"] = "✔" in (base["before"] or "")
        checks["set_says_patience"] = "耐心" in base["doneText"]
        checks["set_no_seat_gift"] = "座位" not in base["doneText"]
        checks["hint_says_buy_stool"] = "另买凳子" in base["hint"]
        checks["seats_unchanged"] = base["seats"] == 6
        checks["save_version"] = base["ver"] == 37

        pg.screenshot(path=os.path.join(EVID, "01-set-done.png"), full_page=False)

        # 关掉两张桌：勾就没了（贪不得）
        pg.evaluate(
            """() => {
              const s = window.__laoyou.state;
              s.venue.seats = 5;
              window.__laoyou.refresh();
            }"""
        )
        pg.wait_for_timeout(200)
        pg.evaluate("() => document.querySelector('[data-tab2=\"shop\"]')?.click()")
        pg.wait_for_timeout(400)
        after = pg.evaluate(
            """() => {
              const secs = Array.from(document.querySelectorAll('.pane .sec'));
              const sec = secs.find((x) => !!x.querySelector('.g96'));
              const rows = sec ? Array.from(sec.querySelectorAll('.lrow')) : [];
              return { doneRows: rows.filter((r) => r.classList.contains('setdone')).length };
            }"""
        )
        checks["mark_follows_tables"] = after["doneRows"] == 0

        pg.screenshot(path=os.path.join(EVID, "02-set-done-off.png"), full_page=False)

        bad = [
            e
            for e in errors
            if "Failed to load resource" not in e and "laoyou-api" not in e and "404" not in e
        ]
        checks["console_clean"] = len(bad) == 0

        report = {"url": URL, "checks": checks, "errors": bad[:8]}
        with open(os.path.join(EVID, "set-report.json"), "w", encoding="utf-8") as f:
            json.dump(report, f, ensure_ascii=False, indent=2)

        b.close()

    for k, v in checks.items():
        print(("true " if v else "FALSE") + "  " + k)
    print("---")
    print(json.dumps(checks, ensure_ascii=False))
    return 0 if all(checks.values()) else 1


if __name__ == "__main__":
    raise SystemExit(main())
