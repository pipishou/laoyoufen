"""批次四（段位只降费 + 评委开口）的探针。

七件事：
1. 店铺页「段位评定」这一段在，写着这一级的评定费；
2. 交费之前，评委那句话已经写出来（不是评完才凭空出现）；
3. 那句话是话，不是数字；
4. 交费按钮可点，点完段位真的升一级；
5. 升段后 toast 里有评委那句；
6. 存档版本仍是 31（这一批不改存档形状）；
7. 控制台干净。

用法：先在 4208 起 preview，再 `python tools/gate/review_probe.py`。
"""

from __future__ import annotations

import json
import os
import re
from pathlib import Path

from playwright.sync_api import sync_playwright
from probe_version import SAVE_VERSION

URL = os.environ.get("REVIEW_URL", "http://127.0.0.1:4208/")
OUT = Path("game/data/evidence/review")
OUT.mkdir(parents=True, exist_ok=True)

READ = """() => {
  const secs = [...document.querySelectorAll('.sec')];
  const box = secs.find((x) => (x.textContent || '').includes('段位评定'));
  const metas = box ? [...box.querySelectorAll('.lmeta')].map((n) => (n.textContent || '').replace(/\\s+/g, ' ').trim()) : [];
  const names = box ? [...box.querySelectorAll('.lname')].map((n) => (n.textContent || '').replace(/\\s+/g, ' ').trim()) : [];
  const btn = box ? box.querySelector('[data-act="grade"]') : null;
  const s = window.__laoyou.state;
  return {
    found: !!box,
    head: box ? (box.querySelector('.sechd')?.textContent || '').replace(/\\s+/g, ' ').trim() : '',
    metas,
    names,
    hasBtn: !!btn,
    enabled: btn ? !btn.disabled : false,
    btnText: btn ? (btn.textContent || '').trim() : '',
    level: s ? s.gradeLevel : -1,
    cash: s ? s.cash : -1,
  };
}"""

SET_READY = """() => {
  const s = window.__laoyou.state;
  s.gradeLevel = 0;
  s.totalCustomers = 260;
  s.cash = 60_000;
  s.pendingTrophies = [];
  window.__laoyou.refresh();
  return true;
}"""

READ_TOASTS = """() => [...document.querySelectorAll('#toasts > *')].map((n) => (n.textContent || '').trim())"""


def kill_modals(page) -> None:
    """打烊单 / 事件 / 引导会拦住下面的操作；面板本身也是 `.modal`，靠 `[data-tab2]` 认出来别删"""
    page.evaluate(
        "() => { document.querySelectorAll('.modal').forEach((m) => {"
        " if (!m.querySelector('[data-tab2]')) m.remove(); }); }"
    )


def main() -> int:
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

        page.evaluate(SET_READY)
        page.wait_for_timeout(200)
        kill_modals(page)

        # 打开面板 → 店铺页
        page.click('[data-tab="shop"]', force=True)
        page.wait_for_timeout(400)
        kill_modals(page)
        page.evaluate(
            "() => { const b = document.querySelector('[data-tab2=\"shop\"]'); if (b) b.click(); }"
        )
        page.wait_for_timeout(400)

        before = page.evaluate(READ)
        remark = next((m for m in before["metas"] if m.startswith("评委")), "")
        checks["panel_found"] = bool(before["found"])
        checks["head_is_grade"] = "段位评定" in (before["head"] or "")
        checks["fee_shown"] = any("评定费" in m for m in list(before["metas"]) + list(before["names"]))
        checks["remark_present"] = bool(remark) and len(remark) > 8
        checks["remark_is_text"] = bool(remark) and not re.search(r"[0-9０-９]", remark)
        checks["level_starts_zero"] = before["level"] == 0
        checks["btn_enabled"] = bool(before["hasBtn"] and before["enabled"])
        page.screenshot(path=str(OUT / "01-review-ready.png"))

        page.click('[data-act="grade"]', force=True)
        page.wait_for_timeout(700)
        after = page.evaluate(READ)
        toasts = page.evaluate(READ_TOASTS)
        joined = " ".join(toasts)
        checks["level_up"] = after["level"] == before["level"] + 1
        checks["toast_has_remark"] = "评委" in joined
        checks["save_version"] = page.evaluate(
            "() => JSON.parse(localStorage.getItem('laoyou.save.v4') || '{}').saveVersion ?? -1"
        ) == SAVE_VERSION
        checks["console_clean"] = not errors
        page.screenshot(path=str(OUT / "02-review-after.png"))

        report = {
            "ok": all(checks.values()),
            "checks": checks,
            "before": before,
            "after": after,
            "toasts": toasts,
            "errors": errors[:5],
        }
        (OUT / "review-report.json").write_text(
            json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8"
        )
        print(json.dumps(report, ensure_ascii=False))
        browser.close()
    return 0 if all(checks.values()) else 1


if __name__ == "__main__":
    raise SystemExit(main())
