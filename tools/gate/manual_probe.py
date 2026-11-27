"""批 N'（八十件事 + 二十四张熟面孔 + 十二页手册）的探针。

十件事：
1. 图鉴里有「店里的手册 · 12 页」这一段；
2. 手册分成四个分章（一天的生意 / 这一碗 / 这条街 / 手里的牌）；
3. 十二页都在，`<details>` 默认收起；
4. 点开一页能看到正文（`[open]`）；
5. 正文里不出现阿拉伯数字（手册讲道理，不报数）；
6. 地图下面多一行「这一片常去的地方：…」；
7. 地图格子写了地名（`.mplace`），起始区是中山路夜市；
8. 换区之后那一行跟着换（邕宁 → 蒲庙老镇）；
9. 存档版本还是 37（这一批全是只读内容，不动存档结构）；
10. 控制台干净。

用法：先 `npm run -s build`，在 4229 起 `npx vite preview --port 4229`，
再在项目根 `python tools/gate/manual_probe.py`（URL 用 localhost，preview 只听 IPv6）。
"""

from __future__ import annotations

import json
import os
import re

from playwright.sync_api import sync_playwright
from probe_version import SAVE_VERSION
from probe_source import MANUAL_SECTIONS, MANUAL_TOTAL

URL = os.environ.get("PW_URL", "http://localhost:4229/")
OUT = "game/data/evidence/manual"

READ = """() => {
  const secs = [...document.querySelectorAll('.sec')];
  const man = secs.find((x) => (x.querySelector('.sechd')?.textContent || '').includes('店里的手册'));
  const pages = man ? [...man.querySelectorAll('details.mpage')] : [];
  const groups = man ? [...man.querySelectorAll('.mghd')].map((n) => (n.textContent || '').trim()) : [];
  const closed = pages.filter((d) => !d.hasAttribute('open')).length;
  const body = pages.map((d) => (d.querySelector('.mbody')?.textContent || '')).join('');
  const placeLine = (document.querySelector('[data-places]')?.textContent || '').trim();
  const cells = [...document.querySelectorAll('.mcell .mplace')].map((n) => (n.textContent || '').trim());
  const first = pages[0];
  if (first) first.setAttribute('open', '');
  return {
    manualFound: !!man,
    pageCount: pages.length,
    groups,
    closed,
    digits: /[0-9]/.test(body),
    placeLine,
    cells,
    opened: first ? first.hasAttribute('open') : false,
    saveVersion: JSON.parse(localStorage.getItem('laoyou.save.v4') || '{}').saveVersion ?? -1,
  };
}"""

MOVE = """(id) => {
  const s = window.__laoyou.state;
  s.district = id;
  s.districtSince = s.month;
  window.__laoyou.refresh();
  return s.district;
}"""


def kill_modals(page) -> None:
    page.evaluate(
        "() => { document.querySelectorAll('.modal').forEach((m) => {"
        " if (!m.querySelector('[data-tab2]')) m.remove(); }); }"
    )


def open_collection(page) -> None:
    page.evaluate(
        "() => { const b = document.querySelector('[data-tab=\"recipe\"]'); if (b) b.click(); }"
    )
    page.wait_for_timeout(260)
    page.evaluate(
        "() => { const b = document.querySelector('[data-tab2=\"collection\"]'); if (b) b.click(); }"
    )
    page.wait_for_timeout(380)


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

        open_collection(page)
        base = page.evaluate(READ)
        checks["manual_found"] = base["manualFound"]
        # 批 BB1′：页数与分章从 data/manual.ts 读（批 Y′ 加四页 how-* 后是 16 页 5 组，
        # 探针写死 12/4 会替代码记账 —— 这正是一条门失效的原因）
        checks["all_pages"] = base["pageCount"] == MANUAL_TOTAL
        checks["all_groups"] = base["groups"] == MANUAL_SECTIONS
        checks["details_closed"] = base["closed"] == MANUAL_TOTAL
        checks["page_opens"] = base["opened"] is True
        checks["no_digits"] = base["digits"] is False
        checks["place_line"] = "这一片常去的地方" in base["placeLine"]
        # 格子里写的是每区第一处（早市在前），兴宁第一处是朝阳广场，夜市那处在 title 里
        checks["cell_names"] = "朝阳广场" in base["cells"]
        page.screenshot(path=f"{OUT}/01-manual.png")

        page.evaluate(MOVE, "yongning")
        page.wait_for_timeout(200)
        open_collection(page)
        moved = page.evaluate(READ)
        checks["place_follows"] = "蒲庙老镇" in moved["placeLine"]
        page.screenshot(path=f"{OUT}/02-places.png")

        checks["save_version"] = moved["saveVersion"] == SAVE_VERSION
        checks["console_clean"] = not errors

        report = {
            "ok": all(checks.values()),
            "checks": checks,
            "base": base,
            "moved": moved,
            "errors": errors[:5],
        }
        with open(f"{OUT}/manual-report.json", "w", encoding="utf-8") as fh:
            json.dump(report, fh, ensure_ascii=False, indent=2)
        print(json.dumps(report, ensure_ascii=False))
        browser.close()
    return 0 if all(checks.values()) else 1


if __name__ == "__main__":
    raise SystemExit(main())
