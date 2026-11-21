# -*- coding: utf-8 -*-
"""全案条目清点 v2：数文件里所有 `id: "xxx"` 形式的条目（不要求换行对齐）。"""
import io
import os
import re
from pathlib import Path

ROOT = Path(r"D:\项目\REA\REA\重构\老友粉店")
D = ROOT / "game" / "src" / "data"

rows = []
for f in sorted(os.listdir(D)):
    if not f.endswith(".ts") or f.endswith(".test.ts"):
        continue
    s = io.open(D / f, encoding="utf-8").read()
    ids = re.findall(r'id:\s*["\']([a-z0-9_.\-]+)["\']', s)
    # 去重：同一 id 在类型定义与表里各出现一次
    uniq = []
    for i in ids:
        if i not in uniq:
            uniq.append(i)
    if uniq:
        rows.append((f, len(uniq)))

for f, n in rows:
    print("%-24s %d" % (f, n))
print("files", len(rows), "total", sum(n for _, n in rows))
