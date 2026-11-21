"""街坊报（A11）真点探针：在真浏览器里写三条报，然后打开图鉴看它们长什么样。

流程：清档 → 建店（alley）→ 收引导 → 注入 news 三条（不同类别）→ 切图鉴
      → 读 .nrow 数量与首条日期/正文 → 截图
判据：三条都在、日期是「X月X日」中文写法、正文里没有占位符 `{`、console 无错。
"""
from __future__ import annotations

import json
import pathlib
import sys
import time

from playwright.sync_api import sync_playwright

URL = "http://127.0.0.1:4202/"
OUT = pathlib.Path(r"D:\项目\REA\REA\重构\老友粉店\game\data\evidence\a11")
OUT.mkdir(parents=True, exist_ok=True)

SEED_NEWS = [
    {"month": 0, "day": 1, "text": "巷口新开一间粉店，老板凌晨四点就起来熬汤。", "kind": "open", "kairo": "news：开店报道"},
    {"month": 0, "day": 2, "text": "明秀路那边最近人少了些，老板站在门口抽烟。", "kind": "rival", "kairo": "news：同行风波"},
    {"month": 0, "day": 3, "text": "街坊凑钱修的那段路，雨天终于不积水。", "kind": "street", "kairo": "news：街区变化"},
]


def main() -> int:
    checks: dict[str, object] = {}
    errors: list[str] = []

    with sync_playwright() as pw:
        browser = pw.chromium.launch()
        page = browser.new_page(viewport={"width": 1440, "height": 900})
        page.on("console", lambda m: errors.append(m.text) if m.type == "error" and "/laoyou-api/" not in (m.location or {}).get("url", "") and "favicon" not in (m.location or {}).get("url", "") else None)
        page.goto(URL, wait_until="networkidle")
        page.evaluate("() => localStorage.clear()")
        page.reload(wait_until="networkidle")

        # 建店 + 收引导
        page.click('.sitecard[data-site="alley"]')
        page.wait_for_timeout(200)
        page.click("[data-chips] .chip")
        page.click("[data-open]")
        page.wait_for_timeout(400)
        for _ in range(6):
            btn = page.query_selector(".gbtn.ghost")
            if not btn:
                break
            try:
                btn.click(timeout=1200)
            except Exception:
                break
            page.wait_for_timeout(120)

        # 注入三条报
        page.evaluate(
            "(rows) => { const s = window.__laoyou.state; s.news = rows.slice(); window.__laoyou.refresh(); }",
            SEED_NEWS,
        )
        page.wait_for_timeout(300)
        page.click('[data-tab="collection"]', force=True)
        page.wait_for_timeout(400)

        rows = page.eval_on_selector_all(
            ".nrow",
            "els => els.map(e => ({ date: e.querySelector('.ndate')?.textContent ?? '', text: e.querySelector('.ntext')?.textContent ?? '' }))",
        )
        header = page.eval_on_selector_all(".sechd", "els => els.map(e => e.textContent).filter(t => t.indexOf('街坊报') >= 0)")
        checks["rows_three"] = len(rows) == 3
        checks["header_present"] = len(header) == 1 and "最近 3 天" in (header[0] or "")
        checks["date_cn"] = bool(rows) and all(("月" in r["date"] and "日" in r["date"]) for r in rows)
        checks["no_placeholder"] = all("{" not in r["text"] for r in rows)
        checks["newest_first"] = bool(rows) and "不积水" in rows[0]["text"]
        checks["store_version"] = page.evaluate("() => window.__laoyou.state.news.length") == 3

        page.screenshot(path=str(OUT / "14-news.png"), full_page=False)
        checks["console_clean"] = len(errors) == 0
        browser.close()

    ok = all(bool(v) for k, v in checks.items() if k != "console_errors")
    report = {"ok": ok, "checks": checks, "rows": rows, "console_errors": errors}
    (OUT / "news-report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False))
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
