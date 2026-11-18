"""M4 真点验收：比赛页的落场段、上场、三条命令、六十秒结算。

跑之前先起预览服务（端口 4187）：
  cd game; npx vite preview --port 4187 --strictPort --host 127.0.0.1
然后：python tools/gate/arena_probe.py

注意：擂台是 body 上的全屏浮层，命令按钮在浮层里，可以直接 DOM click；
      面板每秒重渲染，进面板的那几步同样用 evaluate 里的 click。
"""
import json
import pathlib
import sys

from playwright.sync_api import sync_playwright

URL = "http://127.0.0.1:4187/"
OUT = pathlib.Path("game/data/evidence/m4")
OUT.mkdir(parents=True, exist_ok=True)


def dom_click(page, selector: str, wait: int = 320) -> None:
    page.evaluate(
        """(sel) => {
            const el = document.querySelector(sel);
            if (el) el.click();
        }""",
        selector,
    )
    page.wait_for_timeout(wait)


def state_of(page):
    return page.evaluate("() => window.__laoyou.state")


def main() -> int:
    report = {"ok": False, "steps": [], "console_errors": []}
    with sync_playwright() as p:
        browser = p.chromium.launch(channel="msedge")
        page = browser.new_page(viewport={"width": 1440, "height": 900})
        # 本地预览没有反代，AI 取句请求必然 404 —— 那是设计内行为，不算页面错误
        def on_console(msg) -> None:
            if msg.type != "error":
                return
            url = (msg.location or {}).get("url", "")
            if "/laoyou-api/" in url or "favicon" in url:
                return
            report["console_errors"].append(msg.text)

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

        # 注入：6 段（三块场地都进得去）、有钱、有点人情
        page.evaluate(
            """() => {
                const s = window.__laoyou.state;
                s.gradeLevel = 6;
                s.cash = 60000;
                s.favor = 20;
                s.favorTotal = 20;
                s.reputation = 3.6;
                s.totalCustomers = 3000;
            }"""
        )
        page.wait_for_timeout(200)
        dom_click(page, '[data-tab="contest"]')
        page.wait_for_timeout(500)

        panel = page.evaluate(
            """() => {
                const cards = [...document.querySelectorAll('[data-act="startarena"]')];
                const sec = [...document.querySelectorAll(".sec")].find((e) =>
                    (e.querySelector(".sechd") || {}).textContent?.includes("落场"),
                );
                return {
                    cards: cards.length,
                    ids: cards.map((c) => c.getAttribute("data-id")),
                    disabled: cards.filter((c) => c.disabled).length,
                    header: sec ? sec.querySelector(".sechd").textContent.trim() : "",
                    text: sec ? sec.textContent.replace(/\\s+/g, " ").slice(0, 260) : "",
                };
            }"""
        )
        report["steps"].append({"contest_panel": panel})

        page.evaluate(
            """() => {
                document.querySelectorAll(".toast").forEach((e) => e.remove());
                const b = document.querySelector('[data-act="startarena"]');
                if (b) b.scrollIntoView({ block: "center" });
            }"""
        )
        page.wait_for_timeout(200)
        page.screenshot(path=str(OUT / "01-arena-panel.png"))

        # 上场：点菜市口（第一张卡）
        dom_click(page, '[data-act="startarena"][data-id="market"]', 600)
        opened = page.evaluate(
            """() => {
                const s = window.__laoyou.state;
                const w = document.querySelector(".arena");
                return {
                    hasArena: !!s.arena,
                    arenaVisible: w ? !w.hidden : false,
                    title: (document.querySelector("[data-atitle]") || {}).textContent || "",
                    cmds: document.querySelectorAll('[data-act="astrike"]').length,
                    msLeft: s.arena ? s.arena.msLeft : -1,
                };
            }"""
        )
        report["steps"].append({"start": opened})
        page.wait_for_timeout(300)
        page.screenshot(path=str(OUT / "02-arena-live.png"))

        # 出招：三条命令轮流按，直到结算卡出现（擂台是 60 秒真实时间）
        mine0 = state_of(page)["arena"]["mine"] if state_of(page)["arena"] else -1
        result = None
        for i in range(400):
            for cid in ("holler", "show", "pot"):
                page.evaluate(
                    """(id) => {
                        const b = document.querySelector(`[data-act="astrike"][data-id="${id}"]`);
                        if (b && !b.disabled) b.click();
                    }""",
                    cid,
                )
            page.wait_for_timeout(200)
            tag = page.evaluate(
                """() => {
                    const s = window.__laoyou.state;
                    const r = document.querySelector(".aresult");
                    return { arena: !!s.arena, shown: r ? !r.hidden : false,
                             title: (document.querySelector(".aresult .artitle") || {}).textContent || "" };
                }"""
            )
            if tag["shown"]:
                result = tag
                break
        mine_after = result is not None
        report["steps"].append({"fight": {"mine_start": mine0, "settled": mine_after, "title": (result or {}).get("title", "")}})
        page.wait_for_timeout(300)
        page.screenshot(path=str(OUT / "03-arena-result.png"))

        final = page.evaluate(
            """() => {
                const s = window.__laoyou.state;
                return {
                    arena: s.arena,
                    runs: s.tally.arenaRuns,
                    wins: s.tally.arenaWins,
                    reputation: Number(s.reputation.toFixed(3)),
                    cash: s.cash,
                    resultText: (document.querySelector(".aresult .arline") || {}).textContent || "",
                };
            }"""
        )
        report["steps"].append({"final": final})

        # 键盘：Esc 收摊（先把结算卡再确认一次——这一局已经结束，Esc 只是关浮层）
        page.keyboard.press("Escape")
        page.wait_for_timeout(400)
        after_esc = page.evaluate(
            """() => {
                const w = document.querySelector(".arena");
                return { visible: w ? !w.hidden : false };
            }"""
        )
        report["steps"].append({"esc": after_esc})

        browser.close()

    s0 = report["steps"][0]["contest_panel"]
    st = report["steps"][1]["start"]
    fight = report["steps"][2]["fight"]
    final = report["steps"][3]["final"]
    report["ok"] = (
        s0["cards"] == 3
        and s0["ids"] == ["market", "river", "ring"]
        and s0["header"].startswith("落场 ·")
        and st["hasArena"]
        and st["arenaVisible"]
        and st["cmds"] == 3
        and fight["settled"]
        and final["arena"] is None
        and final["runs"] == 1
        and not report["steps"][4]["esc"]["visible"]
        and not report["console_errors"]
    )
    (OUT / "probe-report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0 if report["ok"] else 1


if __name__ == "__main__":
    sys.exit(main())
