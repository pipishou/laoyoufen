"""像素化真点验收（P57 / P58）：店内小图画出客人与店员、落场出招有动作帧。

跑之前先起预览服务（端口 4191）：
  cd game; npx vite preview --port 4191 --strictPort --host 127.0.0.1
然后：python tools/gate/pixel_probe.py

注意：面板每秒重渲染，按钮一律用 page.evaluate 里的 DOM click；
      动作帧只有 460ms，所以点完立刻读 className、立刻截图，别加等待。
"""
import json
import pathlib

from playwright.sync_api import sync_playwright

URL = "http://127.0.0.1:4191/"
OUT = pathlib.Path("game/data/evidence/px")
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
            # 本地预览没有 /laoyou-api 代理，AI 预取必然 404 —— 那是设计内的回落，不算错
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

        # 注入：几件家当、两个员工、五个排队的人
        page.evaluate(
            """() => {
                const s = window.__laoyou.state;
                s.cash = 200000;
                s.gradeLevel = 8;
                s.gear = ["plastic_stool", "wall_fan", "wash_sink", "hood", "freezer", "bamboo_chair"];
                s.staff.roster = [
                  { uid: "u1", templateId: "t1", name: "阿强", role: "cook", skill: 3, wage: 4200, fatigue: 10, resting: false },
                  { uid: "u2", templateId: "t2", name: "阿珍", role: "server", skill: 2, wage: 3600, fatigue: 12, resting: false },
                ];
                s.flow.customers = Array.from({ length: 5 }, (_, i) => ({
                  id: i + 1, archetypeId: "worker", dishId: s.menu[0].id, status: "waiting",
                  elapsed: 0, waited: i, patience: 40, satisfaction: -1, regular: i === 0,
                }));
                window.__laoyou.refresh();
            }"""
        )
        page.wait_for_timeout(400)

        # ① 店内小图：96 格、家当、客人、店员
        dom_click(page, "[data-tab=shop]")
        page.wait_for_timeout(500)
        page.evaluate(
            """() => {
                const t = document.querySelector(".toast");
                if (t) t.remove();
                const m = document.querySelector(".shopmap");
                if (m) m.scrollIntoView({ block: "center" });
            }"""
        )
        page.wait_for_timeout(250)
        cells = page.evaluate(
            """() => {
                const m = document.querySelector(".shopmap");
                if (!m) return null;
                const cls = (sel) => m.querySelectorAll(sel).length;
                return {
                  total: m.querySelectorAll("i").length,
                  cust: cls(".sm-cust"),
                  staff: cls(".sm-staff"),
                  gear: m.querySelectorAll("i:not(.sm-e):not(.sm-cust):not(.sm-staff)").length,
                  sum: (document.querySelector("[data-shopmap-sum]") || {}).textContent || "",
                  legend: document.querySelectorAll(".smlegend .smk").length,
                };
            }"""
        )
        report["steps"].append({"step": "shop_map", **(cells or {})})
        # 店里的人得是动的：静态色块玩家会以为卡住了
        anim = page.evaluate(
            """() => {
                const c = document.querySelector(".shopmap .sm-cust");
                const s = document.querySelector(".shopmap .sm-staff");
                const name = (el) => el ? getComputedStyle(el, "::after").animationName : null;
                return { cust: name(c), staff: name(s) };
            }"""
        )
        report["steps"].append({"step": "shop_map_motion", **(anim or {})})
        page.screenshot(path=str(OUT / "06-shop-map.png"))

        # ② 落场：出招后那一刻本人带 act-* 类，对面挨重了带 knock
        dom_click(page, "[data-tab=contest]")
        page.wait_for_timeout(500)
        dom_click(page, '[data-act="startarena"][data-id="market"]')
        page.wait_for_timeout(600)
        dom_click(page, '[data-act="astrike"][data-id="pot"]', wait=0)
        act = page.evaluate(
            """() => {
                const me = document.querySelector("[data-arunnerme]");
                const rival = document.querySelector("[data-arunnerrival]");
                return {
                  me: me ? me.className : null,
                  rival: rival ? rival.className : null,
                  fig: !!document.querySelector("[data-arunnerme] .fig"),
                };
            }"""
        )
        report["steps"].append({"step": "arena_act", **act})
        page.screenshot(path=str(OUT / "07-arena-act.png"))
        page.wait_for_timeout(700)
        after = page.evaluate(
            """() => {
                const me = document.querySelector("[data-arunnerme]");
                return me ? me.className : null;
            }"""
        )
        report["steps"].append({"step": "arena_act_cleared", "me": after})

        report["console_errors"] = [e for e in report["console_errors"] if "favicon" not in e]
        s1 = report["steps"][0]
        sm = report["steps"][1]
        s2 = report["steps"][2]
        report["ok"] = bool(
            s1.get("total") == 96
            and s1.get("cust") == 5
            and s1.get("staff") == 2
            and s1.get("gear") == 6
            and "排队 5 人" in s1.get("sum", "")
            and s1.get("legend") == 7
            and sm.get("cust") == "smbob"
            and sm.get("staff") == "smbob"
            and s2.get("fig") is True
            and "act-pot" in (s2.get("me") or "")
            and "act-" not in (report["steps"][3].get("me") or "")
            and not report["console_errors"]
        )
        browser.close()

    (OUT / "probe-report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0 if report["ok"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
