# -*- coding: utf-8 -*-
"""批 Y′ 探针：换招牌 ＋ 操作一览。

看六件事：
  1. 店铺页顶上有一行招牌，预填着现在的店名
  2. 改掉之后 `state.shopName` 跟着变，顶栏那个名字也换
  3. 只填一个字会被退回，并且说清两个字到十二个字
  4. 设置弹窗里有「操作一览」，四行，并且指到图鉴页的手册
  5. 图鉴页手册十六页、五个分章
  6. 存档版本还是三十七

preview: npx vite preview --port 4240   →   PW_URL=http://localhost:4240/
"""
import json
import os

from playwright.sync_api import sync_playwright
from probe_version import SAVE_VERSION

URL = os.environ.get("PW_URL", "http://localhost:4240/")
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
EVID = os.path.join(ROOT, "game", "data", "evidence", "shopname")
os.makedirs(EVID, exist_ok=True)

checks = {}
errors = []


def main() -> int:
    with sync_playwright() as pw:
        b = pw.chromium.launch()
        pg = b.new_page(viewport={"width": 1440, "height": 900})
        pg.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
        pg.on("pageerror", lambda e: errors.append(str(e)))
        pg.goto(URL, wait_until="load")
        pg.wait_for_timeout(700)

        pg.click('.sitecard[data-site="alley"]')
        pg.wait_for_timeout(200)
        pg.click("[data-chips] .chip")
        pg.wait_for_timeout(150)
        pg.click("[data-open]")
        pg.wait_for_timeout(600)
        if pg.query_selector(".gbtn.ghost"):
            pg.click(".gbtn.ghost")
            pg.wait_for_timeout(600)

        pg.click('[data-tab="recipe"]')
        pg.wait_for_timeout(400)
        pg.evaluate("() => document.querySelector('[data-tab2=\"shop\"]')?.click()")
        pg.wait_for_timeout(400)

        # ── 1 招牌那一行 ───────────────────────────────────
        box = pg.evaluate(
            """() => {
              const wrap = document.querySelector('[data-shopname-box]');
              const inp = wrap ? wrap.querySelector('[data-rename-shop]') : null;
              return {
                has: !!wrap,
                maxlength: inp ? inp.getAttribute('maxlength') : '',
                value: inp ? inp.value : '',
                hint: wrap ? (wrap.textContent || '').trim() : '',
              };
            }"""
        )
        checks["shopname_box"] = box["has"] and box["maxlength"] == "12" and len(box["value"]) >= 2
        checks["shopname_hint_says_no_numbers"] = "不改任何数" in box["hint"]

        # ── 2 改名 ────────────────────────────────────────
        pg.evaluate(
            """() => {
              const inp = document.querySelector('[data-shopname-box] input[data-rename-shop]');
              inp.value = '阿婆老友粉';
              inp.dispatchEvent(new Event('change', { bubbles: true }));
            }"""
        )
        pg.wait_for_timeout(500)
        after = pg.evaluate(
            """() => ({
              state: window.__laoyou.state.shopName,
              hud: (document.querySelector('[data-shopname]')?.textContent || '').trim(),
              input: (document.querySelector('[data-shopname-box] input')?.value || '').trim(),
            })"""
        )
        checks["shopname_renamed"] = after["state"] == "阿婆老友粉"
        checks["shopname_hud_follows"] = after["hud"] == "阿婆老友粉"
        checks["shopname_input_keeps"] = after["input"] == "阿婆老友粉"

        # ── 3 一个字被退回 ─────────────────────────────────
        pg.evaluate(
            """() => {
              const inp = document.querySelector('[data-shopname-box] input[data-rename-shop]');
              inp.value = '粉';
              inp.dispatchEvent(new Event('change', { bubbles: true }));
            }"""
        )
        pg.wait_for_timeout(400)
        short = pg.evaluate(
            """() => ({
              state: window.__laoyou.state.shopName,
              toast: (document.querySelector('#toasts')?.textContent || '').trim(),
            })"""
        )
        checks["shopname_short_rejected"] = short["state"] == "阿婆老友粉"
        # 提示原文是「店名要 2–12 个字」：只说字数区间，不吓人
        checks["shopname_short_reason"] = "店名" in short["toast"] and "12" in short["toast"]

        # ── 4 设置里的操作一览 ─────────────────────────────
        pg.evaluate("() => document.querySelector('[data-prefs]')?.click()")
        pg.wait_for_timeout(400)
        helpbox = pg.evaluate(
            """() => {
              const box = document.querySelector('[data-pref-help]');
              if (!box) return { has: false, rows: 0, text: '' };
              return {
                has: true,
                rows: box.querySelectorAll('.prefrow').length,
                text: (box.textContent || '').replace(/\\s+/g, ' ').trim(),
              };
            }"""
        )
        checks["prefhelp_present"] = helpbox["has"]
        checks["prefhelp_four_rows"] = helpbox["rows"] == 4
        # 批 BB1′：源码里那句是「与图鉴页那本手册同一本账；完整十六页在图鉴页。」
        # （`game/src/ui/hud.ts:504`）——只认「图鉴页」+「手册」两个词，不锁整句
        checks["prefhelp_points_to_manual"] = "图鉴页" in helpbox["text"] and "手册" in helpbox["text"]
        checks["prefhelp_says_tabs"] = "页签" in helpbox["text"]
        pg.evaluate("() => document.querySelector('[data-prefs-close]')?.click()")
        pg.wait_for_timeout(250)
        pg.screenshot(path=os.path.join(EVID, "01-shopname-shop.png"), full_page=False)

        # ── 5 图鉴页手册十六页五章 ─────────────────────────
        pg.evaluate("() => document.querySelector('[data-tab2=\"collection\"]')?.click()")
        pg.wait_for_timeout(500)
        manual = pg.evaluate(
            """() => {
              const body = document.querySelector('[data-body="collection"]');
              if (!body) return { pages: 0, groups: 0, gnames: [] };
              const pages = body.querySelectorAll('[data-manual]');
              const groups = body.querySelectorAll('.mgroup');
              return {
                pages: pages.length,
                groups: groups.length,
                gnames: Array.from(groups).map((g) => (g.querySelector('.mghd')?.textContent || '').trim()),
              };
            }"""
        )
        checks["manual_sixteen"] = manual["pages"] == 16
        checks["manual_five_groups"] = manual["groups"] == 5
        checks["manual_has_how_group"] = any("怎么操作" in n for n in manual["gnames"])
        pg.screenshot(path=os.path.join(EVID, "02-shopname-manual.png"), full_page=False)

        # ── 6 存档版本 ────────────────────────────────────
        ver = pg.evaluate(
            """() => {
              for (let i = 0; i < localStorage.length; i++) {
                const k = localStorage.key(i) || '';
                if (!k.includes('laoyou.save')) continue;
                try {
                  const v = JSON.parse(localStorage.getItem(k) || '{}');
                  if (v && typeof v.saveVersion === 'number') return v.saveVersion;
                } catch (e) {}
              }
              return 0;
            }"""
        )
        checks["save_version"] = ver == SAVE_VERSION

        noisy = [e for e in errors if "Failed to load resource" not in e and "404" not in e]
        checks["console_clean"] = len(noisy) == 0
        b.close()

    report = {"url": URL, "checks": checks, "console_errors": noisy[:6]}
    with open(os.path.join(EVID, "shopname-report.json"), "w", encoding="utf-8") as f:
        json.dump(report, f, ensure_ascii=False, indent=2)
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0 if all(checks.values()) else 1


if __name__ == "__main__":
    raise SystemExit(main())
