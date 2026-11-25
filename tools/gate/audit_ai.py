# -*- coding: utf-8 -*-
"""验收用：把线上 /laoyou-api/line 二十五个落点各打一次，看谁是真在线、谁是回落。"""
import json
import urllib.request

BASE = "http://8.134.86.249/laoyou-api/line"
CASES = [
    ("street_request", "lane_lamp", {"街": "明秀路路灯"}),
    ("rival_rumor", "laogan", {"店": "老甘粉店", "档": "街坊"}),
    ("recipe_buyer", "rice-flat", {"粉": "老友粉", "街": "兴宁区"}),
    ("arena_call", "market:1", {"场": "菜市口早场"}),
    ("hook_voice", "capacity:stove", {"类型": "capacity:stove", "事": "那口灶"}),
    ("trophy_voice", "first_bowl", {"成就": "第一碗", "时候": "开张头几天"}),
    ("flavor_voice", "classic", {"名": "老友三味", "时": "全年"}),
    ("style_voice", "qilou", {"店": "骑楼老铺", "门头": "趟栊门"}),
    ("bowl_voice", "enamel", {"碗": "搪瓷碗", "样子": "白底蓝边，磕掉瓷的地方露黑铁"}),
    ("tourney_open", "chaoyang_street", {"场": "朝阳街道·街坊粉王赛", "主办": "朝阳街道办"}),
    ("guest_voice", "picky", {"人": "识食的客人", "场面": "吃完了"}),
    ("guest_talk", "auntie:regular", {"人": "骑楼阿姨", "场面": "常来的街坊"}),
    ("tier_voice", "taste:7", {"维": "味道", "档": "第七档", "看法": "味道是定住了，谁来都挑不出错。"}),
    ("market_voice", "huiNanTian", {"天": "回南天", "时": "二三月", "事": "墙在流水，粉条返潮"}),
    ("grade_voice", "3", {"段": "巷口老铺", "评": "巷子里的人都认你的门牌，比什么招牌都硬。"}),
    ("retail_voice", "ready_bowl", {"货": "即食老友粉", "渠道": "线上网店", "买的人": "外面的人"}),
    ("notebook_voice", "s_sour", {"事": "酸笋为什么先炒", "类": "讲汤", "话": "酸笋先落，豆豉后落，两样都要过油。"}),
    ("district_voice", "ring2", {"圈": "城外一圈", "事": "往北是山，往南是水", "区": "兴宁区"}),
    ("loss_explain", "queue", {"事": "门口站满了没进来", "缘故": "灶和座总有一个先撑不住"}),
    ("menu_advice", "老友粉>猪杂粉", {"走的": "老友粉", "冷的": "猪杂粉", "事": "一款卖得动，一款没人点"}),
    ("appetite_voice", "dull", {"事": "这一片最近点得少了", "缘故": "住久了，胃口淡"}),
    ("pointer_voice", "capacity:seat", {"事": "先把凳子搬进来", "在": "店里的家当"}),
    ("staff_grow_voice", "probe-1", {"谁": "阿强", "会": "看火"}),
    ("perk_voice", "heat_taste_1", {"族": "镬气", "事": "爆得透"}),
    ("item_voice", "invest:supplier", {"事": "跟料商多留一筐", "在哪": "街上的门路"}),
    ("set_voice", "店里坐得下了", {"事": "店里坐得下了", "在": "店里的摆设"}),
    ("market_answer_voice", "waterCut:payday", {"事": "街上停水", "好在": "刚发薪"}),
    ("rally_voice", "rally:r1", {"人": "阿强", "事": "连着几天没歇"}),
    ("broth_thick_voice", "thick:today", {"汤": "挂得住", "嘴": "黏"}),
]

ok = 0
for kind, key, ctx in CASES:
    body = json.dumps({"kind": kind, "key": key, "context": ctx, "month": 0, "day": 1}).encode()
    req = urllib.request.Request(BASE, data=body, headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=40) as r:
            d = json.loads(r.read().decode())
        src = d.get("source")
        text = d.get("body", "")
        good = src == "remote" and len(text) >= 8
        ok += 1 if good else 0
        print("%-15s %-8s %s  %s" % (kind, src, "OK " if good else "--", text[:46]))
    except Exception as e:  # noqa: BLE001
        print("%-15s ERR %s" % (kind, e))

print("\nremote %d / %d" % (ok, len(CASES)))
