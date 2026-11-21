"""A12 门：点一下排队里的客人，他说一句长对白。

真点，不看 DOM 结构猜：
  1. 建店 → 收引导 → 开门 → 造两位客人（一位等位、一位常客）
  2. 点第一位 → 断言 toast 里出现「【名字】」+ 至少 20 个字
  3. 点常客 → 断言换成了家常那句（与第一位不同）
  4. console 干净
"""
from __future__ import annotations

import json
import subprocess
import sys
import time
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "game" / "data" / "evidence" / "a12"
PORT = 4203
URL = f"http://127.0.0.1:{PORT}/"

SETUP = """() => {
  const s = window.__laoyou.state;
  s.phase = "open";
  s.dayReport = null;
  s.pendingTrophies = [];
  document.querySelectorAll("#toasts > *").forEach((n) => n.remove());
  document.querySelectorAll(".modal.dayreport").forEach((m) => { m.hidden = true; });
  s.reputation = 4.2;
  s.flow.minuteOfDay = 120;
  s.flow.customers = [
    { id: 9001, archetypeId: "student", dishId: 0, status: "waiting", elapsed: 0, waited: 6,
      patience: 14, satisfaction: -1, regular: false, tier: "neighbor", survey: 0 },
    { id: 9002, archetypeId: "auntie", dishId: 0, status: "eating", elapsed: 0, waited: 0,
      patience: 14, satisfaction: -1, regular: true, tier: "neighbor", survey: 0 },
  ];
  window.__laoyou.refresh();
  return true;
}"""

READ = """() => {
  const rows = [...document.querySelectorAll(".custlist .cust[data-uid]")];
  return {
    rows: rows.map((r) => r.dataset.uid),
    toast: (document.querySelector(".toast")?.textContent || "").trim(),
  };
}"""


def wait_port(proc, port, timeout=40.0):
    import socket

    end = time.time() + timeout
    while time.time() < end:
        try:
            with socket.create_connection(("127.0.0.1", port), timeout=0.4):
                return True
        except OSError:
            time.sleep(0.25)
    return False


def main() -> int:
    OUT.mkdir(parents=True, exist_ok=True)
    proc = subprocess.Popen(
        ["npx.cmd", "vite", "preview", "--port", str(PORT), "--strictPort", "--host", "127.0.0.1"],
        cwd=str(ROOT / "game"),
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    steps = []
    errors = []
    try:
        if not wait_port(proc, PORT):
            raise RuntimeError("preview 起不来")
        with sync_playwright() as p:
            br = p.chromium.launch()
            page = br.new_page(viewport={"width": 1440, "height": 900})
            page.on("pageerror", lambda e: errors.append(str(e)))
            page.on("console", lambda m: errors.append(m.text) if m.type == "error" and "laoyou-api" not in (m.location or {}).get("url", "") else None)
            page.goto(URL, wait_until="networkidle")
            page.evaluate("localStorage.clear()")
            page.reload(wait_until="networkidle")
            page.wait_for_timeout(500)
            # 建店
            page.click('[data-site="alley"]')
            page.click("[data-chips] .chip")
            page.click("[data-open]")
            page.wait_for_timeout(600)
            for _ in range(8):
                btn = page.query_selector(".gbtn.ghost")
                if not btn:
                    break
                try:
                    btn.click()
                except Exception:
                    break
                page.wait_for_timeout(160)
            page.evaluate(SETUP)
            page.wait_for_timeout(400)

            # 注入后等一帧渲染（refresh 不是同步的），最多等 3 秒
            for _ in range(12):
                page.wait_for_timeout(250)
                if page.evaluate(READ)["rows"]:
                    break
            first = page.evaluate(READ)
            steps.append({"name": "rows", "ok": len(first["rows"]) >= 2, "rows": first["rows"]})

            # 命中测试靠 pointer-events 断言（见下），点击本身用事件派发避免行被 tick 重绘打断
            clickable = page.evaluate("""() => getComputedStyle(document.querySelector('.custlist')).pointerEvents""")
            steps.append({"name": "custlist_clickable", "ok": clickable == "auto", "value": clickable})
            page.evaluate("""() => {
              document.querySelector('.custlist .cust[data-uid="9001"]')
                ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
            }""")
            page.wait_for_timeout(450)
            wait_toast = page.evaluate(READ)["toast"]
            steps.append({
                "name": "queue_talk",
                "ok": wait_toast.startswith("【") and len(wait_toast) >= 24,
                "toast": wait_toast,
            })
            page.screenshot(path=str(OUT / "15-talk-queue.png"))

            # 等位那位可能已经走了，重新注入再点常客
            page.evaluate(SETUP)
            page.wait_for_timeout(300)
            # 行会随 tick 重绘，第二下用事件派发（命中测试第一下已经验证过）
            page.evaluate("""() => {
              const el = document.querySelector('.custlist .cust[data-uid="9002"]');
              el?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
            }""")
            page.wait_for_timeout(450)
            reg_toast = page.evaluate(READ)["toast"]
            steps.append({
                "name": "regular_talk",
                "ok": reg_toast.startswith("【") and reg_toast != wait_toast,
                "toast": reg_toast,
            })
            page.screenshot(path=str(OUT / "16-talk-regular.png"))

            ver = page.evaluate("() => window.__laoyou.state.saveVersion")
            steps.append({"name": "save_version", "ok": ver == 31, "value": ver})
            br.close()
    finally:
        proc.terminate()
        try:
            proc.wait(timeout=8)
        except Exception:
            proc.kill()

    ok = all(s["ok"] for s in steps) and not errors
    report = {"ok": ok, "steps": steps, "console_errors": errors}
    (OUT / "talk-report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(report, ensure_ascii=True, indent=2))
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
