"""赛事阶梯（C 批）真点验收：14 场按五级铺开；报一场出成绩、当天不能报第二场。

跑之前先起预览服务（端口 4193）：
  cd game; npx vite preview --port 4193 --strictPort --host 127.0.0.1
然后：python tools/gate/tourney_probe.py

注意：
  - 面板会缓存，改完状态一定要 `window.__laoyou.refresh()`；
  - 点击用 evaluate 里的 DOM click（面板每秒重渲染，Playwright 的 actionability 会超时）；
  - 本地预览没有 /laoyou-api 代理，AI 预取 404 属设计内，console 里要放过。
"""
import json
import pathlib

from playwright.sync_api import sync_playwright

URL = "http://127.0.0.1:4193/"
OUT = pathlib.Path("game/data/evidence/tourney")
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

        # ① 比赛页：赛事阶梯五级 14 场
        page.evaluate(
            """() => {
                const s = window.__laoyou.state;
                s.cash = 200000;
                s.gradeLevel = 8;
                s.month = 5;   // 六月：城区级也能报
                s.day = 1;
                window.__laoyou.refresh();
            }"""
        )
        dom_click(page, '[data-tab="contest"]', wait=600)

        before = page.evaluate(
            """() => {
                const secs = [...document.querySelectorAll('.sec')];
                const sec = secs.find((x) => x.textContent.includes("赛事阶梯"));
                if (!sec) return null;
                const groups = [...sec.querySelectorAll('.tgroup')];
                return {
                    header: sec.querySelector('.sechd')?.textContent?.trim() ?? "",
                    groups: groups.length,
                    names: groups.map((g) => g.querySelector('.tgname')?.textContent?.trim() ?? ""),
                    buttons: sec.querySelectorAll('[data-act="tourney"]').length,
                    enabled: sec.querySelectorAll('[data-act="tourney"]:not([disabled])').length,
                };
            }"""
        )
        sec_el = page.evaluate(
            """() => {
                const secs = [...document.querySelectorAll('.sec')];
                const sec = secs.find((x) => x.textContent.includes("赛事阶梯"));
                if (sec) sec.scrollIntoView({ block: "center" });
                return !!sec;
            }"""
        )
        page.wait_for_timeout(300)
        page.evaluate("() => document.querySelectorAll('.toast').forEach((t) => t.remove())")
        page.screenshot(path=str(OUT / "01-tourney-ladder.png"))

        # ② 报一场街道办级
        cash0 = page.evaluate("() => window.__laoyou.state.cash")
        dom_click(page, '[data-act="tourney"][data-id="chaoyang_street"]', wait=600)
        after = page.evaluate(
            """() => {
                const s = window.__laoyou.state;
                return {
                    cash: s.cash,
                    played: s.tourneys?.chaoyang_street?.played ?? 0,
                    best: s.tourneys?.chaoyang_street?.best ?? 0,
                    tourneyDay: s.tourneyDay,
                    toasts: [...document.querySelectorAll('.toast')].map((t) => t.textContent.trim()),
                };
            }"""
        )
        page.evaluate("() => document.querySelectorAll('.toast').forEach((t) => t.remove())")
        page.screenshot(path=str(OUT / "02-tourney-result.png"))

        # ③ 同一天再报一场：按钮该被 disabled，行里写明原因
        dom_click(page, '[data-act="tourney"][data-id="zhongshan_night"]', wait=600)
        blocked = page.evaluate(
            """() => {
                const btn = document.querySelector('[data-act="tourney"][data-id="zhongshan_night"]');
                const row = btn ? btn.closest('.lrow') : null;
                return {
                    played: window.__laoyou.state.tourneys?.zhongshan_night?.played ?? 0,
                    disabled: btn ? btn.disabled : null,
                    rowText: row ? row.textContent.replace(/\\s+/g, ' ').trim() : "",
                    toasts: [...document.querySelectorAll('.toast')].map((t) => t.textContent.trim()),
                };
            }"""
        )

        report["steps"] = [
            {"step": "ladder", "found": sec_el, **(before or {})},
            {"step": "first", "cash0": cash0, **after},
            {"step": "blocked", **blocked},
        ]
        ladder_ok = bool(
            before
            and before["groups"] == 5
            and before["buttons"] == 14
            and any("街道办级" in n for n in before["names"])
            and any("全国级" in n for n in before["names"])
        )
        first_ok = after["played"] == 1 and after["best"] >= 1 and any("主持" in t or "名" in t for t in after["toasts"])
        blocked_ok = (
            blocked["played"] == 0
            and blocked["disabled"] is True
            and "今天已经打过" in blocked["rowText"]
        )
        report["ok"] = bool(ladder_ok and first_ok and blocked_ok and not report["console_errors"])

        (OUT / "probe-report.json").write_text(
            json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8"
        )
        browser.close()

    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0 if report["ok"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
