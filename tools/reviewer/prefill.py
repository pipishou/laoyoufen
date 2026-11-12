# -*- coding: utf-8 -*-
"""20 条人审队列的 agent 预判。

为什么要这个文件：20 条必须「全判」，但判断者不能是模型冒充人。
所以分两层：
  - 本脚本产出 agent 预判，写入 human_overrides.jsonl 时 reviewer="agent_prefill"；
  - 人只需确认或改判，改判记录 reviewer="human"。
统计里以 reviewer 区分，agent 预判不进入「人判」分母，
翻案率仍然只在人判行上算。
"""

import json
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
QUEUE = ROOT / "game" / "data" / "review" / "human_queue.jsonl"
LOG = ROOT / "game" / "data" / "review" / "review_log.jsonl"
OVERRIDES = ROOT / "game" / "data" / "review" / "human_overrides.jsonl"

# candidate_id -> (verdict, note)
# verdict 语义：pass= AI 判错该上线 / revise= 方向对但文案要改 / reject= AI 判对该退
DISPOSITION = {
    # ---- J4=2 套路最重：本地锚点几乎为零，必须重写而不是放行 ----
    "night_market": ("revise", "夜市选题太泛，落成「中山路夜市收摊前甩卖猪杂」才够本地；同时补一个真实代价（次日酸笋用不完要倒）"),
    "old_classmate": ("revise", "「老同学来捧场」是换皮通用桥段，改成广西语境：小学同学在埌东上班、专程坐地铁回来吃，带一句白话寒暄"),
    "landlord_repair": ("revise", "房东修水管太中性，改成「包租婆阿姆带师傅上门，顺手教你腌酸笋」把租客关系与工艺绑一起"),
    "school_meet": ("revise", "校园开放日套路，改成本地钩子：中学生放学拿校服当饭票赊账，月底用奖状抵账"),
    # ---- 中等：有本地壳子但玩法读不出，改成能算的选择 ----
    "arcade_renovation": ("revise", "游戏厅翻新与粉店无关，要么改成「隔壁电玩城老板要包月团餐」把它变成订单选择，要么退"),
    "lychee_debt": ("pass", "灵山荔枝赊账有真本地性，J3 低是因为选项没写清代价；文案补「收不收这笔抵账荔枝」的两端后果即可上线"),
    "suan_ye_stall": ("pass", "酸嘢摊是广西强锚点，AI 给 J3/J4 各 3 属保守；保持原文，玩家一眼能懂「酸嘢配粉」"),
    "wuming_orange": ("pass", "武鸣沃柑产地明确、季节真实，可直接上；建议文案补一句「沃柑滞销那年」增加时代感"),
    "caexpo": ("pass", "中国—东盟博览会是南宁最强的城市锚点，J1 给 3 是因为「像政策」，但玩家一眼认得出；保留，文案把展商吃粉写具体"),
    # ---- 行业周期类：内容成立，允许上线 ----
    "rice_price": ("pass", "米价波动是粉店真成本项，与 KCU 面粉阶梯可对表；上线后由 balance.ts 提供量级"),
    "pig_cycle": ("pass", "猪周期直接打在猪杂成本上，是本作最该有的经济事件；保留"),
    "sauce_factory": ("pass", "酱料代工是广西粉店真实现象（预包装老友酱），保留"),
    "rain_flood": ("pass", "雨季涨水影响客流，符合广西气候，保留"),
    # ---- 关系/口碑类：AI 误判为套路，实际是常客系统的骨 ----
    "rival_shop": ("pass", "同业竞争是经营游戏必需的压力源，J2 扣分源于摘要里的金额被误读，已修正；保留"),
    "regular_gift": ("pass", "常客回礼是需求文档里明确的三维喜好闭环，删了会断系统；保留"),
    "damp_floor": ("pass", "回南天是广西独有的体感记忆，正是差异化卖点，保留"),
    "typhoon": ("pass", "台风停业是沿海城市真实约束，保留"),
    # ---- 合规闸：三处机构名/政策口径必须处理 ----
    "inspect": ("revise", "去掉「食药监」全称，改为「街道食品安全检查」，避免真实机构名承担负面事件；机制保留"),
    "heritage": ("revise", "「文旅局非遗名录」改为「市非遗保护中心来店走访」，把机构动作降级为走访，保留荣誉感"),
    "standard": ("revise", "「市场监督管理所＋地方标准」双敏感，改为「同行牵头起草老友粉团体标准，邀你署名」，去掉执法主体"),
}

# 场景/摘要里允许出现的数字属确定性投影，不参与判断（判据边界）


def load_jsonl(p: Path):
    if not p.exists():
        return []
    return [json.loads(x) for x in p.read_text(encoding="utf-8").splitlines() if x.strip()]


def main() -> None:
    queue = load_jsonl(QUEUE)
    log = load_jsonl(LOG)
    existing = {(r["run_id"], r["candidate_id"]) for r in load_jsonl(OVERRIDES)}
    ts = datetime.now(timezone.utc).isoformat(timespec="seconds")

    written, skipped = [], []
    for q in queue:
        cid = q["candidate_id"]
        if cid not in DISPOSITION:
            skipped.append((cid, "无预判"))
            continue
        verdict, note = DISPOSITION[cid]
        # 代表 run：队列里记的那个 run 若在 log 中存在，就用它
        run = q.get("run_id")
        hit = [r for r in log if r["candidate_id"] == cid and r["run_id"] == run]
        if not hit:
            cand_runs = [r for r in log if r["candidate_id"] == cid]
            if not cand_runs:
                skipped.append((cid, "review_log 无记录"))
                continue
            run = cand_runs[-1]["run_id"]
            hit = [cand_runs[-1]]
        if (run, cid) in existing:
            skipped.append((cid, "已有回填"))
            continue
        rec = {
            "ts": ts,
            "run_id": run,
            "candidate_id": cid,
            "content_hash": hit[-1].get("content_hash"),
            "ai_verdict": hit[-1].get("verdict"),
            "ai_score": hit[-1].get("score"),
            "verdict": verdict,
            "note": note,
            "reviewer": "agent_prefill",
        }
        written.append(rec)

    if written:
        OVERRIDES.parent.mkdir(parents=True, exist_ok=True)
        with OVERRIDES.open("a", encoding="utf-8") as f:
            for rec in written:
                f.write(json.dumps(rec, ensure_ascii=False) + "\n")

    print("写入 agent 预判 {} 条，跳过 {} 条".format(len(written), len(skipped)))
    for cid, why in skipped:
        print("  跳过 {}: {}".format(cid, why))
    tally = {}
    for rec in written:
        tally[rec["verdict"]] = tally.get(rec["verdict"], 0) + 1
    print("预判分布:", tally)


if __name__ == "__main__":
    main()
