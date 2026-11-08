"""AI 审核官 · 主流程（L0 规则闸 → L1 五判据 → L2 确定性仲裁 → 落日志）

模型＝当前会话模型 DeepSeek（deepseek-chat）。五判据各自独立调用，不共享上下文。

用法：
  python tools/reviewer/run_review.py --input game/data/review/candidates_static.jsonl --limit 8
  python tools/reviewer/run_review.py --ids bamboo_press,rain_flood --dry

铁律（failure mode 已写入日志字段，不许静默放行）：
  - 任一判据调用失败/字段缺失/JSON 不合法 → 该判据记 error，整条 verdict 强制 to_human
  - verdict=pass_auto 的条目仍进抽样队列（sample_rate 默认 0.05）
"""
from __future__ import annotations

import argparse
import os
import concurrent.futures as cf
import hashlib
import json
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

from common import PROJECT_ROOT, REVIEW_DIR, append_jsonl, read_jsonl, resolve_key, write_jsonl
import l0_rules

API_URL = "https://api.deepseek.com/chat/completions"
MODEL = "deepseek-chat"

COMMON = """【项目】广西老友粉店经营模拟器（浏览器游戏），时间跨度 3 年 36 个月，玩家经营一间街边粉店。
【红线】AI 不产数字（金额/百分比由确定性模拟给出，AI 只写文字）；不写政策文号、机构全称、真实人名；不仿写既有作品。
【对象】一条「街市事件」候选：标题 + 正文 + 2–3 个选项（各有短摘要与结算后一行结果）。
【重要·判据边界】选项「摘要」里的金额与数值（如 ¥-120 · 酸笋热潮 +14）由确定性模拟产出并投影到 UI，**不是文案内容**。任何判据都不得因摘要出现数字而扣分或判 fail；数字红线只由规则闸 R2 与风险判据 J5 负责。
【重要·不适用】若本条事件在某个判据下没有可判内容（例如事件完全不涉及制粉工艺），该判据返回 score=null、verdict="na"，并在 reason 说明「不适用」；不要为此给低分或 unsure。"""

JUDGES = {
    "J1": ("世界观", "你是广西本地生活顾问。判断这条事件是否发生在广西/南宁的现实土壤里：气候（回南天、湿冷、台风季）、物产（酸笋、豆豉、山黄皮、米粉）、街巷形态（骑楼、巷口、夜市）、人的说话方式。5=本地人看了会说「就是这样」；3=不违和但缺本地锚点，换个南方城市也成立；1=明显外来想象（把米粉写成拉面、把酸笋当酸菜）。出现地理/物产硬错判 fail。"),
    "J2": ("工艺", "你是做了二十年老友粉的老师傅。判断工艺描述是否说得通：豆豉酸笋爆香后下汤、切粉/圆粉、酸笋发酵批次是否前后一致、火候与出餐顺序。5=经得起追问；3=大致合理个别含混；1=工艺写反（如「酸笋焯水去酸」把根去掉）。关键工艺写反、玩家会学错判 fail。**若本条事件根本不含制粉/食材处理内容（如探店、涨租、人事），返回 score=null、verdict=\"na\"，不要因「没写工艺」扣分。**"),
    "J3": ("玩法可读", "你是第一次打开这个游戏的玩家。只看这条事件，你知不知道自己在选什么、每个选项大概付出什么：label 是否动词化、summary 能否预判代价、两个选项是否构成真取舍而不是送分题。5=一眼看懂且两个选项都心疼；3=能懂但有一项送分；1=不知道在选什么或选项同质。无法判断后果或选项实质相同判 fail。"),
    "J4": ("新颖", "你是玩过大量经营游戏的评测者。判断这条事件是否只是通用套话（客人投诉→赔/不赔、员工要加薪→加/不加），还是带了本地或行业特有的锋利细节。5=只有开粉店的人想得到；3=套路骨架但有新料；1=换个题材零成本复用。注意：选题套路（探店、涨租、同行竞争）本身不等于 fail，只有正文与结果文案也毫无新料时才判 1/fail。"),
    "J5": ("风险", "你是内容合规与舆情审核。检查：真实机构/政策指称、地域歧视或刻板印象、食品安全误导（把违规操作写成正面）、影射真实人物、可被截图断章取义的政治民族表述。5=干净；3=轻微擦边建议改词；1=必须改写。任一条红线命中判 fail；拿不准一律 unsure（进人审，不自行放行）。"),
}

WEIGHTS = {"J1": 0.30, "J2": 0.25, "J3": 0.25, "J4": 0.20}  # v0.2：J5 降为否决闸，不参与加权
GATE_JUDGE = "J5"  # 风险不是打分维度，是红线清单：只判 pass/fail/unsure
J4_FLOOR = float(os.environ.get("J4_FLOOR", "2"))  # v0.4 地板：J4 ≤ 此值强制人审；置 0 关闭（隔离实验用）
PASS_S = 3.85  # v0.3 校准值：32 条人类基准 S 分布 min2.80/p25 3.35/median 3.67/p75 4.07/max4.47，取「好于中位数」为自动通道
REQUIRED = ("judge", "score", "verdict", "reason", "confidence")


def render_candidate(c: dict) -> str:
    lines = [f"标题：{c['title']}", f"正文：{c['body']}"]
    for i, ch in enumerate(c.get("choices") or [], 1):
        lines.append(f"选项{i}：{ch.get('label','')}｜摘要：{ch.get('summary','')}｜结果：{ch.get('result','')}")
    return "\n".join(lines)


def call_judge(key: str, jid: str, cand: dict, model: str, timeout: int = 40) -> dict:
    name, role = JUDGES[jid]
    sys = (
        f"{role}\n\n{COMMON}\n\n"
        '只输出一个 JSON 对象，字段：judge(string)、score(1-5 整数)、verdict("pass"|"fail"|"unsure")、'
        'reason(一句话，指到具体文字)、span(原文连续子串，无法定位填空串)、confidence(0-1)。'
        "不要 markdown 围栏，不要任何解释。"
    )
    payload = {
        "model": model,
        "messages": [
            {"role": "system", "content": sys},
            {"role": "user", "content": render_candidate(cand)},
        ],
        "temperature": 0.2,
        "max_tokens": 400,
        "response_format": {"type": "json_object"},
    }

    def _post(msgs: list[dict]) -> tuple[dict, dict]:
        body = dict(payload, messages=msgs)
        req = urllib.request.Request(
            API_URL,
            data=json.dumps(body).encode("utf-8"),
            headers={"Content-Type": "application/json", "Authorization": f"Bearer {key}"},
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=timeout) as r:
            data = json.loads(r.read().decode("utf-8"))
        return data, data.get("usage", {})

    t0 = time.time()
    msgs = list(payload["messages"])
    data, usage = _post(msgs)
    txt = data["choices"][0]["message"]["content"].strip()
    obj = None
    for attempt in (1, 2):
        try:
            candidate = json.loads(txt)
        except json.JSONDecodeError:
            candidate = None
        if candidate and all(k in candidate for k in REQUIRED):
            obj = candidate
            break
        if attempt == 2:
            break
        # 一次修复重试：把上一次原文回喂，明确要求 5 个字段齐全（缺字段＝失败，不许放行）
        msgs = msgs + [
            {"role": "assistant", "content": txt},
            {
                "role": "user",
                "content": '上一条输出不合格。只输出 JSON，必须包含且仅包含：{"judge":"%s","score":整数1-5或null,"verdict":"pass|fail|unsure|na","reason":"一句话","span":"原文片段","confidence":0-1}。reason 是必填字段。' % jid,
            },
        ]
        data, usage2 = _post(msgs)
        usage = usage2 or usage
        txt = data["choices"][0]["message"]["content"].strip()

    if obj is None:
        return {"judge": jid, "name": name, "error": "invalid_or_incomplete_json", "raw": txt[:200], "ms": int((time.time() - t0) * 1000), "tokens": usage}
    obj.setdefault("name", name)
    obj["judge"] = jid
    obj["ms"] = int((time.time() - t0) * 1000)
    obj["tokens"] = usage
    return obj


def judge_all(key: str, cand: dict, model: str, workers: int = 5) -> list[dict]:
    out = []
    with cf.ThreadPoolExecutor(max_workers=workers) as ex:
        futs = {ex.submit(call_judge, key, jid, cand, model): jid for jid in JUDGES}
        for f in cf.as_completed(futs):
            jid = futs[f]
            try:
                out.append(f.result())
            except (urllib.error.URLError, TimeoutError, KeyError, OSError) as e:
                out.append({"judge": jid, "name": JUDGES[jid][0], "error": f"call_failed:{type(e).__name__}"})
    out.sort(key=lambda j: j["judge"])
    return out


def arbitrate(judges: list[dict]) -> tuple[str, float | None, str]:
    """L2 确定性仲裁（v0.2）。返回 (verdict, S, 说明)。

    v0.2 两处结构改动，来自首轮 6 条的实测：
      1. J5 风险从「加权维度」降为「否决闸」——实测它对 6 条全给 5，等于恒定白送分且守卫永不触发；
         风险本质是红线清单（有/无），不是程度分。
      2. na（判据不适用）不参与加权，剩余权重重新归一；任何 error/核心判据 na 一律 to_human。
    """
    if any("error" in j for j in judges):
        errs = ",".join(j["judge"] for j in judges if "error" in j)
        return "to_human", None, f"判据调用失败（{errs}）→ 不许默认放行，转人审"
    if {j["judge"] for j in judges} != set(JUDGES):
        return "to_human", None, "判据不全 → 转人审"

    by_id = {j["judge"]: j for j in judges}
    gate = by_id[GATE_JUDGE]
    gate_v = str(gate.get("verdict", "")).lower()
    if gate_v in ("fail", "unsure", "na"):
        return ("reject_auto" if gate_v == "fail" else "to_human"), None, f"风险闸 {gate_v}：{str(gate.get('reason'))[:80]}"

    scores: dict[str, float] = {}
    na: list[str] = []
    for j in judges:
        jid = j["judge"]
        if jid == GATE_JUDGE:
            continue
        v = str(j.get("verdict", "")).lower()
        if v == "na" or j.get("score") is None:
            na.append(jid)
            continue
        try:
            scores[jid] = float(j["score"])
        except (TypeError, ValueError):
            return "to_human", None, f"{jid} score 非数值 → 转人审"

    if "J1" in na or "J3" in na:
        return "to_human", None, f"核心判据被标 na（{','.join(sorted(na))}）→ 转人审"
    wsum = sum(WEIGHTS[k] for k in scores)
    if wsum <= 0:
        return "to_human", None, "无可加权判据 → 转人审"
    S = round(sum(WEIGHTS[k] * s for k, s in scores.items()) / wsum, 3)

    verdicts = {jid: str(j.get("verdict", "unsure")).lower() for jid, j in by_id.items() if jid in scores}
    guard_keys = [k for k in ("J1", "J2") if k in scores]
    guard = min(scores[k] for k in guard_keys) if guard_keys else min(scores.values())
    spread = max(scores.values()) - min(scores.values())
    unsure = any(v == "unsure" for v in verdicts.values())
    has_fail = any(v == "fail" for v in verdicts.values())
    na_note = f" na={','.join(sorted(na))}" if na else ""

    if has_fail or S <= 2.5 or guard <= 1:
        return "reject_auto", S, f"否决：fail={has_fail} S={S} min={guard}{na_note}"
    # 地板：J4 ≤ 此值一律人判。v0.4 锚点方案已证伪回滚，但测出 J4 是极差主因（32 条里最低分判据 J4 占 8 条），
# 保留地板作为守卫——实测每次 run 命中 3–4 条，且这些条目 S 本来就在 2.7–3.4，不改变裁决
    if J4_FLOOR > 0 and "J4" in scores and scores["J4"] <= J4_FLOOR:
        return "to_human", S, f"转人审：J4={scores['J4']}≤{J4_FLOOR:g}（地板）S={S}{na_note}"
    if S >= PASS_S and guard >= 3 and not unsure and spread <= 2:
        return "pass_auto", S, f"通过：S={S} min={guard} 极差={spread}{na_note}"
    return "to_human", S, f"转人审：S={S} min={guard} 极差={spread} unsure={unsure}{na_note}"


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--input", default=str(REVIEW_DIR / "candidates_static.jsonl"))
    ap.add_argument("--limit", type=int, default=0)
    ap.add_argument("--ids", default="")
    ap.add_argument("--model", default=MODEL)
    ap.add_argument("--dry", action="store_true", help="只跑 L0，不调模型")
    ap.add_argument("--sample-rate", type=float, default=0.05)
    args = ap.parse_args()

    REVIEW_DIR.mkdir(parents=True, exist_ok=True)
    cands = read_jsonl(Path(args.input))
    if args.ids:
        want = {s.strip() for s in args.ids.split(",") if s.strip()}
        cands = [c for c in cands if c["id"] in want]
    if args.limit:
        cands = cands[: args.limit]
    if not cands:
        print("no candidates")
        return

    # 去重池＝本次输入的全部正文（含自身，规则里同 id 不自比，靠 R6 只跟池内其它条目比）
    pool_texts = [c.get("body", "") for c in read_jsonl(Path(args.input))]

    l0_pass, l0_reject = l0_rules.run(cands, pool_texts, ai_fields=False)
    print(f"L0: pass {len(l0_pass)} / reject {len(l0_reject)}")
    for r in l0_reject[:10]:
        print("  [L0 拒]", r["id"], r["violations"][:2])

    if args.dry:
        write_jsonl(REVIEW_DIR / "l0_report.jsonl", l0_reject)
        print(f"dry run → {REVIEW_DIR / 'l0_report.jsonl'}")
        return

    key, src = resolve_key()
    if not key:
        print("no DEEPSEEK_API_KEY (env / .env.local / ~/.dsh/.credentials.yaml)")
        return
    print(f"key source: {src} | model: {args.model} | candidates: {len(l0_pass)}")

    run_id = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    log_path = REVIEW_DIR / "review_log.jsonl"
    tally: dict[str, int] = {}
    t_start = time.time()

    for i, c in enumerate(l0_pass, 1):
        judges = judge_all(key, c, args.model)
        verdict, S, why = arbitrate(judges)
        tally[verdict] = tally.get(verdict, 0) + 1
        row = {
            "run_id": run_id,
            "ts": datetime.now(timezone.utc).isoformat(timespec="seconds"),
            "model": args.model,
            "candidate_id": c["id"],
            "content_hash": hashlib.sha1((c.get("body", "") + "|" + "|".join(x.get("result", "") for x in c.get("choices") or [])).encode()).hexdigest()[:12],
            "snapshot": {"title": c.get("title"), "body": c.get("body"), "choices": c.get("choices")},
            "judges": judges,
            "score": S,
            "verdict": verdict,
            "arbiter_note": why,
            "sample_queued": verdict == "pass_auto",
            "human_override": None,  # 人审后回填，唯一的放行证据
        }
        append_jsonl(log_path, row)
        sc = ",".join(f"{j['judge']}={j.get('score', 'ERR')}" for j in judges)
        print(f"[{i}/{len(l0_pass)}] {c['id']:<18} S={S} {verdict:<12} {sc} | {why}")

    dt = time.time() - t_start
    print(f"\n{run_id} done in {dt:.1f}s → {log_path}")
    print("tally:", tally)
    print(f"人审队列约 {tally.get('to_human', 0)} 条；自动通过 {tally.get('pass_auto', 0)} 条（其中抽 {args.sample_rate:.0%} 复核）")


if __name__ == "__main__":
    main()

