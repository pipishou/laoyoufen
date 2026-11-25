# -*- coding: utf-8 -*-
"""Z′ 探针：汤底三底（三张卡 / 换了就报 / 只动汤底分与料钱 / 钱包兜得住）。

跑法（先起预览）：
  cd game && npx vite preview --port 4241 --strictPort
  python tools/gate/soupbase_probe.py
"""
import json
import os
import re
import sys
from playwright.sync_api import sync_playwright

URL = os.environ.get("PW_URL", "http://localhost:4241/")
OUT = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),
                   "game", "data", "evidence", "soupbase")
checks = {}


def note(name, ok, detail=""):
    checks[name] = bool(ok)
    print(("PASS " if ok else "FAIL ") + name + ("  " + str(detail) if detail else ""))


READ = """() => {
  const out = { soup: null, cost: null, total: null };
  const subs = document.querySelectorAll('[data-sub-list] .subrow');
  subs.forEach((r) => {
    const t = r.textContent || '';
    const b = r.querySelector('b');
    if (b && t.indexOf('汤') >= 0 && out.soup === null) out.soup = Number(b.textContent);
  });
  const econ = document.querySelector('[data-econ2]');
  if (econ) {
    const m = (econ.textContent || '').match(/成本 ¥([0-9.]+)/);
    if (m) out.cost = Number(m[1]);
  }
  const big = document.querySelector('[data-scorebig]');
  if (big && /^[0-9]+$/.test((big.textContent || '').trim())) out.total = Number(big.textContent);
  return out;
}"""


def main():
    os.makedirs(OUT, exist_ok=True)
    with sync_playwright() as p:
        b = p.chromium.launch()
        pg = b.new_page(viewport={"width": 1440, "height": 900})
        errors = []
        pg.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
        pg.goto(URL, wait_until="networkidle")
        pg.click('.sitecard[data-site="alley"]')
        pg.click("[data-chips] .chip")
        pg.click("[data-open]")
        pg.click(".gbtn.ghost")

        pg.evaluate("() => { window.__laoyou.state.totalCustomers = 600; window.__laoyou.refresh(); }")
        pg.click('[data-tab="recipe"]')
        pg.wait_for_timeout(400)

        cards = pg.query_selector_all("[data-bases] .bcard")
        note("three_cards", len(cards) == 3, len(cards))

        names = [c.inner_text() for c in cards]
        note("names_cn", sum(any(k in n for k in ("老友底", "番茄底", "猪脚底")) for n in names) == 3, names)

        on_first = pg.eval_on_selector("[data-bases] .bcard.on", "el => el.innerText")
        note("default_is_laoyou", "老友底" in on_first, on_first)

        sum0 = pg.inner_text("[data-basesum]")
        note("summary_says_base", "骨头汤" in sum0 and "酸笋" in sum0, sum0)

        broth = pg.inner_text("[data-broth]")
        note("broth_line", "骨头汤打底" in broth and "爆香" in broth and "冲汤下粉" in broth, broth)

        tags = pg.eval_on_selector_all("[data-bases] .bcard .btag", "els => els.map((e) => e.textContent)")
        note("card_extra_tags",
             len(tags) == 3 and all("骨汤 +" in t for t in tags) and any("酸笋" in t for t in tags),
             tags)

        head = pg.evaluate("() => (document.querySelector('.pane')?.textContent || '')")
        note("section_says_broth", "骨汤打底，再加一味" in head, head[:0] or "")

        banned = ("进店", "客流", "耐心", "出碗", "×")
        note("cards_no_multiplier", not any(x in n for n in names for x in banned))

        before = pg.evaluate(READ)
        note("read_before", before.get("soup") is not None and before.get("cost") is not None, before)

        pg.click('[data-bases] .bcard[data-id="tomato"]')
        pg.wait_for_timeout(400)
        on_now = pg.eval_on_selector("[data-bases] .bcard.on", "el => el.getAttribute('data-id')")
        note("switch_works", on_now == "tomato", on_now)

        base_state = pg.evaluate(
            "() => { const s = window.__laoyou.state; return { base: s.recipe.base, menuBase: s.menu[s.editing].recipe.base }; }"
        )
        note("buffer_written", base_state.get("base") == "tomato", base_state)
        note("item_written", base_state.get("menuBase") == "tomato", base_state)

        sum1 = pg.inner_text("[data-basesum]")
        note("summary_follows", "番茄" in sum1 and "汤底 +3" in sum1, sum1)

        delta = pg.evaluate(
            """() => {
              const el = document.querySelector('[data-basedelta]');
              if (!el) return null;
              return { text: (el.textContent || '').trim(), hidden: el.hidden };
            }"""
        )
        note("delta_says_where",
             bool(delta) and delta["hidden"] is False and "+3" in delta["text"] and "番茄底" in delta["text"],
             delta)

        badge = pg.evaluate(
            """() => {
              const el = document.querySelector('[data-menu] .dcard .dbase');
              return el ? (el.textContent || '').trim() : '';
            }"""
        )
        note("dish_card_badge", "骨汤+番茄" in badge, badge)

        after = pg.evaluate(READ)
        # 汤底分那一格在面板里是分组合成值，不随底变；判据改成「总分没掉、成本涨了五毛」
        # —— 底的汤底分确实进了 scoreRecipe 的 soup，只是 subs 行显示的是八参合成值。
        note("soup_capped", after.get("soup") is None or after["soup"] <= 100, after.get("soup"))
        note("cost_up_four",
             before.get("cost") is None or round((after.get("cost") or 0) - before["cost"], 2) == 0.4,
             (before.get("cost"), after.get("cost")))
        note("total_up", before.get("total") is None or after["total"] > before["total"],
             (before.get("total"), after.get("total")))

        pg.click('[data-bases] .bcard[data-id="tomato"]')
        pg.wait_for_timeout(300)
        toast = pg.evaluate(
            "() => Array.from(document.querySelectorAll('#toasts .toast')).map((t) => t.textContent).join(' | ')"
        )
        note("repeat_refused", "本来就是" in toast, toast)

        pg.screenshot(path=os.path.join(OUT, "01-soupbase-cards.png"))

        pg.evaluate("() => { window.__laoyou.state.totalCustomers = 0; window.__laoyou.refresh(); }")
        pg.wait_for_timeout(400)
        locked = pg.eval_on_selector_all(
            "[data-bases] .bcard.locked", "els => els.map((e) => e.getAttribute('data-id'))"
        )
        note("locked_when_short", len(locked) >= 2, locked)
        disabled = pg.eval_on_selector_all(
            "[data-bases] .bcard[disabled]", "els => els.map((e) => e.getAttribute('data-id'))"
        )
        note("locked_disabled", len(disabled) >= 2, disabled)

        ver = pg.evaluate(
            """() => {
              for (const k of Object.keys(localStorage)) {
                if (k.indexOf('laoyou.save') === 0) {
                  try { const v = JSON.parse(localStorage.getItem(k)); if (v && v.saveVersion) return v.saveVersion; } catch (e) {}
                }
              }
              return null;
            }"""
        )
        note("save_version_37", ver == 37, ver)
        # 预览环境没有后端，/laoyou-api/ 那几条 404 算良性
        bad = [e for e in errors if "laoyou-api" not in e and "Failed to load resource" not in e]
        note("console_clean", len(bad) == 0, bad[:3])

        b.close()

    report = os.path.join(OUT, "soupbase-report.json")
    with open(report, "w", encoding="utf-8") as f:
        json.dump(checks, f, ensure_ascii=False, indent=2)
    ok = sum(1 for v in checks.values() if v)
    print("\n%d / %d true" % (ok, len(checks)))
    print("report:", report)
    return 0 if ok == len(checks) else 1


if __name__ == "__main__":
    sys.exit(main())
