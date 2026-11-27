# -*- coding: utf-8 -*-
"""探针共用的「源码口径」：从 `game/src/data/*.ts` 里读，不在探针里写死。

批 BB1′（体检）：`manual_probe.py` 一直断言「12 页 4 组」，而批 Y′ 加了四页
`how-*` 之后是 16 页 5 组 —— 探针替代码记账，改代码的人反而被探针挡住。
凡是「页数 / 组名 / 条目数」这类**由数据表决定**的数，都从这里读。
"""
from __future__ import annotations

import io
import os
import re

_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


def read_data(name: str) -> str:
    return io.open(os.path.join(_ROOT, "game", "src", "data", name), encoding="utf-8").read()


def manual_pages() -> list:
    """手册页数：数 `id: "m.xxx"` 这一行"""
    return re.findall(r'id:\s*"(m\.[\w-]+)"', read_data("manual.ts"))


def manual_sections() -> list:
    """手册分章顺序（按首次出现），与 `manualSections()` 同序"""
    src = read_data("manual.ts")
    body = src.split("export const MANUAL_PAGES", 1)[1].split("];", 1)[0]
    out = []
    for m in re.finditer(r'section:\s*"([^"]+)"', body):
        if m.group(1) not in out:
            out.append(m.group(1))
    return out


MANUAL_TOTAL = len(manual_pages())
MANUAL_SECTIONS = manual_sections()


def side_ids(kind: str | None = None) -> list:
    """`data/sides.ts` 的条目 id（默认全是加料，不含饮料）。

    批 BB1′（体检）：`sides_probe` 写死「加料台 12 行」，而表里已经 9 样加料 + 4 样饮料
    + 冰热 + 组合两行 = 15 行 —— 又是探针替数据记账。改成「表里每一条都得渲染出来」。
    """
    src = read_data("sides.ts")
    body = src.split("export const SIDES", 1)[1].split("\n];", 1)[0]
    pairs = re.findall(r'id:\s*"([\w.]+)"[\s\S]*?kind:\s*"(\w+)"', body)
    return [i for i, k in pairs if kind is None or k == kind]


def noodle_ids() -> list:
    """`data/noodles.ts` 的粉型 id（六个）。"""
    src = read_data("noodles.ts")
    body = src.split("export const NOODLES", 1)[1].split("\n];", 1)[0]
    return re.findall(r'id:\s*"([\w.]+)"', body)


SIDE_TOP_IDS = side_ids("topping")
SIDE_DRINK_IDS = side_ids("drink")
SIDE_TOTAL = len(SIDE_TOP_IDS) + len(SIDE_DRINK_IDS)
NOODLE_IDS = noodle_ids()
NOODLE_TOTAL = len(NOODLE_IDS)
