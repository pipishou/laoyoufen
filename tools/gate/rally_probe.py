# -*- coding: utf-8 -*-
"""批 V′ 探针：店员闹情绪时，面板上真的要出现三条路，且点得动。

preview 端口 4237；URL 必须用 localhost（vite preview 只听 IPv6）。
"""
import json
import os
import pathlib

from playwright.sync_api import sync_playwright
from probe_version import SAVE_VERSION

HERE = pathlib.Path(__file__).resolve().parent
REPO = HERE.parent.parent
OUT = REPO / "game" / "data" / "evidence" / "rally"
OUT.mkdir(parents=True, exist_ok=True)
URL = os.environ.get("PW_URL", "http://localhost:4237/")

CHECKS: dict[str, bool] = {}


def note(key: str, ok: bool, info: str = "") -> None:
    CHECKS[key] = bool(ok)
    print(f"[{'OK ' if ok else 'RED'}] {key} {info}")


def boot(pg):
    pg.goto(URL, wait_until="load")
    pg.wait_for_timeout(500)
    pg.click('.sitecard[data-site="alley"]')
    pg.wait_for_selector("[data-chips] .chip")
    pg.click("[data-chips] .chip")
    pg.wait_for_selector("[data-open]")
    pg.click("[data-open]")
    pg.wait_for_selector(".gbtn.ghost")
    pg.click(".gbtn.ghost")
    pg.wait_for_timeout(400)


def open_staff(pg):
    pg.evaluate("() => document.querySelector('[data-tab=\"recipe\"]')?.click()")
    pg.wait_for_timeout(250)
    pg.evaluate("() => document.querySelector('[data-tab2=\"staff\"]')?.click()")
    pg.wait_for_timeout(250)


def main() -> None:
    with sync_playwright() as p:
        browser = p.chromium.launch()
        pg = browser.new_page(viewport={"width": 1440, "height": 900})
        errors: list[str] = []
        pg.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
        boot(pg)

        base = pg.evaluate(
            """() => {
              const s = window.__laoyou.state;
              s.staff.roster = [{
                uid: 'probe-v1', templateId: 'st.aqiang', name: '阿强', role: 'cook',
                skill: 3, wage: 150, fatigue: 0, resting: false, xp: 12,
              }];
              s.cash = 30000;
              s.favor = 40;
              window.__laoyou.refresh();
              return { roster: s.staff.roster.length, rally: s.staff.rally ?? null };
            }"""
        )
        note("staff_injected", base["roster"] == 1, str(base))
        open_staff(pg)
        empty = pg.eval_on_selector_all("[data-rally]", "els => els.length")
        note("no_rally_when_calm", empty == 0, f"blocks={empty}")
        pg.screenshot(path=str(OUT / "01-rally-none.png"))

        # 直接摆出「想走」的状态（日结逻辑由单测覆盖，这里只看界面）
        pg.evaluate(
            """() => {
              const s = window.__laoyou.state;
              s.staff.roster[0].fatigue = 100;
              s.staff.rally = { uid: s.staff.roster[0].uid, at: 0 };
              window.__laoyou.refresh();
            }"""
        )
        pg.wait_for_timeout(250)
        open_staff(pg)
        st = pg.evaluate(
            """() => {
              const s = window.__laoyou.state;
              return {
                rally: s.staff.rally ?? null,
                fatigue: s.staff.roster[0]?.fatigue ?? null,
                rowCount: s.staff.roster.length,
              };
            }"""
        )
        note("rally_opened", bool(st["rally"]), str(st))
        note("fatigue_capped", st["fatigue"] == 100, str(st["fatigue"]))
        note("still_employed", st["rowCount"] == 1, str(st["rowCount"]))

        pg.wait_for_selector("[data-rally]")
        block = pg.eval_on_selector(
            "[data-rally]",
            """el => ({
              head: el.querySelector('.sechd')?.textContent?.trim() ?? '',
              hint: el.querySelector('.sechint')?.textContent?.trim() ?? '',
              rows: [...el.querySelectorAll('.lrow')].map((r) => ({
                name: r.querySelector('.lname')?.textContent?.trim() ?? '',
                meta: r.querySelector('.lmeta')?.textContent?.trim() ?? '',
                disabled: !!r.querySelector('button[disabled]'),
              })),
              buttons: el.querySelectorAll('[data-act="rally"]').length,
              text: el.textContent ?? '',
            })""",
        )
        note("rally_block_shown", block["head"].startswith("阿强"), block["head"])
        note("three_paths", len(block["rows"]) == 3, str(len(block["rows"])))
        note("three_buttons", block["buttons"] == 3, str(block["buttons"]))
        note("paths_named", all(r["name"] for r in block["rows"]), str([r["name"] for r in block["rows"]]))
        note(
            "costs_shown",
            all("｜" in r["meta"] and r["meta"].split("｜")[-1].strip() for r in block["rows"]),
            str([r["meta"] for r in block["rows"]]),
        )
        note("hint_says_today", "明天" in block["text"], block["hint"])
        pg.screenshot(path=str(OUT / "02-rally-open.png"))

        # 卖人情
        before = pg.evaluate("() => ({ favor: Math.round(window.__laoyou.state.favor), cash: window.__laoyou.state.cash })")
        pg.evaluate("""() => {
          document.querySelector('[data-act="rally"][data-id="favor"]')?.click();
        }""")
        pg.wait_for_timeout(300)
        after = pg.evaluate(
            """() => {
              const s = window.__laoyou.state;
              return {
                favor: Math.round(s.favor),
                cash: s.cash,
                rally: s.staff.rally ?? null,
                fatigue: s.staff.roster[0]?.fatigue ?? null,
                events: s.staff.lastEvent ?? '',
              };
            }"""
        )
        note("favor_spent", after["favor"] == before["favor"] - 12, f"{before['favor']} -> {after['favor']}")
        note("cash_untouched", after["cash"] == before["cash"], f"{before['cash']} -> {after['cash']}")
        note("fatigue_relieved", after["fatigue"] == 70, str(after["fatigue"]))
        note("rally_cleared", not after["rally"], str(after["rally"]))
        note("last_event_says_stay", "留下" in after["events"], after["events"])

        open_staff(pg)
        gone = pg.eval_on_selector_all("[data-rally]", "els => els.length")
        note("block_gone_after_choice", gone == 0, f"blocks={gone}")
        pg.screenshot(path=str(OUT / "03-rally-after.png"))

        ver = pg.evaluate(
            """() => {
              for (let i = 0; i < localStorage.length; i++) {
                const k = localStorage.key(i) || '';
                if (!k.startsWith('laoyou.save')) continue;
                try { return JSON.parse(localStorage.getItem(k) || '{}').saveVersion ?? null; } catch { return null; }
              }
              return null;
            }"""
        )
        note("save_version", ver == SAVE_VERSION, str(ver))

        bad = [e for e in errors if "Failed to load resource" not in e and "404" not in e]
        note("console_clean", len(bad) == 0, "; ".join(bad[:3]))

        (OUT / "rally-report.json").write_text(json.dumps(CHECKS, ensure_ascii=False, indent=2), encoding="utf-8")
        print("---")
        print("all true" if all(CHECKS.values()) else "SOME RED")
        browser.close()


if __name__ == "__main__":
    main()
