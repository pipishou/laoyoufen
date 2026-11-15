"""多款粉同时上菜单（P47）真点验收：加一款、切款、上下架，点完看存档。

跑法（先起 preview，端口必须是 4180 —— 4173 上常有旧 node 僵尸占着）：
    Start-Process cmd /c "npx vite preview --port 4180 --strictPort --host 127.0.0.1"
    python tools/gate/menu_probe.py
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

URL = "http://127.0.0.1:4180/"
OUT = Path(__file__).resolve().parents[2] / "game" / "data" / "evidence" / "p47"


def open_shop(page) -> None:
    """清档 → 过建店 → 到准备阶段（门还没开）。"""
    page.goto(URL, wait_until="networkidle")
    page.evaluate("localStorage.clear()")
    page.reload(wait_until="networkidle")
    page.wait_for_selector(".setup", timeout=15000)
    page.click('.sitecard[data-site="alley"]')
    page.wait_for_selector("[data-chips] .chip")
    page.click("[data-chips] .chip")
    page.click("[data-open]")
    page.wait_for_selector("[data-openpill]", timeout=10000)


def click_dom(page, selector: str) -> None:
    """面板每秒重渲染，Playwright 的 actionability 等待会因节点被换掉而超时 —— 直接点 DOM。"""
    page.evaluate(
        """(sel) => {
            const el = document.querySelector(sel);
            if (!el) throw new Error("找不到 " + sel);
            el.click();
        }""",
        selector,
    )


def main() -> int:
    OUT.mkdir(parents=True, exist_ok=True)
    errors: list[str] = []
    report: dict[str, object] = {}

    with sync_playwright() as p:
        browser = p.chromium.launch(channel="msedge")
        page = browser.new_page(viewport={"width": 1440, "height": 900})
        page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)

        open_shop(page)
        # 评到第 4 段 → 菜单位 3 款；给点现金
        page.evaluate("window.__laoyou.state.gradeLevel = 4; window.__laoyou.state.cash = 60000;")
        page.click('[data-tab="recipe"]')
        page.wait_for_timeout(300)

        first = page.evaluate(
            """() => {
                const s = window.__laoyou.state;
                return {
                    menuLen: s.menu.length,
                    editing: s.editing,
                    cap: null,
                    cards: document.querySelectorAll(".dcard").length,
                    adds: document.querySelectorAll(".dcard.add").length,
                    sum: document.querySelector("[data-menusum]")?.textContent ?? "",
                };
            }"""
        )
        report["first"] = first

        page.evaluate(
            """() => {
                const el = document.querySelector(".menucards");
                if (el) el.scrollIntoView({ block: "center" });
                document.querySelectorAll(".toast").forEach((t) => t.remove());
            }"""
        )
        page.screenshot(path=str(OUT / "06-menu-one.png"))

        # 加一款
        click_dom(page, '[data-act="adddish"]')
        page.wait_for_timeout(300)
        after_add = page.evaluate(
            """() => {
                const s = window.__laoyou.state;
                return {
                    menuLen: s.menu.length,
                    editing: s.editing,
                    cards: document.querySelectorAll(".dcard").length,
                    heads: document.querySelectorAll(".dcard .dhead").length,
                    prices: [...document.querySelectorAll(".dcard .dprice")].map((e) => e.textContent),
                };
            }"""
        )
        report["after_add"] = after_add

        # 切回第一款（编辑指针要跟手）
        click_dom(page, '[data-act="pickdish"][data-id="0"]')
        page.wait_for_timeout(250)
        after_pick = page.evaluate(
            """() => {
                const s = window.__laoyou.state;
                return {
                    editing: s.editing,
                    onCard: document.querySelectorAll(".dcard.editing").length,
                    editingIndex: [...document.querySelectorAll(".dcard")].findIndex((c) => c.classList.contains("editing")),
                };
            }"""
        )
        report["after_pick"] = after_pick

        # 下架第二款
        click_dom(page, '[data-act="toggledish"][data-id="1"]')
        page.wait_for_timeout(250)
        after_toggle = page.evaluate(
            """() => {
                const s = window.__laoyou.state;
                return {
                    on: s.menu.map((d) => d.on),
                    onCard: document.querySelectorAll(".dcard.on").length,
                    sum: document.querySelector("[data-menusum]")?.textContent ?? "",
                };
            }"""
        )
        report["after_toggle"] = after_toggle

        page.evaluate(
            """() => {
                const el = document.querySelector(".menucards");
                if (el) el.scrollIntoView({ block: "center" });
                document.querySelectorAll(".toast").forEach((t) => t.remove());
            }"""
        )
        page.screenshot(path=str(OUT / "07-menu-two.png"))

        report["console_errors"] = errors
        first_r = report["first"]
        ok = (
            isinstance(first_r, dict)
            and first_r.get("menuLen") == 1
            and first_r.get("adds") == 1
            and isinstance(after_add, dict)
            and after_add.get("menuLen") == 2
            and after_add.get("editing") == 1
            and isinstance(after_pick, dict)
            and after_pick.get("editing") == 0
            and isinstance(after_toggle, dict)
            and after_toggle.get("on") == [True, False]
            and not errors
        )
        report["ok"] = ok
        browser.close()

    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0 if report.get("ok") else 1


if __name__ == "__main__":
    sys.exit(main())
