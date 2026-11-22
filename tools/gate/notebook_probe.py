"""批次八（阿婆的笔记本）的探针。

八件事：
1. 图鉴页里有「阿婆的笔记本」那一段，抬头写「已记 N / 12 条」；
2. 三组都在，每组写着「N / 4」；
3. 未解锁的条目写一句「等你遇上…」，正文不出现（不让玩家一眼看到答案）；
4. 注入两条已解锁后：正文出现、`title` 带「阿婆原话」；
5. 条目正文里没有阿拉伯数字（阿婆不会写数字）；
6. 存档版本还是 34（这一批不升版本，用可选字段）；
7. 控制台干净；
8. 截图两张（未解锁 / 解锁两条）。

用法：先在 4213 起 preview，再在项目根 `python tools/gate/notebook_probe.py`。
"""

from __future__ import annotations

import json
import os
import re

from playwright.sync_api import sync_playwright

URL = os.environ.get("PW_URL", "http://127.0.0.1:4213/")
OUT = "game/data/evidence/notebook"

READ = """() => {
  const secs = [...document.querySelectorAll('.sec')];
  const box = secs.find((x) => (x.textContent || '').includes('阿婆的笔记本'));
  const head = box ? (box.querySelector('.sechd')?.textContent || '').replace(/\\s+/g, ' ').trim() : '';
  const groups = box ? [...box.querySelectorAll('.nghd')].map((n) => (n.textContent || '').replace(/\\s+/g, ' ').trim()) : [];
  const rows = box ? [...box.querySelectorAll('.nrow2')].map((n) => ({
    title: (n.querySelector('.ntitle')?.textContent || '').trim(),
    body: (n.querySelector('.nbody')?.textContent || '').trim(),
    locked: n.classList.contains('locked'),
    elder: n.getAttribute('title') || '',
  })) : [];
 ;const s = window.__laoyou.state;
  return {
    found: !!box,
    head,
    groups,
    rows,
    notes: (s && s.flow && s.flow.notes) || [],
    saveVersion: JSON.parse(localStorage.getItem('laoyou.save.v4') || '{}').saveVersion ?? -1,
  };
}"""

UNLOCK = """() => {
  const s = window.__laoyou.state;
  s.flow.notes = ['n_thick', 's_sour'];
  window.__laoyou.refresh();
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
    detail: dict[str, object] = {}
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

        page.click('[data-tab="recipe"]', force=True)
        page.wait_for_timeout(400)
        kill_modals(page)
        page.evaluate(
            "() => { const b = document.querySelector('[data-tab2=\"collection\"]'); if (b) b.click(); }"
        )
        page.wait_for_timeout(500)

        base = page.evaluate(READ)
        detail["base"] = {"head": base["head"], "groups": base["groups"], "rows": base["rows"][:4]}
        checks["section_found"] = bool(base["found"])
        checks["head_zero"] = "已记 0 / 12 条" in base["head"]
        checks["three_groups"] = len(base["groups"]) == 3 and all("/ 4" in g for g in base["groups"])
        checks["twelve_rows"] = len(base["rows"]) == 12
        checks["locked_shows_cue"] = all(r["locked"] for r in base["rows"]) and all(
            len(r["body"]) > 4 for r in base["rows"]
        )
        page.screenshot(path=f"{OUT}/01-notebook-locked.png")

        page.evaluate(UNLOCK)
        page.wait_for_timeout(500)
        after = page.evaluate(READ)
        detail["after"] = {"head": after["head"], "notes": after["notes"], "rows": after["rows"][:2]}
        got = [r for r in after["rows"] if not r["locked"]]
        checks["unlock_two"] = len(got) == 2 and "已记 2 / 12 条" in after["head"]
        checks["body_visible"] = all(len(r["body"]) > 20 for r in got)
        checks["title_has_elder"] = all("阿婆原话" in r["elder"] for r in got)
        checks["body_no_digits"] = all(not re.search(r"[0-9０-９]", r["body"]) for r in after["rows"])
        checks["save_version"] = after["saveVersion"] == 34
        checks["console_clean"] = not errors
        page.screenshot(path=f"{OUT}/02-notebook-two.png")

        browser.close()

    ok = all(checks.values())
    print(json.dumps({"ok": ok, "checks": checks, "detail": detail, "errors": errors[:5]}, ensure_ascii=False))
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
