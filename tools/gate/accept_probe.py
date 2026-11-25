# -*- coding: utf-8 -*-
"""批 AG′：设置里「操作一览」点开算翻过（解 P413），与图鉴页手册同一本账。

判据不是「点了有反应」，而是：点完 `state.manual.read` 真的多一条、
设置里那行盖上「翻过」、图鉴页的抬头也跟着数上去 —— 三处同一本账。
"""

import io
import json
import os
import sys

from playwright.sync_api import sync_playwright

URL = os.environ.get("PW_URL", "http://localhost:4244/")
OUT = os.path.join(
    "D:", os.sep, "项目", "REA", "REA", "重构", "老友粉店", "game", "data", "evidence", "accept"
)
os.makedirs(OUT, exist_ok=True)

checks = {}


def note(name, ok, got=None):
    checks[name] = bool(ok)
    flag = "PASS" if ok else "FAIL"
    print(f"{flag} {name:<26} {'' if got is None else got}")


def open_game(pg):
    pg.goto(URL, wait_until="networkidle")
    pg.wait_for_timeout(700)
    pg.evaluate("() => localStorage.clear()")
    pg.reload(wait_until="networkidle")
    pg.wait_for_timeout(700)
    pg.evaluate("() => document.querySelector('.sitecard[data-site=\"alley\"]')?.click()")
    pg.wait_for_timeout(200)
    pg.evaluate("() => document.querySelector('[data-chips] .chip')?.click()")
    pg.wait_for_timeout(200)
    pg.evaluate("() => document.querySelector('[data-open]')?.click()")
    pg.wait_for_timeout(400)
    pg.evaluate("() => document.querySelector('.gbtn.ghost')?.click()")
    pg.wait_for_timeout(600)


with sync_playwright() as pw:
    browser = pw.chromium.launch()
    page = browser.new_page(viewport={"width": 1440, "height": 900})
    errors = []
    page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
    page.on("pageerror", lambda e: errors.append(str(e)))

    open_game(page)

    page.evaluate("() => document.querySelector('[data-prefs]')?.click()")
    page.wait_for_timeout(400)
    rows = page.evaluate(
        """() => [...document.querySelectorAll("[data-pref-help] [data-how]")].map((r) => ({
          id: r.dataset.how, text: (r.textContent || "").trim(),
          cursor: getComputedStyle(r).cursor,
        }))"""
    )
    note("how_rows_four", len(rows) == 4, [r["id"] for r in rows])
    note("how_rows_clickable", all(r["cursor"] == "pointer" for r in rows), [r["cursor"] for r in rows])
    note("how_rows_no_mark_yet", all("翻过" not in r["text"] for r in rows), rows[0]["text"][:40] if rows else "")

    before = page.evaluate("() => (window.__laoyou.state.manual?.read ?? []).length")
    first_id = rows[0]["id"] if rows else ""
    page.evaluate(
        """(id) => document.querySelector(`[data-pref-help] [data-how="${id}"]`)?.click()""",
        first_id,
    )
    page.wait_for_timeout(400)
    after = page.evaluate("() => (window.__laoyou.state.manual?.read ?? []).slice()")
    note("how_click_writes_state", first_id in after and len(after) == before + 1, after)

    marked = page.evaluate(
        """() => {
          const r = document.querySelector("[data-pref-help] [data-how]");
          return r ? (r.textContent || "").trim() : "";
        }"""
    )
    note("how_row_shows_mark", "翻过" in marked, marked[:50])
    page.screenshot(path=os.path.join(OUT, "01-prefs-how.png"))

    page.evaluate("() => document.querySelector('[data-prefs-close]')?.click()")
    page.wait_for_timeout(250)
    page.evaluate("() => document.querySelector('[data-tab=\"recipe\"]')?.click()")
    page.wait_for_timeout(300)
    page.evaluate("() => document.querySelector('[data-tab2=\"collection\"]')?.click()")
    page.wait_for_timeout(600)
    counter = page.evaluate(
        """() => {
          const el = document.querySelector('[data-pane="collection"]') || document.querySelector(".pane");
          const t = el ? (el.textContent || "") : "";
          const i = t.indexOf("翻过");
          return i >= 0 ? t.slice(i, i + 24).trim() : "";
        }"""
    )
    note("manual_counter_counts", "翻过 1 页" in counter, counter)
    page.screenshot(path=os.path.join(OUT, "02-manual-counter.png"))

    save = page.evaluate(
        """() => {
          for (const k of Object.keys(localStorage)) {
            if (!k.startsWith("laoyou.save")) continue;
            try { const v = JSON.parse(localStorage.getItem(k)); if (v.saveVersion) return v.saveVersion; } catch (e) {}
          }
          return null;
        }"""
    )
    note("save_version_37", save == 37, save)

    real = [e for e in errors if "Failed to load resource" not in e and "404" not in e]
    note("console_clean", len(real) == 0, real[:2])

    browser.close()

total = sum(1 for v in checks.values() if v)
print(f"\n{total} / {len(checks)} true")
io.open(os.path.join(OUT, "accept-report.json"), "w", encoding="utf-8").write(
    json.dumps(checks, ensure_ascii=False, indent=1)
)
sys.exit(0 if total == len(checks) else 1)
