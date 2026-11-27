# -*- coding: utf-8 -*-
"""批 S′ 探针：老友猪杂伊面 ＋ 生鸡蛋。

看四件事：
  1. 浇头托盘里有「生鸡蛋」（tab 上的 chip）
  2. 加菜台里有「加生蛋」，而且一开始就能点
  3. 把这一局改成「猪杂 ＋ 伊面」，菜单卡片自己长出「老友猪杂伊面」
  4. 同一张卡片打上「老板那碗」的印

preview: npx vite preview --port 4234   →   PW_URL=http://localhost:4234/
"""
import json
import os

from playwright.sync_api import sync_playwright
from probe_version import SAVE_VERSION

URL = os.environ.get("PW_URL", "http://localhost:4234/")
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
EVID = os.path.join(ROOT, "game", "data", "evidence", "egg")
os.makedirs(EVID, exist_ok=True)

checks = {}
errors = []


def main() -> int:
    with sync_playwright() as pw:
        b = pw.chromium.launch()
        pg = b.new_page(viewport={"width": 1440, "height": 900})
        pg.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
        pg.on("pageerror", lambda e: errors.append(str(e)))
        pg.goto(URL, wait_until="load")
        pg.wait_for_timeout(700)

        pg.click('.sitecard[data-site="alley"]')
        pg.wait_for_timeout(200)
        pg.click("[data-chips] .chip")
        pg.wait_for_timeout(150)
        pg.click("[data-open]")
        pg.wait_for_timeout(600)
        if pg.query_selector(".gbtn.ghost"):
            pg.click(".gbtn.ghost")
            pg.wait_for_timeout(600)

        # ── 1 浇头托盘 ────────────────────────────────────
        chips = pg.evaluate(
            """() => Array.from(document.querySelectorAll('#tray .chip')).map((el) => ({
                 id: el.getAttribute('data-top') || '',
                 text: el.textContent || '',
                 title: el.getAttribute('title') || '',
               }))"""
        )
        egg = next((c for c in chips if c["id"] == "top.egg"), None)
        checks["tray_has_egg"] = bool(egg) and "生鸡蛋" in egg["text"]
        checks["tray_egg_says_raw"] = bool(egg) and "不是煎的" in egg["title"]
        checks["tray_egg_has_source"] = bool(egg) and "出处" in egg["title"]
        checks["tray_chips_21"] = len(chips) == 21

        # ── 2 加菜台（面板 → 店铺页的加料那段）────────────────
        pg.click('[data-tab="recipe"]')
        pg.wait_for_timeout(400)
        pg.evaluate("() => document.querySelector('[data-tab2=\"shop\"]')?.click()")
        pg.wait_for_timeout(400)
        sides = pg.evaluate(
            """() => {
              const body = document.querySelector('[data-body="shop"]');
              if (!body) return { rows: [] };
              const btns = Array.from(body.querySelectorAll('[data-act="toggleside"]'));
              return {
                rows: btns.map((el) => {
                  const row = el.closest('.lrow');
                  return {
                    id: el.getAttribute('data-id') || '',
                    name: row ? (row.querySelector('.lname')?.textContent || '').trim() : '',
                    disabled: el.hasAttribute('disabled'),
                    label: (el.textContent || '').trim(),
                  };
                }),
              };
            }"""
        )
        dan = next((r for r in sides["rows"] if r["id"] == "shengdan"), None)
        checks["sides_has_shengdan"] = bool(dan) and "加生蛋" in dan["name"]
        checks["sides_shengdan_unlocked"] = bool(dan) and not dan["disabled"]

        # ── 3/4 猪杂 ＋ 伊面 → 名字与印 ─────────────────────
        named = pg.evaluate(
            """() => {
              const api = window.__laoyou;
              const s = api.state;
              s.main = 'offal';
              s.noodle = 'yifu';
              if (s.menu && s.menu[0]) { s.menu[0].main = 'offal'; s.menu[0].noodle = 'yifu'; }
              api.refresh();
              document.querySelector('[data-tab2="recipe"]')?.click();
              return null;
            }"""
        )
        del named
        pg.wait_for_timeout(400)
        card = pg.evaluate(
            """() => {
              const c = document.querySelector('[data-menu] .dcard');
              if (!c) return { name: '', badge: '' };
              const n = c.querySelector('.nname');
              const b = c.querySelector('.dmine');
              return { name: n ? n.textContent.trim() : '', badge: b ? b.textContent.trim() : '' };
            }"""
        )
        checks["dish_name_house_bowl"] = "老友猪杂伊面" in card["name"]
        checks["house_badge"] = card["badge"] == "老板那碗"

        # 换回切粉，印就该消失
        pg.evaluate(
            """() => {
              const api = window.__laoyou;
              const s = api.state;
              s.noodle = 'flat';
              if (s.menu && s.menu[0]) s.menu[0].noodle = 'flat';
              api.refresh();
              document.querySelector('[data-tab2="recipe"]')?.click();
            }"""
        )
        pg.wait_for_timeout(400)
        badge2 = pg.evaluate(
            """() => {
              const c = document.querySelector('[data-menu] .dcard');
              const b = c ? c.querySelector('.dmine') : null;
              return b ? b.textContent.trim() : '';
            }"""
        )
        checks["house_badge_follows_noodle"] = badge2 == ""

        # ── 5 存档版本 ───────────────────────────────────
        ver = pg.evaluate(
            """() => {
              for (let i = 0; i < localStorage.length; i++) {
                const k = localStorage.key(i) || '';
                if (!k.includes('laoyou.save')) continue;
                try {
                  const v = JSON.parse(localStorage.getItem(k) || '{}');
                  if (v && typeof v.saveVersion === 'number') return v.saveVersion;
                } catch (e) {}
              }
              return 0;
            }"""
        )
        checks["save_version"] = ver == SAVE_VERSION

        pg.screenshot(path=os.path.join(EVID, "01-egg-house-bowl.png"), full_page=False)
        noisy = [e for e in errors if "Failed to load resource" not in e and "404" not in e]
        checks["console_clean"] = len(noisy) == 0
        b.close()

    report = {"url": URL, "checks": checks, "console_errors": noisy[:6]}
    with open(os.path.join(EVID, "egg-report.json"), "w", encoding="utf-8") as f:
        json.dump(report, f, ensure_ascii=False, indent=2)
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0 if all(checks.values()) else 1


if __name__ == "__main__":
    raise SystemExit(main())
