"""A6 老师傅的方子 真点验收。

验七件事：
  1. 配方页菜单卡片底下有「请师傅定」那一行，四个印章按钮；
  2. 人情/钱不够时按钮是灰的（disabled）；
  3. 点「料」→ 扣 12 点人情与 ¥200，卡片变成「料 料钱定死」的印章行，不再给别的选项；
  4. 定过的款再想定别的：那一行已经没有按钮了（一锅只定一条）；
  5. 人情归零后，四枚印章全部变灰；
  6. toast 里是师傅的原话；
  7. console 干净（本地预览没有 /laoyou-api 反代，AI 预取 404 属设计内）。

跑之前先起预览服务（端口 4201）：
  cd game; npx vite preview --port 4201 --strictPort --host 127.0.0.1
然后：$env:PYTHONIOENCODING="utf-8"; python tools/gate/master_probe.py
"""
import json
import pathlib

from playwright.sync_api import sync_playwright

URL = "http://127.0.0.1:4201/"
OUT = pathlib.Path("game/data/evidence/master")


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


READ_CARD = """() => {
    const card = document.querySelector('.dcard');
    if (!card) return { found: false };
    const row = card.querySelector('.macts');
    const btns = [...card.querySelectorAll('.mact')];
    const item = window.__laoyou.state.menu[0] || {};
    return {
        found: true,
        lead: row ? (row.querySelector('.mlead') || { textContent: '' }).textContent.trim() : '',
        done: !!(row && row.classList.contains('done')),
        seals: [...card.querySelectorAll('.mseal')].map((s) => s.textContent.trim()),
        names: [...card.querySelectorAll('.mname')].map((s) => s.textContent.trim()),
        btnCount: btns.length,
        btnIds: btns.map((b) => b.dataset.id),
        disabled: btns.filter((b) => b.disabled).length,
        master: item.master ?? null,
        lockedTaste: item.lockedTaste ?? null,
        favor: window.__laoyou.state.favor,
        cash: window.__laoyou.state.cash,
        toasts: [...document.querySelectorAll('.toast')].map((t) => t.textContent.trim()),
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

        # 建店 → 收引导 → 配方页
        dom_click(page, '.sitecard[data-site="alley"]')
        dom_click(page, "[data-chips] .chip")
        dom_click(page, "[data-open]")
        page.wait_for_timeout(400)
        dom_click(page, ".gbtn.ghost")
        page.wait_for_timeout(300)
        page.evaluate(
            """() => {
                const s = window.__laoyou.state;
                s.cash = 200000;
                s.favor = 60;
                window.__laoyou.refresh();
            }"""
        )
        dom_click(page, '[data-tab="recipe"]', wait=600)

        step1 = page.evaluate(READ_CARD)
        step1["step"] = "fresh"
        report["steps"].append(step1)

        page.evaluate(
            """() => {
                document.querySelectorAll(".toast").forEach((t) => t.remove());
                const c = document.querySelector('.dcard');
                if (c) c.scrollIntoView({ block: "center" });
            }"""
        )
        page.wait_for_timeout(250)
        page.screenshot(path=str(OUT / "12-master-none.png"))

        # 定「料钱定死」
        dom_click(page, '[data-act="master"][data-id="0|cost_set"]', wait=600)
        step2 = page.evaluate(READ_CARD)
        step2["step"] = "set_cost"
        report["steps"].append(step2)
        page.evaluate("() => document.querySelectorAll('.toast').forEach((t) => t.remove())")
        page.wait_for_timeout(200)
        page.screenshot(path=str(OUT / "13-master-cost.png"))

        # 人情归零 → 换一款（新建第二款）看四枚全灰
        page.evaluate(
            """() => {
                const s = window.__laoyou.state;
                s.favor = 0;
                // 菜单上限跟段位走：段位不够时「加一款」是灰的，探针要先把段位抬上去
                s.gradeLevel = 6;
                window.__laoyou.refresh();
            }"""
        )
        dom_click(page, '[data-act="adddish"]', wait=600)
        step3 = page.evaluate(
            """() => {
                const cards = [...document.querySelectorAll('.dcard')].filter((c) => !c.classList.contains('add'));
                const last = cards[cards.length - 1];
                const btns = last ? [...last.querySelectorAll('.mact')] : [];
                return {
                    cards: cards.length,
                    btnCount: btns.length,
                    disabled: btns.filter((b) => b.disabled).length,
                    favor: window.__laoyou.state.favor,
                    masters: window.__laoyou.state.menu.map((d) => d.master ?? null),
                };
            }"""
        )
        step3["step"] = "low_favor"
        report["steps"].append(step3)

        checks = {
            "row_present": step1["found"] and step1["lead"] == "请师傅定",
            "four_seals": step1["btnCount"] == 4,
            "seals_are_cn": step1["seals"] == ["火", "料", "碗", "价"],
            "set_works": step2["master"] == "cost_set",
            "favor_spent": step1["favor"] - step2["favor"] == 12,
            "cash_spent": abs((step1["cash"] - step2["cash"]) - 200) < 0.001,
            "card_shows_seal": step2["done"] and step2["names"] == ["料钱定死"] and step2["btnCount"] == 0,
            "toast_is_master_line": any("拿秤称" in t for t in step2["toasts"]),
            "low_favor_greys_all": step3["btnCount"] == 4 and step3["disabled"] == 4,
            "one_per_dish": step2["btnCount"] == 0,
            "locked_other_dish": step3["masters"][1] is None,
            "console_clean": not report["console_errors"],
        }
        report["checks"] = checks
        report["ok"] = all(checks.values())
        browser.close()

    (OUT / "master-report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({"ok": report["ok"], "checks": report["checks"]}, ensure_ascii=False, indent=2))
    return 0 if report["ok"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
