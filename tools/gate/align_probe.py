# -*- coding: utf-8 -*-
"""批 AK′ 探针：今天只亮一处（P430）。

试玩 1619 三局两周第 10 / 13 / 15 天都出现过「店铺页指一件、打烊单指另一件」。
这一批把四处收成 `sim/align.ts` 一个裁定，探针就量三件事：
  ① 页面上一共只有一处「红」（段头 `.sechd.hot` 或行 `.lrow.hotrow`）
  ② 不是今天那一件的，退成灰字（设备段的「参考：…最慢」、评定按钮的虚线）
  ③ HUD 那枚「可评定」只在今天这一件就是评定时才出现

用法（先起 preview）：
    cd game && npx vite preview --port 4245 --strictPort
    PW_URL=http://localhost:4245/ python -X utf8 tools/gate/align_probe.py
"""
import json
import os

from playwright.sync_api import sync_playwright

URL = os.environ.get("PW_URL", "http://localhost:4245/")
OUT = os.path.join("game", "data", "evidence", "align")
os.makedirs(OUT, exist_ok=True)

checks = {}


def note(name, ok, detail=""):
    checks[name] = {"ok": bool(ok), "detail": str(detail)[:160]}


def open_game(pg):
    pg.goto(URL, wait_until="networkidle")
    pg.wait_for_timeout(700)
    pg.evaluate("() => localStorage.clear()")
    pg.reload(wait_until="networkidle")
    pg.wait_for_timeout(700)
    pg.evaluate("() => document.querySelector('.sitecard[data-site=\"alley\"]')?.click()")
    pg.wait_for_timeout(200)
    pg.evaluate("() => document.querySelector('[data-chips] .chip')?.click()")
    pg.wait_for_timeout(200)
    pg.evaluate("() => document.querySelector('[data-open]')?.click()")
    pg.wait_for_timeout(400)
    pg.evaluate("() => document.querySelector('.gbtn.ghost')?.click()")
    pg.wait_for_timeout(600)
    # 店铺页
    pg.evaluate("() => document.querySelector('[data-tab=\"recipe\"]')?.click()")
    pg.wait_for_timeout(300)
    pg.evaluate("() => document.querySelector('[data-tab2=\"shop\"]')?.click()")
    pg.wait_for_timeout(400)


# 昨天走掉一堆人，全是因为排不下队 —— 钩子会落到产能上
LOSS_QUEUE_JS = """() => {
  const s = window.__laoyou.state;
  s.dayReport = null;
  s.days.push({ month: 1, day: 1, revenue: 0, served: 10, lost: 30, avgSat: 60,
                price: 10, taste: 60, cash: 0, lostQueue: 30, lostPrice: 0, lostWait: 0 });
  window.__laoyou.refresh();
}"""

# 段位够格 + 昨天排不下队 → 今天该接客，评定降级
READY_AND_LOSS_JS = """() => {
  const s = window.__laoyou.state;
  s.totalCustomers = 400;
  s.cash = 30000;
  s.dayReport = null;
  s.days.push({ month: 1, day: 1, revenue: 0, served: 10, lost: 30, avgSat: 60,
                price: 10, taste: 60, cash: 0, lostQueue: 30, lostPrice: 0, lostWait: 0 });
  window.__laoyou.refresh();
}"""

# 段位够格 + 没人走 → 今天就是去评
READY_QUIET_JS = """() => {
  const s = window.__laoyou.state;
  s.totalCustomers = 400;
  s.cash = 30000;
  s.dayReport = null;
  s.days.length = 0;
  window.__laoyou.refresh();
}"""

MARKS_JS = """() => {
  const secs = [...document.querySelectorAll('.pane .sechd.hot')].map((x) => (x.textContent || '').trim().slice(0, 12));
  const rows = [...document.querySelectorAll('.pane .lrow.hotrow')].map((x) => (x.textContent || '').trim().slice(0, 12));
  const slow = document.querySelector('.pane [data-slow-soft]');
  const slowHot = document.querySelector('.pane .sechd.hot .tag2.hot');
  const gradeBtn = document.querySelector('.pane button[data-act="grade"]');
  const demoted = document.querySelector('[data-demoted]');
  const chip = document.querySelector('.chip.grade');
  return {
    hotSecs: secs,
    hotRows: rows,
    hotCount: secs.length + rows.length,
    slowSoft: slow ? (slow.textContent || '').trim() : '',
    slowSoftClass: slow ? slow.className : '',
    slowHotTag: slowHot ? (slowHot.textContent || '').trim() : '',
    gradeClass: gradeBtn ? gradeBtn.className : '',
    gradeText: gradeBtn ? (gradeBtn.textContent || '').trim() : '',
    demoted: demoted ? (demoted.textContent || '').trim() : '',
    chipClass: chip ? chip.className : '',
    chipText: chip ? (chip.textContent || '').trim() : '',
  };
}"""


def main():
    with sync_playwright() as pw:
        browser = pw.chromium.launch()
        pg = browser.new_page(viewport={"width": 1440, "height": 900})
        errors = []
        pg.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
        open_game(pg)

        # ① 开局：钩子落在能当天见效的家当上 → 设备段那行「最慢」只能是参考
        pg.evaluate(LOSS_QUEUE_JS)
        pg.wait_for_timeout(400)
        a = pg.evaluate(MARKS_JS)
        note("single_hot_section_a", len(a["hotSecs"]) <= 1, a)
        # 这一段今天就是「该动的那一段」——那行「最慢」是真话，不是参考
        note("slow_hot_when_focus", "最慢" in a["slowHotTag"] and a["slowSoft"] == "", a)
        note("slow_no_grey_when_hot", a["slowSoftClass"] == "", a["slowSoftClass"])
        note("demoted_line_present", "今天先不动" in a["demoted"], a["demoted"])
        pg.screenshot(path=os.path.join(OUT, "01-focus-one.png"))

        # ② 段位够格但今天该接客 → 评定按钮虚掉、HUD 不喊
        pg.evaluate(READY_AND_LOSS_JS)
        pg.wait_for_timeout(400)
        b = pg.evaluate(MARKS_JS)
        note("single_hot_section_b", len(b["hotSecs"]) <= 1, b)
        note("grade_soft_when_not_focus", "soft" in b["gradeClass"], b["gradeClass"])
        note("grade_ready_label", b["gradeText"] == "交费评定", b["gradeText"])
        note("hud_chip_not_hot", "hot" not in b["chipClass"], b["chipClass"])
        note("demoted_says_enough", "够格" in b["demoted"], b["demoted"])
        pg.screenshot(path=os.path.join(OUT, "02-grade-demoted.png"))

        # ③ 没人走、段位够格 → 今天就是评定：按钮回到主推、HUD 也喊
        pg.evaluate(READY_QUIET_JS)
        pg.wait_for_timeout(400)
        c = pg.evaluate(MARKS_JS)
        note("single_hot_section_c", len(c["hotSecs"]) <= 1, c)
        note("grade_hot_when_focus", "soft" not in c["gradeClass"], c)
        note("hud_chip_hot", "hot" in c["chipClass"], c["chipClass"])
        note("slow_still_soft", c["slowSoft"].startswith("参考"), c["slowSoft"])
        pg.screenshot(path=os.path.join(OUT, "03-grade-focus.png"))

        ver = pg.evaluate(
            """() => {
              for (let i = 0; i < localStorage.length; i++) {
                const k = localStorage.key(i);
                if (!k || !k.startsWith('laoyou.save')) continue;
                try { const o = JSON.parse(localStorage.getItem(k)); if (o && o.saveVersion) return o.saveVersion; } catch (e) {}
              }
              return 0;
            }"""
        )
        note("save_version", ver == 37, ver)

        bad = [e for e in errors if "Failed to load resource" not in e]
        note("console_clean", len(bad) == 0, bad[:2])

        browser.close()

    ok = sum(1 for v in checks.values() if v["ok"])
    print(json.dumps(checks, ensure_ascii=False, indent=1))
    print(f"{ok} / {len(checks)} true")
    with open(os.path.join(OUT, "align-report.json"), "w", encoding="utf-8") as f:
        json.dump(checks, f, ensure_ascii=False, indent=1)
    return 0 if ok == len(checks) else 1


if __name__ == "__main__":
    raise SystemExit(main())
