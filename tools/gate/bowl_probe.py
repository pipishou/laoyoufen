"""A4 碗 + A2 配料组合 真点验收。

验六件事：
  1. 店铺页有「碗」一段，五只碗全列出来（没买的显示价格，买不起的 disabled）；
  2. 新铺用消毒不锈钢碗，抬头「现在用「消毒不锈钢碗」· 买了 1/5 只」；
  3. 买搪瓷碗 → 扣 600、自动换上、抬头变 2/5、那一行变「正在用」；
  4. 再买瓦煲 → 3/5；点搪瓷那行的「换上」→ 回到搪瓷，且**不花钱**；
  5. 配方页有「这一碗的搭配」段：点酸笋 + 酸辣椒 → 「凑成 1 / 24 搭」；
  6. 图鉴页底部有「碗 · N/5」；console 干净（本地预览没有 /laoyou-api 反代，AI 预取 404 属设计内）。

跑之前先起预览服务（端口 4199）：
  cd game; npx vite preview --port 4199 --strictPort --host 127.0.0.1
然后：python tools/gate/bowl_probe.py
"""
import json
import pathlib

from playwright.sync_api import sync_playwright

URL = "http://127.0.0.1:4199/"
OUT = pathlib.Path("game/data/evidence/bowl")


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


READ_BOWL = """() => {
    const heads = [...document.querySelectorAll('.sechd')].map((h) => h.textContent.trim());
    const head = heads.find((t) => t.includes('碗 ·')) || '';
    const headEl = [...document.querySelectorAll('.sechd')].find((h) => h.textContent.includes('碗 ·'));
    const sec = headEl ? headEl.closest('.sec') : null;
    const rows = [...document.querySelectorAll('[data-act="buybowl"], [data-act="setbowl"]')].map((b) => ({
        act: b.dataset.act,
        id: b.dataset.id,
        disabled: !!b.disabled,
        text: b.textContent.trim(),
    }));
    return {
        head: head.slice(0, 60),
        rows,
        rowCount: sec ? sec.querySelectorAll('.lrow').length : 0,
        onTag: [...document.querySelectorAll('.tag2.on')].map((t) => t.textContent.trim()),
        bowl: window.__laoyou.state.bowl,
        bowls: window.__laoyou.state.bowls,
        cash: window.__laoyou.state.cash,
    };
}"""

READ_PAIR = """() => {
    const box = document.querySelector('[data-pairs]');
    return {
        text: box ? box.textContent.replace(/\\s+/g, ' ').trim().slice(0, 160) : '',
        chips: box ? [...box.querySelectorAll('.flav')].map((c) => c.textContent.trim()) : [],
        on: box ? box.querySelectorAll('.flav.on').length : 0,
    };
}"""

READ_COLLECTION = """() => {
    const pane = document.querySelector('.pane[data-pane="collection"]');
    const heads = pane ? [...pane.querySelectorAll('.sechd')].map((h) => h.textContent.trim()) : [];
    return { bowlHead: heads.find((t) => t.startsWith('碗 ·')) || '', heads: heads.length };
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

        # 建店 → 收引导 → 店铺页
        dom_click(page, '.sitecard[data-site="alley"]')
        dom_click(page, "[data-chips] .chip")
        dom_click(page, "[data-open]")
        page.wait_for_timeout(400)
        dom_click(page, ".gbtn.ghost")
        page.wait_for_timeout(300)
        page.evaluate("() => { window.__laoyou.state.cash = 200000; window.__laoyou.refresh(); }")
        dom_click(page, '[data-tab="shop"]', wait=500)

        step1 = page.evaluate(READ_BOWL)
        step1["step"] = "fresh"
        report["steps"].append(step1)

        page.evaluate(
            """() => {
                const h = [...document.querySelectorAll('.sechd')].find((x) => x.textContent.includes('碗 ·'));
                if (h) h.scrollIntoView({ block: "center" });
                document.querySelectorAll(".toast").forEach((t) => t.remove());
            }"""
        )
        page.wait_for_timeout(250)
        page.screenshot(path=str(OUT / "07-bowl-none.png"))

        # 买搪瓷碗
        dom_click(page, '[data-act="buybowl"][data-id="enamel"]', wait=500)
        step2 = page.evaluate(READ_BOWL)
        step2["step"] = "buy_enamel"
        report["steps"].append(step2)
        page.evaluate("() => document.querySelectorAll('.toast').forEach((t) => t.remove())")
        page.wait_for_timeout(200)
        page.screenshot(path=str(OUT / "08-bowl-enamel.png"))

        # 再买瓦煲
        dom_click(page, '[data-act="buybowl"][data-id="claypot"]', wait=500)
        step3 = page.evaluate(READ_BOWL)
        step3["step"] = "buy_claypot"
        report["steps"].append(step3)

        # 换回搪瓷：不花钱
        cash_before = step3["cash"]
        dom_click(page, '[data-act="setbowl"][data-id="enamel"]', wait=500)
        step4 = page.evaluate(READ_BOWL)
        step4["step"] = "switch_enamel"
        step4["cashBefore"] = cash_before
        report["steps"].append(step4)

        # 配方页：点酸笋 + 酸辣椒，凑成一搭
        dom_click(page, '[data-tab="recipe"]', wait=500)
        dom_click(page, '[data-top="top.sourbamboo"]', wait=250)
        dom_click(page, '[data-top="top.chili"]', wait=400)
        step5 = page.evaluate(READ_PAIR)
        step5["step"] = "pairing"
        report["steps"].append(step5)

        page.evaluate(
            """() => {
                document.querySelectorAll(".toast").forEach((t) => t.remove());
                const el = document.querySelector('[data-pairs]');
                if (el) el.scrollIntoView({ block: "center" });
            }"""
        )
        page.wait_for_timeout(250)
        page.screenshot(path=str(OUT / "09-pairing.png"))

        # 图鉴：碗段
        dom_click(page, '[data-tab="collection"]', wait=500)
        step6 = page.evaluate(READ_COLLECTION)
        step6["step"] = "collection"
        report["steps"].append(step6)

        checks = {
            "bowl_section": "碗 ·" in step1["head"],
            "five_rows": step1["rowCount"] == 5,
            "starts_steel": "消毒不锈钢碗" in step1["head"] and "1/5" in step1["head"],
            "buy_works": step2["bowl"] == "enamel" and abs((step1["cash"] - step2["cash"]) - 600) < 0.001,
            "buy_head": "2/5" in step2["head"] and "搪瓷碗" in step2["head"],
            "buy_marks_active": "正在用" in step2["onTag"],
            "second_buy": step3["bowl"] == "claypot" and "3/5" in step3["head"],
            "switch_free": step4["bowl"] == "enamel" and abs(step4["cash"] - step4["cashBefore"]) < 0.001,
            "pairing_section": "搭配" in step5["text"],
            "pairing_one": "凑成 1 / 24" in step5["text"] and step5["on"] >= 1,
            "collection_bowl": "碗 ·" in step6["bowlHead"],
            "console_clean": not report["console_errors"],
        }
        report["checks"] = checks
        report["ok"] = all(checks.values())
        browser.close()

    (OUT / "bowl-report.json").write_text(
        json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0 if report["ok"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
