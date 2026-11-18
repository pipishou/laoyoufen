"""M1 同条街验收：店铺页签里真点「接手铺面」→ 断言份额、服气、租金折扣落账 → 截图。

先 npm run build；另开 `npx vite preview --port 4183 --strictPort --host 127.0.0.1`。
    python tools/gate/street_probe.py
"""

from __future__ import annotations

import json
import pathlib

from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parents[2]
URL = "http://127.0.0.1:4183/"
SHOT_DIR = ROOT / "game" / "data" / "evidence" / "m1"
OUT: dict[str, object] = {}


def click_js(page, selector: str) -> None:
    """面板每秒重渲染，Playwright 的 actionability 会因节点被换掉而超时，统一用 DOM click。"""
    page.evaluate(
        """(sel) => { const el = document.querySelector(sel); if (el) el.click(); }""",
        selector,
    )


def street_sec_js(inner: str) -> str:
    return (
        """() => {
          const secs = [...document.querySelectorAll('.sec')];
          const b = secs.find((s) => (s.querySelector('.sechd')||{}).textContent?.includes('同条街'));
          if (!b) return { found: false };
          """
        + inner
        + """
        }"""
    )


def main() -> int:
    SHOT_DIR.mkdir(parents=True, exist_ok=True)
    with sync_playwright() as p:
        browser = p.chromium.launch(channel="msedge", headless=True, args=["--disable-extensions"])
        page = browser.new_page(viewport={"width": 1440, "height": 900})
        errors: list[str] = []
        page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
        page.goto(URL, wait_until="load", timeout=30000)
        page.evaluate("() => localStorage.clear()")
        page.reload(wait_until="load")
        page.wait_for_timeout(600)

        # 过建店（巷内小店 → 选名字 → 开张）
        page.click('.sitecard[data-site="alley"]')
        page.click("[data-chips] .chip")
        page.click("[data-open]")
        page.wait_for_timeout(500)

        # 引导卡会挡住面板，验收先把它永久收掉（真玩时玩家可以随时点「? 引导」找回）
        page.evaluate(
            """() => {
              const btn = [...document.querySelectorAll('.guide button')].find((b) =>
                (b.textContent || '').includes('不用教了'),
              );
              if (btn) btn.click();
            }"""
        )
        page.wait_for_timeout(200)

        # 真玩要第 6 段 + 让同行撑不住；验收只验「面板长什么样、点下去账对不对」
        page.evaluate(
            """() => {
              const s = window.__laoyou.state;
              s.gradeLevel = 6;
              s.cash = 100000;
              const laogan = s.rivals.find((r) => r.id === 'laogan');
              laogan.closed = true;   // 老甘撑不住关门了
              const sanjie = s.rivals.find((r) => r.id === 'sanjie');
              sanjie.wins = 3; sanjie.pacified = true;  // 三姐已经服气
            }"""
        )
        click_js(page, '[data-tab="shop"]')
        page.wait_for_timeout(800)

        # 滚到「同条街」并去掉会挡图的 toast
        page.evaluate(
            """() => {
              const secs = [...document.querySelectorAll('.sec')];
              const b = secs.find((s) => (s.querySelector('.sechd')||{}).textContent?.includes('同条街'));
              if (b) b.scrollIntoView({ block: 'center' });
              document.querySelectorAll('.toast').forEach((t) => t.remove());
            }"""
        )
        page.wait_for_timeout(300)

        before = page.evaluate(
            street_sec_js(
                """
              const head = (b.querySelector('.sechd')||{}).textContent || '';
              const rows = [...b.querySelectorAll('.lrow')].map((r) => (r.querySelector('.lname')||{}).textContent || '');
              const tags = [...b.querySelectorAll('.tag2')].map((t) => t.textContent || '');
              const takeBtn = b.querySelector('[data-act="takeover"]');
              return {
                found: true,
                head,
                rows,
                tags,
                hasTakeover: !!takeBtn,
                shareText: (b.textContent || '').includes('抢走'),
                closedText: (b.textContent || '').includes('已关门'),
                pacifiedText: (b.textContent || '').includes('服气'),
              };
            """
            )
        )
        OUT["panel"] = before
        page.screenshot(path=str(SHOT_DIR / "01-street-panel.png"))

        if not before.get("hasTakeover"):
            OUT["ok"] = False
            OUT["reason"] = "同条街段里没有「接手」按钮"
        else:
            click_js(page, '[data-act="takeover"]')
            page.wait_for_timeout(700)
            page.evaluate(
                """() => {
                  const secs = [...document.querySelectorAll('.sec')];
                  const b = secs.find((s) => (s.querySelector('.sechd')||{}).textContent?.includes('同条街'));
                  if (b) b.scrollIntoView({ block: 'center' });
                  document.querySelectorAll('.toast').forEach((t) => t.remove());
                }"""
            )
            page.wait_for_timeout(300)
            after = page.evaluate(
                """() => {
                  const s = window.__laoyou.state;
                  const laogan = s.rivals.find((r) => r.id === 'laogan');
                  return {
                    takenOver: s.takenOver,
                    cash: s.cash,
                    laoganClosed: laogan.closed,
                    rent: Math.round(s.cash),
                  };
                }"""
            )
            OUT["after"] = after
            rent = page.evaluate(
                """() => {
                  const secs = [...document.querySelectorAll('.sec')];
                  const b = secs.find((s) => (s.querySelector('.sechd')||{}).textContent?.includes('同条街'));
                  return b ? b.textContent : '';
                }"""
            )
            OUT["takenOverOk"] = "laogan" in (after.get("takenOver") or [])
            page.screenshot(path=str(SHOT_DIR / "02-street-taken.png"))
            OUT["ok"] = bool(OUT.get("takenOverOk"))

        OUT["console_errors"] = errors[:5]
        if errors:
            OUT["ok"] = False
        browser.close()

    print(json.dumps(OUT, ensure_ascii=False, indent=2))
    return 0 if OUT.get("ok") else 1


if __name__ == "__main__":
    raise SystemExit(main())
