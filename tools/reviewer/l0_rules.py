"""L0 规则闸：0 成本、100% 确定、可解释的先砍。

设计原则（来自 decision-card 2026-11-08-AI审核官与数据飞轮）：
  - 只拦「确定错」的东西，绝不判断好不好
  - 每条规则必须给人看得懂的理由码，日志可追溯到具体 span
  - 规则只作用于 AI 产出字段；静态表里的 ¥-60 由 effects 承载，不算违规

规则集：
  R1 长度    body 18–200 字；title 4–20 字；每个 result 8–80 字
  R2 数字闸  AI 文本内不出现阿拉伯数字 / 中文数字金额（红线：AI 不产数字）
  R3 错字    广西/南宁常见错写（螺狮粉、老友粉的粉类写成面 等）
  R4 结构    ≥2 个选项；每项必须有 label+summary+result；id 唯一
  R5 敏感    政策文号、机构全称、真实人名、绝对化承诺
  R6 重复    与池内已有条目 3-gram Jaccard ≥ 0.85
"""
from __future__ import annotations

import re

ARABIC_NUM = re.compile(r"[0-9０-９]")
CN_AMOUNT = re.compile(r"[一二三四五六七八九十百千万两半]{1,3}(?:块钱|元钱|元|块|毛|角)")
MONEY_SYMBOL = re.compile(r"[¥￥$]")

TYPO_BLACKLIST = {
    "螺狮粉": "螺蛳粉（蛳，不是狮）",
    "老友面": "老友粉（本项目是粉店；若确指老友面之争事件须显式标注）",
    "酸笋子": "酸笋",
    "桂林米粉粉": "重复用字",
}

SENSITIVE = [
    # 只拦「全称 / 文号」；口语简称（食药监、城管、街道）是本地生活叙事的一部分，不拦
    (re.compile(r"[（(]?\d{4}[）)]?\s*第?\s*\d+\s*号"), "疑似政策文号"),
    (re.compile(r"(市场监督管理局|食品药品监督管理局|卫生健康委员会|人民政府|公安局)"), "机构全称"),
    (re.compile(r"(保证|百分百|绝对|一定)(能|会|治|好|有效)"), "绝对化承诺"),
]

# R3 豁免：确指「老友面之争」这类以讹传讹为题材的事件时，「老友面」是必要的对立面
TYPO_EXEMPT_CONTEXT = ("老友面之争", "之争", "传统", "根是")

DIGITS_ALLOWED_EXCEPTION = ("老友面之争",)  # 少数需要写年份的事件，正文须显式豁免


def _grams(text: str, n: int = 3) -> set[str]:
    t = re.sub(r"\s+", "", text)
    return {t[i : i + n] for i in range(max(0, len(t) - n + 1))}


def jaccard(a: str, b: str) -> float:
    ga, gb = _grams(a), _grams(b)
    if not ga or not gb:
        return 0.0
    return len(ga & gb) / len(ga | gb)


def check(cand: dict, pool_texts: list[str], *, ai_fields: bool = True) -> list[dict]:
    """返回违规列表 [{rule, reason, span}]；空列表＝通过。"""
    v: list[dict] = []
    cid = cand.get("id", "")
    title = (cand.get("title") or "").strip()
    body = (cand.get("body") or "").strip()
    choices = cand.get("choices") or []

    # R4 结构
    if not cid or not title or not body or len(choices) < 2:
        v.append({"rule": "R4", "reason": "缺 id/title/body 或选项少于 2 个", "span": cid})
        return v  # 结构不全不再往下判
    labels = [(c.get("label") or "").strip() for c in choices]
    if any(not l for l in labels):
        v.append({"rule": "R4", "reason": "选项缺 label", "span": cid})
    if len(set(labels)) != len(labels):
        v.append({"rule": "R4", "reason": "选项 label 重复", "span": cid})
    for i, c in enumerate(choices):
        if not (c.get("summary") or "").strip() or not (c.get("result") or "").strip():
            v.append({"rule": "R4", "reason": f"第 {i+1} 项缺 summary/result", "span": cid})

    # R1 长度（中文标题 2 字起：「回南天」「酸笋季」都是合格的人类标题，3 字门槛会误伤）
    if not 2 <= len(title) <= 20:
        v.append({"rule": "R1", "reason": f"title 长度 {len(title)} 越界 2–20", "span": title})
    if not 18 <= len(body) <= 200:
        v.append({"rule": "R1", "reason": f"body 长度 {len(body)} 越界 18–200", "span": body[:20]})
    for i, c in enumerate(choices):
        r = (c.get("result") or "").strip()
        if r and not 8 <= len(r) <= 80:
            v.append({"rule": "R1", "reason": f"result[{i}] 长度 {len(r)} 越界 8–80", "span": r[:20]})

    exempt = any(k in body for k in DIGITS_ALLOWED_EXCEPTION)

    # R2 数字闸（AI 不产数字）
    if ai_fields and not exempt:
        for field, text in [("body", body)] + [
            (f"result[{i}]", (c.get("result") or "")) for i, c in enumerate(choices)
        ]:
            if ARABIC_NUM.search(text) or MONEY_SYMBOL.search(text) or CN_AMOUNT.search(text):
                v.append({"rule": "R2", "reason": f"{field} 出现数字/金额（AI 不产数字）", "span": text[:40]})

    # R3 错字（「老友面之争」这类以讹传讹题材豁免：老友面是对立面，不是错写）
    blob = title + body + "".join(labels) + "".join((c.get("result") or "") for c in choices)
    typo_exempt = any(k in blob for k in TYPO_EXEMPT_CONTEXT)
    for bad, why in TYPO_BLACKLIST.items():
        if typo_exempt and bad == "老友面":
            continue
        if bad in blob:
            v.append({"rule": "R3", "reason": f"错写「{bad}」→ {why}", "span": bad})

    # R5 敏感
    for pat, why in SENSITIVE:
        m = pat.search(blob)
        if m:
            v.append({"rule": "R5", "reason": why, "span": m.group(0)})

    # R6 重复
    for pt in pool_texts:
        j = jaccard(body, pt)
        if j >= 0.85:
            v.append({"rule": "R6", "reason": f"与池内条目 3-gram 相似度 {j:.2f} ≥0.85", "span": cid})
            break

    return v


def run(cands: list[dict], pool_texts: list[str], *, ai_fields: bool = True) -> tuple[list[dict], list[dict]]:
    """返回 (通过, 被拒)；被拒项带 violations。"""
    ok, bad = [], []
    seen = set()
    for c in cands:
        if c.get("id") in seen:
            bad.append({**c, "violations": [{"rule": "R4", "reason": "id 重复", "span": c.get("id")}]})
            continue
        seen.add(c.get("id"))
        # R6 只跟「池内其它条目」比：排除自身正文，否则 jaccard(self,self)=1 全灭
        others = [t for t in pool_texts if t and t != c.get("body")]
        v = check(c, others, ai_fields=ai_fields)
        if v:
            bad.append({**c, "violations": v})
        else:
            ok.append(c)
    return ok, bad
