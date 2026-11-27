"""批次一（九档）的探针：HUD 上的四维九格是不是真的在反映这一碗。

五件事：
1. HUD 浮层里有味 / 镬 / 饱 / 相四行，每行九格；
2. 汤桶调低，味这一行掉档，镬这一行不动（映射是否单一出口）；
3. 汤桶调高，味这一行回升；
4. 菜单卡片上有四维一行（`.ntier`）；
5. 图鉴里有四维图例（四行 × 九格 + 一句「这一维看什么」）。

用法：先在 4205 起 preview，再 `python tools/gate/tier_probe.py`。
"""

from __future__ import annotations

import json
import os

from playwright.sync_api import sync_playwright
from probe_version import SAVE_VERSION

URL = "http://127.0.0.1:4205/"
OUT = "game/data/evidence/tier"

READ = """() => {
  const rows = [...document.querySelectorAll("[data-tiers] .trow")].map((r) => ({
    dim: (r.querySelector(".tdim") || {}).textContent || "",
    on: r.querySelectorAll(".tcells i.on").length,
    cells: r.querySelectorAll(".tcells i").length,
    word: (r.querySelector(".tword") || {}).textContent || "",
    title: r.getAttribute("title") || "",
  }));
  const card = document.querySelector(".dcard .ntier");
  return {
    rows,
    card: card ? card.textContent || "" : "",
    version: (window.__laoyou && window.__laoyou.state && window.__laoyou.state.saveVersion) || 0,
  };
}"""

LEGEND = """() => {
  const box = document.querySelector(".tlegend");
  if (!box) return { rows: 0, cells: 0, whats: [], titles: [] };
  const rows = [...box.querySelectorAll(".trow2")];
  return {
    rows: rows.length,
    cells: rows.reduce((n, r) => n + r.querySelectorAll(".tcells2 i").length, 0),
    whats: rows.map((r) => (r.querySelector(".twhat") || {}).textContent || ""),
    titles: [...box.querySelectorAll(".tcells2 i")].slice(0, 3).map((e) => e.getAttribute("title") || ""),
  };
}"""

# 把汤桶整体压低 / 抬起：汤只喂「味」，不该动「镬」。
# 注意：浮层读的是「当下这一碗」的草稿配方（s.recipe），不是菜单里某一款。
SET_SOUP = """(v) => {
  const s = window.__laoyou.state;
  for (let i = 0; i < s.recipe.soup.length; i++) s.recipe.soup[i] = v;
  window.__laoyou.refresh();
  return true;
}"""


def kill_modals(page) -> None:
    """打烊单 / 事件 / 引导的模态会拦住页签点击；探针只关心浮层，先清掉。

    注意别把面板自己删了 —— 面板也是 `.modal`，靠里面的 `[data-tab2]` 认出来。
    """
    page.evaluate(
        "() => { document.querySelectorAll('.modal').forEach((m) => {"
        " if (!m.querySelector('[data-tab2]')) m.remove(); }); }"
    )


def main() -> int:
    os.makedirs(OUT, exist_ok=True)
    checks: dict[str, bool] = {}
    with sync_playwright() as pw:
        browser = pw.chromium.launch()
        page = browser.new_page(viewport={"width": 1440, "height": 900})
        errors: list[str] = []
        page.on("pageerror", lambda e: errors.append(str(e)))
        page.goto(URL, wait_until="networkidle")
        page.evaluate("() => { localStorage.clear(); location.reload(); }")
        page.wait_for_timeout(1200)
        page.click('.sitecard[data-site="alley"]')
        page.click("[data-chips] .chip")
        page.click("[data-open]")
        page.wait_for_timeout(600)
        try:
            page.locator(".gbtn.ghost").click(timeout=1200)
        except Exception:
            pass
        page.wait_for_timeout(400)

        base = page.evaluate(READ)
        dims = [r["dim"] for r in base["rows"]]
        checks["four_rows"] = dims == ["味", "镬", "饱", "相"] or len(dims) == 4
        checks["nine_cells"] = all(r["cells"] == 9 for r in base["rows"]) and len(base["rows"]) == 4
        checks["words_present"] = all(r["word"] for r in base["rows"])
        checks["title_has_dim"] = all(r["title"] for r in base["rows"])
        page.screenshot(path=f"{OUT}/01-tier-hud.png")

        taste0 = next((r for r in base["rows"] if r["dim"].startswith("味")), {"on": 0})
        wok0 = next((r for r in base["rows"] if r["dim"].startswith("镬")), {"on": 0})
        fill0 = next((r for r in base["rows"] if r["dim"].startswith("饱")), {"on": 0})
        look0 = next((r for r in base["rows"] if r["dim"].startswith("相")), {"on": 0})

        page.evaluate(SET_SOUP, 0)
        page.wait_for_timeout(300)
        low = page.evaluate(READ)
        taste1 = next((r for r in low["rows"] if r["dim"].startswith("味")), {"on": 0})
        other1 = [r["on"] for r in low["rows"] if not r["dim"].startswith("味")]
        checks["soup_low_drops_taste"] = taste1["on"] < taste0["on"]
        checks["soup_low_keeps_others"] = other1 == [wok0["on"], fill0["on"], look0["on"]]
        page.screenshot(path=f"{OUT}/02-tier-low.png")

        page.evaluate(SET_SOUP, 60)
        page.wait_for_timeout(300)
        high = page.evaluate(READ)
        taste2 = next((r for r in high["rows"] if r["dim"].startswith("味")), {"on": 0})
        checks["soup_high_raises_taste"] = taste2["on"] > taste1["on"]

        kill_modals(page)
        page.click('[data-tab="recipe"]')
        page.wait_for_timeout(500)
        card = page.evaluate(
            """() => {
              const c = document.querySelector(".dcard:not(.add) .ntier");
              return c ? c.textContent || "" : "";
            }"""
        )
        checks["card_shows_line"] = "味" in card and "镬" in card

        kill_modals(page)
        page.click('[data-tab2="collection"]')
        page.wait_for_timeout(600)
        legend = page.evaluate(LEGEND)
        checks["legend_four_rows"] = legend["rows"] == 4
        checks["legend_36_cells"] = legend["cells"] == 36
        checks["legend_whats"] = all(w.strip() for w in legend["whats"]) and len(legend["whats"]) == 4
        checks["legend_titles"] = all(t.strip() for t in legend["titles"])
        page.screenshot(path=f"{OUT}/03-tier-legend.png")

        checks["save_version"] = base["version"] == SAVE_VERSION
        checks["console_clean"] = len(errors) == 0

        browser.close()

    ok = all(checks.values())
    report = {"ok": ok, "checks": checks, "errors": errors, "base": base}
    with open(f"{OUT}/tier-report.json", "w", encoding="utf-8") as fh:
        json.dump(report, fh, ensure_ascii=False, indent=2)
    print(json.dumps({"ok": ok, "checks": checks}, ensure_ascii=False, indent=2))
    if not ok:
        print(json.dumps({"base": base, "legend": legend, "errors": errors}, ensure_ascii=False)[:1200])
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
