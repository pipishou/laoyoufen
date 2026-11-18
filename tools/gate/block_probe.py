"""M2 街面真点验收：点「修」、看钱掉、看已修标记、看小地图变绿。

面板每秒重渲染，所以按钮一律用 page.evaluate 里的 DOM click（actionability 会超时）。
"""
import json
import os
import sys

from playwright.sync_api import sync_playwright

URL = "http://127.0.0.1:4184/"
OUT = os.path.join("game", "data", "evidence", "m2")
os.makedirs(OUT, exist_ok=True)


def main() -> int:
    errors: list[str] = []
    report: dict = {"ok": False, "steps": [], "console_errors": errors}

    with sync_playwright() as pw:
        browser = pw.chromium.launch(channel="msedge", headless=True)
        page = browser.new_page(viewport={"width": 1440, "height": 900})
        page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
        page.goto(URL, wait_until="load")
        page.wait_for_timeout(1200)

        # ── 1. 建店 ──
        page.evaluate("localStorage.clear(); location.reload();")
        page.wait_for_timeout(1600)
        page.click('.sitecard[data-site="alley"]')
        page.click("[data-chips] .chip")
        page.click("[data-open]")
        page.wait_for_timeout(600)
        # 收掉引导，别挡住面板
        for sel in ["[data-guide='dismiss']", ".gbtn.ghost"]:
            if page.locator(sel).count():
                page.evaluate(f"document.querySelector(\"{sel}\").click()")
                break
        page.wait_for_timeout(300)

        # ── 2. 给钱、进店铺页 ──
        page.evaluate("window.__laoyou.state.cash = 120000; window.__laoyou.refresh && window.__laoyou.refresh();")
        page.wait_for_timeout(400)
        page.evaluate('document.querySelector("[data-tab=\\"shop\\"]").click()')
        page.wait_for_timeout(900)

        state0 = page.evaluate(
            """() => {
              const s = window.__laoyou.state;
              return { cash: s.streets ? s.cash : 0, streets: (s.streets||[]).slice() };
            }"""
        )
        report["steps"].append({"name": "before", **state0})

        # 街面段在不在
        has_block = page.evaluate(
            """() => {
              const secs = Array.from(document.querySelectorAll(".sec"));
              const el = secs.find((x) => (x.querySelector(".sechd")?.textContent || "").includes("街面"));
              if (!el) return null;
              return {
                header: el.querySelector(".sechd").textContent.trim(),
                mapCells: el.querySelectorAll(".minimap i").length,
                kCells: el.querySelectorAll(".minimap .mc-k").length,
                buttons: el.querySelectorAll("[data-act=buystreet]").length,
                request: (el.querySelector(".lmeta")?.textContent || "").slice(0, 40),
              };
            }"""
        )
        report["steps"].append({"name": "block", **(has_block or {})})
        # 滚到小地图：图在屏幕中间，标题与街坊请求留在上方可见
        page.evaluate(
            """() => {
              document.querySelector(".minimap").scrollIntoView({ block: "center" });
              document.querySelectorAll(".toast").forEach((t) => t.remove());
            }"""
        )
        page.wait_for_timeout(300)
        page.screenshot(path=os.path.join(OUT, "01-street-block.png"))

        # ── 3. 修最便宜那件（公告栏 ¥4,000）──
        ok_click = page.evaluate(
            """() => {
              const b = document.querySelector('[data-act="buystreet"][data-id="notice_board"]');
              if (!b) return false;
              b.click();
              return true;
            }"""
        )
        page.wait_for_timeout(900)
        after = page.evaluate(
            """() => {
              const s = window.__laoyou.state;
              const el = Array.from(document.querySelectorAll(".sec")).find((x) =>
                (x.querySelector(".sechd")?.textContent || "").includes("街面"));
              return {
                cash: s.cash,
                streets: (s.streets||[]).slice(),
                header: el?.querySelector(".sechd")?.textContent.trim() || "",
                kCells: el?.querySelectorAll(".minimap .mc-k").length || 0,
                builtTag: (el?.textContent || "").includes("已修"),
                stillButton: !!document.querySelector('[data-act="buystreet"][data-id="notice_board"]'),
              };
            }"""
        )
        report["steps"].append({"name": "after_notice_board", "clicked": ok_click, **after})
        # 滚到小地图：图在屏幕中间，标题与街坊请求留在上方可见
        page.evaluate(
            """() => {
              document.querySelector(".minimap").scrollIntoView({ block: "center" });
              document.querySelectorAll(".toast").forEach((t) => t.remove());
            }"""
        )
        page.wait_for_timeout(300)
        page.screenshot(path=os.path.join(OUT, "02-street-built.png"))

        # ── 4. 断言 ──
        report["ok"] = bool(
            has_block
            and has_block["mapCells"] == 256
            and has_block["kCells"] == 0
            and has_block["buttons"] == 12
            and ok_click
            and after["streets"] == ["notice_board"]
            and after["cash"] == state0["cash"] - 4_000
            and after["kCells"] == 1
            and after["builtTag"]
            and not after["stillButton"]
            and not errors
        )
        browser.close()

    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0 if report["ok"] else 1


if __name__ == "__main__":
    sys.exit(main())
