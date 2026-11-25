# -*- coding: utf-8 -*-
"""批 AH′ 探针：手册读过标记（P387 / P413 / P414）。

从批 AD′ 的 `fold_probe.py` 里拆出来的一半（解 P416：一个探针只该管一件事）。

用法（先起 preview）：
    cd game && npx vite preview --port 4244 --strictPort
    PW_URL=http://localhost:4244/ python -X utf8 tools/gate/manualread_probe.py
"""
import json
import os
import sys

from playwright.sync_api import sync_playwright

URL = os.environ.get("PW_URL", "http://localhost:4244/")
OUT = os.path.join("game", "data", "evidence", "manualread")
os.makedirs(OUT, exist_ok=True)

checks = {}


def note(name, ok, detail=""):
    checks[name] = {"ok": bool(ok), "detail": str(detail)[:140]}


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


def main():
    with sync_playwright() as pw:
        browser = pw.chromium.launch()
        pg = browser.new_page(viewport={"width": 375, "height": 667})
        errors = []
        pg.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
        open_game(pg)

        # 图鉴页 → 手册
        pg.evaluate("() => document.querySelector('[data-tab=\"recipe\"]')?.click()")
        pg.wait_for_timeout(400)
        pg.evaluate("() => document.querySelector('[data-tab2=\"collection\"]')?.click()")
        pg.wait_for_timeout(400)

        base = pg.evaluate(
            """() => {
              const cnt = document.querySelector("[data-manualread]");
              const pages = [...document.querySelectorAll(".mpage")];
              return {
                counter: cnt ? (cnt.textContent || "").trim() : "",
                pages: pages.length,
                unread: pages.filter((p) => p.getAttribute("data-read") !== "1").length,
              };
            }"""
        )
        note("manual_pages_sixteen", base["pages"] == 16, base)
        note("manual_counter_zero", "还没翻过" in base["counter"], base["counter"])
        note("manual_none_read", base["unread"] == 16, base["unread"])

        pg.evaluate(
            """() => {
              const d = document.querySelector(".mpage");
              if (d) { d.open = true; d.dispatchEvent(new Event("toggle", { bubbles: true })); }
            }"""
        )
        pg.wait_for_timeout(500)

        after = pg.evaluate(
            """() => {
              const cnt = document.querySelector("[data-manualread]");
              const first = document.querySelector(".mpage");
              return {
                counter: cnt ? (cnt.textContent || "").trim() : "",
                read: first ? first.getAttribute("data-read") : "",
                tag: first ? !!first.querySelector(".mread") : false,
                saved: (window.__laoyou.state.manual?.read ?? []).length,
              };
            }"""
        )
        note("manual_open_marks_read", after["read"] == "1" and after["tag"], after)
        note("manual_counter_counts", "翻过 1 页" in after["counter"], after["counter"])
        note("manual_saved_in_state", after["saved"] == 1, after["saved"])
        pg.screenshot(path=os.path.join(OUT, "01-manual-read.png"))

        # 批 AG′（解 P413）：设置里那四条「怎么操作」也算翻过
        pg.evaluate("() => document.querySelector('[data-prefs]')?.click()")
        pg.wait_for_timeout(400)
        pre = pg.evaluate(
            """() => {
              const rows = [...document.querySelectorAll("[data-how]")];
              return {
                rows: rows.length,
                marked: rows.filter((r) => !!r.querySelector(".mread")).length,
                firstId: rows.length ? rows[0].getAttribute("data-how") : "",
              };
            }"""
        )
        note("how_rows_four", pre["rows"] == 4, pre)
        note("how_rows_unmarked_here", pre["marked"] <= 1, pre)

        pg.evaluate("() => document.querySelector('[data-how]')?.click()")
        pg.wait_for_timeout(500)
        how = pg.evaluate(
            """() => {
              const rows = [...document.querySelectorAll("[data-how]")];
              return {
                marked: rows.filter((r) => !!r.querySelector(".mread")).length,
                saved: (window.__laoyou.state.manual?.read ?? []).length,
                counter: (document.querySelector("[data-manualread]")?.textContent || "").trim(),
              };
            }"""
        )
        note("how_click_marks_read", how["marked"] >= 1 and how["saved"] >= 2, how)
        note("how_counts_in_total", "翻过 2 页" in how["counter"], how["counter"])
        pg.screenshot(path=os.path.join(OUT, "02-how-read.png"))
        pg.evaluate("() => document.querySelector('[data-prefs-close]')?.click()")
        pg.wait_for_timeout(300)

        ver = pg.evaluate("() => window.__laoyou.state.saveVersion")
        note("save_version", ver == 37, ver)

        bad = [e for e in errors if "Failed to load resource" not in e and "laoyou-api" not in e]
        note("console_clean", len(bad) == 0, bad[:2])

        browser.close()

    with open(os.path.join(OUT, "manualread-report.json"), "w", encoding="utf-8") as fh:
        json.dump({"url": URL, "checks": checks}, fh, ensure_ascii=False, indent=2)

    passed = sum(1 for c in checks.values() if c["ok"])
    for k, v in checks.items():
        print(("  OK  " if v["ok"] else "  --  ") + k + ("  " + v["detail"] if not v["ok"] else ""))
    print("%d / %d true" % (passed, len(checks)))
    return 0 if passed == len(checks) else 1


if __name__ == "__main__":
    sys.exit(main())
