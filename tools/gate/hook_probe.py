"""二轮试玩 F1/F2/F3 真点验收。

验三件事：
  F1 次日仍然算得清流失 —— 点过「明天继续」后（`dayReport` 清空、计数归零），
     店铺页的「← 现在最缺」红标仍然亮得起来（病灶曾经让这里恒为 0）。
  F2 产能钩点名的是能加座的扩建，不是只省钱的粉篓。
  F3 时间前缀只在 CSS 里说一次 —— 正文里不许再出现「明天」。

跑之前先起预览服务（端口 4194）：
  cd game; npx vite preview --port 4194 --strictPort --host 127.0.0.1
然后：python tools/gate/hook_probe.py

注意：
  - 面板会缓存，改完状态一定要 `window.__laoyou.refresh()`；
  - `eye_gate.py shot --slug f1` 会清空 game/data/evidence/f1，要先跑它再跑本脚本；
  - 本地预览没有 /laoyou-api 代理，AI 预取 404 属设计内，console 里要放过。
"""
import json
import pathlib

from playwright.sync_api import sync_playwright

URL = "http://127.0.0.1:4194/"
OUT = pathlib.Path("game/data/evidence/f1")
OUT.mkdir(parents=True, exist_ok=True)

# 「卡在灶上」那一档的本地池（见 game/src/ai/lines.ts 的 HOOK_VOICE["capacity:stove"]）。
# 探针要能分辨「副行说的是不是主句那件事」，只能把这几句抄一份当标尺 ——
# 改文案时记得同步这里，否则 voice_matches_kind 会红。
# 三轮试玩 ②：主句点灶、副行说「桌椅不够」是上一版最大的毛病，所以这里只认灶那四句。
CAPACITY_VOICE = {
    "火不旺，手再快也是白站。",
    "火眼通利了，粉才出得快。",
    "锅底那点火，最耽误人。",
    "灶是店的心口，心口不畅，什么都慢。",
}


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

        # 过建店 → 收引导
        dom_click(page, '.sitecard[data-site="alley"]')
        dom_click(page, "[data-chips] .chip")
        dom_click(page, "[data-open]")
        page.wait_for_timeout(400)
        dom_click(page, ".gbtn.ghost")
        page.wait_for_timeout(300)

        dom_click(page, '[data-tab="shop"]', wait=450)

        # ① F1：造一个「已经点过明天继续」的次日清晨
        #    昨天 60 走 / 40 吃；今天还没客人；座位 2（街边摊那种）
        page.evaluate(
            """() => {
                const s = window.__laoyou.state;
                s.days = [{
                    month: 0, day: 1, revenue: 620, served: 40, lost: 60,
                    avgSat: 55, price: 9, taste: 60, cash: 20000,
                }];
                s.dayReport = null;
                s.flow.lostToday = 0;
                s.flow.servedToday = 0;
                s.cash = 200000;
                s.venue.seats = 2;
                s.gradeLevel = 0;
                window.__laoyou.refresh();
            }"""
        )
        page.wait_for_timeout(500)

        step1 = page.evaluate(
            """() => {
                const hot = [...document.querySelectorAll('.sechd.hot')];
                return {
                    hot: hot.length,
                    titles: hot.map((x) => x.textContent.trim().slice(0, 24)),
                    hasBadge: hot.some((x) => getComputedStyle(x, '::after').content.includes('最缺')),
                    gearHot: hot.some((x) => x.textContent.includes('家当')),
                    effTags: document.querySelectorAll('.tag2.hot2').length,
                };
            }"""
        )
        step1["step"] = "next_morning_red_mark"
        report["steps"].append(step1)

        page.evaluate(
            """() => {
                const el = [...document.querySelectorAll('.sechd.hot')][0];
                if (el) el.scrollIntoView({ block: "center" });
                document.querySelectorAll(".toast").forEach((t) => t.remove());
            }"""
        )
        page.wait_for_timeout(200)
        page.screenshot(path=str(OUT / "01-red-mark.png"))

        # ② F2/F3：把打烊单造出来，看它点名的是哪一件、正文说不说「明天」
        page.evaluate(
            """() => {
                const s = window.__laoyou.state;
                s.phase = "closing";
                s.dayReport = {
                    month: 0, day: 1, revenue: 620, served: 40, lost: 60,
                    avgSat: 55, price: 9, taste: 60, cash: 200000,
                };
                window.__laoyou.refresh();
            }"""
        )
        page.wait_for_timeout(600)

        step2 = page.evaluate(
            """() => {
                const main = document.querySelector('[data-hook-main]');
                const why = document.querySelector('[data-hook-why]');
                const line = document.querySelector('[data-hook-line]');
                const hook = document.querySelector('[data-day-hook]');
                return {
                    main: main ? main.textContent : null,
                    why: why ? why.textContent : null,
                    line: line ? line.textContent : null,
                    hidden: hook ? hook.hidden : null,
                    bad: hook ? hook.classList.contains('bad') : null,
                    kind: hook ? hook.dataset.hookKind : null,
                };
            }"""
        )
        step2["step"] = "closing_hook"
        report["steps"].append(step2)

        text = (step2.get("main") or "") + (step2.get("line") or "")
        # 试玩 11-20 第 ②③ 条：两口座 + 一口灶时，最划算的是灶（¥1,500，一天多十碗），
        # 不是一万二的隔墙 —— 扩座在灶还慢的时候一点用都没有（见 sim/bottleneck.ts）。
        expect_stove = "猛火灶" in text
        no_wall = "打通隔墙" not in text
        no_cost_item = "粉篓" not in text
        no_tomorrow_in_body = "明天" not in (step2.get("main") or "")
        why_says_lost = "走了 60 位" in (step2.get("why") or "")

        page.evaluate(
            """() => {
                const hook = document.querySelector('[data-day-hook]');
                if (hook) hook.scrollIntoView({ block: "center" });
                document.querySelectorAll(".toast").forEach((t) => t.remove());
            }"""
        )
        page.wait_for_timeout(200)
        page.screenshot(path=str(OUT / "02-hook-copy.png"))

        checks = {
            "red_mark_on_next_morning": step1["hot"] >= 1,
            # 试玩二轮 F7：产能吃紧时，「家当」这一段也要标红，并给效率件打「省事」
            "gear_section_hot": step1.get("gearHot") is True,
            "efficiency_tags": step1.get("effTags") == 6,
            "badge_text": bool(step1["hasBadge"]),
            "hook_is_capacity": step2.get("kind") == "capacity",
            "hook_names_stove": expect_stove,
            "hook_skips_wall": no_wall,
            "hook_why_shows_lost": why_says_lost,
            "hook_skips_cost_item": no_cost_item,
            "no_tomorrow_in_body": no_tomorrow_in_body,
            "hook_visible": step2.get("hidden") is False,
            "hook_marked_bad": step2.get("bad") is True,
            # 试玩二轮 F5：副行必须来自「加灶扩座」那一档的池，
            # 不能再说街面/家当的事（否则是在解释另一件事）。
            "voice_matches_kind": (step2.get("line") or "") in CAPACITY_VOICE,
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
