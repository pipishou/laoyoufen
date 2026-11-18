"""M3 家当真点验收：点「搬进来」、看钱掉、看座位涨、看按钮变「已买」。

面板每秒重渲染，所以按钮一律用 page.evaluate 里的 DOM click（actionability 会超时）。
"""
import json
import os

from playwright.sync_api import sync_playwright

URL = "http://127.0.0.1:4185/"
OUT = os.path.join("game", "data", "evidence", "m3")
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
        for sel in ["[data-guide='dismiss']", ".gbtn.ghost"]:
            if page.locator(sel).count():
                page.evaluate(f"document.querySelector(\"{sel}\").click()")
                break
        page.wait_for_timeout(300)

        # ── 2. 给钱、进店铺页 ──
        page.evaluate("window.__laoyou.state.cash = 50000; window.__laoyou.refresh && window.__laoyou.refresh();")
        page.wait_for_timeout(400)
        page.evaluate('document.querySelector("[data-tab=\\"shop\\"]").click()')
        page.wait_for_timeout(900)

        state0 = page.evaluate(
            """() => {
              const s = window.__laoyou.state;
              return { cash: s.cash, seats: s.venue.seats, gear: (s.gear||[]).slice() };
            }"""
        )
        report["steps"].append({"name": "before", **state0})

        has_gear = page.evaluate(
            """() => {
              const secs = Array.from(document.querySelectorAll(".sec"));
              const el = secs.find((x) => (x.querySelector(".sechd")?.textContent || "").includes("家当"));
              if (!el) return null;
              const rows = Array.from(el.querySelectorAll(".lrow"));
              return {
                header: el.querySelector(".sechd").textContent.trim(),
                rows: rows.length,
                buttons: el.querySelectorAll("[data-act=buygear]").length,
                names: rows.slice(0, 3).map((r) => (r.querySelector(".lname")?.textContent || "").trim()),
                hasKairoName: (el.textContent || "").includes("Faucet"),
              };
            }"""
        )
        report["steps"].append({"name": "gear", **(has_gear or {})})
        page.evaluate(
            """() => {
              const secs = Array.from(document.querySelectorAll(".sec"));
              const el = secs.find((x) => (x.querySelector(".sechd")?.textContent || "").includes("家当"));
              if (el) el.scrollIntoView({ block: "center" });
              document.querySelectorAll(".toast").forEach((t) => t.remove());
            }"""
        )
        page.wait_for_timeout(300)
        page.screenshot(path=os.path.join(OUT, "01-gear-list.png"))

        # ── 3. 点最便宜的那件（塑料矮凳）──
        page.evaluate(
            """() => {
              const btn = document.querySelector('[data-act=buygear][data-id="plastic_stool"]');
              if (btn) btn.click();
            }"""
        )
        page.wait_for_timeout(700)

        after = page.evaluate(
            """() => {
              const s = window.__laoyou.state;
              const secs = Array.from(document.querySelectorAll(".sec"));
              const el = secs.find((x) => (x.querySelector(".sechd")?.textContent || "").includes("家当"));
              return {
                cash: s.cash,
                seats: s.venue.seats,
                gear: (s.gear||[]).slice(),
                header: el ? el.querySelector(".sechd").textContent.trim() : "",
                stillBuyable: document.querySelectorAll('[data-act=buygear][data-id="plastic_stool"]').length,
                boughtRows: el ? Array.from(el.querySelectorAll(".lrow")).filter((r) => (r.textContent||"").includes("已买")).length : -1,
              };
            }"""
        )
        report["steps"].append({"name": "after_stool", **after})
        page.evaluate(
            """() => {
              const secs = Array.from(document.querySelectorAll(".sec"));
              const el = secs.find((x) => (x.querySelector(".sechd")?.textContent || "").includes("家当"));
              if (el) el.scrollIntoView({ block: "center" });
              document.querySelectorAll(".toast").forEach((t) => t.remove());
            }"""
        )
        page.wait_for_timeout(300)
        page.screenshot(path=os.path.join(OUT, "02-gear-bought.png"))

        # ── 4. 再买一件贵的（冰柜 ¥3,600），验证乘数真的进状态 ──
        page.evaluate(
            """() => {
              const btn = document.querySelector('[data-act=buygear][data-id="freezer"]');
              if (btn) btn.click();
            }"""
        )
        page.wait_for_timeout(700)
        after2 = page.evaluate(
            """() => {
              const s = window.__laoyou.state;
              return { cash: s.cash, gear: (s.gear||[]).slice() };
            }"""
        )
        report["steps"].append({"name": "after_freezer", **after2})

        ok = (
            state0["cash"] == 50000
            and (has_gear or {}).get("rows") == 12
            and (has_gear or {}).get("buttons") == 12
            and (has_gear or {}).get("hasKairoName") is False
            and after["cash"] == 49900
            and after["seats"] == state0["seats"] + 1
            and after["gear"] == ["plastic_stool"]
            and after["stillBuyable"] == 0
            and "1/12" in after["header"]
            and after2["cash"] == 46300
            and after2["gear"] == ["plastic_stool", "freezer"]
            and not errors
        )
        report["ok"] = bool(ok)
        browser.close()

    with open(os.path.join(OUT, "probe-report.json"), "w", encoding="utf-8") as f:
        json.dump(report, f, ensure_ascii=False, indent=2)
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0 if report["ok"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
