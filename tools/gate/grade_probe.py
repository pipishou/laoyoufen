# -*- coding: utf-8 -*-
"""A5 进货档（米与骨）真点探针。

看到的三件事：
1. 配方页有「进货 · 米与骨」段，两行共六枚按钮，默认档高亮；
2. 点「陈米」当场料钱降、米粉分降（不花钱、不用等到次日）；
3. 换「筒骨」当场把钱往上抬 —— 净额仍可能是「省」，所以要按成本数字比，不能按文案比。

跑法：
    npx vite preview --port 4200 --strictPort --host 127.0.0.1
    $env:PYTHONIOENCODING="utf-8"; python tools/gate/grade_probe.py
"""

import json
import os
import re
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

URL = os.environ.get("GRADE_URL", "http://127.0.0.1:4200/")
OUT = Path("game/data/evidence/a5")
OUT.mkdir(parents=True, exist_ok=True)

READ = """() => {
  const box = document.querySelector('[data-grades]');
  if (!box) return { box: false };
  const rows = [...box.querySelectorAll('.grow')];
  const btns = [...box.querySelectorAll('.mbtn')];
  return {
    box: true,
    rows: rows.length,
    btns: btns.length,
    on: btns.filter((b) => b.classList.contains('on')).map((b) => b.dataset.id),
    sum: (document.querySelector('[data-gradesum]')?.textContent || '').trim(),
    note: (box.querySelector('.gnote')?.textContent || '').trim(),
    econ: (document.querySelector('[data-econ2]')?.textContent || '').replace(/\\s+/g, ' ').trim(),
    score: (document.querySelector('[data-scorebig]')?.textContent || '').trim(),
  };
}"""


def cost_of(econ: str) -> float:
    m = re.search(r"成本 ¥([\d.]+)", econ or "")
    return float(m.group(1)) if m else -1.0


def click(page, act, gid):
    page.click(f'[data-act="{act}"][data-id="{gid}"]', force=True)
    page.wait_for_timeout(260)


def main() -> int:
    checks = {}
    steps = []
    errors = []

    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page(viewport={"width": 1440, "height": 900})
        page.on("pageerror", lambda e: errors.append(str(e)))
        page.on(
            "console",
            lambda m: errors.append(m.text)
            if m.type == "error" and "/laoyou-api/" not in (m.location or {}).get("url", "")
            else None,
        )

        page.goto(URL, wait_until="networkidle")
        page.evaluate("() => localStorage.clear()")
        page.reload(wait_until="networkidle")
        page.wait_for_timeout(400)

        page.click('[data-site="alley"]')
        page.click("[data-chips] .chip")
        page.click("[data-open]")
        page.wait_for_timeout(400)
        if page.query_selector(".gbtn.ghost"):
            page.click(".gbtn.ghost")
            page.wait_for_timeout(200)

        page.click('[data-tab="recipe"]')
        page.wait_for_timeout(400)

        step0 = page.evaluate(READ)
        steps.append({"name": "recipe_default", **step0})
        checks["section_present"] = bool(step0.get("box"))
        checks["six_buttons"] = step0.get("btns") == 6
        checks["two_rows"] = step0.get("rows") == 2
        checks["default_on"] = step0.get("on") == ["late", "spine"]
        checks["sum_zero"] = "料钱不动" in (step0.get("sum") or "")
        page.screenshot(path=str(OUT / "10-grade-default.png"))

        # 陈米：料钱降
        click(page, "setrice", "aged")
        step1 = page.evaluate(READ)
        steps.append({"name": "after_aged_rice", **step1})
        checks["rice_switched"] = "aged" in (step1.get("on") or [])
        checks["rice_saves_money"] = "每碗省" in (step1.get("sum") or "")
        checks["rice_note_changed"] = (step1.get("note") or "") != (step0.get("note") or "")
        checks["rice_cheaper"] = cost_of(step1.get("econ")) < cost_of(step0.get("econ"))

        # 筒骨：钱往上抬（按成本数字比，文案会因为陈米已省而仍写「省」）
        click(page, "setbone", "tube")
        step2 = page.evaluate(READ)
        steps.append({"name": "after_tube_bone", **step2})
        checks["bone_switched"] = "tube" in (step2.get("on") or [])
        checks["bone_dearer"] = cost_of(step2.get("econ")) > cost_of(step1.get("econ"))
        checks["sum_names_both"] = "陈米" in (step2.get("sum") or "") and "筒骨" in (step2.get("sum") or "")
        page.screenshot(path=str(OUT / "11-grade-tube.png"))

        checks["console_clean"] = not errors
        ok = all(checks.values())
        report = {"ok": ok, "checks": checks, "steps": steps, "console_errors": errors}
        (OUT / "grade-report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
        print(json.dumps({"ok": ok, "checks": checks}, ensure_ascii=False, indent=2))
        browser.close()
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
