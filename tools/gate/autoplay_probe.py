# -*- coding: utf-8 -*-
"""无人值守试玩（评估用，照 dsh-game-studio 的 playtest 契约抄一遍自家游戏）。

**这不是新门**，是为了回答「那个插件对我们的游戏有没有用」而做的一次对照实验：
把它的 `window.__gameState()` / `window.__autoplay(state)` 契约 + 10Hz 循环 +
fps 采样 + 中途/结束截图 + 控制台与 4xx 抓取，原样套到《老友粉店》身上，
看它能不能真的把一局「开店 → 报账 → 明天」跑起来，以及能不能抓到我们现有门抓不到的东西。

跑法（在仓库根）：
    python -X utf8 tools/gate/autoplay_probe.py --url http://localhost:4244/ --seconds 60
输出：`game/data/evidence/autoplay/{run.json,01-title.png,02-mid.png,03-end.png}`
"""

from __future__ import annotations

import argparse
import json
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
GAME = ROOT / "game"
EVIDENCE = GAME / "data" / "evidence" / "autoplay"

# 照别人的契约注入两个函数：
#   __gameState()  —— 一帧世界的可读快照
#   __autoplay(s)  —— 只有试玩时会调，每次做一个「合理的动作」
# 我们的游戏不是「一个人拿方向键跑」，所以走的是契约里给「管理/卡牌/格盘」留的那条路。
INIT = r"""
(() => {
  // 帧率：自己算，因为游戏没吐 fps（对方的契约要求 state.fps）
  let frames = 0, fps = 60, t0 = performance.now();
  const tick = () => {
    frames += 1;
    const now = performance.now();
    if (now - t0 >= 500) { fps = Math.round((frames * 1000) / (now - t0)); frames = 0; t0 = now; }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);

  const q = (sel) => document.querySelector(sel);
  const seen = () => {
    const el = q(sel => sel); // 占位，避免 lint 误会
    return el;
  };
  const visible = (el) => {
    if (!el) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };
  // 按钮被置灰就是「这条路现在走不通」—— 点上去是空转，别算成有效动作
  const usable = (el) => el && !el.disabled && visible(el);

  window.__gameState = () => {
    const s = (window.__laoyou && window.__laoyou.state) || null;
    const day = s ? (s.month ?? 1) * 30 + (s.day ?? 1) : 0;
    const cash = s ? Math.round(s.cash ?? 0) : 0;
    // 判「这一局还在打」：报账弹窗没开、现金没见底
    const report = q(".modal.dayreport");
    const playing = !(report && !report.hasAttribute("hidden")) && cash > -50000;
    return {
      phase: playing ? "playing" : "won",   // 我们的「一局」= 一直开着店，没有输赢
      score: cash,
      hearts: s && s.venue ? (s.venue.seats ?? 0) : 0,
      fps,
      hero: { x: 0, y: 0 },
      pickups: [],
      enemies: [],
      world: { w: 96, h: 96, size: 12 },
      time: day,
    };
  };

  window.__autoplay = (state) => {
    // 1) 有事件先答话（不然时间不走）
    const evt = document.querySelector('.evtbtn[data-evt-choice="0"]');
    if (usable(evt)) { evt.click(); return "event"; }

    // 2) 报账单挂着就翻篇
    const next = document.querySelector("[data-day-next]");
    if (usable(next)) { next.click(); return "next-day"; }

    // 3) 没开门就开门（顺带把时间倍速拉到最快，否则一局要两分钟）
    const pill = document.querySelector("[data-openpill]");
    if (usable(pill)) {
      pill.click();
      const speeds = [...document.querySelectorAll("[data-speed]")];
      const last = speeds[speeds.length - 1];
      if (last && !last.disabled) last.click();
      return "open";
    }

    // 4) 什么都不用做 —— 让时间自己走
    return "wait";
  };
  window.__probeReady = true;
})();
"""


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--url", default="http://localhost:4244/")
    ap.add_argument("--seconds", type=int, default=60)
    ap.add_argument("--keep-open", action="store_true", help="跑完不关浏览器（调试用）")
    args = ap.parse_args()

    EVIDENCE.mkdir(parents=True, exist_ok=True)
    for old in EVIDENCE.glob("*.png"):
        old.unlink()

    from playwright.sync_api import sync_playwright

    report = {
        "url": args.url,
        "seconds": args.seconds,
        "browser": "",
        "errors": [],
        "requests": [],
        "actions": {},
        "fps": None,
        "phase_seen": [],
        "days_played": 0,
        "final": {},
        "shots": [],
    }

    def launch(pw):
        for kwargs in ({"args": ["--force-device-scale-factor=1"]}, {"channel": "msedge"}, {"channel": "chrome"}):
            try:
                return pw.chromium.launch(**kwargs), kwargs.get("channel", "bundled-chromium")
            except Exception:  # noqa: BLE001 - 逐个候选试
                continue
        raise RuntimeError("无可用浏览器")

    with sync_playwright() as pw:
        browser, name = launch(pw)
        report["browser"] = name
        ctx = browser.new_context(viewport={"width": 1440, "height": 900}, device_scale_factor=1)
        page = ctx.new_page()
        page.on("console", lambda m: report["errors"].append(m.text[:300]) if m.type == "error" else None)
        page.on("pageerror", lambda e: report["errors"].append(str(e)[:300]))
        page.on(
            "response",
            lambda r: report["requests"].append(f"{r.status} {r.url}") if r.status >= 400 else None,
        )
        page.add_init_script(INIT)
        page.goto(args.url, wait_until="load", timeout=30000)
        page.wait_for_selector("#game canvas", timeout=15000)
        page.wait_for_timeout(1200)

        # 开局三连（照现成探针的顺序）
        page.evaluate("() => document.querySelector('.sitecard[data-site=\"alley\"]')?.click()")
        page.wait_for_timeout(250)
        page.evaluate("() => document.querySelector('[data-chips] .chip')?.click()")
        page.wait_for_timeout(250)
        page.evaluate("() => document.querySelector('[data-open]')?.click()")
        page.wait_for_timeout(400)
        page.evaluate("() => document.querySelector('.gbtn.ghost')?.click()")
        page.wait_for_timeout(600)

        page.screenshot(path=str(EVIDENCE / "01-title.png"))
        report["shots"].append("01-title.png")

        ready = page.evaluate("() => typeof window.__gameState === 'function'")
        report["contract"] = {"gameState": ready}

        fps_samples: list[float] = []
        started = time.time()
        mid_taken = False
        last_day = -1
        while time.time() - started < args.seconds:
            state = page.evaluate("() => window.__gameState()")
            if isinstance(state.get("fps"), (int, float)):
                fps_samples.append(float(state["fps"]))
            day = int(state.get("time") or 0)
            if day != last_day:
                report["days_played"] = max(report["days_played"], day)
                last_day = day
            if state.get("phase") and state["phase"] not in [p for p, _ in report["phase_seen"]]:
                report["phase_seen"].append([state["phase"], round(time.time() - started, 1)])
            act = page.evaluate("() => window.__autoplay(window.__gameState())")
            report["actions"][act] = report["actions"].get(act, 0) + 1
            if not mid_taken and time.time() - started > args.seconds / 2:
                page.screenshot(path=str(EVIDENCE / "02-mid.png"))
                report["shots"].append("02-mid.png")
                mid_taken = True
            page.wait_for_timeout(100)

        final = page.evaluate("() => window.__gameState()")
        report["final"] = final
        page.screenshot(path=str(EVIDENCE / "03-end.png"))
        report["shots"].append("03-end.png")

        if fps_samples:
            report["fps"] = {"min": min(fps_samples), "avg": round(sum(fps_samples) / len(fps_samples)), "n": len(fps_samples)}

        hud = page.evaluate(
            """() => ({
              cash: document.querySelector('[data-cash]')?.textContent ?? '',
              date: document.querySelector('.date')?.textContent ?? '',
              why: [...document.querySelectorAll('.daywhy span')].map(e => e.textContent).filter(Boolean).slice(0, 6),
              customers: document.querySelector('[data-today]')?.textContent ?? '',
            })"""
        )
        report["hud"] = hud
        if not args.keep_open:
            browser.close()

    (EVIDENCE / "run.json").write_text(json.dumps(report, ensure_ascii=False, indent=1), encoding="utf-8")

    print(f"[autoplay] browser={report['browser']} 契约 gameState={report.get('contract')}")
    print(f"[autoplay] 动作统计 {report['actions']}")
    print(f"[autoplay] 走到第 {report['days_played']} 天 · 现金 {report['final'].get('score')} · fps {report['fps']}")
    print(f"[autoplay] HUD {report['hud'].get('date')} · 今日客流 {report['hud'].get('customers')}")
    print(f"[autoplay] 控制台 error {len(report['errors'])} 条 · 4xx {len(report['requests'])} 条")
    print(f"[autoplay] 证据 → {EVIDENCE}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
