"""D 批（家当搭配）真点验收。

验四件事：
  1. 店铺页有「搭配 · 0/8 组」这一段，且八组全列出来；
  2. 买一件（塑料矮凳）时那组标「差 1 件」，不是「凑齐了」；
  3. 再买一件（竹躺椅）后，「凳子管够」变成「凑齐了」，抬头变「1/8 组」；
  4. 搭配段落里的件名是店里真有的家当，不出现开罗的组合名。

跑之前先起预览服务（端口 4195）：
  cd game; npx vite preview --port 4195 --strictPort --host 127.0.0.1
然后：python tools/gate/combo_probe.py

注意：
  - `eye_gate.py shot --slug combo` 会清空 game/data/evidence/combo，要先跑它再跑本脚本；
  - 本地预览没有 /laoyou-api 代理，AI 预取 404 属设计内，console 里要放过。
"""
import json
import pathlib

from playwright.sync_api import sync_playwright

URL = "http://127.0.0.1:4195/"
OUT = pathlib.Path("game/data/evidence/combo")
OUT.mkdir(parents=True, exist_ok=True)


def dom_click(page, selector: str, wait: int = 320) -> None:
    page.evaluate(
        """(sel) => {
            const el = document.querySelector(sel);
            if (el) el.click();
        }""",
        selector,
    )
    if wait:
        page.wait_for_timeout(wait)


def read_combo(page) -> dict:
    return page.evaluate(
        """() => {
            const hd = [...document.querySelectorAll('.sechd')]
                .find((x) => x.textContent.includes('搭配'));
            if (!hd) return { header: null };
            const kids = [...hd.parentElement.children];
            const from = kids.indexOf(hd) + 1;
            const rows = kids.slice(from).filter((x) => x.classList.contains('lrow'));
            return {
                header: hd.textContent.trim().replace(/\\s+/g, ' '),
                rows: rows.map((r) => ({
                    name: (r.querySelector('.lname') || {}).textContent || '',
                    tag: (r.querySelector('.tag2') || {}).textContent || '',
                    active: !r.classList.contains('locked'),
                })),
            };
        }"""
    )


def main() -> int:
    report = {"ok": False, "steps": [], "console_errors": []}
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

        dom_click(page, '.sitecard[data-site="alley"]')
        dom_click(page, "[data-chips] .chip")
        dom_click(page, "[data-open]")
        page.wait_for_timeout(400)
        dom_click(page, ".gbtn.ghost")
        page.wait_for_timeout(300)

        dom_click(page, '[data-tab="shop"]', wait=450)
        page.evaluate("() => { window.__laoyou.state.cash = 200000; window.__laoyou.refresh(); }")
        page.wait_for_timeout(400)

        none = read_combo(page)
        none["step"] = "no_combo"
        report["steps"].append(none)

        page.evaluate(
            """() => {
                const hd = [...document.querySelectorAll('.sechd')]
                    .find((x) => x.textContent.includes('搭配'));
                if (hd) hd.scrollIntoView({ block: "center" });
                document.querySelectorAll(".toast").forEach((t) => t.remove());
            }"""
        )
        page.wait_for_timeout(200)
        page.screenshot(path=str(OUT / "01-combo-none.png"))

        # 只买一件
        dom_click(page, '[data-act="buygear"][data-id="plastic_stool"]', wait=420)
        half = read_combo(page)
        half["step"] = "one_of_pair"
        report["steps"].append(half)

        # 再买一件，凑齐「凳子管够」
        dom_click(page, '[data-act="buygear"][data-id="bamboo_chair"]', wait=420)
        done = read_combo(page)
        done["step"] = "pair_done"
        report["steps"].append(done)

        page.evaluate(
            """() => {
                const hd = [...document.querySelectorAll('.sechd')]
                    .find((x) => x.textContent.includes('搭配'));
                if (hd) hd.scrollIntoView({ block: "center" });
                document.querySelectorAll(".toast").forEach((t) => t.remove());
            }"""
        )
        page.wait_for_timeout(200)
        page.screenshot(path=str(OUT / "02-combo-one.png"))

        def row(step, name):
            for r in step.get("rows") or []:
                if r["name"].startswith(name):
                    return r
            return None

        stools_half = row(half, "凳子管够")
        stools_done = row(done, "凳子管够")
        all_text = json.dumps(done, ensure_ascii=False)

        checks = {
            "section_present": bool(none.get("header")),
            "eight_rows": len(none.get("rows") or []) == 8,
            "starts_at_zero": "0/8" in (none.get("header") or ""),
            "half_marked_one_left": bool(stools_half) and stools_half["tag"].strip() == "差 1 件",
            "pair_marked_done": bool(stools_done) and stools_done["tag"].strip() == "凑齐了",
            "pair_row_active": bool(stools_done) and stools_done["active"] is True,
            "header_after_pair": "1/8" in (done.get("header") or ""),
            "no_kairo_combo_name": "Corner" not in all_text and "Style" not in all_text,
        }
        report["checks"] = checks
        report["ok"] = all(checks.values()) and not report["console_errors"]
        report["saveVersion"] = page.evaluate("() => window.__laoyou.state.saveVersion")

        browser.close()

    (OUT / "probe-report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0 if report["ok"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
