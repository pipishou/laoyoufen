# -*- coding: utf-8 -*-
"""探针共用的存档版本号：从 game/src/sim/state.ts 读，不许在探针里写死。

批 BB1′（体检）：14 个探针写死 `saveVersion == 36`，`SAVE_VERSION` 到 37 之后
它们整条红 —— 从批 K′ 到现在一直没跑过，门等于没开。版本号只许有一个出处。
"""
import io
import os
import re

_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


def _read() -> int:
    path = os.path.join(_ROOT, "game", "src", "sim", "state.ts")
    src = io.open(path, encoding="utf-8").read()
    m = re.search(r"export const SAVE_VERSION\s*=\s*(\d+)", src)
    if not m:
        raise RuntimeError("state.ts 里找不到 SAVE_VERSION")
    return int(m.group(1))


SAVE_VERSION = _read()
