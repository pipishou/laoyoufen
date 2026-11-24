# -*- coding: utf-8 -*-
"""批 C″ 探针：压迫型事件的记号与前一个月不出场。

跑法（仓库根 D:\\项目\\REA\\REA\\重构\\老友粉店）：
  cd game; npx vite preview --port 4232
  $env:PW_URL="http://localhost:4232/"; python -X utf8 tools\\gate\\grace_probe.py
"""

import json
import os
import sys
import time

from playwright.sync_api import sync_playwright

URL = os.environ.get("PW_URL", "http://localhost:4232/")
OUT = os.path.join("game", "data", "evidence", "grace")
BENIGN = ("Failed to load resource", "404", "net::ERR")

CHECKS: dict[str, bool] = {}
NOTES: dict[str, str] = {}


def note(key: str, ok: bool, text: str = "") -> None:
    CHECKS[key] = bool(ok)
    if text:
        NOTES[key] = text


def main() -> int:
    os.makedirs(OUT, exist_ok=True)
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page(viewport={"width": 1440, "height": 900})
        errors: list[str] = []
        page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
        page.goto(URL, wait_until="load")
        page.wait_for_timeout(700)

        # 开局：街边摊 → 配方 → 开门
        page.click('.sitecard[data-site="alley"]')
        page.wait_for_timeout(250)
        page.click("[data-chips] .chip")
        page.wait_for_timeout(250)
        page.click("[data-open]")
        page.wait_for_timeout(400)
        btn = page.query_selector(".gbtn.ghost")
        if btn:
            btn.click()
            page.wait_for_timeout(600)

        ver = page.evaluate(
            """() => {
              for (const key of Object.keys(localStorage)) {
                if (!key.startsWith('laoyou.save')) continue;
                try {
                  const raw = JSON.parse(localStorage.getItem(key));
                  if (raw && typeof raw.saveVersion === 'number') return raw.saveVersion;
                } catch (e) { /* 忽略 */ }
              }
              return null;
            }"""
        )
        note("save_version", ver == 37, str(ver))

        # ① 压迫型：标题带记号
        page.evaluate(
            """() => {
              const s = window.__laoyou.state;
              s.events.pending = { id: 'rival_shop', absDay: 4 };
              window.__laoyou.refresh();
            }"""
        )
        page.wait_for_timeout(350)
        title = page.query_selector("[data-evt-title]")
        marked = page.evaluate(
            "() => !!document.querySelector('[data-evt-title].pressure')"
        )
        text = (title.inner_text() if title else "").strip()
        note("pressure_marked", marked, text)
        note("pressure_title_text", bool(text), text)

        # ② 普通型：不带记号
        page.evaluate(
            """() => {
              const s = window.__laoyou.state;
              s.events.pending = { id: 'sour_days', absDay: 5 };
              window.__laoyou.refresh();
            }"""
        )
        page.wait_for_timeout(350)
        note(
            "plain_unmarked",
            page.evaluate("() => !document.querySelector('[data-evt-title].pressure')"),
        )

        # ③ 记号是跟着事件切换清的，不是一上就留着
        page.evaluate(
            """() => {
              const s = window.__laoyou.state;
              s.events.pending = { id: 'rival_shop', absDay: 6 };
              window.__laoyou.refresh();
            }"""
        )
        page.wait_for_timeout(300)
        again = page.evaluate("() => !!document.querySelector('[data-evt-title].pressure')")
        note("mark_follows_event", again)

        # ④ 新局没有「上一次压迫型」的记录
        page.evaluate(
            """() => {
              const s = window.__laoyou.state;
              s.events.pending = null;
              window.__laoyou.refresh();
            }"""
        )
        page.wait_for_timeout(250)
        note(
            "no_pressure_yet",
            page.evaluate("() => typeof window.__laoyou.state.events.lastPressureDay !== 'number'"),
        )

        page.screenshot(path=os.path.join(OUT, "01-grace-pressure.png"))

        real = [e for e in errors if not any(b in e for b in BENIGN)]
        note("console_clean", len(real) == 0, " | ".join(real[:3]))
        browser.close()

    report = {"url": URL, "at": time.strftime("%Y-%m-%d %H:%M:%S"), "checks": CHECKS, "notes": NOTES}
    with open(os.path.join(OUT, "grace-report.json"), "w", encoding="utf-8") as f:
        json.dump(report, f, ensure_ascii=False, indent=2)

    bad = [k for k, v in CHECKS.items() if not v]
    for k, v in CHECKS.items():
        print(("PASS " if v else "FAIL ") + k + ("  " + NOTES[k] if k in NOTES else ""))
    print("---")
    print("all true" if not bad else "false: " + ", ".join(bad))
    return 0 if not bad else 1


if __name__ == "__main__":
    sys.exit(main())
