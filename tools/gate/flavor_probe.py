"""B1 味道层真点验收。

验四件事：
  1. 配方页有一块「这锅的味道」，六条成型吃法全列出来（未成立的写还差哪几味）；
  2. 点齐酸笋 + 豆豉 + 酸辣椒 → 「老友三味」亮起来，并且写出效果（味道 +3）；
  3. 粉型绑定的组合认粉型：干捞 + 肉末成立，切粉 + 肉末不成立；
  4. 图鉴页有「味道 · N/6」一段，每张卡都能看到要哪几味。

跑之前先起预览服务（端口 4197）：
  cd game; npx vite preview --port 4197 --strictPort --host 127.0.0.1
然后：python tools/gate/flavor_probe.py

注意：
  - 面板会缓存，改完状态一定要 `window.__laoyou.refresh()`；
  - 本地预览没有 /laoyou-api 代理，AI 预取 404 属设计内，console 里要放过。
"""
import json
import pathlib

from playwright.sync_api import sync_playwright

URL = "http://127.0.0.1:4197/"
OUT = pathlib.Path("game/data/evidence/flavor")
OUT.mkdir(parents=True, exist_ok=True)


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
    const box = document.querySelector('.flavorbox');
    const chips = [...document.querySelectorAll('.flavlist .flav')];
    const head = document.querySelector('.flavhd');
    return {
        hasBox: !!box,
        head: head ? head.textContent.trim().replace(/\\s+/g, ' ').slice(0, 80) : '',
        total: chips.length,
        on: chips.filter((c) => c.classList.contains('on')).map((c) => c.textContent.trim().slice(0, 40)),
        text: chips.map((c) => c.textContent.trim().slice(0, 60)),
        titles: chips.map((c) => (c.getAttribute('title') || '').slice(0, 60)),
    };
}"""


def main() -> int:
    report = {"ok": False, "steps": [], "checks": {}, "console_errors": []}
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

        # 过建店 → 收引导 → 配方页
        dom_click(page, '.sitecard[data-site="alley"]')
        dom_click(page, "[data-chips] .chip")
        dom_click(page, "[data-open]")
        page.wait_for_timeout(400)
        dom_click(page, ".gbtn.ghost")
        page.wait_for_timeout(300)
        dom_click(page, '[data-tab="recipe"]', wait=450)

        step1 = page.evaluate(READ)
        step1["step"] = "flavor_box_empty"
        report["steps"].append(step1)

        page.evaluate(
            """() => {
                const el = document.querySelector('.flavorbox');
                if (el) el.scrollIntoView({ block: "center" });
                document.querySelectorAll(".toast").forEach((t) => t.remove());
            }"""
        )
        page.wait_for_timeout(200)
        page.screenshot(path=str(OUT / "01-flavor-none.png"))

        # 点齐三味
        for tid in ("top.sourbamboo", "top.douchi", "top.chili"):
            dom_click(page, f'[data-top="{tid}"]', wait=260)
        page.wait_for_timeout(300)

        step2 = page.evaluate(READ)
        step2["step"] = "classic_on"
        report["steps"].append(step2)

        page.evaluate(
            """() => {
                const el = document.querySelector('.flavorbox');
                if (el) el.scrollIntoView({ block: "center" });
            }"""
        )
        page.wait_for_timeout(200)
        page.screenshot(path=str(OUT / "02-flavor-classic.png"))

        # 粉型绑定：干捞 + 肉末成立；切粉 + 肉末不成立
        step3 = page.evaluate(
            """() => {
                const s = window.__laoyou.state;
                s.recipe.toppings.push("top.mince");
                s.noodle = "flat";
                window.__laoyou.refresh();
                const flatOn = [...document.querySelectorAll('.flav.on')].map((c) => c.textContent.trim());
                s.noodle = "dry";
                window.__laoyou.refresh();
                const dryOn = [...document.querySelectorAll('.flav.on')].map((c) => c.textContent.trim());
                return { flatOn: flatOn.map((x) => x.slice(0, 20)), dryOn: dryOn.map((x) => x.slice(0, 20)) };
            }"""
        )
        page.wait_for_timeout(300)
        step3["step"] = "noodle_bound"
        report["steps"].append(step3)

        # 图鉴页：味道一段
        dom_click(page, '[data-tab="collection"]', wait=500)
        step4 = page.evaluate(
            """() => {
                const heads = [...document.querySelectorAll('.sechd')].map((h) => h.textContent.trim());
                const flavorHead = heads.find((t) => t.includes('味道')) || '';
                const groups = [...document.querySelectorAll('.tgroup')];
                let cards = 0;
                for (const g of groups) {
                    const name = (g.querySelector('.tgname') || {}).textContent || '';
                    if (name.includes('成型吃法')) cards = g.querySelectorAll('.tcard').length;
                }
                return { flavorHead: flavorHead.slice(0, 60), flavorCards: cards };
            }"""
        )
        page.wait_for_timeout(200)
        step4["step"] = "collection"
        report["steps"].append(step4)
        page.screenshot(path=str(OUT / "03-collection-flavor.png"))

        checks = {
            "box_present": step1["hasBox"],
            "six_rows": step1["total"] == 6,
            "starts_empty": step1["on"] == [],
            "head_zero": "0/6" in step1["head"],
            "classic_on": any("老友三味" in x for x in step2["on"]),
            "classic_effect": any("味道" in x for x in step2["on"]),
            "title_has_source": any("出处" in t for t in step2["titles"]),
            "flat_no_dry": not any("干捞肉末" in x for x in step3["flatOn"]),
            "dry_has_mince": any("干捞肉末" in x for x in step3["dryOn"]),
            "collection_section": "味道" in step4["flavorHead"],
            "collection_six_cards": step4["flavorCards"] == 6,
            "console_clean": not report["console_errors"],
        }
        report["checks"] = checks
        report["ok"] = all(checks.values())
        browser.close()

    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "flavor-report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0 if report["ok"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
