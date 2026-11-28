# -*- coding: utf-8 -*-
"""批 BJ′ 的探针：手机上装得进主屏、竖屏点得动（解 P550）。

判据（写进 `docs/手机BJ′-2026-11-28.md` 与 ACCEPTANCE 五·三十三）：
  1. `manifest.json` 能取到、内容类型 `application/json`，且字段齐全：
     name / short_name / id 绝对路径 / start_url / scope / display / orientation /
     background_color / theme_color，`prefer_related_applications` 缺省或 false；
  2. 图标同时有 192 与 512（只写一张 512 Chrome 判不可安装），且都返回 `image/png`；
  3. `index.html` 的 head 里有 7 条：manifest / theme-color /
     mobile-web-app-capable / apple-mobile-web-app-capable /
     apple-mobile-web-app-status-bar-style=black-translucent /
     apple-mobile-web-app-title / apple-touch-icon；
  4. 四个 `--safe-*` 变量在 :root 上是**真的定义了**（以前被引用但没人定义，
     等于没安全区），且 `--tap-min` 能算出 > 44 的数；
  5. 竖屏 360×640：舞台完整落在视口内（不被裁边）、顶部那枚「点我一键横屏」
     按钮出现且**真实屏幕像素**高度 ≥ 44；
  6. 竖屏能一路点完「开门 → 卖 → 日结」：只用真实 DOM 点击（建店卡 / 名字 /
     开张 / 关引导 / 倍速 / 明天继续），不塞任何测试后门；
  7. 日结单的「明天继续」真实像素高度 ≥ 44，点了真的进下一天；
  8. 横屏 667×375 时那枚竖屏按钮必须隐藏（别在横屏也糊一个按钮上去）；
  9. 桌面 1440×900 时同样隐藏，且控制台零 pageerror。

跑法（仓库根，先 `npm run -s build` 再起 `npx vite preview --port 4246 --strictPort`）：
    PW_URL=http://localhost:4246/ python -X utf8 tools/gate/bj_probe.py
"""
from __future__ import annotations

import json
import os
import sys
import urllib.request

from playwright.sync_api import sync_playwright

URL = os.environ.get("PW_URL", "http://localhost:4246/")
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = os.path.join(ROOT, "game", "data", "evidence", "bj-2026-11-28")
os.makedirs(OUT, exist_ok=True)

MANIFEST_URL = URL.rstrip("/") + "/manifest.json"
ICON_URLS = {
    "192": URL.rstrip("/") + "/icons/icon-192.png",
    "512": URL.rstrip("/") + "/icons/icon-512.png",
    "maskable": URL.rstrip("/") + "/icons/icon-512-maskable.png",
}

# 量「真实屏幕像素」：getBoundingClientRect 已经含 transform，这才是手指落点
MEASURE = """(sel) => {
  const el = document.querySelector(sel);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  const cs = getComputedStyle(el);
  return {
    w: Math.round(r.width), h: Math.round(r.height),
    x: Math.round(r.x), y: Math.round(r.y),
    visible: !el.hidden && cs.display !== 'none' && cs.visibility !== 'hidden',
    text: (el.textContent || '').trim().slice(0, 16),
  };
}"""

ROOT_VARS = """() => {
  const cs = getComputedStyle(document.documentElement);
  const get = (k) => (cs.getPropertyValue(k) || '').trim();
  // --tap-min 是 calc()，getPropertyValue 只会回未求值的字符串。
  // 真要拿到 px 得塞进一个元素量一次 —— 这也是探针唯一可信的算法。
  const probe = document.createElement('div');
  probe.style.cssText = 'position:absolute;left:-9999px;top:0;width:var(--tap-min);height:var(--tap-min);';
  document.body.appendChild(probe);
  const pr = probe.getBoundingClientRect();
  const tapMinPx = Math.round(Math.max(pr.width, pr.height));
  probe.remove();
  const stage = document.getElementById('stage');
  const r = stage ? stage.getBoundingClientRect() : null;
  return {
    safe: { top: get('--safe-top'), right: get('--safe-right'),
            bottom: get('--safe-bottom'), left: get('--safe-left') },
    tapMin: get('--tap-min'),
    tapMinPx,
    stageScale: get('--stage-scale'),
    stage: r ? { w: Math.round(r.width), h: Math.round(r.height),
                 x: Math.round(r.x), y: Math.round(r.y) } : null,
    vw: Math.round(window.visualViewport ? window.visualViewport.width : window.innerWidth),
    vh: Math.round(window.visualViewport ? window.visualViewport.height : window.innerHeight),
    bodyOverflow: getComputedStyle(document.body).overflow,
    htmlOverflow: getComputedStyle(document.documentElement).overflow,
  };
}"""

HEAD_TAGS = """() => {
  const out = {};
  out.manifest = document.querySelector('link[rel="manifest"]')?.getAttribute('href') || '';
  out.themeColor = document.querySelector('meta[name="theme-color"]')?.getAttribute('content') || '';
  out.mobileCapable = document.querySelector('meta[name="mobile-web-app-capable"]')?.getAttribute('content') || '';
  out.appleCapable = document.querySelector('meta[name="apple-mobile-web-app-capable"]')?.getAttribute('content') || '';
  out.appleStatus = document.querySelector('meta[name="apple-mobile-web-app-status-bar-style"]')?.getAttribute('content') || '';
  out.appleTitle = document.querySelector('meta[name="apple-mobile-web-app-title"]')?.getAttribute('content') || '';
  out.appleIcon = document.querySelector('link[rel="apple-touch-icon"]')?.getAttribute('href') || '';
  return out;
}"""

# 只用真实点击走完 开门 → 卖 → 日结，不塞后门
ENTER = """(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const tap = (sel) => {
    const el = document.querySelector(sel);
    if (!el) return false;
    el.click();
    return true;
  };
  for (let i = 0; i < 80; i += 1) {
    if (window.__laoyou && window.__laoyou.state) break;
    await sleep(100);
  }
  const steps = {};
  steps.card = tap('.sitecard[data-site="alley"]');
  await sleep(250);
  steps.chip = tap('[data-chips] .chip');
  await sleep(250);
  steps.open = tap('[data-open]');
  await sleep(900);
  steps.guide = tap('.gbtn.ghost');
  await sleep(500);
  // 建店后 phase = prep，得按顶栏那枚「● 开门营业」才真的走时间
  steps.pill = tap('[data-openpill]');
  await sleep(700);
  steps.speed = tap('.spd[data-speed="16"]');
  await sleep(300);
  const s = window.__laoyou && window.__laoyou.state;
  return { steps, phase: s ? s.phase : null, minute: s ? s.flow.minuteOfDay : null };
})()"""

WAIT_CLOSING = """(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  for (let i = 0; i < 120; i += 1) {
    const s = window.__laoyou && window.__laoyou.state;
    if (s && s.phase === 'closing') return { ok: true, month: s.month, day: s.day, waited: i * 250 };
    await sleep(250);
  }
  const s = window.__laoyou && window.__laoyou.state;
  return { ok: false, phase: s ? s.phase : null, month: s ? s.month : null, day: s ? s.day : null };
})()"""

CLICK_NEXT = """(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const s0 = window.__laoyou.state;
  // 注意：endDay() 在写日结单之后就把 day 加了 1，所以「明天继续」
  // 不会让 day 变 —— 它只把 phase 从 closing 拉回 prep 并清掉日结单。
  const before = { month: s0.month, day: s0.day, phase: s0.phase, report: !!s0.dayReport };
  const btn = document.querySelector('[data-day-next]');
  if (!btn) return { ok: false, before, reason: 'no button' };
  btn.click();
  await sleep(900);
  const s1 = window.__laoyou.state;
  return {
    ok: true, before,
    after: { month: s1.month, day: s1.day, phase: s1.phase, report: !!s1.dayReport },
  };
})()"""


def fetch(url: str) -> tuple[int, str, bytes]:
    req = urllib.request.Request(url, headers={"User-Agent": "bj-probe"})
    with urllib.request.urlopen(req, timeout=10) as r:
        return r.status, r.headers.get("Content-Type", ""), r.read()


def main() -> int:
    checks: dict[str, bool] = {}
    detail: dict = {}
    errors: list[str] = []

    # —— ① manifest / 图标：走 HTTP 直取，不靠浏览器 ——
    try:
        st, ctype, body = fetch(MANIFEST_URL)
        man = json.loads(body.decode("utf-8"))
        detail["manifest"] = {"status": st, "contentType": ctype, "size": len(body),
                              "name": man.get("name"), "display": man.get("display"),
                              "orientation": man.get("orientation"),
                              "id": man.get("id"), "startUrl": man.get("start_url"),
                              "scope": man.get("scope"),
                              "icons": [i.get("sizes") for i in man.get("icons", [])]}
        checks["manifest_200"] = st == 200
        checks["manifest_json_type"] = "application/json" in ctype
        checks["manifest_name"] = bool(man.get("name")) and bool(man.get("short_name"))
        checks["manifest_id_absolute"] = str(man.get("id", "")).startswith("/")
        checks["manifest_start_url_relative"] = str(man.get("start_url", "")).startswith("./")
        checks["manifest_scope_slash_end"] = str(man.get("scope", "")).endswith("/")
        checks["manifest_display_fullscreen"] = man.get("display") == "fullscreen"
        checks["manifest_orientation"] = man.get("orientation") == "landscape"
        checks["manifest_colors"] = bool(man.get("background_color")) and bool(man.get("theme_color"))
        checks["manifest_prefer_false"] = man.get("prefer_related_applications") is False
        sizes = {i.get("sizes") for i in man.get("icons", [])}
        checks["manifest_has_192"] = "192x192" in sizes
        checks["manifest_has_512"] = "512x512" in sizes
        checks["manifest_has_maskable"] = any(
            "maskable" in str(i.get("purpose", "")) for i in man.get("icons", [])
        )
    except Exception as e:  # noqa: BLE001
        detail["manifest_error"] = str(e)
        for k in ("manifest_200", "manifest_json_type", "manifest_name",
                  "manifest_id_absolute", "manifest_start_url_relative",
                  "manifest_scope_slash_end", "manifest_display_fullscreen",
                  "manifest_orientation", "manifest_colors", "manifest_prefer_false",
                  "manifest_has_192", "manifest_has_512", "manifest_has_maskable"):
            checks[k] = False

    icons: dict[str, dict] = {}
    for key, url in ICON_URLS.items():
        try:
            st, ctype, body = fetch(url)
            icons[key] = {"status": st, "type": ctype, "size": len(body)}
        except Exception as e:  # noqa: BLE001
            icons[key] = {"error": str(e)}
    detail["icons"] = icons
    checks["icon_192"] = icons.get("192", {}).get("status") == 200 and \
        "image/png" in icons.get("192", {}).get("type", "")
    checks["icon_512"] = icons.get("512", {}).get("status") == 200 and \
        "image/png" in icons.get("512", {}).get("type", "")
    checks["icon_maskable"] = icons.get("maskable", {}).get("status") == 200

    with sync_playwright() as pw:
        browser = pw.chromium.launch()

        # —— ② 手机竖屏 360×640：全流程真实点击 ——
        ctx = browser.new_context(viewport={"width": 360, "height": 640}, device_scale_factor=2,
                                  has_touch=True, is_mobile=True)
        page = ctx.new_page()
        page.on("pageerror", lambda e: errors.append(f"portrait: {e}"))
        page.goto(URL, wait_until="networkidle")
        page.wait_for_timeout(900)

        tags = page.evaluate(HEAD_TAGS)
        detail["head"] = tags
        checks["head_manifest"] = tags["manifest"] == "./manifest.json"
        checks["head_theme_color"] = tags["themeColor"] == "#2f2118"
        checks["head_mobile_capable"] = tags["mobileCapable"] == "yes"
        checks["head_apple_capable"] = tags["appleCapable"] == "yes"
        checks["head_apple_status"] = tags["appleStatus"] == "black-translucent"
        checks["head_apple_title"] = tags["appleTitle"] == "老友粉店"
        checks["head_apple_icon"] = tags["appleIcon"] == "./icons/icon-192.png"

        root_vars = page.evaluate(ROOT_VARS)
        detail["portrait_vars"] = root_vars
        safe = root_vars["safe"]
        checks["safe_area_defined"] = all(v.endswith("px") for v in safe.values())
        tap_min_px = root_vars.get("tapMinPx", 0)
        checks["tap_min_over_44"] = tap_min_px > 44
        stage = root_vars["stage"] or {}
        checks["portrait_stage_inside"] = (
            stage.get("x", -1) >= -1 and stage.get("y", -1) >= -1
            and stage.get("x", 1e9) + stage.get("w", 0) <= root_vars["vw"] + 1
            and stage.get("y", 1e9) + stage.get("h", 0) <= root_vars["vh"] + 1
        )
        checks["body_no_scroll"] = root_vars["bodyOverflow"] == "hidden" and \
            root_vars["htmlOverflow"] == "hidden"

        # 竖屏那枚一键横屏按钮
        rot = page.evaluate(MEASURE, ".rotatehint")
        detail["rotatehint_portrait"] = rot
        checks["portrait_rotatehint_visible"] = bool(rot and rot["visible"])
        checks["portrait_rotatehint_44"] = bool(rot and rot["h"] >= 44)

        # 建店卡那一屏：开张营业按钮
        sbtn = page.evaluate(MEASURE, ".sbtn.main")
        detail["portrait_sbtn"] = sbtn
        checks["portrait_sbtn_44"] = bool(sbtn and sbtn["h"] >= 44)

        # 引导恢复按钮（关引导后一直挂在屏幕上）
        page.screenshot(path=os.path.join(OUT, "01-portrait-setup-360x640.png"))

        enter = page.evaluate(ENTER)
        detail["enter"] = enter
        checks["portrait_open_ok"] = bool(enter.get("steps", {}).get("pill")) and \
            enter.get("phase") in ("open", "closing")

        restore = page.evaluate(MEASURE, ".guiderestore")
        detail["portrait_guiderestore"] = restore
        checks["portrait_guiderestore_44"] = bool(restore and restore["visible"] and restore["h"] >= 44)

        closing = page.evaluate(WAIT_CLOSING)
        detail["closing"] = closing
        checks["portrait_reach_closing"] = bool(closing.get("ok"))
        page.screenshot(path=os.path.join(OUT, "02-portrait-closing-360x640.png"))

        next_btn = page.evaluate(MEASURE, "[data-day-next]")
        detail["portrait_next"] = next_btn
        checks["portrait_next_44"] = bool(next_btn and next_btn["h"] >= 44)

        nxt = page.evaluate(CLICK_NEXT)
        detail["next_click"] = nxt
        # 「明天继续」的效果是 closing → prep 且清掉日结单，不是 day +1
        # （endDay() 在写日结单时就把 day 加过了）。这条判据曾经写错，
        # 断言 day 变了会永远红 —— 记进文档的「探针也会写错」一节。
        checks["portrait_day_advanced"] = bool(
            nxt.get("ok")
            and nxt["before"]["phase"] == "closing"
            and nxt["after"]["phase"] == "prep"
            and nxt["before"]["report"] is True
            and nxt["after"]["report"] is False
        )
        page.screenshot(path=os.path.join(OUT, "03-portrait-next-day-360x640.png"))
        ctx.close()

        # —— ③ 横屏 667×375：按钮必须藏起来 ——
        ctx2 = browser.new_context(viewport={"width": 667, "height": 375}, device_scale_factor=2,
                                   has_touch=True, is_mobile=True)
        page2 = ctx2.new_page()
        page2.on("pageerror", lambda e: errors.append(f"landscape: {e}"))
        page2.goto(URL, wait_until="networkidle")
        page2.wait_for_timeout(900)
        land_rot = page2.evaluate(MEASURE, ".rotatehint")
        land_vars = page2.evaluate(ROOT_VARS)
        detail["landscape"] = {"rotatehint": land_rot, "stage": land_vars["stage"],
                               "vw": land_vars["vw"], "vh": land_vars["vh"]}
        checks["landscape_rotatehint_hidden"] = not (land_rot and land_rot["visible"])
        st = land_vars["stage"] or {}
        checks["landscape_stage_inside"] = (
            st.get("x", -1) >= -1 and st.get("y", -1) >= -1
            and st.get("x", 1e9) + st.get("w", 0) <= land_vars["vw"] + 1
            and st.get("y", 1e9) + st.get("h", 0) <= land_vars["vh"] + 1
        )
        page2.screenshot(path=os.path.join(OUT, "04-landscape-667x375.png"))
        ctx2.close()

        # —— ④ 桌面 1440×900：同样不该出现竖屏按钮 ——
        ctx3 = browser.new_context(viewport={"width": 1440, "height": 900})
        page3 = ctx3.new_page()
        page3.on("pageerror", lambda e: errors.append(f"desktop: {e}"))
        page3.goto(URL, wait_until="networkidle")
        page3.wait_for_timeout(900)
        desk_rot = page3.evaluate(MEASURE, ".rotatehint")
        detail["desktop_rotatehint"] = desk_rot
        checks["desktop_rotatehint_hidden"] = not (desk_rot and desk_rot["visible"])
        page3.screenshot(path=os.path.join(OUT, "05-desktop-1440x900.png"))
        ctx3.close()

        browser.close()

    checks["no_pageerror"] = len(errors) == 0

    report = {"ok": all(checks.values()), "checks": checks, "detail": detail, "pageerrors": errors}
    with open(os.path.join(OUT, "probe.json"), "w", encoding="utf-8") as f:
        json.dump(report, f, ensure_ascii=False, indent=2)
    print(json.dumps(checks, ensure_ascii=False, indent=2))
    bad = [k for k, v in checks.items() if not v]
    print("FAIL: " + ", ".join(bad) if bad else "ALL PASS")
    return 0 if report["ok"] else 1


if __name__ == "__main__":
    sys.exit(main())
