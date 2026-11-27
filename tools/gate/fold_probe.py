# -*- coding: utf-8 -*-
"""批 AH′ 探针：打烊单折行（P406 / P411 / P412）。

拆自批 AD′ 的 `fold_probe.py`（解 P416：一个探针管两件事）——手册那半搬去
`tools/gate/manualread_probe.py`。

用法（先起 preview）：
    cd game && npx vite preview --port 4244 --strictPort
    PW_URL=http://localhost:4244/ python -X utf8 tools/gate/fold_probe.py
"""
import json
import os
import sys

from playwright.sync_api import sync_playwright
from probe_version import SAVE_VERSION

URL = os.environ.get("PW_URL", "http://localhost:4244/")
OUT = os.path.join("game", "data", "evidence", "fold")
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


DAY_JS = """() => {
  const s = window.__laoyou.state;
  s.flow.actToday = "a_suan";
  s.dayReport = {
    month: 3, day: 12, revenue: 320, served: 30, lost: 11,
    avgSat: 61, price: 12, cash: 1800, taste: 58,
    lostQueue: 9, lostPrice: 1, lostWait: 1,
    investDone: ["夜市摆摊"], investGain: ["进店多 18%"],
    thick: 4,
  };
  window.__laoyou.refresh();
}"""

COUNT_JS = """() => {
  const el = document.querySelector("[data-why-fold]");
  const spans = [...document.querySelectorAll(".daywhy span:not([data-why-fold])")];
  const shown = spans.filter((x) => !x.hidden && (x.textContent || "").trim() !== "").length;
  const total = spans.filter((x) => (x.textContent || "").trim() !== "").length;
  return { text: el ? (el.textContent || "").trim() : "", shown, total };
}"""


def main():
    with sync_playwright() as pw:
        browser = pw.chromium.launch()
        pg = browser.new_page(viewport={"width": 375, "height": 667})
        errors = []
        pg.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
        open_game(pg)

        # 打烊单：塞一份四件事都有的日结（功课 / 为什么 / 到点 / 挂汤）
        pg.evaluate(DAY_JS)
        pg.wait_for_timeout(400)

        fold = pg.evaluate(COUNT_JS)
        note("fold_total_over_three", fold["total"] > 3, fold)
        note("fold_hides_extra", fold["shown"] == 3, fold["shown"])
        note("fold_says_more", "还有" in fold["text"] and "条" in fold["text"], fold["text"])

        pg.evaluate("() => document.querySelector('[data-why-fold]')?.click()")
        pg.wait_for_timeout(200)
        opened = pg.evaluate(COUNT_JS)
        note("fold_click_shows_all", opened["shown"] == fold["total"], opened)
        note("fold_says_collapse", "收起" in opened["text"], opened["text"])
        pg.screenshot(path=os.path.join(OUT, "01-fold-open.png"))

        # 批 AH′（解 P412）：这个「点开」要记住 —— 存在设置里（不进存档），重开还是点开的
        saved = pg.evaluate(
            """() => {
              const raw = localStorage.getItem("laoyou.prefs.v1");
              try { return JSON.parse(raw || "{}").whyOpen === true; } catch { return false; }
            }"""
        )
        note("fold_open_saved_in_prefs", saved is True, saved)

        pg.reload(wait_until="networkidle")
        pg.wait_for_timeout(900)
        pg.evaluate("() => document.querySelector('.gbtn.ghost')?.click()")
        pg.wait_for_timeout(400)
        pg.evaluate(DAY_JS)
        pg.wait_for_timeout(400)
        remembered = pg.evaluate(COUNT_JS)
        note(
            "fold_state_remembered",
            remembered["shown"] == remembered["total"] and "收起" in remembered["text"],
            remembered,
        )

        # 380 以下的屏再窄一档：只留两条（批 AE′，解 P411）—— 先收回去
        pg.evaluate("() => document.querySelector('[data-why-fold]')?.click()")
        pg.wait_for_timeout(150)
        pg.set_viewport_size({"width": 340, "height": 640})
        pg.wait_for_timeout(200)
        pg.evaluate("() => window.__laoyou.refresh()")
        pg.wait_for_timeout(300)
        narrow = pg.evaluate(
            """() => {
              const spans = [...document.querySelectorAll(".daywhy span:not([data-why-fold])")];
              return spans.filter((x) => !x.hidden && (x.textContent || "").trim() !== "").length;
            }"""
        )
        note("fold_narrow_keeps_two", narrow == 2, narrow)
        pg.screenshot(path=os.path.join(OUT, "02-fold-narrow.png"))

        ver = pg.evaluate("() => window.__laoyou.state.saveVersion")
        note("save_version", ver == SAVE_VERSION, ver)

        bad = [e for e in errors if "Failed to load resource" not in e and "laoyou-api" not in e]
        note("console_clean", len(bad) == 0, bad[:2])

        browser.close()

    with open(os.path.join(OUT, "fold-report.json"), "w", encoding="utf-8") as fh:
        json.dump({"url": URL, "checks": checks}, fh, ensure_ascii=False, indent=2)

    passed = sum(1 for c in checks.values() if c["ok"])
    for k, v in checks.items():
        print(("  OK  " if v["ok"] else "  --  ") + k + ("  " + v["detail"] if not v["ok"] else ""))
    print("%d / %d true" % (passed, len(checks)))
    return 0 if passed == len(checks) else 1


if __name__ == "__main__":
    sys.exit(main())
