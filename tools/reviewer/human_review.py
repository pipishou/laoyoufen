"""人审清单：把 review_log 里 to_human 的条目导出成「可直接勾选」的清单，并回收勾选结果。

飞轮第三齿唯一的咬合处。

用法：
  # 1) 导出清单（Markdown 打印/勾选 + JSONL 机读）
  python tools/reviewer/human_review.py export
  python tools/reviewer/human_review.py export --run 20261108T125819Z

  # 2) 勾完把结果写回（append-only，绝不改 review_log 的历史行）
  python tools/reviewer/human_review.py apply --id bamboo_press --verdict pass
  python tools/reviewer/human_review.py apply --id food_blogger --verdict revise --note "把「举灯」改成「架灯」"
  python tools/reviewer/human_review.py apply --id inspect --verdict reject --note "机构指称，改写后重投"

  # 3) 看回填进度
  python tools/reviewer/human_review.py status

verdict 取值：
  pass    通过（AI 判错了——本来是 to_human，人确认可用）
  revise  改词后通过（AI 判对了一半：内容值得留，但要动字）
  reject  否决（AI 判对了 / 或人否决，须写 note）
"""
from __future__ import annotations

import argparse
import io
import json
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

from common import REVIEW_DIR, append_jsonl, read_jsonl, write_jsonl

LOG = REVIEW_DIR / "review_log.jsonl"
QUEUE = REVIEW_DIR / "human_queue.jsonl"
OVERRIDES = REVIEW_DIR / "human_overrides.jsonl"
MD_DIR = REVIEW_DIR.parents[2] / ".junshi" / "review"

VERDICT_LABEL = {"pass": "通过（原样进池）", "revise": "改词后通过", "reject": "否决"}
WEIGHTS = {"J1": 0.30, "J2": 0.25, "J3": 0.25, "J4": 0.20}


def stats_of(item: dict) -> dict:
    """从 judges 现算判据布局，不复读 arbiter_note（那句 min 是守门值不是全表最小值，容易误读）。"""
    judges = item["judges"]
    scored = {j["judge"]: j["score"] for j in judges if isinstance(j.get("score"), (int, float))}
    na = sorted(j["judge"] for j in judges if j.get("score") is None)
    gate = next((j for j in judges if j["judge"] == "J5"), None)
    gate_verdict = str((gate or {}).get("verdict", "")).lower()
    guard = min((scored[k] for k in ("J1", "J2") if k in scored), default=None)
    return {
        "S": item.get("score"),
        "scored": scored,
        "na": na,
        "low": min(scored.values()) if scored else None,
        "spread": (max(scored.values()) - min(scored.values())) if scored else None,
        "guard": guard,
        "gate_verdict": gate_verdict,
        "kind": "风险闸" if item.get("score") is None and gate_verdict in ("unsure", "fail") else "判据打架",
    }


def s_text(item: dict) -> str:
    st = stats_of(item)
    return "闸" if st["S"] is None else f"{st['S']}"


def latest_run(rows: list[dict]) -> str:
    return max(r["run_id"] for r in rows)


def build_queue(run: str | None = None, runs: list[str] | None = None) -> list[dict]:
    rows = read_jsonl(LOG)
    if not rows:
        return []
    done = {o["candidate_id"]: o for o in read_jsonl(OVERRIDES)}

    def pack(r: dict, queue_id: str, extra_note: str = "") -> dict:
        cid = r["candidate_id"]
        return {
            "queue_id": queue_id,
            "run_id": r["run_id"],
            "candidate_id": cid,
            "content_hash": r.get("content_hash"),
            "score": r.get("score"),
            "arbiter_note": (extra_note + (r.get("arbiter_note") or "")).strip(),
            "snapshot": r.get("snapshot"),
            "judges": [
                {
                    "judge": j.get("judge"),
                    "name": j.get("name"),
                    "score": j.get("score"),
                    "verdict": j.get("verdict"),
                    "reason": j.get("reason"),
                }
                for j in r.get("judges", [])
            ],
            "human_override": done.get(cid),
        }

    # 多 run 模式（k≥3 多数票）：为什么需要 —— 同一判据文本连跑 4 次，逐条一致率只有 47%，
    # 用单 run 导出的清单会把噪声当成待判条目。这里取多数票为 to_human 的条目，
    # 代表行 = S 最接近中位数的那次 run（避免挑到极端样本），并在 arbiter_note 前置投票分布。
    if runs:
        from aggregate import majority
        by_cid: dict[str, list[dict]] = {}
        for r in rows:
            if r["run_id"] in runs:
                by_cid.setdefault(r["candidate_id"], []).append(r)
        out = []
        for cid, rs in by_cid.items():
            votes = [r["verdict"] for r in rs]
            maj = majority(votes)
            if maj != "to_human":
                continue
            nums = sorted(r["score"] for r in rs if r.get("score") is not None)
            med = nums[len(nums) // 2] if nums else None
            rep = min(
                (r for r in rs if r["verdict"] == "to_human"),
                key=lambda r: abs((r.get("score") or 0) - (med or 0)),
                default=rs[0],
            )
            cnt = Counter(votes)
            note = f"投票 {len(votes)} 次：" + " / ".join(f"{v}×{n}" for v, n in cnt.most_common()) + "；"
            out.append(pack(rep, f"k{len(runs)}:{cid}", note))
        out.sort(key=lambda x: (x["score"] is None, x["score"] or 0))
        return out

    run = run or latest_run(rows)
    return [pack(r, f"{run}:{r['candidate_id']}") for r in rows if r["run_id"] == run and r["verdict"] == "to_human"]


def md_for(item: dict, idx: int) -> str:
    snap = item["snapshot"] or {}
    judges = item["judges"]
    st = stats_of(item)
    sc = " ".join(f"{j['judge']}={'na' if j['score'] is None else j['score']}" for j in judges)
    ov = item.get("human_override")
    mark = {"pass": "✅ 已勾：通过", "revise": "✏️ 已勾：改词后通过", "reject": "❌ 已勾：否决"}.get(
        (ov or {}).get("verdict", ""), "⬜ 待勾"
    )
    # 只挑分数最低与最高的两条理由：人审真正要看的是「AI 在哪儿犹豫/在哪儿夸」
    scored = [j for j in judges if isinstance(j.get("score"), (int, float))]
    lo = min(scored, key=lambda j: j["score"]) if scored else None
    hi = max(scored, key=lambda j: j["score"]) if scored else None
    if st["S"] is None:
        line = f"**AI 判**：`{sc}` → **J5 风险闸 {st['gate_verdict']}（不评分，直接上交人判）**"
    else:
        line = (
            f"**AI 判**：`{sc}` → S={st['S']} · 加权极差 {st['spread']} · "
            f"J1/J2 守门 {st['guard']} · na={','.join(st['na']) or '无'}"
        )
    lines = [
        f"### {idx:02d} · `{item['candidate_id']}` · {st['kind']} · {mark}",
        "",
        f"**标题**：{snap.get('title','')}",
        "",
        f"**正文**：{snap.get('body','')}",
        "",
    ]
    for i, ch in enumerate(snap.get("choices") or [], 1):
        lines.append(f"- 选项{i} **{ch.get('label','')}**｜{ch.get('summary','')} → {ch.get('result','')}")
    vote_note = next(
        (ln for ln in (item.get("arbiter_note") or "").split("；") if ln.startswith("投票")), ""
    )
    lines += ["", line]
    if vote_note:
        lines.append(f"**跨 run 投票**：{vote_note}（同一份判据连跑多次，裁决会翻转 —— 票数越散越说明这条卡在判据边界上）")
    if st["S"] is None:
        gate_reason = (next((j for j in judges if j["judge"] == "J5"), None) or {}).get("reason", "")
        lines.append(f"**人判要点**：只判一件事——这条的合规风险能不能接受。J5 原话：{gate_reason}")
    if lo:
        lines.append(f"**最低分**：{lo['judge']} {lo['name']} {lo['score']} —— {lo['reason']}")
    if hi and hi is not lo:
        lines.append(f"**最高分**：{hi['judge']} {hi['name']} {hi['score']} —— {hi['reason']}")
    na = [j for j in judges if j.get("score") is None]
    if na:
        lines.append("**不适用**：" + "；".join(f"{j['judge']} {j['reason']}" for j in na))
    lines += [
        "",
        "- [ ] ✅ **通过** — 原样进池（AI 这条判错了）",
        "- [ ] ✏️ **改词后通过** — 内容留，改哪句：`________________`",
        "- [ ] ❌ **否决** — 为什么：`________________`",
        "",
        f"> 回填：`python tools/reviewer/human_review.py apply --id {item['candidate_id']} --verdict pass|revise|reject --note \"...\"`",
        "",
        "---",
        "",
    ]
    return "\n".join(lines)


def _overview_table(queue: list[dict]) -> list[str]:
    rows = [
        "| # | id | 类型 | S | 最低分 | J5 | 状态 |",
        "|---|---|---|---|---|---|---|",
    ]
    for i, q in enumerate(queue, 1):
        st = stats_of(q)
        ov = (q.get("human_override") or {}).get("verdict")
        if st["scored"]:
            low = min(st["scored"], key=lambda k: st["scored"][k])
            low_txt = f"{low}={st['scored'][low]}"
        else:
            low_txt = "-"
        rows.append(
            f"| {i} | `{q['candidate_id']}` | {st['kind']} | {s_text(q)} | {low_txt} | "
            f"{st['gate_verdict']} | {'待勾' if not ov else VERDICT_LABEL.get(ov, ov)} |"
        )
    return rows


def cmd_export(args) -> None:
    runs = [x.strip() for x in (getattr(args, "runs", "") or "").split(",") if x.strip()]
    if runs and len(runs) < 3:
        print(f"注意：--runs 只给了 {len(runs)} 个 run，噪声未压住（k<3 的结果只能当 smoke test）")
    queue = build_queue(args.run, runs or None)
    if not queue:
        print("队列为空：review_log 里没有 to_human 行")
        return
    write_jsonl(QUEUE, queue)

    run = queue[0]["run_id"]
    k_note = f"（k={len(runs)} 多数票：{'/'.join(runs)}）" if runs else "（单 run）"
    pending = [q for q in queue if not q.get("human_override")]
    gate_n = sum(1 for q in queue if stats_of(q)["kind"] == "风险闸")
    md = [
        f"# 人审清单 · {run}{k_note}",
        "",
        f"导出时间：{datetime.now(timezone.utc).astimezone().isoformat(timespec='seconds')}",
        f"队列 **{len(queue)}** 条（风险闸 {gate_n} 条 + 判据打架 {len(queue) - gate_n} 条），"
        f"待勾 **{len(pending)}** 条。",
        "",
        "**两类条目，判法不同**：",
        "- **风险闸**：AI 没敢评分，直接上交。只需回答一件事——这条的合规风险能不能接受。",
        "- **判据打架**：判据分数互相矛盾（极差 ≥2）。真正要看的是 AI 的理由，而不是这条内容本身；"
        "反复出现的同一种分歧＝判据边界要改。",
        "",
        "**怎么用**：每条三个勾，勾一个；`revise`/`reject` 必须填一句理由。",
        "勾完 `python tools/reviewer/human_review.py status` 看进度，再跑 `review_stats.py` 出翻案率。",
        "",
        "## 回填速记（勾完照抄，把 pass 改成 revise/reject 即可）",
        "",
        "```bash",
    ]
    for q in queue:
        md.append(
            f"python tools/reviewer/human_review.py apply --id {q['candidate_id']} "
            f'--verdict pass --note ""'
        )
    md += [
        "```",
        "",
        "> 一条都不勾也等于答案，但那样飞轮只有两齿：`human_override` 全空时翻案率算不出来，"
        "任何准确率都是编的。",
        "",
        "## 速览",
        "",
    ]
    md += _overview_table(queue)
    md += ["", "---", ""]
    for i, q in enumerate(queue, 1):
        md.append(md_for(q, i))

    MD_DIR.mkdir(parents=True, exist_ok=True)
    md_path = MD_DIR / f"{run[:8]}-人审清单.md"
    md_path.write_text("\n".join(md), encoding="utf-8")

    html_path = MD_DIR / f"{run[:8]}-人审清单.html"
    try:
        import checklist_html

        html_path.write_text(
            checklist_html.render(queue, run=run, title="人审清单"), encoding="utf-8"
        )
        html_note = f"\nHTML    : {html_path}（点按钮勾选，底部自动生成回填命令）"
    except Exception as e:  # noqa: BLE001
        html_note = f"\nHTML    : 未生成（{type(e).__name__}: {e}）"

    print(f"队列 {len(queue)} 条（风险闸 {gate_n} / 判据打架 {len(queue) - gate_n}；待勾 {len(pending)}）")
    print(f"Markdown: {md_path}{html_note}")
    print(f"JSONL   : {QUEUE}")


def cmd_apply(args) -> None:
    if args.verdict in ("revise", "reject") and not args.note:
        print(f"--verdict {args.verdict} 必须带 --note：没有理由的回填等于没回填")
        return
    rows = read_jsonl(LOG)
    if not rows:
        print("review_log 为空")
        return
    run = args.run or latest_run(rows)
    hit = [r for r in rows if r["run_id"] == run and r["candidate_id"] == args.id]
    if not hit:
        print(f"{run} 里没有 {args.id}")
        return
    r = hit[-1]
    rec = {
        "ts": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "run_id": run,
        "candidate_id": args.id,
        "content_hash": r.get("content_hash"),
        "ai_verdict": r["verdict"],
        "ai_score": r.get("score"),
        "verdict": args.verdict,
        "note": args.note or "",
        "reviewer": args.reviewer,
    }
    append_jsonl(OVERRIDES, rec)
    print(f"已回填 {args.id} → {args.verdict}（AI 原判 {r['verdict']} S={r.get('score')}）")


def cmd_status(args) -> None:
    runs = [x.strip() for x in (getattr(args, "runs", "") or "").split(",") if x.strip()]
    queue = build_queue(args.run, runs or None)
    if not queue:
        print("队列为空")
        return
    done = [q for q in queue if q.get("human_override")]
    print(f"队列 {len(queue)} 条｜已勾 {len(done)}｜待勾 {len(queue) - len(done)}")
    c = Counter((q["human_override"] or {}).get("verdict") for q in done)
    print("勾选分布:", {k: v for k, v in c.items() if k}, "（pass=AI 判错 / revise=改词 / reject=AI 判对）")
    for q in queue:
        ov = q.get("human_override")
        print(f"  [{'x' if ov else ' '}] {q['candidate_id']:<18} S={q['score']}  {((ov or {}).get('verdict') or '-')}")


def main() -> None:
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest="cmd", required=True)

    e = sub.add_parser("export", help="导出清单")
    e.add_argument("--run", default=None)
    e.add_argument("--runs", default="", help="逗号分隔的 k 个 run_id：按多数票导队列（k>=3 才压得住噪声）")
    e.set_defaults(func=cmd_export)

    a = sub.add_parser("apply", help="回填一条人审结果")
    a.add_argument("--id", required=True)
    a.add_argument("--verdict", required=True, choices=["pass", "revise", "reject"])
    a.add_argument("--note", default="")
    a.add_argument("--reviewer", default="human")
    a.add_argument("--run", default=None)
    a.set_defaults(func=cmd_apply)

    s = sub.add_parser("status", help="看回填进度")
    s.add_argument("--run", default=None)
    s.add_argument("--runs", default="", help="同上：按多数票口径看进度")
    s.set_defaults(func=cmd_status)

    args = ap.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
