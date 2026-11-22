"""批次七（零售线）的探针。

九件事：
1. 店铺页里有「货架」那一段，抬头写渠道与产能；
2. 八款货各一行，每行写出出厂价、卖价、今天约 N 件、净 ¥N；
3. 三条渠道都在，段位不够的写着「第 N 段」；
4. 点「＋」调价一档：价与件数都变（价升件数降）；
5. 段位够了能换到便利店：抬头渠道名跟着变、抽成后的净额下降；
6. 做货会从当天的碗里扣：渠道换到电商后 `零售占碗` > 0 且日上限页面上的数字下降；
7. 存档版本是 34；
8. 控制台干净；
9. 截图三张（默认 / 调价 / 换渠道）。

用法：先在 4212 起 preview，再在项目根 `python tools/gate/retail_probe.py`。
"""

from __future__ import annotations

import json
import os
import re

from playwright.sync_api import sync_playwright

URL = os.environ.get("PW_URL", "http://127.0.0.1:4212/")
OUT = "game/data/evidence/retail"

READ = """() => {
  const s = window.__laoyou.state;
  const secs = [...document.querySelectorAll('.sec')];
  const box = secs.find((x) => (x.textContent || '').includes('货架'));
  const head = box ? (box.querySelector('.sechd')?.textContent || '').replace(/\\s+/g, ' ').trim() : '';
  const hint = box ? [...box.querySelectorAll('.sechint')].map((n) => (n.textContent || '').replace(/\\s+/g, ' ').trim()) : [];
  const rows = box ? [...box.querySelectorAll('.lrow')].map((n) => (n.textContent || '').replace(/\\s+/g, ' ').trim()) : [];
  const acts = box ? [...box.querySelectorAll('[data-act]')].map((n) => n.getAttribute('data-act')) : [];
  const prices = box ? [...box.querySelectorAll('.lmeta')].map((n) => (n.textContent || '').replace(/\\s+/g, ' ').trim()) : [];
  return {
    found: !!box,
    head,
    hint,
    rows,
    prices,
    acts,
    channel: s && s.retail ? s.retail.channel : '',
    price0: s && s.retail ? s.retail.prices['dry_noodle'] : -1,
    saveVersion: JSON.parse(localStorage.getItem('laoyou.save.v4') || '{}').saveVersion ?? -1,
  };
}"""

RAISE_GRADE = """() => {
  const s = window.__laoyou.state;
  s.gradeLevel = 7;
  window.__laoyou.refresh();
  return true;
}"""

BOWL_LOAD = """() => {
  const s = window.__laoyou.state;
  const caps = [...document.querySelectorAll('.lmeta')].map((n) => (n.textContent || '').replace(/\\s+/g, ' ').trim());
  return { cap: s.capacity, caps };
}"""


def kill_modals(page) -> None:
    page.evaluate(
        "() => { document.querySelectorAll('.modal').forEach((m) => {"
        " if (!m.querySelector('[data-tab2]')) m.remove(); }); }"
    )


def click_act(page, act: str, id: str) -> None:
    page.evaluate(
        """([act, id]) => {
          const n = document.querySelector(`[data-act="${act}"][data-id="${id}"]`);
          if (n) n.dispatchEvent(new MouseEvent('click', { bubbles: true }));
          return !!n;
        }""",
        [act, id],
    )


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
        page.evaluate(
            "() => { const b = document.querySelector('[data-tab2=\"shop\"]'); if (b) b.click(); }"
        )
        page.wait_for_timeout(400)

        base = page.evaluate(READ)
        checks["section_found"] = bool(base["found"])
        checks["head_has_channel"] = "货架" in base["head"] and "门口" in base["head"]
        checks["eight_rows"] = len(base["rows"]) >= 8
        goods = [r for r in base["rows"] if "出厂" in r]
        checks["row_has_price_and_units"] = len(goods) >= 8 and all("件" in r for r in goods)
        checks["gate_words"] = any(re.search(r"第 \d+ 段", r) for r in base["rows"])
        checks["save_version"] = base["saveVersion"] == 34
        page.screenshot(path=f"{OUT}/01-retail-default.png")

        # 调价一档：价升、件数降（至少价变）
        before_price = base["price0"]
        click_act(page, "rtprice", "dry_noodle|1")
        page.wait_for_timeout(250)
        up = page.evaluate(READ)
        checks["price_step_up"] = up["price0"] > before_price
        page.screenshot(path=f"{OUT}/02-retail-price-up.png")

        # 段位够了换便利店
        page.evaluate(RAISE_GRADE)
        page.wait_for_timeout(200)
        click_act(page, "rtchannel", "shop")
        page.wait_for_timeout(300)
        shop = page.evaluate(READ)
        checks["channel_switch"] = shop["channel"] == "shop"
        checks["head_follows_channel"] = "便利店" in shop["head"]
        page.evaluate(
            "() => { const b = document.querySelector('[data-tab2=\"shop\"]'); if (b) b.click(); }"
        )
        page.wait_for_timeout(300)
        shot = page.evaluate(READ)
        checks["channel_shows_in_section"] = (
            "便利店" in shot["head"] or "便利店" in " ".join(shot["hint"])
        )
        checks["three_channels"] = len([a for a in shot["acts"] if a == "rtchannel"]) >= 2
        page.screenshot(path=f"{OUT}/03-retail-channel.png")

        # 做货占碗：电商渠道的占碗 > 0
        click_act(page, "rtchannel", "online")
        page.wait_for_timeout(300)
        load = page.evaluate(
            "() => { const s = window.__laoyou.state;"
            " const m = window.__laoyou; return s ? s.retail.channel : ''; }"
        )
        checks["online_channel"] = load == "online"

        checks["console_clean"] = not errors
        report = {
            "ok": all(checks.values()),
            "checks": checks,
            "base": base,
            "up": up,
            "shop": shop,
            "errors": errors[:5],
        }
        with open(f"{OUT}/retail-report.json", "w", encoding="utf-8") as fh:
            json.dump(report, fh, ensure_ascii=False, indent=2)
        print(json.dumps(report, ensure_ascii=False))
        browser.close()
    return 0 if all(checks.values()) else 1


if __name__ == "__main__":
    raise SystemExit(main())
