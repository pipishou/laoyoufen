"""成就（B 批）真点验收：图鉴页 30 枚按六组铺开；达成时弹一句「成就 · …」。

跑之前先起预览服务（端口 4192）：
  cd game; npx vite preview --port 4192 --strictPort --host 127.0.0.1
然后：python tools/gate/trophy_probe.py

注意：
  - 面板会缓存，改完状态一定要 `window.__laoyou.refresh()`；
  - toast 只挂几秒，断言完立刻截图；
  - 本地预览没有 /laoyou-api 代理，AI 预取 404 属设计内，console 里要放过。
"""
import json
import pathlib

from playwright.sync_api import sync_playwright
from probe_version import SAVE_VERSION

URL = "http://127.0.0.1:4192/"
OUT = pathlib.Path("game/data/evidence/trophy")
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

        # 过建店
        dom_click(page, '.sitecard[data-site="alley"]')
        dom_click(page, "[data-chips] .chip")
        dom_click(page, "[data-open]")
        page.wait_for_timeout(400)
        dom_click(page, ".gbtn.ghost")
        page.wait_for_timeout(300)

        # ① 图鉴页：六组、三十张卡、一张都没亮
        dom_click(page, '[data-tab="collection"]', wait=500)
        before = page.evaluate(
            """() => {
                const secs = [...document.querySelectorAll('.sec')];
                const sec = secs.find((x) => x.textContent.includes("成就"));
                if (!sec) return null;
                return {
                    groups: sec.querySelectorAll(".tgroup").length,
                    cards: sec.querySelectorAll(".tcard").length,
                    on: sec.querySelectorAll(".tcard.on").length,
                    header: sec.querySelector(".sechd").textContent.slice(0, 40),
                    progress: [...sec.querySelectorAll(".tcard .tprog")].slice(0, 3).map((x) => x.textContent),
                };
            }"""
        )
        page.evaluate("""() => {
            const sec = [...document.querySelectorAll('.sec')].find((x) => x.textContent.includes("成就"));
            if (sec) sec.scrollIntoView({block: "center"});
        }""")
        page.wait_for_timeout(300)
        page.evaluate("() => document.querySelectorAll('.toast').forEach((t) => t.remove())")
        page.screenshot(path=str(OUT / "01-collection-trophies.png"))
        report["steps"].append({"step": "collection", **(before or {})})

        # ② 注入达标条件 → 手动跑一次判定（正常时机是日结）
        got = page.evaluate(
            """() => {
                const s = window.__laoyou.state;
                s.tally.bowls = 3;
                s.totalCustomers = 130;
                s.gradeLevel = 1;
                s.gear = ["plastic_stool"];
                s.streets = ["lane_lamp"];
                const n = window.__laoyou.trophies();
                window.__laoyou.refresh();
                // 正常时机是下一分钟推进；这里手动跑一次反馈消费
                window.__laoyou.feedback();
                return { hit: n, trophies: s.trophies.length, favor: s.favor, queued: s.pendingTrophies.length };
            }"""
        )
        page.wait_for_timeout(400)
        toast = page.evaluate(
            """() => {
                const t = [...document.querySelectorAll('.toast')].map((x) => x.textContent);
                return t;
            }"""
        )
        page.screenshot(path=str(OUT / "02-trophy-toast.png"))
        report["steps"].append({"step": "earn", **got, "toast": toast})

        # ③ 图鉴页再看：亮起来的卡
        dom_click(page, '[data-tab="collection"]', wait=500)
        after = page.evaluate(
            """() => {
                const sec = [...document.querySelectorAll('.sec')].find((x) => x.textContent.includes("成就"));
                if (!sec) return null;
                return {
                    on: sec.querySelectorAll(".tcard.on").length,
                    header: sec.querySelector(".sechd").textContent.slice(0, 40),
                    names: [...sec.querySelectorAll(".tcard.on")].map((x) => x.textContent.replace(/\\s+/g, " ").trim()),
                };
            }"""
        )
        page.evaluate("""() => {
            const sec = [...document.querySelectorAll('.sec')].find((x) => x.textContent.includes("成就"));
            if (sec) sec.scrollIntoView({block: "center"});
        }""")
        page.wait_for_timeout(300)
        page.evaluate("() => document.querySelectorAll('.toast').forEach((t) => t.remove())")
        page.screenshot(path=str(OUT / "03-collection-earned.png"))
        report["steps"].append({"step": "after", **(after or {})})

        snap = page.evaluate("() => ({ version: window.__laoyou.state.saveVersion })")
        report["saveVersion"] = snap["version"]

        ok = (
            before is not None
            and before["groups"] == 6
            and before["cards"] == 30
            and before["on"] == 0
            and "0 / 30" in before["header"]
            and got["hit"] >= 5
            and any("成就 ·" in t for t in toast)
            and after is not None
            and after["on"] == got["trophies"]
            and report["saveVersion"] == SAVE_VERSION
            and not report["console_errors"]
        )
        report["ok"] = ok
        browser.close()

    (OUT / "probe-report.json").write_text(
        json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0 if report["ok"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
