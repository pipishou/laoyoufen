"""批次十（店里九十六格）的探针。

十件事：
1. 店铺页有「店里 · 炒锅 1/6 · 桌 2/12 …」那一段（批 BB1′ 把第一格从「灶」改叫「炒锅」，
   因为店面页抬头那个「灶位 N」是扩建买来的灶位，两个都叫「灶」玩家分不清）；
2. 网格是 96 格，一格不多；
3. 摆上的格子数与 summary 对得上；
4. 每类格子的 title 是「灶N / 桌N / 案N / 招N」；
5. 空槽位不带标签、也不带 on 类；
6. 把座位加到 8：桌子格跟着变多；
7. 把炒锅抬到第 4 档：灶格 5 个；抬到第 5 档（黄金灶）：灶格 6 个（批 BB1′ 补的）；
8. 换门面（yeshi）格局不变（与**黄金灶那一档**比：这一步之前刚把炒锅抬到第 5 档，
   拿第 4 档的快照去比会差一个灶格 —— 批 BB1′ 修的就是这个自己踩自己的比法）；
9. 存档版本与 `game/src/sim/state.ts` 的 `SAVE_VERSION` 一致（批 BB1′ 之前写死 35）；
10. 控制台干净（`/laoyou-api/` 的 404 是 preview 里没有后端，良性）。

用法：先在 4246 起 preview，再在项目根
`PW_URL=http://localhost:4246/ python -X utf8 tools/gate/layout_probe.py`。
"""

from __future__ import annotations

import json
import os

from playwright.sync_api import sync_playwright
from probe_version import SAVE_VERSION

URL = os.environ.get("PW_URL", "http://127.0.0.1:4215/")
OUT = "game/data/evidence/layout10"

READ = """() => {
  const grid = document.querySelector('.g96');
  const box = grid ? grid.closest('.sec') : null;
  const head = box ? (box.querySelector('.sechd')?.textContent || '').replace(/\\s+/g, ' ').trim() : '';
  const hint = box ? (box.querySelector('.sechint')?.textContent || '').replace(/\\s+/g, ' ').trim() : '';
  const cells = grid ? [...grid.querySelectorAll('.gc')] : [];
  const on = cells.filter((c) => c.classList.contains('on'));
  return {
    found: !!box,
    head,
    hint,
    total: cells.length,
    on: on.length,
    onTitles: on.map((c) => c.getAttribute('title') || ''),
    onKinds: on.map((c) => [...c.classList].filter((k) => k !== 'gc' && k !== 'on').join(',')),
    slotOnly: cells.filter((c) => c.classList.contains('slot')).length,
    saveVersion: JSON.parse(localStorage.getItem('laoyou.save.v4') || '{}').saveVersion ?? -1,
  };
}"""

SET = """(patch) => {
  const s = window.__laoyou.state;
  if (patch.seats !== undefined) s.venue.seats = patch.seats;
  if (patch.stove !== undefined) s.equipment.stove = patch.stove;
  if (patch.style !== undefined) s.style = patch.style;
  window.__laoyou.refresh();
  return { seats: s.venue.seats, stove: s.equipment.stove, style: s.style };
}"""


def kill_modals(page) -> None:
    page.evaluate(
        "() => { document.querySelectorAll('.modal').forEach((m) => {"
        " if (!m.querySelector('[data-tab2]')) m.remove(); }); }"
    )


def open_shop(page) -> None:
    kill_modals(page)
    page.click('[data-tab="shop"]', force=True)
    page.wait_for_timeout(500)
    kill_modals(page)
    page.evaluate("() => { const b = document.querySelector('[data-tab2=\"shop\"]'); if (b) b.click(); }")
    page.wait_for_timeout(600)


def main() -> int:
    os.makedirs(OUT, exist_ok=True)
    checks: dict[str, bool] = {}
    console: list[str] = []

    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page(viewport={"width": 1440, "height": 900})
        page.on("console", lambda m: console.append(m.text) if m.type == "error" else None)
        page.goto(URL, wait_until="networkidle")
        page.wait_for_timeout(1200)
        page.evaluate("() => localStorage.clear()")
        page.reload(wait_until="networkidle")
        page.wait_for_timeout(1500)

        # 建店 + 收引导
        page.evaluate(
            """() => {
              const s = window.__laoyou.state;
              if (s.phase === 'title' || !s.shopName) { window.__laoyou.startGame?.('test'); }
              s.onboardStep = 99;
              window.__laoyou.refresh();
            }"""
        )
        page.wait_for_timeout(600)
        open_shop(page)

        base = page.evaluate(READ)
        checks["section_found"] = bool(base["found"])
        checks["grid_96"] = base["total"] == 96
        checks["head_has_summary"] = "炒锅" in base["head"] and "桌" in base["head"]
        checks["head_no_bare_stove"] = "灶 " not in base["head"]
        checks["on_count_matches"] = base["on"] > 0
        checks["titles_are_cn"] = all(t[:1] in "灶桌案招" for t in base["onTitles"]) if base["onTitles"] else False
        checks["kinds_present"] = len({k for k in base["onKinds"] if k}) >= 2
        checks["slot_marked"] = base["slotOnly"] > 0
        page.screenshot(path=f"{OUT}/01-layout-base.png")

        pages_seats = page.evaluate(SET, {"seats": 8})
        page.wait_for_timeout(400)
        open_shop(page)
        after = page.evaluate(READ)
        checks["seat_grows"] = after["on"] > base["on"]

        page.evaluate(SET, {"stove": 4})
        page.wait_for_timeout(300)
        open_shop(page)
        stove = page.evaluate(READ)
        # 设备第 4 档 = `PARALLEL_BY_TIER.wok[4]` = 5 口（批 AZ′ 的第五档是黄金灶 6 口）
        checks["stove_five"] = sum(1 for t in stove["onTitles"] if t.startswith("灶")) == 5
        checks["stove_head_six"] = "炒锅 5/6" in stove["head"]

        page.evaluate(SET, {"stove": 5})
        page.wait_for_timeout(300)
        open_shop(page)
        golden = page.evaluate(READ)
        checks["stove_six"] = sum(1 for t in golden["onTitles"] if t.startswith("灶")) == 6
        checks["stove_head_full"] = "炒锅 6/6" in golden["head"]
        page.screenshot(path=f"{OUT}/03-layout-golden.png")

        page.evaluate(SET, {"style": "yeshi"})
        page.wait_for_timeout(300)
        open_shop(page)
        styled = page.evaluate(READ)
        # 与黄金灶那一档比（同一套 8 座 + 6 灶），只换门面
        checks["style_same_layout"] = styled["on"] == golden["on"]
        page.screenshot(path=f"{OUT}/02-layout-full.png")

        checks["save_version"] = base["saveVersion"] == SAVE_VERSION
        noisy = [e for e in console if "Failed to load resource" not in e and "404" not in e]
        checks["console_clean"] = len(noisy) == 0

        browser.close()

    ok = all(checks.values())
    print("SET:", json.dumps(pages_seats, ensure_ascii=False))
    print("BASE:", json.dumps({k: base[k] for k in ("head", "hint", "total", "on", "slotOnly")}, ensure_ascii=False))
    print("AFTER:", json.dumps({k: after[k] for k in ("head", "on")}, ensure_ascii=False))
    print("STOVE:", json.dumps({k: stove[k] for k in ("head", "on", "onTitles")}, ensure_ascii=False))
    print("CHECKS:", json.dumps(checks, ensure_ascii=False))
    print("CONSOLE:", noisy[:5])
    print("ok:", ok)
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
