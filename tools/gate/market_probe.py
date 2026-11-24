# -*- coding: utf-8 -*-
"""批 B″ 探针：坏行情配上好事、「借两桶水」治停水、杂货铺十件。

preview: npx vite preview --port 4231   →   PW_URL=http://localhost:4231/
"""
import json
import os

from playwright.sync_api import sync_playwright

URL = os.environ.get("PW_URL", "http://localhost:4231/")
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
EVID = os.path.join(ROOT, "game", "data", "evidence", "market")
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

        # 人情给够，开店铺页
        pg.evaluate(
            """() => {
              const s = window.__laoyou.state;
              s.favor = 60;
              s.cash = 60_000;
              window.__laoyou.refresh();
            }"""
        )
        pg.wait_for_timeout(200)
        pg.evaluate("() => document.querySelector('[data-tab=\"recipe\"]')?.click()")
        pg.wait_for_timeout(300)
        pg.evaluate("() => document.querySelector('[data-tab2=\"shop\"]')?.click()")
        pg.wait_for_timeout(500)

        goods = pg.evaluate(
            """() => {
              const secs = Array.from(document.querySelectorAll('.pane .sec'));
              const sec = secs.find((x) => (x.querySelector('.sechd') || {}).textContent?.includes('杂货铺'));
              const rows = sec ? Array.from(sec.querySelectorAll('.lrow')) : [];
              const bucket = rows.find((r) => r.textContent.includes('借两桶水')) || null;
              return {
                rows: rows.length,
                names: rows.map((r) => (r.querySelector('.lname') || {}).textContent || ''),
                bucket: bucket ? bucket.textContent.trim() : '',
                bucketTitle: bucket ? Array.from(bucket.querySelectorAll('.lmeta')).map((n) => n.getAttribute('title') || '').join(' ') : '',
                favor: window.__laoyou.state.favor,
              };
            }"""
        )
        checks["goods_rows_10"] = goods["rows"] == 10
        checks["bucket_row_present"] = "借两桶水" in (goods["names"] or [])
        checks["bucket_why_mentions_stop"] = "停水" in goods["bucket"]
        checks["bucket_has_source"] = "gxnews" in goods["bucketTitle"]

        # 买水
        pg.evaluate(
            """() => {
              const btn = document.querySelector('[data-act="buygood"][data-id="water_bucket"]');
              if (btn) btn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
            }"""
        )
        pg.wait_for_timeout(500)
        after = pg.evaluate(
            """() => ({ favor: window.__laoyou.state.favor, stamp: (window.__laoyou.state.goods || {}).water_bucket || 0 })"""
        )
        checks["bucket_costs_favor"] = after["favor"] == goods["favor"] - 4
        checks["bucket_dated_today"] = after["stamp"] > 0

        pg.screenshot(path=os.path.join(EVID, "01-market-goods.png"), full_page=False)

        # 找一天「坏事 + 配对」的行情行
        pair_text = ""
        pair_hit = None
        for month in range(12):
            for day in (1, 4, 7, 10, 13, 16, 19, 22, 25, 28):
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
                if t and "（" in t:
                    pair_text = t
                    pair_hit = [month, day]
                    break
            if pair_hit:
                break

        checks["market_line_pair"] = bool(pair_hit)
        checks["pair_words_no_digits"] = bool(pair_text) and not any(ch.isdigit() for ch in pair_text.split("（")[-1])

        pg.screenshot(path=os.path.join(EVID, "02-market-pair.png"), full_page=False)

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
            "pairText": pair_text,
            "pairDay": pair_hit,
            "errors": bad[:8],
        }
        with open(os.path.join(EVID, "market-report.json"), "w", encoding="utf-8") as f:
            json.dump(report, f, ensure_ascii=False, indent=2)

        b.close()

    for k, v in checks.items():
        print(("true " if v else "FALSE") + "  " + k)
    print("---")
    print(json.dumps(checks, ensure_ascii=False))
    return 0 if all(checks.values()) else 1


if __name__ == "__main__":
    raise SystemExit(main())
