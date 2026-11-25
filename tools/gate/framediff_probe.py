# -*- coding: utf-8 -*-
"""帧差回归门（批 AL′，2026-11-25）—— 补 `eye_gate` 补不上的那一半。

来历：`eye_gate` 数的是「这一屏用了多少种颜色」（五视口 727 · 778 · … 色 + 一个 stamp），
它挡得住「把配色改崩」，**挡不住「颜色数没变、但东西整块挪了」**：
把一个按钮从左边移到右边、把一行字换成另一行字，色数照样是对的。
读 DSGS 的 `/grow`（`replay --as reference|copy` 做帧对帧比较、`match yes/no` 是硬判据）
时发现，这正是我们缺的那把尺子。

怎么用：

    # 1) 先存一份基准（只在「改了外观且确认没问题」的批次之后做）
    python -X utf8 tools/gate/framediff_probe.py --url http://localhost:4246/ --save-baseline

    # 2) 以后每批拿它当门：逐像素比，差出界就红
    python -X utf8 tools/gate/framediff_probe.py --url http://localhost:4246/

判据（默认最严）：**除了 `--allow` 给出的矩形，任何一个像素不同就算不通过。**
只改了一句文案的批次，用 `--allow "x,y,w,h"`（CSS 像素，可重复）把那一段圈出来，
其余像素必须逐点相同 —— 这就是 P417（只改说法的批次缺一个不靠经济数字的回归锁）的答案。

为了「同一状态截两张一定一样」，脚本先把状态钉死：
开局走完 → 把所有会自己动的字段（营业额、客流、时间）写成固定值 → 只截**面板**，
不截会动的画布（店里小图与客人踏步在 canvas 上，那部分归 `playthrough_gate` 管）。
"""

from __future__ import annotations

import argparse
import json
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
GAME = ROOT / "game"
EVIDENCE = GAME / "data" / "evidence" / "framediff"
BASELINE = EVIDENCE / "baseline"

# 三个视口：手机、平板、桌面。与 eye_gate 的取法一致，便于两把尺子对得上。
VIEWPORTS = [(375, 667), (768, 1024), (1440, 900)]

# 钉死状态：这些字段都只影响面板上的字，不会引起模拟推进（phase 停在 prep）
PIN = r"""
(() => {
  const s = window.__laoyou && window.__laoyou.state;
  if (!s) return false;
  s.phase = "prep";
  s.month = 3; s.day = 12;
  s.cash = 30000; s.reputation = 62; s.price = 10;
  s.totalCustomers = 420; s.todayCustomers = 12;
  s.flow.minuteOfDay = 8 * 60;
  s.flow.servedToday = 7; s.flow.lostToday = 3;
  s.flow.revenueToday = 70;
  s.flow.customers = [];
  s.dayReport = null;
  s.venue.seats = 6; s.venue.stoves = 2;
  // 灶 2 口、掌勺 1 个人 → 会多出「灶位」那一块。候选人是开局随机挑的（姓名与日薪都不同），
  // 不清掉这一块里的价钱句每跑都不一样 —— 清空候选后它固定说「今天没有煮粉的来问工」。
  s.staff.candidates = [];
  s.gradeLevel = 1;
  s.shopName = "老友粉店";
  window.__laoyou.refresh();
  // 开场那条 toast 上的店名是开局随机取的（秀灵／中山路…），不清掉画面每跑都不一样。
  const box = document.getElementById("toasts");
  if (box) { box.innerHTML = ""; box.style.display = "none"; }
  return true;
})()
"""


def capture(url: str, out: Path, keep_open: bool) -> str:
    from playwright.sync_api import sync_playwright

    out.mkdir(parents=True, exist_ok=True)
    browser_name = ""
    with sync_playwright() as pw:
        browser = None
        for kwargs in ({"args": ["--force-device-scale-factor=1"]}, {"channel": "msedge"}, {"channel": "chrome"}):
            try:
                browser = pw.chromium.launch(**kwargs)
                browser_name = kwargs.get("channel", "bundled-chromium")
                break
            except Exception:  # noqa: BLE001 - 逐个候选试
                continue
        if browser is None:
            raise RuntimeError("无可用浏览器")
        for w, h in VIEWPORTS:
            ctx = browser.new_context(viewport={"width": w, "height": h}, device_scale_factor=1)
            page = ctx.new_page()
            page.goto(url, wait_until="load", timeout=30000)
            page.wait_for_selector("#game canvas", timeout=15000)
            page.wait_for_timeout(1200)
            page.evaluate("() => document.querySelector('.sitecard[data-site=\"alley\"]')?.click()")
            page.wait_for_timeout(250)
            page.evaluate("() => document.querySelector('[data-chips] .chip')?.click()")
            page.wait_for_timeout(250)
            page.evaluate("() => document.querySelector('[data-open]')?.click()")
            page.wait_for_timeout(400)
            page.evaluate("() => document.querySelector('.gbtn.ghost')?.click()")
            page.wait_for_timeout(600)
            page.evaluate(PIN)
            page.wait_for_timeout(300)
            # 打开面板并切到「店里」页 —— 这一段是纯 DOM，最稳
            page.evaluate("() => document.querySelector('[data-tab=\"recipe\"]')?.click()")
            page.wait_for_timeout(300)
            page.evaluate("() => document.querySelector('[data-tab2=\"shop\"]')?.click()")
            page.wait_for_timeout(450)
            pane = page.query_selector(".pane[data-pane='shop']") or page.query_selector(".pane")
            target = pane or page
            target.screenshot(path=str(out / f"{w}x{h}.png"))
            ctx.close()
        if not keep_open:
            browser.close()
    return browser_name


def diff(now: Path, base: Path, boxes: list[tuple[int, int, int, int]]):
    from PIL import Image, ImageChops

    a = Image.open(now).convert("RGB")
    b = Image.open(base).convert("RGB")
    if a.size != b.size:
        return {"size_mismatch": True, "now": a.size, "baseline": b.size, "outside": -1, "total": -1}
    d = ImageChops.difference(a, b)
    gray = d.convert("L")
    # 把允许矩形涂黑（等于「这一块不算」）
    for x, y, w, h in boxes:
        for yy in range(max(0, y), min(gray.height, y + h)):
            for xx in range(max(0, x), min(gray.width, x + w)):
                gray.putpixel((xx, yy), 0)
    hist = gray.histogram()
    total_changed = sum(hist[1:])
    outside = total_changed
    bbox = gray.getbbox()
    return {
        "size_mismatch": False,
        "now": a.size,
        "baseline": b.size,
        "outside": outside,
        "total": sum(ImageChops.difference(a, b).convert("L").histogram()[1:]),
        "bbox": bbox,
    }


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--url", default="http://localhost:4246/")
    ap.add_argument("--save-baseline", action="store_true", help="把这次截图存成基准（改了外观且确认没问题时才用）")
    ap.add_argument("--allow", action="append", default=[], help='允许变化的矩形："x,y,w,h"（CSS 像素），可重复')
    ap.add_argument("--keep-open", action="store_true")
    args = ap.parse_args()

    boxes: list[tuple[int, int, int, int]] = []
    for spec in args.allow:
        parts = [int(p) for p in spec.replace(" ", "").split(",")]
        if len(parts) != 4:
            print(f"[framediff] --allow 写法不对：{spec}（应为 x,y,w,h）")
            return 2
        boxes.append(tuple(parts))  # type: ignore[arg-type]

    shots = EVIDENCE / "shots"
    if shots.exists():
        shutil.rmtree(shots)
    browser = capture(args.url, shots, args.keep_open)
    print(f"[framediff] 浏览器 {browser} · 截图 {len(VIEWPORTS)} 个视口 → {shots}")

    if args.save_baseline:
        if BASELINE.exists():
            shutil.rmtree(BASELINE)
        shutil.copytree(shots, BASELINE)
        print(f"[framediff] 基准已更新 → {BASELINE}")
        return 0

    if not BASELINE.exists():
        print(f"[framediff] 还没有基准：先跑一次 --save-baseline（基准目录 {BASELINE}）")
        return 2

    report: dict = {"url": args.url, "allow": boxes, "shots": {}, "cheatsheet": "eye_gate 数颜色，这一份比像素"}
    failed: list[str] = []
    for w, h in VIEWPORTS:
        name = f"{w}x{h}.png"
        now = shots / name
        base = BASELINE / name
        if not base.exists():
            print(f"[framediff] 基准里没有 {name}（基准是旧的？重跑一次 --save-baseline）")
            return 2
        r = diff(now, base, boxes)
        report["shots"][name] = r
        if r["size_mismatch"]:
            print(f"  FAIL {name}: 尺寸变了 {r['baseline']} → {r['now']}")
            failed.append(name)
            continue
        mark = "ok  " if r["outside"] == 0 else "FAIL"
        if r["outside"] != 0:
            failed.append(name)
        print(f"  {mark} {name}: 允许外变化 {r['outside']} px · 总变化 {r['total']} px · 边界 {r['bbox']}")

    report["failed"] = failed
    (EVIDENCE / "framediff-report.json").write_text(json.dumps(report, ensure_ascii=False, indent=1), encoding="utf-8")
    if failed:
        print(f"[framediff] 不通过：{', '.join(failed)} —— 要么把变化圈进 --allow，要么确认后重存基准")
        return 1
    print(f"[framediff] 全通过（{len(VIEWPORTS)} 个视口，允许外逐点相同）")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
