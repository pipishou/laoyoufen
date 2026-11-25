# -*- coding: utf-8 -*-
"""长跑试玩门（批 AL′，2026-11-25）—— 从「评估脚本」硬化成「门」。

来历：读三个「游戏工作室」移植版时，bullish0x 的 `/soak-test` 协议点破一件事 ——
我们的门里**没有一条是「连着跑很久」**：`eye_gate` 只看一帧的颜色数，探针各管一处 DOM，
替身四种子跑的是模拟层（不碰界面）。界面层能不能连着跑二十个游戏日、堆会不会一直长，
从来没人量过。`tools/gate/autoplay_probe.py` 是那次评估的实验脚本，它只打印数字、不判真假。

这一份判六件事，任何一件不达标就 exit 1：

  1. `days_reached`    连着开店至少 `--min-days` 个游戏日（默认 20）
  2. `phase_playing`   全程没掉出 playing（报账单挂着、现金没见底）
  3. `fps_min`         采样里最差那一帧不低于 `--min-fps`（默认 30）
  4. `fps_avg`         平均帧率不低于 `--min-fps-avg`（默认 45）
  5. `errors_clean`    控制台 error 与 pageerror 全在白名单里（只许接口 404 那类）
  6. `http_only_api`   所有 4xx/5xx 请求都落在 `/laoyou-api/`（本作没有别的外部依赖）
  7. `heap_bounded`    末段堆相对首段的增长不超过 `--heap-growth`（默认 0.6）

堆采样只有在浏览器暴露 `performance.memory` 时才算数（Chromium 有，Firefox 没有）；
拿不到就记 `heap_bounded: null`，**不判失败**（宁可不判，也不假装量过）。

跑法（在仓库根；先起预览服务）：
    npx vite preview --port 4246 --strictPort          # 另一个窗口 / 后台 job
    python -X utf8 tools/gate/playthrough_gate.py --url http://localhost:4246/ --minutes 5
输出：`game/data/evidence/playthrough/{run.json,01-start.png,02-mid.png,03-end.png}`
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
GAME = ROOT / "game"
EVIDENCE = GAME / "data" / "evidence" / "playthrough"

# 复用评估脚本里的契约注入（同一份 INIT，免得两处走散）
sys.path.insert(0, str(HERE))
from autoplay_probe import INIT  # noqa: E402  —— 路径要先插进去

# 控制台噪音白名单：预览环境没有后端，接口 404 是良性的；别的 error 一律算账
ERROR_ALLOW = (
    "Failed to load resource",
    "net::ERR",
    "/laoyou-api/",
    "favicon",
    "the server responded with a status of 404",
)


def heap_now(page) -> int:
    try:
        return int(page.evaluate("() => (performance.memory ? performance.memory.usedJSHeapSize : 0)"))
    except Exception:  # noqa: BLE001 - 拿不到就当没量到
        return 0


def launch(pw):
    for kwargs in ({"args": ["--force-device-scale-factor=1"]}, {"channel": "msedge"}, {"channel": "chrome"}):
        try:
            return pw.chromium.launch(**kwargs), kwargs.get("channel", "bundled-chromium")
        except Exception:  # noqa: BLE001 - 逐个候选试
            continue
    raise RuntimeError("无可用浏览器")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--url", default="http://localhost:4246/")
    ap.add_argument("--minutes", type=float, default=5.0)
    ap.add_argument("--min-days", type=int, default=20)
    ap.add_argument("--min-fps", type=float, default=30.0)
    ap.add_argument("--min-fps-avg", type=float, default=45.0)
    ap.add_argument("--max-api-per-day", type=float, default=3.0, help="一天最多打几次一句话接口（P429 的判据）")
    ap.add_argument("--heap-growth", type=float, default=0.6)
    ap.add_argument("--keep-open", action="store_true")
    args = ap.parse_args()

    EVIDENCE.mkdir(parents=True, exist_ok=True)
    for old in EVIDENCE.glob("*.png"):
        old.unlink()

    from playwright.sync_api import sync_playwright

    errors: list[str] = []
    bad_http: list[str] = []
    report: dict = {"url": args.url, "minutes": args.minutes, "checks": {}}

    with sync_playwright() as pw:
        browser, name = launch(pw)
        report["browser"] = name
        ctx = browser.new_context(viewport={"width": 1440, "height": 900}, device_scale_factor=1)
        page = ctx.new_page()
        page.on("console", lambda m: errors.append(m.text[:300]) if m.type == "error" else None)
        page.on("pageerror", lambda e: errors.append(f"pageerror: {e}"[:300]))
        page.on("response", lambda r: bad_http.append(f"{r.status} {r.url}") if r.status >= 400 else None)
        page.add_init_script(INIT)
        page.goto(args.url, wait_until="load", timeout=30000)
        page.wait_for_selector("#game canvas", timeout=15000)
        page.wait_for_timeout(1200)

        # 开局三连（与各探针同序：选地址 → 挑风格 → 开门 → 上工）
        page.evaluate("() => document.querySelector('.sitecard[data-site=\"alley\"]')?.click()")
        page.wait_for_timeout(250)
        page.evaluate("() => document.querySelector('[data-chips] .chip')?.click()")
        page.wait_for_timeout(250)
        page.evaluate("() => document.querySelector('[data-open]')?.click()")
        page.wait_for_timeout(400)
        page.evaluate("() => document.querySelector('.gbtn.ghost')?.click()")
        page.wait_for_timeout(600)
        page.screenshot(path=str(EVIDENCE / "01-start.png"))

        fps: list[float] = []
        heaps: list[int] = []
        actions: dict[str, int] = {}
        days = 0
        stuck = 0
        started = time.time()
        next_heap = started
        mid_done = False
        budget = args.minutes * 60

        while time.time() - started < budget:
            state = page.evaluate("() => window.__gameState()")
            if isinstance(state.get("fps"), (int, float)):
                fps.append(float(state["fps"]))
            # `phase` 不是 playing 有两种：报账单挂着（正常的、下一拍就被点掉）、真卡住。
            # 前者只会持续一两拍，所以只有「连续 40 拍（约 4 秒）都不是 playing」才算掉出去。
            stuck = stuck + 1 if state.get("phase") != "playing" else 0
            left_playing = stuck >= 40
            days = max(days, int(state.get("time") or 0))
            act = page.evaluate("() => window.__autoplay(window.__gameState())")
            actions[act] = actions.get(act, 0) + 1
            now = time.time()
            if now >= next_heap:
                h = heap_now(page)
                if h > 0:
                    heaps.append(h)
                next_heap = now + max(15.0, budget / 12.0)
            if not mid_done and now - started > budget / 2:
                page.screenshot(path=str(EVIDENCE / "02-mid.png"))
                mid_done = True
            page.wait_for_timeout(100)

        page.screenshot(path=str(EVIDENCE / "03-end.png"))
        hud = page.evaluate(
            """() => ({
              cash: document.querySelector('[data-cash]')?.textContent ?? '',
              date: document.querySelector('.date')?.textContent ?? '',
              canvas: !!document.querySelector('#game canvas'),
            })"""
        )
        if not args.keep_open:
            browser.close()

    fps_min = min(fps) if fps else 0
    fps_avg = round(sum(fps) / len(fps), 1) if fps else 0
    bad_errors = [e for e in errors if not any(a in e for a in ERROR_ALLOW)]
    off_api = [r for r in bad_http if "/laoyou-api/" not in r]
    # 一句话通道被打了多少次：这一项守的是 P429（失败无冷却会让它一天十几次）
    line_calls = [r for r in bad_http if "/laoyou-api/line" in r]
    per_day = round(len(line_calls) / max(1, days), 2)

    heap_growth = None
    if len(heaps) >= 4:
        head = sorted(heaps[:3])[0]
        tail = sorted(heaps[-3:])[0]
        if head > 0:
            heap_growth = round((tail - head) / head, 3)

    checks = {
        "hud_alive": bool(hud.get("canvas")) and str(hud.get("cash", "")).strip() != "",
        "days_reached": days >= args.min_days,
        "phase_playing": not left_playing,
        "fps_min": fps_min >= args.min_fps,
        "fps_avg": fps_avg >= args.min_fps_avg,
        "errors_clean": len(bad_errors) == 0,
        "http_only_api": len(off_api) == 0,
        # 一天最多打几次一句话接口：冷却修好之后应当是「几次」，不是一个游戏日十几次
        "api_budget": per_day <= args.max_api_per_day,
        "heap_bounded": None if heap_growth is None else heap_growth <= args.heap_growth,
    }
    failed = [k for k, v in checks.items() if v is False]

    report.update(
        {
            "checks": checks,
            "failed": failed,
            "days": days,
            "fps": {"min": fps_min, "avg": fps_avg, "n": len(fps)},
            "heap": {"samples": heaps, "growth": heap_growth},
            "errors": errors[:20],
            "bad_errors": bad_errors[:20],
            "http_4xx": bad_http[:20],
            "off_api": off_api[:20],
            "actions": actions,
            "line_calls": len(line_calls),
            "line_per_day": per_day,
            "hud": hud,
        }
    )
    (EVIDENCE / "run.json").write_text(json.dumps(report, ensure_ascii=False, indent=1), encoding="utf-8")

    print(f"[playthrough] 跑了 {args.minutes:g} 分钟 · 到第 {days} 天 · 动作 {actions}")
    print(f"[playthrough] fps min {fps_min} / avg {fps_avg}（采样 {len(fps)} 次）")
    print(f"[playthrough] 堆采样 {len(heaps)} 次 · 增长 {heap_growth if heap_growth is not None else '未量到'}")
    print(f"[playthrough] 一句话接口 {len(line_calls)} 次（{per_day} 次/天，上限 {args.max_api_per_day}）")
    print(f"[playthrough] console error {len(errors)} 条（其中不在白名单 {len(bad_errors)} 条）· 4xx {len(bad_http)} 条（不在接口 {len(off_api)} 条）")
    for k, v in checks.items():
        mark = "—" if v is None else ("ok" if v else "FAIL")
        print(f"  {mark:5} {k}")
    if failed:
        print(f"[playthrough] 不通过：{', '.join(failed)}")
        print(f"[playthrough] 证据 → {EVIDENCE}")
        return 1
    print(f"[playthrough] 全通过 · 证据 → {EVIDENCE}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
