"""批次五（配料品质档）的探针：进货换档，是不是真的动了「相」与料钱。

六件事：
1. 配方页有 `[data-quality]` 这一段，抬头写着「进货 · …」；
2. 三枚 chips（平常货 / 靓货 / 头手货），正在用的是实心（`.on`）；
3. 点「靓货」：state.quality 变 good，成本上去、魅力上去；
4. 点「头手货」：再上去一档，且不比靓货便宜；
5. 味道总分（total）一分不动 —— 进货不换味道，只换卖相与料钱；
6. 存档版本 32、控制台干净。

用法：先在 4210 起 preview，再 `python tools/gate/quality_probe.py`。
"""

from __future__ import annotations

import json
import os

from playwright.sync_api import sync_playwright

URL = os.environ.get("PW_URL", "http://127.0.0.1:4210/")
OUT = "game/data/evidence/quality"

READ = """() => {
  const box = document.querySelector('[data-quality]');
  const s = window.__laoyou.state;
  const chips = box ? [...box.querySelectorAll('.qb')] : [];
  const econ = document.querySelector('[data-econ2]');
  const txt = econ ? (econ.textContent || '').replace(/\\s+/g, ' ') : '';
  const cost = /成本 ¥([\\d.]+)/.exec(txt);
  const charm = /魅力 (\\d+)/.exec(txt);
  const big = document.querySelector('[data-scorebig]');
  return {
    head: box ? ((box.querySelector('.qhd') || {}).textContent || '').replace(/\\s+/g, ' ').trim() : '',
    chips: chips.map((c) => (c.textContent || '').replace(/\\s+/g, ' ').trim()),
    on: chips.filter((c) => c.classList.contains('on')).length,
    quality: s ? (s.quality || '') : '',
    cost: cost ? Math.round(parseFloat(cost[1]) * 100) / 100 : -1,
    charm: charm ? parseInt(charm[1], 10) : -1,
    total: big ? parseInt(big.textContent || '0', 10) : -1,
    saveVersion: JSON.parse(localStorage.getItem('laoyou.save.v4') || '{}').saveVersion ?? -1,
  };
}"""

CLICK = """(id) => {
  const b = document.querySelector(`.qb[data-id="${id}"]`);
  if (!b) return false;
  b.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  return true;
}"""


def kill_modals(page) -> None:
    page.evaluate(
        "() => { document.querySelectorAll('.modal').forEach((m) => {"
        " if (!m.querySelector('[data-tab2]')) m.remove(); }); }"
    )


def main() -> int:
    os.makedirs(OUT, exist_ok=True)
    checks: dict[str, bool] = {}
    errors: list[str] = []
    with sync_playwright() as pw:
        browser = pw.chromium.launch()
        page = browser.new_page(viewport={"width": 1440, "height": 900})
        page.on("pageerror", lambda e: errors.append(str(e)))
        page.on(
            "console",
            lambda m: errors.append(m.text)
            if m.type == "error" and "/laoyou-api/" not in (m.location or {}).get("url", "")
            else None,
        )

        page.goto(URL, wait_until="networkidle")
        page.evaluate("() => { localStorage.clear(); location.reload(); }")
        page.wait_for_timeout(900)
        page.click('.sitecard[data-site="alley"]')
        page.click("[data-chips] .chip")
        page.click("[data-open]")
        page.wait_for_timeout(600)
        try:
            page.locator(".gbtn.ghost").click(timeout=1200)
        except Exception:
            pass
        kill_modals(page)

        # 配方页（HUD 页签）—— 进货档就长在这一页
        page.click('[data-tab="recipe"]', force=True)
        page.wait_for_timeout(500)
        kill_modals(page)

        # 新局这一碗是空配方：先加三样浇头，不然「配料料钱」与「相」都没得比
        page.evaluate(
            "() => { const s = window.__laoyou.state;"
            " s.recipe.toppings = ['top.sourbamboo', 'top.douchi', 'top.chili'];"
            " window.__laoyou.refresh(); }"
        )
        page.wait_for_timeout(300)

        base = page.evaluate(READ)
        checks["box_present"] = bool(base["head"].startswith("进货"))
        checks["three_chips"] = len(base["chips"]) == 3
        checks["chips_are_cn"] = all(any(w in c for w in ("平常货", "靓货", "头手货")) for c in base["chips"])
        checks["starts_plain"] = base["quality"] == "plain" and base["on"] == 1
        checks["head_shows_plain"] = "平常货" in base["head"]
        page.screenshot(path=f"{OUT}/01-quality-plain.png")

        page.evaluate(CLICK, "good")
        page.wait_for_timeout(300)
        good = page.evaluate(READ)
        checks["switch_good"] = good["quality"] == "good"
        checks["good_on"] = good["on"] == 1
        checks["good_costs_more"] = good["cost"] > base["cost"]
        checks["good_charm_up"] = good["charm"] > base["charm"]
        checks["total_untouched_by_good"] = good["total"] == base["total"]
        page.screenshot(path=f"{OUT}/02-quality-good.png")

        page.evaluate(CLICK, "top")
        page.wait_for_timeout(300)
        top = page.evaluate(READ)
        checks["switch_top"] = top["quality"] == "top"
        checks["top_costs_more"] = top["cost"] > good["cost"]
        checks["top_charm_up"] = top["charm"] >= good["charm"]
        checks["total_untouched_by_top"] = top["total"] == base["total"]
        checks["head_shows_mult"] = "×2.6" in top["head"]
        checks["save_version"] = top["saveVersion"] == 32
        checks["console_clean"] = not errors
        page.screenshot(path=f"{OUT}/03-quality-top.png")

        browser.close()

    report = {"ok": all(checks.values()), "checks": checks, "plain": base, "good": good, "top": top, "errors": errors}
    with open(f"{OUT}/quality-report.json", "w", encoding="utf-8") as f:
        json.dump(report, f, ensure_ascii=False, indent=2)
    print(json.dumps(report, ensure_ascii=False))
    return 0 if report["ok"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
