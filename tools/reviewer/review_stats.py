"""飞轮第三齿：review_log.jsonl → 翻案率矩阵 + 成本归因。

它回答的不是「AI 准不准」，而是「哪一条判据在哪个题材上系统性偏了」——
那才是能改判据的原料。

用法：
  python tools/reviewer/review_stats.py
  python tools/reviewer/review_stats.py --json
"""
from __future__ import annotations

import argparse
import json
from collections import Counter, defaultdict
from pathlib import Path

from common import REVIEW_DIR, read_jsonl

JUDGES = ["J1", "J2", "J3", "J4", "J5"]
VERDICTS = ["pass_auto", "to_human", "reject_auto"]


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--log", default=str(REVIEW_DIR / "review_log.jsonl"))
    ap.add_argument("--json", action="store_true")
    args = ap.parse_args()

    rows = read_jsonl(Path(args.log))
    if not rows:
        print("no review_log yet")
        return

    n = len(rows)
    runs = sorted({r["run_id"] for r in rows})
    verdict_c = Counter(r["verdict"] for r in rows)
    reviewed = [r for r in rows if r.get("human_override")]

    # 翻案率：人审结果与自动裁决不一致的比例（飞轮核心信号）
    flips = defaultdict(int)
    flips_total = defaultdict(int)
    for r in reviewed:
        auto = r["verdict"]
        human = (r.get("human_override") or {}).get("verdict")
        if not human:
            continue
        flips_total[auto] += 1
        if human != auto:
            flips[auto] += 1

    # 判据分歧图：同一候选内极差 ≥2 的次数 / 每条判据的 fail+unsure 次数
    spread2 = 0
    judge_flag = Counter()
    judge_na = Counter()
    score_sum = defaultdict(list)
    tokens = 0
    for r in rows:
        scores = []
        for j in r.get("judges", []):
            raw = j.get("score")
            if raw is None:
                if str(j.get("verdict", "")).lower() == "na":
                    judge_na[j["judge"]] += 1
                continue
            try:
                val = float(raw)
            except (TypeError, ValueError):
                continue
            scores.append(val)
            score_sum[j["judge"]].append(val)
            if str(j.get("verdict", "")).lower() in ("fail", "unsure"):
                judge_flag[j["judge"]] += 1
            tokens += (j.get("tokens") or {}).get("total_tokens", 0) or 0
        if scores and max(scores) - min(scores) >= 2:
            spread2 += 1

    out = {
        "runs": len(runs),
        "rows": n,
        "verdicts": {v: verdict_c.get(v, 0) for v in VERDICTS},
        "auto_pass_rate": round(verdict_c.get("pass_auto", 0) / n, 3),
        "human_queue_rate": round(verdict_c.get("to_human", 0) / n, 3),
        "judge_means": {k: round(sum(v) / len(v), 2) for k, v in score_sum.items() if v},
        "judge_flag_counts": dict(judge_flag),
        "judge_na_counts": dict(judge_na),
        "disagreement_rate": round(spread2 / n, 3),
        "human_reviewed": len(reviewed),
        "flip_rate": {k: (round(flips[k] / flips_total[k], 3) if flips_total[k] else None) for k in flips_total},
        "tokens_total": tokens,
        "est_cost_cny": round(tokens / 1_000_000 * 2.0, 4),  # 粗估：¥2/百万 token（混入/出），未按模型单价细分
    }

    if args.json:
        print(json.dumps(out, ensure_ascii=False, indent=2))
        return

    print(f"runs={out['runs']}  rows={n}")
    print(f"自动通过 {out['verdicts']['pass_auto']} ({out['auto_pass_rate']:.0%}) | "
          f"人审 {out['verdicts']['to_human']} ({out['human_queue_rate']:.0%}) | "
          f"自动否决 {out['verdicts']['reject_auto']}")
    print("判据均分:", out["judge_means"])
    print("判据 fail/unsure 次数:", out["judge_flag_counts"] or "{}")
    print(f"判据打架率（极差≥2）: {out['disagreement_rate']:.0%}")
    print(f"人审已复核 {out['human_reviewed']} 条；翻案率: {out['flip_rate'] or '（尚无人审回填）'}")
    print(f"tokens={tokens}  估费 ¥{out['est_cost_cny']}")
    if not reviewed:
        print("\n⚠ 飞轮第三齿未咬合：review_log 里 human_override 全为 null —— 没有放行证据，翻案率无从计算。")
        print("  下一条指令：跑一次人审回填（对 to_human 队列逐条写 verdict），或先做 200 条金标盲测。")


if __name__ == "__main__":
    main()

