# -*- coding: utf-8 -*-
"""清点本作 data/ 与 sim/ 的条目数（对照开罗 46 张表用）。

用法（仓库任意位置）：
    python -X utf8 tools\\gate\\count_entries.py
"""
import io
import os
import re

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(os.path.dirname(HERE))
ROOT = os.path.join(REPO, "game", "src")


def count(path, pattern):
    p = os.path.join(ROOT, path)
    if not os.path.exists(p):
        return None
    s = io.open(p, encoding="utf-8").read()
    return len(re.findall(pattern, s))


TARGETS = [
    ("data/ingredients.ts", r'id: "top\.', "浇头 TOPPINGS"),
    ("data/sides.ts", r'id: "[a-z]+",\s*\n\s*name', "加菜 SIDES"),
    ("data/pairing.ts", r'id: "[a-z_]+",\s*\n\s*name', "浇头搭配 PAIRINGS"),
    ("data/customers.ts", r'id: "[a-z_]+"', "客型 ARCHETYPES"),
    ("data/events.ts", r'^\s{2}\{\s*$', "事件 EVENTS_BASE"),
    ("data/events-more.ts", r'id: "[a-z_]+",', "事件 EVENTS_MORE"),
    ("data/tourneys.ts", r'id: "[a-z_]+",', "赛事 TOURNEYS"),
    ("data/rivals.ts", r'id: "[a-z_]+",', "同行 RIVALS"),
    ("data/market.ts", r'id: "[a-zA-Z]+",', "行情 MARKETS"),
    ("data/gear.ts", r'id: "[a-z_]+",', "家当 GEARS"),
    ("data/equipment.ts", r'id: "[a-z_]+",', "设备 EQUIPMENT"),
    ("data/skill.ts", r'id: "[a-z_.]+",', "技法（行数，权威数见 SKILL_TOTAL）"),
    ("data/perk.ts", r'^\s{2}\{$', "手艺 PERKS"),
    ("data/staff-skill.ts", r'^\s{2}\{$', "店员手艺 + 毕业技"),
    ("data/staff.ts", r'id: "st\.[a-z_]+",', "店员模板 STAFF"),
    ("data/trophies.ts", r'id: "[a-z_]+",', "奖杯 TROPHIES"),
    ("data/notebook.ts", r'id: "[a-z_]+",', "笔记 NOTES"),
    ("data/places.ts", r'^\s{2}\{$', "地名 PLACES"),
    ("data/manual.ts", r'id: "m\.[a-z]+",', "手册 MANUAL_PAGES"),
    ("data/talk.ts", r'"[^"]{6,}",', "长对白 TALK（句）"),
    ("data/noodles.ts", r'id: "[a-z]+",', "粉型 NOODLES"),
    ("data/mains.ts", r'id: "[a-z]+",', "主料 MAINS"),
    ("data/invest.ts", r'id: "[a-z_]+",', "门路 INVESTS"),
    ("data/goods.ts", r'id: "[a-z_]+",', "杂货 GOODS"),
    ("data/slots.ts", r'id: "[a-z_]+",', "成套 SLOT_SETS"),
    ("data/quality.ts", r'id: "[a-z_]+",', "品质 QUALITY"),
    ("data/flavor.ts", r'^\s{2}\{$', "风味"),
    ("data/combo.ts", r'id: "[a-z_]+",', "家当搭配 COMBO"),
    ("data/streets.ts", r'id: "[a-z_]+",', "街型 STREETS"),
    ("data/events.ts", r'^\s{2}\{$', "（重）事件基表对象数"),
]


def main():
    print("== 条目清点（%s）==" % ROOT)
    for path, pat, label in TARGETS:
        n = count(path, pat)
        shown = "-" if n is None else str(n)
        print("%-40s %4s   %s" % (label, shown, path))

    print()
    d = os.path.join(ROOT, "data")
    names = sorted(x for x in os.listdir(d) if x.endswith(".ts") and not x.endswith(".test.ts"))
    print("data/：%d 个 ts 文件" % len(names))
    print(", ".join(n[:-3] for n in names))

    print()
    s2 = os.path.join(ROOT, "sim")
    n2 = sorted(x for x in os.listdir(s2) if x.endswith(".ts") and not x.endswith(".test.ts"))
    print("sim/：%d 个 ts 文件" % len(n2))
    print(", ".join(x[:-3] for x in n2))


if __name__ == "__main__":
    main()
