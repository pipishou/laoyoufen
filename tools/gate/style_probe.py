"""A1「店的样子」真点验收。

验五件事：
  1. 店铺页有「店的样子」一段，六套门面全列出来（未装的显示价格，装不起的 disabled）；
  2. 新铺抬头是「已装 0/6 · 店里还是空铺」，店内小图 data-style 是 none；
  3. 点「骑楼老铺」买下 → 抬头变「已装 1/6 · 现在「骑楼老铺」」、data-style 变 qilou、钱少了 400、
     那一行的按钮变成「正在用」；
  4. 再买「夜市摊」→ data-style 跟着变 yeshi；点骑楼那行的「换上」→ 回到 qilou（换不花钱）；
  5. console 干净（本地预览没有 /laoyou-api 反代，AI 预取 404 属设计内，要放过）。

跑之前先起预览服务（端口 4198）：
  cd game; npx vite preview --port 4198 --strictPort --host 127.0.0.1
然后：python tools/gate/style_probe.py
"""
import json
import pathlib

from playwright.sync_api import sync_playwright

URL = "http://127.0.0.1:4198/"
OUT = pathlib.Path("game/data/evidence/style")


def dom_click(page, selector: str, wait: int = 300) -> None:
    page.evaluate(
        """(sel) => {
            const el = document.querySelector(sel);
            if (el) el.click();
        }""",
        selector,
    )
    if wait:
        page.wait_for_timeout(wait)


READ = """() => {
    const heads = [...document.querySelectorAll('.sechd')].map((h) => h.textContent.trim());
    const head = heads.find((t) => t.includes('店的样子')) || '';
    const rows = [...document.querySelectorAll('[data-act="buystyle"], [data-act="setstyle"]')].map((b) => ({
        act: b.dataset.act,
        id: b.dataset.id,
        disabled: !!b.disabled,
        text: b.textContent.trim(),
    }));
    const map = document.querySelector('.shopmap');
    const onTag = [...document.querySelectorAll('.tag2.on')].map((t) => t.textContent.trim());
    return {
        head: head.slice(0, 60),
        rows,
        style: map ? map.dataset.style : null,
        onTag,
        cash: window.__laoyou.state.cash,
    };
}"""


def main() -> int:
    report = {"ok": False, "steps": [], "checks": {}, "console_errors": []}
    OUT.mkdir(parents=True, exist_ok=True)
    with sync_playwright() as p:
        browser = p.chromium.launch(channel="msedge")
        page = browser.new_page(viewport={"width": 1440, "height": 900})

        def on_console(m):
            if m.type != "error":
                return
            loc = (m.location or {}).get("url", "")
            if "/laoyou-api/" in loc or "favicon" in loc:
                return
            report["console_errors"].append(f"{m.text} @ {loc}")

        page.on("console", on_console)
        page.goto(URL, wait_until="load")
        page.wait_for_timeout(700)
        page.evaluate("() => localStorage.clear()")
        page.reload(wait_until="load")
        page.wait_for_timeout(900)

        # 过建店 → 收引导 → 店铺页
        dom_click(page, '.sitecard[data-site="alley"]')
        dom_click(page, "[data-chips] .chip")
        dom_click(page, "[data-open]")
        page.wait_for_timeout(400)
        dom_click(page, ".gbtn.ghost")
        page.wait_for_timeout(300)
        page.evaluate("() => { window.__laoyou.state.cash = 200000; window.__laoyou.refresh(); }")
        dom_click(page, '[data-tab="shop"]', wait=500)

        step1 = page.evaluate(READ)
        step1["step"] = "fresh"
        report["steps"].append(step1)

        page.evaluate(
            """() => {
                const h = [...document.querySelectorAll('.sechd')].find((x) => x.textContent.includes('店的样子'));
                if (h) h.scrollIntoView({ block: "center" });
                document.querySelectorAll(".toast").forEach((t) => t.remove());
            }"""
        )
        page.wait_for_timeout(250)
        page.screenshot(path=str(OUT / "04-style-none.png"))

        # 买骑楼老铺
        dom_click(page, '[data-act="buystyle"][data-id="qilou"]', wait=500)
        step2 = page.evaluate(READ)
        step2["step"] = "buy_qilou"
        report["steps"].append(step2)

        page.evaluate(
            """() => {
                document.querySelectorAll(".toast").forEach((t) => t.remove());
                const el = document.querySelector(".shopmap");
                if (el) el.scrollIntoView({ block: "center" });
            }"""
        )
        page.wait_for_timeout(250)
        page.screenshot(path=str(OUT / "05-style-qilou.png"))

        # 再买夜市摊（整套换掉）
        dom_click(page, '[data-act="buystyle"][data-id="yeshi"]', wait=500)
        step3 = page.evaluate(READ)
        step3["step"] = "buy_yeshi"
        report["steps"].append(step3)

        page.evaluate(
            """() => {
                document.querySelectorAll(".toast").forEach((t) => t.remove());
                const el = document.querySelector(".shopmap");
                if (el) el.scrollIntoView({ block: "center" });
            }"""
        )
        page.wait_for_timeout(250)
        page.screenshot(path=str(OUT / "06-style-yeshi.png"))

        # 换回骑楼：不花钱
        cash_before = step3["cash"]
        dom_click(page, '[data-act="setstyle"][data-id="qilou"]', wait=500)
        step4 = page.evaluate(READ)
        step4["step"] = "switch_back"
        step4["cashBefore"] = cash_before
        report["steps"].append(step4)

        checks = {
            "section_present": "店的样子" in step1["head"],
            "starts_empty": "空铺" in step1["head"] and step1["style"] == "none",
            "six_rows": len(step1["rows"]) == 6,
            "rows_are_buy": all(r["act"] == "buystyle" for r in step1["rows"]),
            "buy_works": step2["style"] == "qilou",
            "buy_head": "1/6" in step2["head"] and "骑楼老铺" in step2["head"],
            "buy_cash": abs((step1["cash"] - step2["cash"]) - 400) < 0.001,
            "buy_marks_active": "正在用" in step2["onTag"],
            "switch_works": step3["style"] == "yeshi" and step4["style"] == "qilou",
            "switch_free": abs(step4["cash"] - step4["cashBefore"]) < 0.001,
            "switch_shows_setstyle": any(r["act"] == "setstyle" and r["id"] == "yeshi" for r in step4["rows"]),
            "console_clean": not report["console_errors"],
        }
        report["checks"] = checks
        report["ok"] = all(checks.values())
        browser.close()

    (OUT / "style-report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0 if report["ok"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
