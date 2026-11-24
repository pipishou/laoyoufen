# -*- coding: utf-8 -*-
"""批 Q′ 探针：明天的行情预告、手艺页「先点这个」、打烊单「到点」一行。

preview: npx vite preview --port 4233   →   PW_URL=http://localhost:4233/
"""
import json
import os

from playwright.sync_api import sync_playwright

URL = os.environ.get("PW_URL", "http://localhost:4233/")
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
EVID = os.path.join(ROOT, "game", "data", "evidence", "hint")
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

        pg.click('.sitecard[data-site="alley"]')
        pg.wait_for_timeout(200)
        pg.click("[data-chips] .chip")
        pg.wait_for_timeout(150)
        pg.click("[data-open]")
        pg.wait_for_timeout(600)
        if pg.query_selector(".gbtn.ghost"):
            pg.click(".gbtn.ghost")
            pg.wait_for_timeout(600)

        pg.evaluate(
            """() => {
              const s = window.__laoyou.state;
              s.cash = 60_000;
              s.favor = 40;
              window.__laoyou.refresh();
            }"""
        )
        pg.wait_for_timeout(200)

        # ── 1/2 明天的行情预告 ──────────────────────────────
        tomorrow = ""
        tomorrow_day = None
        for month in range(12):
            for day in range(1, 31):
                t = pg.evaluate(
                    """([m, d]) => {
                      const api = window.__laoyou;
                      api.state.month = m;
                      api.state.day = d;
                      api.refresh();
                      const el = document.querySelector('[data-market]');
                      return el ? el.textContent.trim() : '';
                    }""",
                    [month, day],
                )
                if t and "明天：" in t:
                    tomorrow = t
                    tomorrow_day = [month, day]
                    break
            if tomorrow_day:
                break

        checks["tomorrow_present"] = bool(tomorrow_day)
        tail = tomorrow.split("明天：")[-1] if tomorrow else ""
        checks["tomorrow_no_digits"] = bool(tail) and not any(c.isdigit() for c in tail) and "¥" not in tail

        # 明天是坏事的那几条，必须把「配了谁」说出来
        BAD = ("停水", "气价上调", "修路围挡")
        bad_tomorrow = ""
        for month in range(12):
            for day in range(1, 31):
                t = pg.evaluate(
                    """([m, d]) => {
                      const api = window.__laoyou;
                      api.state.month = m;
                      api.state.day = d;
                      api.refresh();
                      const el = document.querySelector('[data-market]');
                      return el ? el.textContent.trim() : '';
                    }""",
                    [month, day],
                )
                if "明天：" in t and any(b in t.split("明天：")[-1] for b in BAD):
                    bad_tomorrow = t
                    break
            if bad_tomorrow:
                break
        checks["tomorrow_says_pairs"] = ("（配" in bad_tomorrow) if bad_tomorrow else False

        pg.screenshot(path=os.path.join(EVID, "01-hint-market.png"), full_page=False)

        # ── 3 手艺页每族一枚「先点这个」 ─────────────────────
        pg.evaluate("() => document.querySelector('[data-tab=\"recipe\"]')?.click()")
        pg.wait_for_timeout(300)
        pg.evaluate("() => document.querySelector('[data-tab2=\"perk\"]')?.click()")
        pg.wait_for_timeout(500)

        perk = pg.evaluate(
            """() => {
              const recs = Array.from(document.querySelectorAll('.pane .pc[data-rec="1"]'));
              return {
                count: recs.length,
                titles: recs.map((b) => b.getAttribute('title') || ''),
                names: recs.map((b) => b.textContent.trim()),
              };
            }"""
        )
        checks["rec_one_per_family"] = perk["count"] == 4
        checks["rec_title_says_first"] = all("先点这个" in t for t in perk["titles"]) and perk["count"] > 0

        pg.screenshot(path=os.path.join(EVID, "02-hint-perk.png"), full_page=False)

        # ── 4 打烊单的「到点」一行 ────────────────────────────
        invested = pg.evaluate(
            """() => {
              const api = window.__laoyou;
              const s = api.state;
              s.dayReport = Object.assign({}, s.dayReport || {}, {
                month: s.month, day: s.day, served: 36, lost: 9,
                revenue: 360, cost: 200, sat: 62,
                investDone: ['跟料商多留一筐'],
              });
              api.refresh();
              const el = document.querySelector('[data-invest-line]');
              return el ? el.textContent.trim() : '';
            }"""
        )
        checks["invest_line_present"] = "走完了" in invested and "跟料商多留一筐" in invested
        checks["invest_line_prefix_css"] = invested != ""

        pg.screenshot(path=os.path.join(EVID, "03-hint-dayreport.png"), full_page=False)

        checks["save_version"] = pg.evaluate("() => window.__laoyou.state.saveVersion") == 37

        bad = [
            e
            for e in errors
            if "Failed to load resource" not in e and "laoyou-api" not in e and "404" not in e
        ]
        checks["console_clean"] = len(bad) == 0

        report = {
            "url": URL,
            "checks": checks,
            "tomorrow": tomorrow,
        "badTomorrow": bad_tomorrow,
            "tomorrowDay": tomorrow_day,
            "rec": perk,
            "investLine": invested,
            "errors": bad[:8],
        }
        with open(os.path.join(EVID, "hint-report.json"), "w", encoding="utf-8") as f:
            json.dump(report, f, ensure_ascii=False, indent=2)

        b.close()

    for k, v in checks.items():
        print(("true " if v else "FALSE") + "  " + k)
    print("---")
    print(json.dumps(checks, ensure_ascii=False))
    return 0 if all(checks.values()) else 1


if __name__ == "__main__":
    raise SystemExit(main())
