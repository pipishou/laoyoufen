"""S5 扩建 + S2 招人验收：真点买扩建、真点雇人，看座位/灶/日上限与在职人数是否跟着变。

用法（先 npm run build，再在仓库根跑；另开一个 `npx vite preview --port 4173`）：
    python tools/gate/expand_probe.py
"""

from __future__ import annotations

import json
import pathlib
import sys

from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parents[2]
URL = "http://127.0.0.1:4173/"
SHOT_DIR = ROOT / "game" / "data" / "evidence" / "s5s2"

OUT: dict[str, object] = {}


def dismiss_events(page, rounds: int) -> None:
    """把会停表的东西都点掉：日结单 → 次日准备态 → 再点开门；事件弹窗点第一个选项。

    16 倍速下一天只要 45 秒真实时间，不清这三样，时间一直是停的。
    """
    for _ in range(rounds):
        page.evaluate(
            """() => {
              const next = document.querySelector('.dayreport [data-day-next]');
              if (next) { next.click(); return; }
              const s = window.__laoyou && window.__laoyou.state;
              if (s && s.phase === 'prep') {
                const open = document.querySelector('[data-openpill]');
                if (open && !open.disabled) { open.click(); return; }
              }
              const m = document.querySelector('.eventmodal');
              if (!m) return;
              const b = m.querySelector('button');
              if (b) b.click();
            }"""
        )
        page.wait_for_timeout(500)


def main() -> int:
    SHOT_DIR.mkdir(parents=True, exist_ok=True)
    with sync_playwright() as p:
        browser = p.chromium.launch(channel="msedge", headless=True, args=["--disable-extensions"])
        page = browser.new_page(viewport={"width": 1440, "height": 900})
        errors: list[str] = []
        page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
        page.goto(URL, wait_until="load", timeout=30000)
        page.evaluate("() => localStorage.clear()")
        page.reload(wait_until="load")
        page.wait_for_timeout(1600)

        # 建店：巷内小店 + 第一个候选名 → 开张 → 开门
        page.wait_for_selector('.sitecard[data-site="alley"]', timeout=20000)
        page.click('.sitecard[data-site="alley"]')
        page.click("[data-chips] .chip")
        page.click("[data-open]")
        page.wait_for_timeout(700)
        page.click("[data-openpill]")
        page.wait_for_timeout(400)

        start = page.evaluate(
            """() => {
              const s = window.__laoyou.state;
              return { cash: s.cash, seats: s.venue.seats, stoves: s.venue.stoves,
                       capacity: s.capacity, expansion: s.venue.expansion,
                       total: s.totalCustomers, slots: null };
            }"""
        )
        OUT["start"] = start

        # 攒客流到「第一个员工愿意来」的门槛（STAFF_UNLOCK[0] = 300）。
        # 这里直接把累计接待数抬到 320，不靠跑模拟器：本探针验的是 S5/S2 的 UI 与扣费链路，
        # 客流增长本身由 probe:win / probe:standin 负责。跑模拟器那版实测「16 倍速下时间会停」，
        # 已单独记入 lead 里的观察项。
        page.click('button.spd[data-speed="16"]')
        dismiss_events(page, 3)
        trace = page.evaluate(
            """() => {
              const s = window.__laoyou.state;
              const before = { phase: s.phase, day: s.day, minute: s.flow.minuteOfDay, total: s.totalCustomers };
              s.totalCustomers = 320;
              return before;
            }"""
        )
        OUT["trace_before_inject"] = trace
        page.wait_for_timeout(900)
        OUT["customers_before_buy"] = page.evaluate("() => window.__laoyou.state.totalCustomers")

        # S5：先把事件弹窗/日结单清干净（它们会拦 pointer events），再真点店铺页签
        for _ in range(6):
            left = page.evaluate(
                """() => {
                  const m = document.querySelector('.eventmodal');
                  if (m) { const b = m.querySelector('button'); if (b) b.click(); }
                  const d = document.querySelector('.dayreport [data-day-next]');
                  if (d) d.click();
                  return { event: !!document.querySelector('.eventmodal'),
                           report: !!document.querySelector('.dayreport') };
                }"""
            )
            if not left["event"] and not left["report"]:
                break
            page.wait_for_timeout(400)
        page.click('[data-tab="shop"]', timeout=8000)
        page.wait_for_timeout(900)
        has = page.evaluate(
            """() => Array.from(document.querySelectorAll('.sechd'))
                 .some((e) => e.textContent.includes('店面'))"""
        )
        OUT["panel_ready"] = has
        page.screenshot(path=str(SHOT_DIR / "01-shop-before.png"))
        panel_before = page.evaluate(
            """() => {
              const hs = Array.from(document.querySelectorAll('.sechd'));
              const h = hs.find((e) => e.textContent.includes('店面'));
              return h ? h.textContent.trim() : '';
            }"""
        )
        OUT["panel_before"] = panel_before

        # 面板每秒重渲染（innerHTML 重写），Playwright 的 actionability 等待会因节点被换掉而超时，
        # 所以用 DOM click：事件仍是真实用户点击，只是不走可见性等待。
        exp_clicked = page.evaluate(
            """() => {
              const b = document.querySelector('button[data-act="buildexpand"]');
              if (!b) return 'missing';
              if (b.disabled) return 'disabled';
              b.click();
              return 'clicked';
            }"""
        )
        OUT["expand_click"] = exp_clicked
        page.wait_for_timeout(700)
        after_expand = page.evaluate(
            """() => {
              const s = window.__laoyou.state;
              const hs = Array.from(document.querySelectorAll('.sechd'));
              const h = hs.find((e) => e.textContent.includes('店面'));
              return { cash: s.cash, seats: s.venue.seats, stoves: s.venue.stoves,
                       capacity: s.capacity, expansion: s.venue.expansion,
                       panel: h ? h.textContent.trim() : '',
                       caprow: document.querySelector('[data-caprow]')?.textContent ?? '' };
            }"""
        )
        OUT["after_expand"] = after_expand
        page.screenshot(path=str(SHOT_DIR / "02-after-expand.png"))

        # S2：面板内页签切到「员工」（底部 [data-tab] 被面罩挡住，面板内是 [data-tab2]）
        page.evaluate(
            """() => {
              document.querySelector('.mtabs [data-tab2="staff"]')?.click();
            }"""
        )
        page.wait_for_timeout(700)
        page.screenshot(path=str(SHOT_DIR / "03-staff-before.png"))
        staff_before = page.evaluate(
            """() => {
              const s = window.__laoyou.state;
              const hs = Array.from(document.querySelectorAll('.sechd'));
              const h = hs.find((e) => e.textContent.includes('在职'));
              return { roster: s.staff.roster.length, cands: s.staff.candidates.map((c) => c.role),
                       line: h ? h.textContent.trim() : '',
                       hint: document.querySelector('.hint')?.textContent ?? '' };
            }"""
        )
        OUT["staff_before"] = staff_before

        hired = page.evaluate(
            """() => {
              const btns = Array.from(document.querySelectorAll('button[data-act="hire"]'));
              const cands = window.__laoyou.state.staff.candidates;
              const pick = (role) => btns.find((b) => {
                const c = cands.find((x) => x.uid === b.getAttribute('data-id'));
                return c && (!role || c.role === role) && !b.disabled;
              });
              // 候选是每天随机的，优先雇掌勺（它才涨产能），没有就雇任意一个先验链路
              const b = pick('cook') || pick(null);
              if (!b) return null;
              const id = b.getAttribute('data-id');
              b.click();
              return id;
            }"""
        )
        OUT["hired_uid"] = hired
        page.wait_for_timeout(700)
        after_hire = page.evaluate(
            """() => {
              const s = window.__laoyou.state;
              const hs = Array.from(document.querySelectorAll('.sechd'));
              const h = hs.find((e) => e.textContent.includes('在职'));
              const serve = document.querySelector('[data-caprow]')?.textContent ?? '';
              return { cash: s.cash, roster: s.staff.roster.length, line: h ? h.textContent.trim() : '',
                       caprow: serve, serveText: serve };
            }"""
        )
        OUT["after_hire"] = after_hire
        page.screenshot(path=str(SHOT_DIR / "04-after-hire.png"))

        OUT["console_error_count"] = len(errors)
        OUT["console_errors"] = errors[:5]
        browser.close()

    st = OUT["start"]  # type: ignore[index]
    ae = OUT["after_expand"]  # type: ignore[index]
    ah = OUT["after_hire"]  # type: ignore[index]
    spent_expand = int(st["cash"]) - int(ae["cash"])
    ok = (
        ae["seats"] == st["seats"] + 2
        and ae["capacity"] == st["capacity"] + 60
        and ae["expansion"] == 1
        and "座位 6" in ae["panel"]
        and str(st["capacity"] + 60) in ae["caprow"]
        and ah["roster"] == 1
        and "在职 1/1" in ah["line"]
        and OUT["console_error_count"] == 0
        # 期间仍在营业有进账，所以净支出只会比 12,000 小
        and 0 < spent_expand <= 12_000
    )
    OUT["expand_net_spend"] = spent_expand
    OUT["ok"] = ok
    (SHOT_DIR / "probe.json").write_text(json.dumps(OUT, ensure_ascii=False, indent=1), encoding="utf-8")
    sys.stdout.reconfigure(encoding="utf-8")
    print(json.dumps(OUT, ensure_ascii=False, indent=1))
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
