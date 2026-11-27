#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""批 D′ 探针：「今天卡在座位」这行字 + 买一张 ¥150 的矮凳真的多一位。

跑法（在项目根）：
    $env:PW_URL="http://localhost:4220/"; python tools/gate/seat_probe.py
"""
import json
import os
import sys

from playwright.sync_api import sync_playwright
from probe_version import SAVE_VERSION

URL = os.environ.get("PW_URL", "http://localhost:4220/")
OUT = os.path.join("game", "data", "evidence", "seat")
CHECKS = {}

READ = """
() => {
  const api = window.__laoyou;
  const st = api.state;
  const tight = document.querySelector('[data-tight]');
  const hook = document.querySelector('[data-hook-main]');
  const loss = document.querySelector('[data-loss-line]');
  return {
    tight: tight ? tight.textContent.trim() : "",
    hook: hook ? hook.textContent.trim() : "",
    loss: loss ? loss.textContent.trim() : "",
    seats: st.venue.seats,
    cash: Math.round(st.cash),
    ver: st.saveVersion,
    gear: (st.gear ?? []).slice(),
  };
}
"""


def open_shop(page):
    page.evaluate(
        """() => {
          const b = document.querySelector('[data-tab2="shop"]');
          if (b) { b.dispatchEvent(new MouseEvent('click', { bubbles: true })); return; }
          const h = document.querySelector('[data-tab="shop"]');
          if (h) h.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        }"""
    )
    page.wait_for_timeout(400)
    page.wait_for_selector("[data-tight]", timeout=5000, state="attached")


def main():
    os.makedirs(OUT, exist_ok=True)
    with sync_playwright() as p:
        b = p.chromium.launch()
        page = b.new_page(viewport={"width": 1440, "height": 900})
        errors = []
        page.on(
            "console",
            lambda m: errors.append(m.text)
            if (m.type == "error" and "Failed to load resource" not in m.text)
            else None,
        )
        page.goto(URL, wait_until="networkidle")
        page.wait_for_timeout(900)
        page.click('.sitecard[data-site="alley"]')
        page.click("[data-chips] .chip")
        page.click("[data-open]")
        page.wait_for_timeout(600)
        try:
            page.locator(".gbtn.ghost").click(timeout=1200)
        except Exception:
            pass
        page.wait_for_function("() => window.__laoyou && window.__laoyou.state")

        page.evaluate(
            """() => {
              const s = window.__laoyou.state;
              s.cash = 20000;
              s.venue.seats = 2;
              window.__laoyou.refresh();
            }"""
        )
        open_shop(page)
        base = page.evaluate(READ)
        CHECKS["tight_rows"] = bool(base["tight"])
        CHECKS["tight_says_seats"] = "座位" in base["tight"]
        CHECKS["tight_offers_stool"] = "矮凳" in base["tight"] and "¥150" in base["tight"]
        page.screenshot(path=os.path.join(OUT, "01-seat-tight.png"))

        # 买一张矮凳（¥150）
        page.evaluate(
            """() => {
              const btn = [...document.querySelectorAll('[data-act="buygear"]')]
                .find((b) => (b.dataset.id || "") === "plastic_stool");
              if (btn) btn.dispatchEvent(new MouseEvent("click", { bubbles: true }));
            }"""
        )
        page.wait_for_timeout(400)
        open_shop(page)
        after = page.evaluate(READ)
        CHECKS["buy_stool"] = "plastic_stool" in after["gear"]
        CHECKS["seats_up"] = after["seats"] == base["seats"] + 1
        CHECKS["tight_moves_on"] = after["tight"] != base["tight"]
        CHECKS["cash_down_150"] = base["cash"] - after["cash"] == 150
        page.screenshot(path=os.path.join(OUT, "02-seat-after.png"))

        # 队满主因时钩子点名矮凳/躺椅（先造一份「昨天走了 40 位」的样本）
        page.evaluate(
            """() => {
              const s = window.__laoyou.state;
              s.dayReport = { ...(s.dayReport ?? {}), lost: 40, served: 20 };
              s.flow.lostQueue = 40;
              s.flow.lostPrice = 0;
              s.flow.lostWait = 0;
              s.venue.seats = 2;
              s.gear = [];
              window.__laoyou.refresh();
            }"""
        )
        page.wait_for_timeout(300)
        hook = page.evaluate(READ)
        CHECKS["hook_names_seat"] = ("矮凳" in hook["hook"]) or ("躺椅" in hook["hook"])
        CHECKS["save_version"] = after["ver"] == SAVE_VERSION
        CHECKS["console_clean"] = len(errors) == 0
        page.screenshot(path=os.path.join(OUT, "03-seat-hook.png"))
        b.close()

    ok = all(CHECKS.values())
    print(json.dumps({"ok": ok, "checks": CHECKS, "base": base, "after": after, "hook": hook, "errors": errors}, ensure_ascii=False))
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()
