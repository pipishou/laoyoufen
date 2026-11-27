# -*- coding: utf-8 -*-
"""探针：设置页（批 G′）—— 五项都在、改了立刻存、重开还在、高对比真的换色板。

用法：
    npx vite preview --port 4223
    $env:PW_URL="http://localhost:4223/"; python -X utf8 tools/gate/settings_probe.py
"""
import json
import os

from playwright.sync_api import sync_playwright
from probe_version import SAVE_VERSION

URL = os.environ.get("PW_URL", "http://localhost:4223/")
EVID = os.path.join("game", "data", "evidence", "settings")


def main() -> None:
    os.makedirs(EVID, exist_ok=True)
    checks: dict[str, bool] = {}
    errors: list[str] = []

    with sync_playwright() as p:
        b = p.chromium.launch()
        pg = b.new_page(viewport={"width": 1440, "height": 900})
        pg.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
        pg.goto(URL, wait_until="load")
        pg.wait_for_timeout(700)

        # 开局：选街边摊 → 起名 → 开门
        pg.click('.sitecard[data-site="alley"]')
        pg.wait_for_timeout(200)
        chips = pg.query_selector_all("[data-chips] .chip")
        if chips:
            chips[0].click()
        pg.wait_for_timeout(150)
        pg.click("[data-open]")
        pg.wait_for_timeout(500)

        # 1) 顶栏有「设置」，点开有五行
        btn = pg.query_selector("[data-prefs]")
        checks["button_present"] = bool(btn and btn.is_visible())
        btn.click()
        pg.wait_for_timeout(220)
        rows = pg.query_selector_all("[data-prefs-body] .prefrow")
        checks["six_rows"] = len(rows) == 6
        names = [r.query_selector(".prefname").inner_text() for r in rows]
        checks["names_cn"] = names == ["音乐", "音效", "音量", "高对比", "大字", "恢复默认"]
        pg.screenshot(path=os.path.join(EVID, "01-settings-open.png"))

        # 2) 关音乐 → localStorage 立刻变
        pg.click('.prefmodal [data-pref="music"]')
        pg.wait_for_timeout(120)
        raw = pg.evaluate("() => localStorage.getItem('laoyou.prefs.v1')")
        prefs = json.loads(raw) if raw else {}
        checks["music_off_saved"] = prefs.get("music") is False
        checks["music_row_says_off"] = pg.inner_text('.prefmodal [data-pref="music"]').strip() == "关"

        # 3) 音量两下 → 高
        pg.click('.prefmodal [data-pref="volume"]')
        pg.wait_for_timeout(120)
        prefs = json.loads(pg.evaluate("() => localStorage.getItem('laoyou.prefs.v1')"))
        checks["volume_cycles"] = prefs.get("volume") == "high"
        checks["volume_row_cn"] = pg.inner_text('.prefmodal [data-pref="volume"]').strip() == "高"

        # 4) 高对比 → 根节点 class，色板真的换了
        pg.click('.prefmodal [data-pref="contrast"]')
        pg.wait_for_timeout(150)
        cls = pg.evaluate("() => document.documentElement.className")
        token = pg.evaluate(
            "() => getComputedStyle(document.documentElement).getPropertyValue('--ink').trim()"
        )
        checks["contrast_class"] = "prefs-contrast" in cls
        checks["contrast_token_dark"] = token in ("#000000", "#000")
        pg.screenshot(path=os.path.join(EVID, "02-settings-contrast.png"))

        # 5) 大字也开，顶栏数字变大
        before = pg.evaluate(
            "() => parseFloat(getComputedStyle(document.querySelector('#hud .stat .v') || document.querySelector('#float .v')).fontSize)"
        )
        pg.click('.prefmodal [data-pref="bigText"]')
        pg.wait_for_timeout(180)
        after = pg.evaluate(
            "() => parseFloat(getComputedStyle(document.querySelector('#hud .stat .v') || document.querySelector('#float .v')).fontSize)"
        )
        checks["bigtext_bigger"] = after > before

        # 6) 关掉再开，设置还在
        pg.click("[data-prefs-close]")
        pg.wait_for_timeout(150)
        checks["modal_closes"] = not pg.is_visible(".prefmodal .prefbox")
        pg.click("[data-prefs]")
        pg.wait_for_timeout(200)
        checks["persist_on_reopen"] = pg.inner_text('.prefmodal [data-pref="music"]').strip() == "关"
        pg.screenshot(path=os.path.join(EVID, "03-settings-reopen.png"))

        # 7) 刷新页面后仍然生效（存在本机）
        pg.reload(wait_until="load")
        pg.wait_for_timeout(600)
        cls2 = pg.evaluate("() => document.documentElement.className")
        checks["survives_reload"] = "prefs-contrast" in cls2

        # 7b) 恢复默认：点一下回到「全开 + 音量中 + 高对比关」（P281）
        pg.click("[data-prefs]")
        pg.wait_for_timeout(200)
        checks["reset_row_present"] = pg.query_selector('.prefmodal [data-pref="reset"]') is not None
        pg.click('.prefmodal [data-pref="reset"]')
        pg.wait_for_timeout(150)
        checks["reset_back_to_mid"] = pg.inner_text('.prefmodal [data-pref="volume"]').strip() == "中"
        checks["reset_music_on"] = pg.inner_text('.prefmodal [data-pref="music"]').strip() == "开"
        checks["reset_contrast_off"] = "prefs-contrast" not in pg.evaluate("() => document.documentElement.className")
        pg.click("[data-prefs-close]")

        # 8) 存档版本没被这一改动带跑
        pg.wait_for_timeout(200)
        ver = pg.evaluate(
            """() => { try { const s = JSON.parse(localStorage.getItem('laoyou.save.v4') || '{}'); return s.saveVersion ?? 0; } catch (e) { return -1; } }"""
        )
        checks["save_version"] = ver == SAVE_VERSION

        clean = [e for e in errors if "laoyou-api/line" not in e and "Failed to load resource" not in e]
        checks["console_clean"] = not clean

        b.close()

    ok = all(checks.values())
    print(json.dumps({"ok": ok, "checks": checks, "errors": errors[:5]}, ensure_ascii=False))
    raise SystemExit(0 if ok else 1)


if __name__ == "__main__":
    main()
