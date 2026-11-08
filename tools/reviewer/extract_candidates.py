"""从 game/src/data/events.ts 抽出候选（正则解析，不引 TS 运行时）。

用途：
  1. 冷启动金标：把已有静态事件当"已发布内容"抽样人审，建立基准
  2. R6 去重池：池内已有正文列表
  3. 校验 L0 规则不会误伤真人写的好文案（假阳性率是第一优先指标）

用法：
  python tools/reviewer/extract_candidates.py --out game/data/review/candidates_static.jsonl
"""
from __future__ import annotations

import argparse
import json
import re
from pathlib import Path

from common import PROJECT_ROOT, write_jsonl

EVENTS_TS = PROJECT_ROOT / "game" / "src" / "data" / "events.ts"


def _string_field(block: str, name: str) -> str:
    m = re.search(rf'{name}:\s*"((?:[^"\\]|\\.)*)"', block)
    return m.group(1).replace('\\"', '"') if m else ""


def parse_events(text: str) -> list[dict]:
    """按 `id:` 切块，每块取 title/body/choices。够用且不依赖 TS 工具链。"""
    # 顶层 EVENTS 数组体
    start = text.index("export const EVENTS")
    body = text[start:]
    # 用 "  {\n    id:" 作为分隔起点
    chunks = re.split(r"\n  \{\n(?=\s*id:)", body)
    out = []
    for ch in chunks[1:]:
        cid = _string_field(ch, "id")
        if not cid:
            continue
        title = _string_field(ch, "title")
        body_txt = _string_field(ch, "body")
        weight = re.search(r"weight:\s*([0-9.]+)", ch)
        cooldown = re.search(r"cooldownDays:\s*([0-9.]+)", ch)
        choices = []
        for cm in re.finditer(r"\n      \{\n(.*?)\n      \}", ch, re.S):
            cblk = cm.group(1)
            choices.append(
                {
                    "label": _string_field(cblk, "label"),
                    "summary": _string_field(cblk, "summary"),
                    "result": _string_field(cblk, "result"),
                }
            )
        if not choices:
            # 单函数式写法兜底：直接扫 label/result 对
            for cm in re.finditer(r'label:\s*"((?:[^"\\]|\\.)*)"[\s\S]{0,400}?result:\s*"((?:[^"\\]|\\.)*)"', ch):
                choices.append({"label": cm.group(1), "summary": "", "result": cm.group(2)})
        out.append(
            {
                "id": cid,
                "source": "static_v1",
                "title": title,
                "body": body_txt,
                "weight": float(weight.group(1)) if weight else None,
                "cooldownDays": float(cooldown.group(1)) if cooldown else None,
                "choices": choices,
            }
        )
    return out


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default=str(PROJECT_ROOT / "game" / "data" / "review" / "candidates_static.jsonl"))
    args = ap.parse_args()

    text = EVENTS_TS.read_text(encoding="utf-8")
    rows = parse_events(text)
    write_jsonl(Path(args.out), rows)
    print(f"parsed {len(rows)} events -> {args.out}")
    print("first:", json.dumps(rows[0], ensure_ascii=False)[:200] if rows else "none")


if __name__ == "__main__":
    main()
