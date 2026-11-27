# -*- coding: utf-8 -*-
"""批 W′ 探针：袋装线从一档变四档，界面上真的要看出三档货。

preview 端口 4238；URL 必须用 localhost（vite preview 只听 IPv6）。
"""
import json
import os
import pathlib

from playwright.sync_api import sync_playwright
from probe_version import SAVE_VERSION

HERE = pathlib.Path(__file__).resolve().parent
REPO = HERE.parent.parent
OUT = REPO / "game" / "data" / "evidence" / "pack"
OUT.mkdir(parents=True, exist_ok=True)
URL = os.environ.get("PW_URL", "http://localhost:4238/")

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


def open_shop(pg):
    pg.evaluate("() => document.querySelector('[data-tab=\"recipe\"]')?.click()")
    pg.wait_for_timeout(250)
    pg.evaluate("() => document.querySelector('[data-tab2=\"shop\"]')?.click()")
    pg.wait_for_timeout(300)


def main() -> None:
    with sync_playwright() as p:
        browser = p.chromium.launch()
        pg = browser.new_page(viewport={"width": 1440, "height": 900})
        errors: list[str] = []
        pg.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
        boot(pg)
        open_shop(pg)

        before = pg.eval_on_selector_all("[data-sku]", "els => els.length")
        note("no_sku_before_pack", before == 0, f"rows={before}")
        pg.screenshot(path=str(OUT / "01-pack-none.png"))

        # 造一份好味道的昨天 + 置办包装机 + 段位 0
        pg.evaluate(
            """() => {
              const s = window.__laoyou.state;
              s.cash = 30000;
              s.pack = true;
              s.gradeLevel = 0;
              s.reputation = 4;
              s.dayReport = {
                month: s.month, day: s.day, revenue: 600, served: 40, lost: 8,
                avgSat: 70, price: s.price, taste: 92, cash: s.cash,
              };
              window.__laoyou.refresh();
            }"""
        )
        open_shop(pg)
        pg.wait_for_selector("[data-packsku]")
        info = pg.evaluate(
            """() => {
              const rows = [...document.querySelectorAll('[data-sku]')].map((r) => ({
                id: r.getAttribute('data-sku'),
                name: r.querySelector('.lname')?.textContent?.trim() ?? '',
                tag: r.querySelector('.tag2')?.textContent?.trim() ?? '',
                meta: r.querySelector('.lmeta')?.textContent?.trim() ?? '',
              }));
              const words = document.querySelector('[data-packsku]')?.textContent?.trim() ?? '';
              const s = window.__laoyou.state;
              return { rows, words, grade: s.gradeLevel };
            }"""
        )
        ids = [r["id"] for r in info["rows"]]
        note("two_sku_at_grade_0", ids == ["soup", "sour"], str(ids))
        note("sku_names_cn", info["rows"][0]["name"] == "汤底包", str(info["rows"][0]["name"]))
        note("sku_price_shown", "¥18" in info["rows"][0]["meta"], info["rows"][0]["meta"])
        note("sku_count_shown", "件" in info["rows"][0]["tag"], info["rows"][0]["tag"])
        note("sku_words_lock_gift", "还差段位" in info["words"], info["words"])
        pg.screenshot(path=str(OUT / "02-pack-two-sku.png"))

        # 抬段位：礼盒上车
        pg.evaluate(
            """() => {
              const s = window.__laoyou.state;
              s.gradeLevel = 4;
              window.__laoyou.refresh();
            }"""
        )
        open_shop(pg)
        pg.wait_for_timeout(250)
        rows3 = pg.eval_on_selector_all("[data-sku]", "els => els.map((e) => e.getAttribute('data-sku'))")
        note("gift_unlocks", rows3 == ["soup", "sour", "gift"], str(rows3))
        gift = pg.eval_on_selector('[data-sku="gift"]', "el => el.querySelector('.lmeta')?.textContent ?? ''")
        note("gift_says_box", "扎成一盒" in gift, gift)
        pg.screenshot(path=str(OUT / "03-pack-three-sku.png"))

        # 分货数量：三档都要分到件数，且加起来小于基础袋数
        nums = pg.evaluate(
            """() => [...document.querySelectorAll('[data-sku] .tag2')].map((e) =>
              Number((e.textContent || '').replace(/[^0-9]/g, '')))"""
        )
        note("sku_counts_positive", all(n > 0 for n in nums), str(nums))
        note("sku_counts_spread", len(set(nums)) > 1, str(nums))

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

        (OUT / "pack-report.json").write_text(json.dumps(CHECKS, ensure_ascii=False, indent=2), encoding="utf-8")
        print("---")
        print("all true" if all(CHECKS.values()) else "SOME RED")
        browser.close()


if __name__ == "__main__":
    main()
