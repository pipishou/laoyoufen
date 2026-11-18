"""P0-1 复现：面板顶栏切页签时正文是否为空。

真实玩家首次路径：底栏点一次「店铺」（走 onOpenTab → refresh，有内容），
再点顶栏切到从未渲染过的「比赛 / 图鉴 / 账本」——
panels 的 show() 只切 hidden、不重绘，所以这些页签应当是空的。

用法: PYTHONIOENCODING=utf-8 python tools/gate/probe_tabs.py
"""

import json

from playwright.sync_api import sync_playwright

URL = "http://127.0.0.1:4181/"
OUT = "game/data/evidence/playtest-eval"


def body_len(page, tab):
    return page.evaluate(
        """(t) => {
            const el = document.querySelector('[data-body="' + t + '"]');
            return el ? el.innerHTML.trim().length : -1;
        }""",
        tab,
    )


def bootstrap(page):
    page.goto(URL, wait_until="networkidle")
    page.evaluate("localStorage.clear()")
    page.reload(wait_until="networkidle")
    page.wait_for_timeout(1200)
    page.evaluate("""() => document.querySelector('.sitecard[data-site="alley"]').click()""")
    page.wait_for_timeout(200)
    page.evaluate("""() => document.querySelector('[data-chips] .chip').click()""")
    page.wait_for_timeout(200)
    page.evaluate("""() => document.querySelector('[data-open]').click()""")
    page.wait_for_timeout(400)
    page.evaluate("""() => { const b = document.querySelector('[data-guide-hide]'); if (b) b.click(); }""")
    page.wait_for_timeout(200)


def main():
    report = {"url": URL, "firstVisitViaTopBar": {}, "errors": []}
    with sync_playwright() as pw:
        browser = pw.chromium.launch(channel="msedge", headless=True)
        page = browser.new_page(viewport={"width": 1440, "height": 900})
        page.on("console", lambda m: report["errors"].append(m.text) if m.type == "error" else None)
        bootstrap(page)

        # 只从底栏进一次「店铺」
        page.evaluate("""() => document.querySelector('[data-tab="shop"]').click()""")
        page.wait_for_timeout(500)
        report["firstVisitViaTopBar"]["shop(底栏进入)"] = body_len(page, "shop")

        # 其余三个全靠顶栏切（首次进入）
        for tab in ["contest", "collection", "ledger"]:
            page.evaluate(
                """(t) => document.querySelector('[data-tab2="' + t + '"]').click()""", tab
            )
            page.wait_for_timeout(400)
            report["firstVisitViaTopBar"][f"{tab}(顶栏切入)"] = body_len(page, tab)

        page.screenshot(path=f"{OUT}/01-tabs-first-visit.png")
        browser.close()

    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
