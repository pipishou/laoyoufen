"""飞轮第三/四齿：review_log.jsonl + human_overrides.jsonl → 翻案率矩阵 + 成本归因。

它回答的不是「AI 准不准」，而是「哪一条判据在哪个题材上系统性偏了」——
那才是能改判据的原料。

两种「不一致」要分开算，混在一起就是自欺：
  · AI 已给方向（pass_auto / reject_auto）而人反过来 → **翻案**（判据偏了，可定位到判据 ID）
  · AI 弃权（to_human）由人补位 → **补位**，不算翻案；但补位里 pass 的比例就是「误杀率」的来源
  · J5 闸弃权（不评分直接上交）→ 单列：人判 reject 说明闸有救，人判 pass 说明闸太敏感

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
HUMAN = ["pass", "revise", "reject"]


def load_overrides(path: Path) -> dict[tuple[str, str], dict]:
    """human_overrides.jsonl 是 append-only：同一候选多次回填取最后一条。"""
    out: dict[tuple[str, str], dict] = {}
    for o in read_jsonl(path):
        if not o.get("candidate_id"):
            continue
        out[(o.get("run_id"), o["candidate_id"])] = o
    return out


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--log", default=str(REVIEW_DIR / "review_log.jsonl"))
    ap.add_argument("--overrides", default=str(REVIEW_DIR / "human_overrides.jsonl"))
    ap.add_argument("--json", action="store_true")
    args = ap.parse_args()

    rows = read_jsonl(Path(args.log))
    if not rows:
        print("no review_log yet")
        return
    ov_map = load_overrides(Path(args.overrides))

    # 把外置回填合并进行内（行内 human_override 兼容旧数据）
    for r in rows:
        if not r.get("human_override"):
            r["human_override"] = ov_map.get((r.get("run_id"), r.get("candidate_id")))

    n = len(rows)
    runs = sorted({r["run_id"] for r in rows})
    verdict_c = Counter(r["verdict"] for r in rows)
    reviewed = [r for r in rows if r.get("human_override")]

    def human_of(r: dict) -> str:
        return str((r.get("human_override") or {}).get("verdict") or "").lower()

    # 1) 翻案：AI 有方向、人反过来
    flip_base = Counter()
    flip = Counter()
    # 2) 补位：AI 弃权、人给结论
    backstop = defaultdict(Counter)
    # 3) J5 闸弃权单列
    gate_rows = [r for r in reviewed if r.get("score") is None and r["verdict"] == "to_human"]
    # 4) 误杀 / 漏放（拿 S 与人判比，只在有 S 的行上算）
    false_kill = []   # 人 pass，但 S 低于阈值 → 判据过严
    false_pass = []   # 人 reject，但 S 高于阈值 → 判据过松
    try:
        from run_review import PASS_S  # 单一来源，别在两处写阈值
    except Exception:  # noqa: BLE001
        PASS_S = None

    for r in reviewed:
        h = human_of(r)
        if h not in HUMAN:
            continue
        auto = r["verdict"]
        if auto in ("pass_auto", "reject_auto"):
            flip_base[auto] += 1
            if (auto == "pass_auto" and h != "pass") or (auto == "reject_auto" and h != "reject"):
                flip[auto] += 1
        elif auto == "to_human" and r.get("score") is not None:
            backstop["scored"][h] += 1
            if PASS_S is not None and h == "pass" and r["score"] < PASS_S:
                false_kill.append(r["candidate_id"])
            if PASS_S is not None and h == "reject" and r["score"] >= PASS_S:
                false_pass.append(r["candidate_id"])
        elif auto == "to_human":
            backstop["gate"][h] += 1

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
        "human_queue_pending": verdict_c.get("to_human", 0) - len([r for r in reviewed if r["verdict"] == "to_human"]),
        "flip_rate": {k: (round(flip[k] / flip_base[k], 3) if flip_base[k] else None) for k in flip_base},
        "backstop": {k: dict(v) for k, v in backstop.items()},
        "gate_reviewed": len([r for r in gate_rows if human_of(r) in HUMAN]),
        "false_kill": false_kill,
        "false_pass": false_pass,
        "pass_s": PASS_S,
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
    print(f"人审已回填 {out['human_reviewed']} 条（队列还剩 {max(out['human_queue_pending'], 0)} 条未勾）")
    if reviewed:
        print("翻案（AI 有方向被人推翻）:", {k: v for k, v in out["flip_rate"].items()} or "（复核行都在 to_human，无方向可翻）")
        if backstop.get("scored"):
            print("补位（AI 弃权由人定）:", backstop["scored"])
        if backstop.get("gate"):
            print("J5 闸弃权 → 人判:", backstop["gate"])
        if false_kill:
            print(f"误杀（人判通过但 S<{PASS_S}）:", false_kill)
        if false_pass:
            print(f"漏放（人判否决但 S≥{PASS_S}）:", false_pass)
    else:
        print("翻案率: （尚无人审回填）")
    print(f"tokens={tokens}  估费 ¥{out['est_cost_cny']}")
    if not reviewed:
        print("\n⚠ 飞轮第三齿未咬合：review_log + human_overrides 里都没有人审结果 —— 没有放行证据，"
              "翻案率无从计算。")
        print("  下一条指令：`python tools/reviewer/human_review.py export` 出清单 → 逐条 apply 回填。")


if __name__ == "__main__":
    main()
