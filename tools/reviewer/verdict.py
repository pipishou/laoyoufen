"""四态裁决（机制移植自 Claude Code Game Studios 的 story-done verdict 结构）。

为什么需要四态：两态（通过/违规）无法表达「这条根本没被评估」——
没评估被记成通过，等于门在说谎。四态里的 NOT_ASSESSED 优先级高于两种通过，
且必须点名「什么能 settle 它」。

出处（本地副本 `D:\\项目\\skill\\Claude-Code-Game-Studios`）：
  .claude/skills/story-done/SKILL.md:251-266  verdict 判定顺序
  .claude/skills/story-done/SKILL.md:110-131  验收判据的观察方式（looking/asked/seen-on-screen/deferred）
  .claude/skills/story-done/SKILL.md:198-203  scope 对照 git status

四种裁决（第一个匹配的胜出）：
  1. BLOCKED        判据 fail，或存在 BLOCKING 缺口/偏离
  2. NOT_ASSESSED   存在无法评估的判据，或某个门返回 not_assessed，或输入缺失
  3. COMPLETE_WITH_NOTES  全部通过或 DEFERRED，但有 ADVISORY 项
  4. COMPLETE       全部通过，无任何 ADVISORY

信息行（证据戳、run result、缺失的 sprint 文件）不升级裁决。
"""

from __future__ import annotations

from typing import Any, Iterable

COMPLETE = "COMPLETE"
COMPLETE_WITH_NOTES = "COMPLETE_WITH_NOTES"
NOT_ASSESSED = "NOT_ASSESSED"
BLOCKED = "BLOCKED"
ORDER = (BLOCKED, NOT_ASSESSED, COMPLETE_WITH_NOTES, COMPLETE)

CRITERION_STATES = ("pass", "fail", "untested", "deferred")
EVIDENCE_KINDS = ("looking", "asked", "screenshot", "deferred")


def _item_status(x: Any) -> str:
    if isinstance(x, str):
        return x.strip().lower()
    if isinstance(x, dict):
        return str(x.get("status", "")).strip().lower()
    return ""


def _label(x: Any) -> str:
    if isinstance(x, str):
        return x
    if isinstance(x, dict):
        return str(x.get("id") or x.get("what") or x.get("note") or x)
    return str(x)


def verdict_of(
    criteria: Iterable[Any] = (),
    gaps: Iterable[Any] = (),
    deviations: Iterable[Any] = (),
    gates: Iterable[dict] = (),
    *,
    missing_inputs: Iterable[str] = (),
) -> dict:
    """按四态优先级算出裁决。

    criteria:    ["pass"] 或 [{"id": "AC-1", "status": "fail"}]
    gaps:        [{"level": "blocking"|"advisory", "what": "..."}]  证据/门缺口
    deviations:  [{"level": "blocking"|"advisory"|"out_of_scope", "what": "..."}]
    gates:       [{"gate": "LP-CODE-REVIEW", "verdict": "pass"|"blocked"|"not_assessed"}]
    missing_inputs: ["GDD missing"] 「要判却没有判据可依」的东西
    """
    reasons: list[str] = []
    blocked: list[str] = []
    not_assessed: list[str] = []
    advisory: list[str] = []

    crit = list(criteria)
    for c in crit:
        st = _item_status(c)
        if st not in CRITERION_STATES:
            not_assessed.append(f"判据状态不可识别：{_label(c)}")
        elif st == "fail":
            blocked.append(f"判据失败：{_label(c)}")
        elif st == "untested":
            not_assessed.append(f"判据未测：{_label(c)}")

    for g in list(gaps) + list(deviations):
        lvl = _item_status(g) if isinstance(g, str) else str((g or {}).get("level", "")).strip().lower()
        what = _label(g)
        if lvl in ("blocking", "blocked"):
            blocked.append(f"缺口/偏离（blocking）：{what}")
        elif lvl in ("advisory", "out_of_scope"):
            advisory.append(f"{lvl}：{what}")
        else:
            # 没有等级的缺口不算通过：按「无法评估」处理（fail-closed）
            not_assessed.append(f"缺口未标等级：{what}")

    for g in gates:
        gv = str((g or {}).get("verdict", "")).strip().lower()
        name = str((g or {}).get("gate", "gate"))
        if gv in ("blocked", "fail", "fail_auto"):
            blocked.append(f"门 {name} 返回 blocked")
        elif gv in ("not_assessed", "na", "skip", "error", ""):
            not_assessed.append(f"门 {name} 未给出结论（{gv or 'empty'}）")

    for m in missing_inputs:
        not_assessed.append(f"缺判据输入：{m}")

    if blocked:
        return {"verdict": BLOCKED, "reasons": blocked + not_assessed, "counts": _counts(crit, advisory)}
    if not_assessed:
        return {
            "verdict": NOT_ASSESSED,
            "reasons": not_assessed + [f"需 settle：{r}" for r in not_assessed][:0],
            "counts": _counts(crit, advisory),
        }
    if advisory:
        return {"verdict": COMPLETE_WITH_NOTES, "reasons": advisory, "counts": _counts(crit, advisory)}
    return {"verdict": COMPLETE, "reasons": [], "counts": _counts(crit, advisory)}


def _counts(crit: list, advisory: list) -> dict:
    d = {s: 0 for s in CRITERION_STATES}
    for c in crit:
        st = _item_status(c)
        if st in d:
            d[st] += 1
    d["advisory"] = len(advisory)
    return d


def from_review(verdict: str, judges: Iterable[dict] = ()) -> dict:
    """把审核管线的三态裁决映射到四态。

    pass_auto   → COMPLETE（AI 有方向且达标）
    reject_auto → BLOCKED
    to_human    → NOT_ASSESSED（AI 弃权＝这条没被判定，不是判错）
    任一判据 error → NOT_ASSESSED（fail-closed，且不会被 COMPLETE 覆盖）
    """
    v = str(verdict or "").strip().lower()
    errs = [str((j or {}).get("judge", "?")) for j in judges if str((j or {}).get("verdict", "")).lower() == "error"]
    if errs:
        return {"verdict": NOT_ASSESSED, "reasons": [f"判据调用失败：{','.join(errs)}（需重跑或人判）"]}
    if v == "pass_auto":
        return {"verdict": COMPLETE, "reasons": []}
    if v == "reject_auto":
        return {"verdict": BLOCKED, "reasons": ["判据 fail 且 S 低于下限"]}
    if v == "to_human":
        return {"verdict": NOT_ASSESSED, "reasons": ["AI 弃权：等待人判（弃权≠判错）"]}
    return {"verdict": NOT_ASSESSED, "reasons": [f"未知裁决：{verdict}"]}


def _selftest() -> int:
    fails = []

    def eq(name, got, want):
        if got != want:
            fails.append(f"{name}: got {got} want {want}")

    eq("全通过", verdict_of(["pass", "pass"])["verdict"], COMPLETE)
    eq("有 fail", verdict_of(["pass", "fail"])["verdict"], BLOCKED)
    eq("未测优先于通过", verdict_of(["pass", "untested"])["verdict"], NOT_ASSESSED)
    eq("blocking 缺口", verdict_of(["pass"], gaps=[{"level": "blocking", "what": "缺截图"}])["verdict"], BLOCKED)
    eq("advisory 缺口", verdict_of(["pass"], gaps=[{"level": "advisory", "what": "文档旧了"}])["verdict"], COMPLETE_WITH_NOTES)
    eq("门 not_assessed", verdict_of(["pass"], gates=[{"gate": "QL-TEST", "verdict": "not_assessed"}])["verdict"], NOT_ASSESSED)
    eq("信息行不升级", verdict_of(["pass"], gates=[{"gate": "EVIDENCE-STAMP", "verdict": "pass"}])["verdict"], COMPLETE)
    eq("缺口无等级 fail-closed", verdict_of(["pass"], gaps=[{"what": "没写等级"}])["verdict"], NOT_ASSESSED)
    eq("映射 to_human", from_review("to_human")["verdict"], NOT_ASSESSED)
    eq("映射 reject", from_review("reject_auto")["verdict"], BLOCKED)
    eq("映射 error 压过 pass", from_review("pass_auto", [{"judge": "J4", "verdict": "error"}])["verdict"], NOT_ASSESSED)
    eq("deferred 不阻塞", verdict_of(["pass", "deferred"])["verdict"], COMPLETE)

    if fails:
        print("SELFTEST FAIL")
        for f in fails:
            print("  -", f)
        return 1
    print("SELFTEST OK (12 cases)")
    return 0


if __name__ == "__main__":
    import sys

    sys.exit(_selftest())
