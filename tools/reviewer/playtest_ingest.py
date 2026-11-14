# -*- coding: utf-8 -*-
"""把玩家的试玩记录（playtest-*.json）变成一份可读报告。

飞轮的第三齿：人类证据 → 报告 → 决策。之前只有 AI 审核官（吃事件文案），
玩家的数据停在浏览器里没人吃；这个脚本负责把它读出来。

用法：
    python tools/reviewer/playtest_ingest.py                 # 读全部，写 docs/试玩记录-<日期>.md
    python tools/reviewer/playtest_ingest.py --file x.json   # 只读一个
    python tools/reviewer/playtest_ingest.py --print         # 只打印，不写文件
"""
from __future__ import annotations

import argparse
import glob
import io
import json
import pathlib
from datetime import datetime

ROOT = pathlib.Path(__file__).resolve().parents[2]
PLAYTEST_DIR = ROOT / "game" / "data" / "playtest"
GAME_MINUTES_PER_DAY = 120
REAL_MINUTES_PER_GAME_MINUTE = 6  # 见 game/src/data/balance.ts


def load(path: pathlib.Path) -> dict:
    with io.open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def fmt(n: float, nd: int = 1) -> str:
    return f"{n:,.{nd}f}"


def analyze(data: dict) -> dict:
    s = data.get("summary") or {}
    days = data.get("days") or []
    bowls = s.get("bowls", 0)
    lost = s.get("lost", 0)
    n_days = s.get("days", len(days))
    per_day = bowls / n_days if n_days else 0
    # 每天的温度/价格轨迹，用来看玩家在什么时候调价、什么时候开始掉客
    trail = []
    for d in days:
        if not d.get("minutes"):
            continue
        price = d["priceSum"] / d["priceCount"] if d.get("priceCount") else 0
        taste = d["tasteSum"] / d["tasteCount"] if d.get("tasteCount") else 0
        trail.append(
            {
                "month": d["month"],
                "day": d["day"],
                "bowls": d["bowls"],
                "lost": d["lost"],
                "price": price,
                "taste": taste,
                "seats": d.get("seats", 0),
                "peak": d.get("peakWaiting", 0),
            }
        )
    # 卡点信号：连着 5 天碗数不动且流失为 0 → 产能顶到天花板（无聊区）
    flat = 0
    max_flat = 0
    prev = None
    for row in trail:
        if prev is not None and row["lost"] == 0 and abs(row["bowls"] - prev) <= 3:
            flat += 1
            max_flat = max(max_flat, flat)
        else:
            flat = 0
        prev = row["bowls"]
    return {
        "games": 1,
        "minutes": s.get("minutes", 0),
        "days": n_days,
        "bowls": bowls,
        "lost": lost,
        "lost_rate": s.get("lostRate", 0),
        "avg_price": s.get("avgPrice", 0),
        "avg_taste": s.get("avgTaste", 0),
        "peak_waiting": s.get("peakWaiting", 0),
        "revenue": s.get("revenueTotal", 0),
        "bowls_per_day": per_day,
        "flat_run": max_flat,
        "trail": trail,
        "reasons": s.get("lostReasons", []),
    }


def render(rows: list[tuple[pathlib.Path, dict]], when: str) -> str:
    total_min = sum(a["minutes"] for _, a in rows)
    real_min = total_min * REAL_MINUTES_PER_GAME_MINUTE
    out = []
    out.append(f"# 试玩记录 · {when}\n")
    out.append("> 由 `tools/reviewer/playtest_ingest.py` 从 `game/data/playtest/*.json` 生成。")
    out.append("> 数据来源＝玩家浏览器里按 `Shift+E` 导出的埋点包（日聚合 ＋ 最近 600 分钟细节）。\n")
    out.append("## 一、总览\n")
    out.append("| 项 | 值 |")
    out.append("|---|---|")
    out.append(f"| 记录文件 | {len(rows)} 个 |")
    out.append(f"| 游戏内时长 | {total_min:,} 分钟（≈ {total_min / GAME_MINUTES_PER_DAY:.1f} 个游戏日） |")
    out.append(f"| 折算真实游玩 | {real_min:,.0f} 分钟（≈ {real_min / 60:.1f} 小时，按 1 游戏分钟 = 6 秒） |")
    out.append("")
    for path, a in rows:
        out.append(f"## 二、{path.name}\n")
        out.append("| 指标 | 实测 | 设计基线 | 判读 |")
        out.append("|---|---|---|---|")
        out.append(f"| 游戏天数 | {a['days']} | 36 月 × 30 = 1,080 | {'够长，可下结论' if a['days'] >= 30 else '太短，只能看前几天的体感'} |")
        out.append(f"| 日均碗数 | {fmt(a['bowls_per_day'])} | 4 座上限 71.2 / 8 座 113.4 | {'顶到产能' if a['bowls_per_day'] > 65 else '没喂饱' if a['bowls_per_day'] < 45 else '正常区间'} |")
        out.append(f"| 累计卖碗 | {a['bowls']:,} | — | — |")
        out.append(f"| 流失率 | {a['lost_rate'] * 100:.1f}% | 替身 27–51% | {'偏高' if a['lost_rate'] > 0.4 else '正常' if a['lost_rate'] > 0.05 else '几乎没流失（可能产能过剩）'} |")
        out.append(f"| 均价 | ¥{fmt(a['avg_price'], 2)} | 默认 ¥9 | {'低于默认，玩家在降价' if a['avg_price'] < 8.9 else '守住默认价' if a['avg_price'] < 9.6 else '敢涨价'} |")
        out.append(f"| 味道均分 | {fmt(a['avg_taste'], 0)} | 及格线 ~55 | {'偏低' if a['avg_taste'] < 55 else '及格' if a['avg_taste'] < 70 else '好'} |")
        out.append(f"| 峰值排队 | {a['peak_waiting']} | 队列上限 12 | {'爆队' if a['peak_waiting'] >= 10 else '正常'} |")
        out.append(f"| 累计营收 | ¥{a['revenue']:,} | — | — |")
        out.append(f"| 最长持平段 | {a['flat_run']} 天 | 0 天为好 | {'⚠ 连续 5 天以上碗数不动且不流失＝顶到产能，属 P24 无聊区' if a['flat_run'] >= 5 else '有变化'} |")
        out.append("")
        if a["reasons"]:
            out.append("**流失原因（按人数）**\n")
            out.append("| 原因 | 人数 | 占比 |")
            out.append("|---|---|---|")
            tot = max(1, sum(r["count"] for r in a["reasons"]))
            for r in a["reasons"][:6]:
                out.append(f"| {r['reason']} | {r['count']} | {r['count'] / tot * 100:.1f}% |")
            out.append("")
        if a["trail"]:
            out.append("**逐日轨迹（前 20 天）**\n")
            out.append("| 月 | 日 | 碗 | 流失 | 售价 | 味道 | 座位 | 峰值排队 |")
            out.append("|---|---|---|---|---|---|---|---|")
            for row in a["trail"][:20]:
                out.append(
                    f"| {row['month'] + 1} | {row['day']} | {row['bowls']} | {row['lost']} | "
                    f"¥{fmt(row['price'], 1)} | {fmt(row['taste'], 0)} | {row['seats']} | {row['peak']} |"
                )
            out.append("")
    out.append("## 三、下一步看什么\n")
    out.append("1. 日均碗数是否顶到 71.2（4 座上限）——顶到就撞 P24。")
    out.append("2. 均价是否一路往下掉——掉了说明「调味道」这条路玩家没走通，走的是降价。")
    out.append("3. 流失原因里「看价牌走了」占多大比例——占比高说明定价信号可读但太晚。")
    out.append("4. 持平段 ≥5 天 → 中期没有决策点，P24 优先级继续压过 P22。")
    out.append("")
    return "\n".join(out)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--file", help="只读指定的 json")
    ap.add_argument("--print", action="store_true", help="只打印不写文件")
    args = ap.parse_args()

    if args.file:
        files = [pathlib.Path(args.file)]
    else:
        files = [pathlib.Path(p) for p in sorted(glob.glob(str(PLAYTEST_DIR / "playtest-*.json")))]
    if not files:
        print(f"[空] {PLAYTEST_DIR} 下没有 playtest-*.json —— 先在游戏里按 Shift+E 导出一份")
        return

    rows = []
    for p in files:
        try:
            rows.append((p, analyze(load(p))))
        except Exception as exc:  # noqa: BLE001
            print(f"[跳过] {p.name}: {exc}")

    when = datetime.now().strftime("%Y-%m-%d")
    md = render(rows, when)
    if args.print:
        print(md)
        return
    out = ROOT / "docs" / f"试玩记录-{when}.md"
    out.parent.mkdir(parents=True, exist_ok=True)
    with io.open(out, "w", encoding="utf-8") as f:
        f.write(md)
    print(f"[写入] {out}")
    for p, a in rows:
        print(f"  {p.name}: {a['days']} 天 / 日均 {a['bowls_per_day']:.1f} 碗 / 流失 {a['lost_rate']*100:.0f}% / 均价 ¥{a['avg_price']:.1f}")


if __name__ == "__main__":
    main()
