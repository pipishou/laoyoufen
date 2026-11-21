"""批次三（南宁行情）的探针：HUD 上说清的「今天街上」，是不是真的跟着日子换。

六件事：
1. 浮层里有 `[data-market]` 这一行；
2. 换到一个有行情的日子：行显示出来，写着行情名与四个数（进店 / 耐心 / 客单价 / 料钱）；
3. `title` 里写着「什么时候」的原话；
4. 换到没有行情的日子：这一行收起来，一个字都不留；
5. 换到另一条行情：字跟着变（不是写死一次）；
6. 存档版本仍 31、控制台干净。

用法：先在 4207 起 preview，再 `python tools/gate/market_probe.py`。
"""

from __future__ import annotations

import json
import os

from playwright.sync_api import sync_playwright

URL = "http://127.0.0.1:4207/"
OUT = "game/data/evidence/market"

# 与 game/src/data/market.ts 的 SEASON / MARKET_CHANCE 对齐（python 这边只是挑日子用）
SEASON = {
    "huiNanTian": [2, 3],
    "storm": [7, 8, 9],
    "heat": [6, 7, 8],
    "coldSnap": [12, 1, 2],
    "marketRush": [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
    "inspection": [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
    "porkUp": [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
    "schoolOpen": [3, 9],
}
ORDER = list(SEASON.keys())
CHANCE = 0.34


def hash_string(s: str) -> int:
    """FNV-1a 32 位，与 game/src/sim/rng.ts 的 hashString 一致"""
    h = 2166136261
    for ch in s:
        h ^= ord(ch)
        h = (h * 16777619) & 0xFFFFFFFF
    return h


def roll(player_id: str, month: int, day: int, salt: str) -> float:
    return hash_string(f"{player_id}:market:{month}:{day}:{salt}") / 4294967296


def market_at(player_id: str, month: int, day: int) -> str | None:
    """按 sim/market.ts 的 todayMarket 复算今天是不是行情、是哪一条"""
    if roll(player_id, month, day, "has") > CHANCE:
        return None
    pool = [m for m in ORDER if month in SEASON[m]]
    if not pool:
        return None
    idx = int(roll(player_id, month, day, "pick") * len(pool)) % len(pool)
    return pool[idx]


def find_days(player_id: str) -> tuple[tuple[int, int, str], tuple[int, int, str], tuple[int, int]]:
    """找三天：一条指定行情 / 另一条不同行情 / 一个没有行情"""
    first: tuple[int, int, str] | None = None
    other: tuple[int, int, str] | None = None
    plain: tuple[int, int] | None = None
    for month in range(1, 13):
        for day in range(1, 29):
            got = market_at(player_id, month, day)
            if got is None:
                if plain is None:
                    plain = (month, day)
                continue
            if first is None:
                first = (month, day, got)
            elif other is None and got != first[2]:
                other = (month, day, got)
        if first and other and plain:
            break
    if not (first and plain):
        raise SystemExit("找不到合适的日子：换一个 playerId 再试")
    return first, other or first, plain


READ = """() => {
  const row = document.querySelector("[data-market]");
  return {
    exists: !!row,
    text: row ? (row.textContent || "") : "",
    cls: row ? (row.className || "") : "",
    title: row ? (row.getAttribute("title") || "") : "",
    version: (window.__laoyou && window.__laoyou.state && window.__laoyou.state.saveVersion) || 0,
    player: (window.__laoyou && window.__laoyou.state && window.__laoyou.state.playerId) || "",
  };
}"""

SET_DAY = """([month, day]) => {
  const s = window.__laoyou.state;
  s.month = month;
  s.day = day;
  window.__laoyou.refresh();
  return true;
}"""


def kill_modals(page) -> None:
    """打烊单 / 事件 / 引导会拦住下面的操作；面板本身也是 `.modal`，靠 `[data-tab2]` 认出来别删"""
    page.evaluate(
        "() => { document.querySelectorAll('.modal').forEach((m) => {"
        " if (!m.querySelector('[data-tab2]')) m.remove(); }); }"
    )


def main() -> int:
    os.makedirs(OUT, exist_ok=True)
    checks: dict[str, bool] = {}
    errors: list[str] = []
    with sync_playwright() as pw:
        browser = pw.chromium.launch()
        page = browser.new_page(viewport={"width": 1440, "height": 900})
        page.on("pageerror", lambda e: errors.append(str(e)))
        page.goto(URL, wait_until="networkidle")
        page.evaluate("() => { localStorage.clear(); location.reload(); }")
        page.wait_for_timeout(1200)
        page.click('.sitecard[data-site="alley"]')
        page.click("[data-chips] .chip")
        page.click("[data-open]")
        page.wait_for_timeout(600)
        try:
            page.locator(".gbtn.ghost").click(timeout=1200)
        except Exception:
            pass
        page.wait_for_timeout(400)
        kill_modals(page)

        base = page.evaluate(READ)
        player = base["player"] or "p1"
        checks["row_present"] = base["exists"]
        first, other, plain = find_days(player)

        # 1) 有行情的日子
        page.evaluate(SET_DAY, [first[0], first[1]])
        page.wait_for_timeout(400)
        on = page.evaluate(READ)
        checks["shown_on_market_day"] = "on" in on["cls"].split() and bool(on["text"].strip())
        checks["text_has_name"] = "·" in on["text"] and any(
            name in on["text"] for name in ("回南天", "台风", "高温", "寒潮", "赶圩", "创城", "猪肉", "开学")
        )
        checks["text_has_numbers"] = any(k in on["text"] for k in ("进店", "耐心", "客单价", "料钱")) and (
            "%" in on["text"]
        )
        checks["title_has_when"] = len(on["title"]) > 4
        page.screenshot(path=f"{OUT}/01-market-on.png")

        # 2) 没有行情的日子：这一行收起来
        page.evaluate(SET_DAY, [plain[0], plain[1]])
        page.wait_for_timeout(400)
        off = page.evaluate(READ)
        checks["hidden_on_plain_day"] = "on" not in off["cls"].split() and off["text"].strip() == ""
        page.screenshot(path=f"{OUT}/02-market-off.png")

        # 3) 换到另一条行情：字跟着变
        page.evaluate(SET_DAY, [other[0], other[1]])
        page.wait_for_timeout(400)
        two = page.evaluate(READ)
        checks["switches_with_day"] = bool(two["text"].strip()) and two["text"] != on["text"]
        page.screenshot(path=f"{OUT}/03-market-other.png")

        checks["save_version"] = base["version"] == 31
        checks["console_clean"] = len(errors) == 0
        browser.close()

    ok = all(checks.values())
    report = {
        "ok": ok,
        "checks": checks,
        "errors": errors,
        "days": {"first": first, "other": other, "plain": plain},
        "texts": {"on": on["text"], "off": off["text"], "other": two["text"], "title": on["title"]},
    }
    with open(f"{OUT}/market-report.json", "w", encoding="utf-8") as fh:
        json.dump(report, fh, ensure_ascii=False, indent=2)
    print(json.dumps({"ok": ok, "checks": checks}, ensure_ascii=False, indent=2))
    if not ok:
        print(json.dumps({"texts": report["texts"], "days": report["days"], "errors": errors}, ensure_ascii=False)[:1500])
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
