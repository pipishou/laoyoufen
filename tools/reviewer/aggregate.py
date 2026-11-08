"""跨 run 聚合：把 N 次重复审核折成一条可判决、且标注稳定性的结论。

为什么需要它（2026-11-08 实测）：同一份判据文本连跑 4 次，自动通过数 13/10/6/10（sd≈2.5），
逐条完全一致的只有 15/32（47%）。单次 tally 不能用来比较判据版本 —— 差异会被噪声吃掉。
规程：任何判据文本改动，必须 k≥3 次重复 + 多数票，才允许说「变好了」。

用法：
    python tools/reviewer/aggregate.py                # 取最近 3 个 run
    python tools/reviewer/aggregate.py --last 5
    python tools/reviewer/aggregate.py --runs A,B,C   # 指定 run_id
    python tools/reviewer/aggregate.py --flip         # 只看翻转条目
    python tools/reviewer/aggregate.py --json         # 机器可读
"""
from __future__ import annotations

import argparse
import json
import statistics
import sys
from collections import Counter, defaultdict

from common import REVIEW_DIR, read_jsonl, write_jsonl

PRIORITY = ["reject_auto", "to_human", "pass_auto"]  # 平票时偏向更保守的一侧
OUT = REVIEW_DIR / "review_aggregate.json"


def all_runs() -> list[str]:
    seen: list[str] = []
    for r in read_jsonl(REVIEW_DIR / "review_log.jsonl"):
        if r["run_id"] not in seen:
            seen.append(r["run_id"])
    return seen


def majority(verdicts: list[str]) -> str:
    cnt = Counter(verdicts)
    top = max(cnt.values())
    tied = [v for v, n in cnt.items() if n == top]
    if len(tied) == 1:
        return tied[0]
    for v in PRIORITY:  # 平票 → 保守侧（reject > to_human > pass）
        if v in tied:
            return v
    return tied[0]


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--runs", default="", help="逗号分隔的 run_id")
    ap.add_argument("--last", type=int, default=3)
    ap.add_argument("--flip", action="store_true", help="只列翻转条目")
    ap.add_argument("--json", action="store_true")
    a = ap.parse_args()

    runs = [x.strip() for x in a.runs.split(",") if x.strip()] or all_runs()[-a.last:]
    rows = [r for r in read_jsonl(REVIEW_DIR / "review_log.jsonl") if r["run_id"] in runs]
    if not rows:
        print("没有匹配的 run", file=sys.stderr)
        return 2

    per_v: dict[str, dict[str, str]] = defaultdict(dict)
    per_s: dict[str, dict[str, float | None]] = defaultdict(dict)
    titles: dict[str, str] = {}
    for r in rows:
        cid = r["candidate_id"]
        per_v[cid][r["run_id"]] = r["verdict"]
        per_s[cid][r["run_id"]] = r["score"]
        titles[cid] = (r.get("snapshot") or {}).get("title", "")

    items = []
    for cid in sorted(per_v):
        vs = [per_v[cid].get(run, "-") for run in runs]
        ss = [per_s[cid].get(run) for run in runs]
        nums = [float(x) for x in ss if x is not None]
        items.append({
            "candidate_id": cid,
            "title": titles.get(cid, ""),
            "verdicts": vs,
            "counts": dict(Counter(v for v in vs if v != "-")),
            "majority": majority([v for v in vs if v != "-"]),
            "stable": len(set(vs)) == 1,
            "S_mean": round(statistics.mean(nums), 3) if nums else None,
            "S_spread": round(max(nums) - min(nums), 3) if len(nums) > 1 else 0.0,
        })

    stable = sum(1 for i in items if i["stable"])
    tallies = [dict(Counter(r["verdict"] for r in rows if r["run_id"] == run)) for run in runs]
    passes = [t.get("pass_auto", 0) for t in tallies]
    summary = {
        "runs": runs,
        "n_items": len(items),
        "stable": stable,
        "unstable": len(items) - stable,
        "agreement": round(100 * stable / len(items), 1) if items else 0.0,
        "pass_auto_by_run": passes,
        "pass_auto_mean": round(statistics.mean(passes), 2) if passes else 0,
        "pass_auto_sd": round(statistics.pstdev(passes), 2) if len(passes) > 1 else 0.0,
        "S_spread_median": round(statistics.median([i["S_spread"] or 0 for i in items]), 3) if items else 0,
        "majority_tally": dict(Counter(i["majority"] for i in items)),
    }

    if a.json:
        print(json.dumps({"summary": summary, "items": items}, ensure_ascii=False, indent=2))
        return 0

    print(f"runs: {', '.join(runs)}  (k={len(runs)})")
    for run, t in zip(runs, tallies):
        print(f"  {run}  {t}")
    print(f"pass_auto: {passes} → mean {summary['pass_auto_mean']}  sd {summary['pass_auto_sd']}")
    print(f"逐条一致 {stable}/{len(items)}（{summary['agreement']}%）  中位 S 跨 run 极差 {summary['S_spread_median']}")
    print(f"多数票结果: {summary['majority_tally']}")
    print()
    shown = [i for i in items if (not i["stable"] or not a.flip)]
    if a.flip:
        print(f"{'candidate':<18} {'逐次裁决':<46} {'S均值':<7} 跨run极差")
        for i in shown:
            print(f"{i['candidate_id']:<18} {' / '.join(i['verdicts']):<46} {str(i['S_mean']):<7} {i['S_spread']}")
    else:
        print(f"{'candidate':<18} {'稳定':<5} {'多数票':<12} {'S均值':<7} {'极差':<6}")
        for i in items:
            print(f"{i['candidate_id']:<18} {'是' if i['stable'] else '否':<5} {i['majority']:<12} "
                  f"{str(i['S_mean']):<7} {i['S_spread']:<6}")

    write_jsonl(OUT, [{"summary": summary, "items": items}])
    print(f"\n→ {OUT}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
