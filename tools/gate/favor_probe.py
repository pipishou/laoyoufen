"""M3b 真点验收：人情三样花法 + 店里布景小图 + 转手配方。

跑之前先起预览服务（端口 4186）：
  cd game; npx vite preview --port 4186 --strictPort --host 127.0.0.1
然后：python tools/gate/favor_probe.py

注意：面板每秒重渲染，按钮一律用 page.evaluate 里的 DOM click（actionability 会超时）；
      截图前把目标滚到视口中间，并先把 .toast 清掉（否则盖住面板）。
"""
import json
import pathlib
import sys

from playwright.sync_api import sync_playwright

URL = "http://127.0.0.1:4186/"
OUT = pathlib.Path("game/data/evidence/m3b")
OUT.mkdir(parents=True, exist_ok=True)


def dom_click(page, selector: str) -> None:
    page.evaluate(
        """(sel) => {
            const el = document.querySelector(sel);
            if (el) el.click();
        }""",
        selector,
    )
    page.wait_for_timeout(320)


def state_of(page):
    return page.evaluate("() => window.__laoyou.state")


def main() -> int:
    report = {"ok": False, "steps": [], "console_errors": []}
    with sync_playwright() as p:
        browser = p.chromium.launch(channel="msedge")
        page = browser.new_page(viewport={"width": 1440, "height": 900})
        page.on("console", lambda m: report["console_errors"].append(m.text) if m.type == "error" else None)
        page.goto(URL, wait_until="load")
        page.wait_for_timeout(700)
        page.evaluate("() => localStorage.clear()")
        page.reload(wait_until="load")
        page.wait_for_timeout(900)

        # 过建店
        dom_click(page, '.sitecard[data-site="alley"]')
        dom_click(page, "[data-chips] .chip")
        dom_click(page, "[data-open]")
        page.wait_for_timeout(400)
        dom_click(page, ".gbtn.ghost")  # 先关掉引导
        page.wait_for_timeout(300)

        # 注入：6 段（菜单位 3 款）、有现金、人情 100
        page.evaluate(
            """() => {
                const s = window.__laoyou.state;
                s.gradeLevel = 6;
                s.cash = 100000;
                s.favor = 100;
                s.favorTotal = 100;
                s.totalCustomers = 3000;
            }"""
        )
        page.wait_for_timeout(200)
        dom_click(page, '[data-tab="shop"]')
        page.wait_for_timeout(500)

        info = page.evaluate(
            """() => {
                const cells = document.querySelectorAll(".shopmap i").length;
                const seats = document.querySelectorAll(".shopmap i.sm-seat").length;
                const kitchen = document.querySelectorAll(".shopmap i.sm-kitchen").length;
                const favBtns = document.querySelectorAll('[data-act="usefavor"]').length;
                const sellBtns = document.querySelectorAll('[data-act="sellrecipe"]').length;
                const heads = [...document.querySelectorAll(".sechd")].map((e) => e.textContent.trim()).slice(0, 8);
                return { cells, seats, kitchen, favBtns, sellBtns, heads };
            }"""
        )
        report["steps"].append({"after_open_shop": info})

        # 截人情段 + 小图
        page.evaluate(
            """() => {
                document.querySelectorAll(".toast").forEach((e) => e.remove());
                const m = document.querySelector(".shopmap");
                if (m) m.scrollIntoView({ block: "center" });
            }"""
        )
        page.wait_for_timeout(250)
        page.screenshot(path=str(OUT / "01-shop-map.png"))

        # 请老师傅尝一口：100 → 92
        favor_before = state_of(page)["favor"]
        dom_click(page, '[data-act="usefavor"][data-id="hint_recipe"]')
        page.wait_for_timeout(400)
        favor_after = state_of(page)["favor"]
        report["steps"].append({"hint_recipe": {"before": favor_before, "after": favor_after}})

        # 让师傅带一手：先雇一个人（直接注入，避免走候选刷新）
        page.evaluate(
            """() => {
                const s = window.__laoyou.state;
                s.staff.roster.push({
                    uid: "st.probe", name: "阿珍", role: "prep", skill: 2,
                    wage: 130, note: "", fatigue: 0, resting: false,
                });
            }"""
        )
        page.wait_for_timeout(400)
        dom_click(page, '[data-tab="shop"]')
        page.wait_for_timeout(300)
        dom_click(page, '[data-act="usefavor"][data-id="teach_staff"]')
        page.wait_for_timeout(400)
        st = state_of(page)
        report["steps"].append(
            {"teach_staff": {"favor": st["favor"], "skill": st["staff"]["roster"][0]["skill"]}}
        )

        # 转手：先在配方页加一款，再回店铺页转手它
        dom_click(page, '[data-tab="recipe"]')
        page.wait_for_timeout(400)
        dom_click(page, '[data-act="adddish"]')
        page.wait_for_timeout(400)
        menu_after_add = len(state_of(page)["menu"])
        dom_click(page, '[data-tab="shop"]')
        page.wait_for_timeout(400)
        favor_before_sell = state_of(page)["favor"]
        dom_click(page, '[data-act="sellrecipe"][data-id="1"]')
        page.wait_for_timeout(500)
        st2 = state_of(page)
        report["steps"].append(
            {
                "sell_recipe": {
                    "menu_after_add": menu_after_add,
                    "menu_after_sell": len(st2["menu"]),
                    "favor_before": favor_before_sell,
                    "favor_after": st2["favor"],
                }
            }
        )
        page.evaluate(
            """() => {
                document.querySelectorAll(".toast").forEach((e) => e.remove());
                const m = document.querySelector(".shopmap");
                if (m) m.scrollIntoView({ block: "center" });
            }"""
        )
        page.wait_for_timeout(200)
        page.screenshot(path=str(OUT / "02-favor-used.png"))

        browser.close()

    report["ok"] = (
        report["steps"][0]["after_open_shop"]["cells"] == 96
        and report["steps"][0]["after_open_shop"]["favBtns"] == 3
        and report["steps"][1]["hint_recipe"]["after"] == report["steps"][1]["hint_recipe"]["before"] - 8
        and report["steps"][2]["teach_staff"]["skill"] == 3
        and report["steps"][3]["sell_recipe"]["menu_after_sell"] == 1
        and not report["console_errors"]
    )
    (OUT / "probe-report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0 if report["ok"] else 1


if __name__ == "__main__":
    sys.exit(main())
