"""批 B′（街上的门路 + 杂货铺）的探针。

十二件事：
1. 店铺页里有「街上的门路」与「杂货铺」两段；
2. 门路三条、杂货三件各一行；
3. 三条钱价 ¥50 / ¥120 / ¥400 都在页面上；
4. 每条都挂了出处（`.lmeta` 的 title 里有 http 链接）；
5. 点「跟料商多留一筐」：钱少 50、`investments.supplier` 记上到期日，行变「在走」；
6. 同类互斥：再点「请老师傅来看一天」，toast 里是「先等」，且没记账；
7. 不同类可以并存：再点「请美食号写一篇」能买上（管 3 天）；
8. 杂货铺花人情：先塞 40 点人情，点「借三台电扇过来」→ 人情 −8、`goods.fan` 记日戳；
9. 买过的杂货行写「今天在用」；
10. 存档版本还是 36（这一批只用可选字段，不升版本）；
11. 控制台干净；
12. 截图三张（默认 / 买完料商 / 买完杂货）。

用法：先 `npm run -s build`，在 4218 起 `npx vite preview --port 4218`，
再在项目根 `python tools/gate/invest_probe.py`（URL 用 localhost，preview 只听 IPv6）。
"""

from __future__ import annotations

import json
import os
import re

from playwright.sync_api import sync_playwright
from probe_version import SAVE_VERSION

URL = os.environ.get("PW_URL", "http://localhost:4218/")
OUT = "game/data/evidence/invest"

READ = """() => {
  const s = window.__laoyou.state;
  const secs = [...document.querySelectorAll('.sec')];
  const pick = (kw) => secs.find((x) => (x.querySelector('.sechd')?.textContent || '').includes(kw));
  const dump = (box) => {
    if (!box) return { found: false, head: '', rows: [], titles: [], acts: [] };
    return {
      found: true,
      head: (box.querySelector('.sechd')?.textContent || '').replace(/\\s+/g, ' ').trim(),
      rows: [...box.querySelectorAll('.lrow')].map((n) => (n.textContent || '').replace(/\\s+/g, ' ').trim()),
      titles: [...box.querySelectorAll('.lmeta')].map((n) => n.getAttribute('title') || ''),
      acts: [...box.querySelectorAll('[data-act]')].map((n) => `${n.getAttribute('data-act')}:${n.getAttribute('data-id')}`),
    };
  };
  return {
    invest: dump(pick('街上的门路')),
    goods: dump(pick('杂货铺')),
    cash: s ? Math.round(s.cash) : -1,
    favor: s ? Math.round(s.favor) : -1,
    investments: s && s.investments ? s.investments : {},
    bought: s && s.goods ? s.goods : {},
    saveVersion: JSON.parse(localStorage.getItem('laoyou.save.v4') || '{}').saveVersion ?? -1,
  };
}"""

SET_FAVOR = """() => {
  const s = window.__laoyou.state;
  s.favor = 40;
  window.__laoyou.refresh();
  return true;
}"""

TOASTS = "() => [...document.querySelectorAll('.toast')].map((n) => (n.textContent || '').replace(/\\s+/g, ' ').trim())"


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
        checks["sections_found"] = bool(base["invest"]["found"]) and bool(base["goods"]["found"])
        checks["three_invest_rows"] = len(base["invest"]["rows"]) >= 3
        checks["three_good_rows"] = len(base["goods"]["rows"]) >= 3
        allrows = " ".join(base["invest"]["rows"] + base["goods"]["rows"])
        checks["prices_shown"] = all(x in allrows for x in ("50", "120", "400"))
        checks["source_in_title"] = any(
            "http" in t for t in base["invest"]["titles"] + base["goods"]["titles"]
        )
        checks["favor_cost_shown"] = "人情" in " ".join(base["goods"]["rows"])
        checks["save_version"] = base["saveVersion"] == SAVE_VERSION
        page.screenshot(path=f"{OUT}/01-invest-default.png")

        # 买料商留货
        cash0 = base["cash"]
        click_act(page, "buyinvest", "supplier")
        page.wait_for_timeout(350)
        after = page.evaluate(READ)
        checks["buy_supplier"] = bool(after["investments"].get("supplier")) and after["cash"] == cash0 - 50
        reopen_shop(page)
        walked = page.evaluate(READ)
        checks["row_says_walking"] = any("在走" in r for r in walked["invest"]["rows"])
        page.screenshot(path=f"{OUT}/02-invest-supplier.png")

        # 同类互斥：老师傅那一行不再给按钮，只写「先等『跟料商多留一筐』过去」
        click_act(page, "buyinvest", "master")
        page.wait_for_timeout(300)
        toasts = page.evaluate(TOASTS)
        excl = page.evaluate(READ)
        master_act = "buyinvest:master" in excl["invest"]["acts"]
        checks["exclusive_master"] = (
            not master_act
            and not excl["investments"].get("master")
            and any("先等" in r for r in excl["invest"]["rows"])
        )

        # 不同类可以并存：美食号
        click_act(page, "buyinvest", "press")
        page.wait_for_timeout(300)
        both = page.evaluate(READ)
        checks["press_alongside"] = bool(both["investments"].get("press")) and bool(
            both["investments"].get("supplier")
        )

        # 杂货铺：花人情
        page.evaluate(SET_FAVOR)
        page.wait_for_timeout(250)
        reopen_shop(page)
        before_goods = page.evaluate(READ)
        click_act(page, "buygood", "fan")
        page.wait_for_timeout(350)
        got = page.evaluate(READ)
        checks["buy_good"] = bool(got["bought"].get("fan")) and got["favor"] == before_goods["favor"] - 8
        reopen_shop(page)
        shown = page.evaluate(READ)
        checks["good_row_active"] = any("今天在用" in r for r in shown["goods"]["rows"])
        page.screenshot(path=f"{OUT}/03-invest-goods.png")

        checks["console_clean"] = not errors
        report = {
            "ok": all(checks.values()),
            "checks": checks,
            "base": base,
            "after": after,
            "walked": walked,
            "toasts": toasts,
            "got": got,
            "errors": errors[:5],
        }
        with open(f"{OUT}/invest-report.json", "w", encoding="utf-8") as fh:
            json.dump(report, fh, ensure_ascii=False, indent=2)
        print(json.dumps(report, ensure_ascii=False))
        browser.close()
    return 0 if all(checks.values()) else 1


if __name__ == "__main__":
    raise SystemExit(main())
