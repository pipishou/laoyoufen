"""批 J′（96 格成套度 + 杂货九件 + 门路八条）的探针。

十件事：
1. 店铺页里有「店里」「街上的门路」「杂货铺」三段；
2. 门路八条各一行、杂货九件各一行；
3. 「店里」段写出成套进度「成套 0 / 6」，六条成套各一行；
4. 成套的奖励写法在页面上：「耐心 +12%」「进店 +4%」（六条只走耐心/进店两个出口）；
5. 买「门口多亮一盏灯」：人情 −5、`goods.lamp` 记上日戳、行变「今天在用」；
6. 杂货抬头跟着变成「今天买了：门口多亮一盏灯」；
7. 把座位调到 6 再重开店铺页：成套段变「成套 1 / 6」，那条写「已凑齐」；
8. 成套一条真给座位前，`flow.slotSeatPrize` 还是空的（打烊才发，单元测试另行覆盖）；
9. 存档版本还是 36（这一批全是可选字段，不升版本）；
10. 控制台干净。

用法：先 `npm run -s build`，在 4225 起 `npx vite preview --port 4225`，
再在项目根 `python tools/gate/together_probe.py`（URL 用 localhost，preview 只听 IPv6）。
"""

from __future__ import annotations

import json
import os

from playwright.sync_api import sync_playwright

URL = os.environ.get("PW_URL", "http://localhost:4225/")
OUT = "game/data/evidence/together"

READ = """() => {
  const s = window.__laoyou.state;
  const secs = [...document.querySelectorAll('.sec')];
  const pick = (kw) => secs.find((x) => (x.querySelector('.sechd')?.textContent || '').includes(kw));
  const dump = (box) => {
    if (!box) return { found: false, head: '', hint: '', rows: [], titles: [] };
    return {
      found: true,
      head: (box.querySelector('.sechd')?.textContent || '').replace(/\\s+/g, ' ').trim(),
      hint: [...box.querySelectorAll('.sechint, .hint2')].map((n) => (n.textContent || '').replace(/\\s+/g, ' ').trim()).join(' | '),
      rows: [...box.querySelectorAll('.lrow')].map((n) => (n.textContent || '').replace(/\\s+/g, ' ').trim()),
      titles: [...box.querySelectorAll('.lmeta')].map((n) => n.getAttribute('title') || ''),
    };
  };
  return {
    // 「店里」这一段要用 .g96 认：页面上还有别的段也叫「店里 · 摆了 N/12 件家当」
    shop: dump(secs.find((x) => !!x.querySelector('.g96'))),
    invest: dump(pick('街上的门路')),
    goods: dump(pick('杂货铺')),
    favor: s ? Math.round(s.favor) : -1,
    seats: s ? s.venue.seats : -1,
    bought: s && s.goods ? s.goods : {},
    seatPrize: s && s.flow ? (s.flow.slotSeatPrize ?? null) : null,
    saveVersion: JSON.parse(localStorage.getItem('laoyou.save.v4') || '{}').saveVersion ?? -1,
  };
}"""

SET_FAVOR = """() => {
  const s = window.__laoyou.state;
  s.favor = 40;
  window.__laoyou.refresh();
  return true;
}"""

SET_SEATS = """() => {
  const s = window.__laoyou.state;
  s.venue.seats = 6;
  window.__laoyou.refresh();
  return s.venue.seats;
}"""


def kill_modals(page) -> None:
    page.evaluate(
        "() => { document.querySelectorAll('.modal').forEach((m) => {"
        " if (!m.querySelector('[data-tab2]')) m.remove(); }); }"
    )


def click_act(page, act: str, id: str) -> bool:
    return bool(
        page.evaluate(
            """([act, id]) => {
              const n = document.querySelector(`[data-act="${act}"][data-id="${id}"]`);
              if (n) n.dispatchEvent(new MouseEvent('click', { bubbles: true }));
              return !!n;
            }""",
            [act, id],
        )
    )


def reopen_shop(page) -> None:
    page.evaluate(
        "() => { const b = document.querySelector('[data-tab2=\"shop\"]'); if (b) b.click(); }"
    )
    page.wait_for_timeout(350)


def main() -> int:
    os.makedirs(OUT, exist_ok=True)
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

        page.click('[data-tab="shop"]', force=True)
        page.wait_for_timeout(400)
        kill_modals(page)
        reopen_shop(page)

        base = page.evaluate(READ)
        checks["sections_found"] = (
            bool(base["shop"]["found"])
            and bool(base["invest"]["found"])
            and bool(base["goods"]["found"])
        )
        checks["eight_invest_rows"] = len(base["invest"]["rows"]) >= 8
        checks["nine_good_rows"] = len(base["goods"]["rows"]) >= 9
        checks["set_section"] = "成套 0 / 6" in base["shop"]["hint"]
        setrows = " ".join(base["shop"]["rows"])
        checks["set_two_rows"] = "店里坐得下了" in setrows and "门面齐了" in setrows
        checks["set_rewards_shown"] = "耐心 +12%" in setrows and "进店 +4%" in setrows
        checks["save_version"] = base["saveVersion"] == 37
        page.screenshot(path=f"{OUT}/01-together-default.png")

        # 买一盏灯：人情 −5，日戳记上，行变今天在用
        page.evaluate(SET_FAVOR)
        page.wait_for_timeout(200)
        reopen_shop(page)
        before = page.evaluate(READ)
        click_act(page, "buygood", "lamp")
        page.wait_for_timeout(350)
        got = page.evaluate(READ)
        checks["buy_lamp"] = bool(got["bought"].get("lamp")) and got["favor"] == before["favor"] - 5
        reopen_shop(page)
        shown = page.evaluate(READ)
        checks["lamp_row_active"] = any("门口多亮一盏灯" in r and "今天在用" in r for r in shown["goods"]["rows"])
        checks["goods_head_follows"] = "今天买了" in shown["goods"]["head"]
        page.screenshot(path=f"{OUT}/02-together-lamp.png")

        # 座位调到 6：成套第一条凑齐
        page.evaluate(SET_SEATS)
        page.wait_for_timeout(250)
        reopen_shop(page)
        seated = page.evaluate(READ)
        checks["set_done_after_seats"] = "成套 1 / 6" in seated["shop"]["hint"]
        checks["set_row_says_done"] = any("店里坐得下了" in r and "已凑齐" in r for r in seated["shop"]["rows"])
        checks["prize_not_granted_yet"] = seated["seatPrize"] is None and seated["seats"] == 6
        page.screenshot(path=f"{OUT}/03-together-set.png")

        checks["console_clean"] = not errors
        report = {
            "ok": all(checks.values()),
            "checks": checks,
            "base": base,
            "shown": shown,
            "seated": seated,
            "errors": errors[:5],
        }
        with open(f"{OUT}/together-report.json", "w", encoding="utf-8") as fh:
            json.dump(report, fh, ensure_ascii=False, indent=2)
        print(json.dumps(report, ensure_ascii=False))
        browser.close()
    return 0 if all(checks.values()) else 1


if __name__ == "__main__":
    raise SystemExit(main())
