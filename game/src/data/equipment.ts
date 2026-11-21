/**
 * 设备（六阶 S4）—— 对应开罗 `storeequip.txt` 的 24 件设备，压成三件主线设备。
 *
 * 为什么只留三件：开罗那 24 件里真正影响「一碗粉怎么更快更省」的只有三类——
 * 火力（灶）、煮制（锅/篓）、案面（砧板/柜台）。其余（饮水机、雕像、净化器）是氛围件，
 * 归到 S3 布置里做 charm，不进产能链。
 *
 * 每件四档，价格取自 `data/anchors.ts` 的 `CAPITAL.equipmentYuan`
 * = ¥1,500 / ¥3,800 / ¥9,000 / ¥30,000，折 150 / 380 / 900 / 3,000 碗。
 * 换算理由：一间 4 座小店月卖 2,100 碗、月净利约 6,000–9,000，
 * 顶档 3,000 碗 ≈ 一个半月的全部毛利——就像现实里换一台商用双眼灶。
 */

import { CAPITAL } from "./anchors";

export type EquipId = "stove" | "strainer" | "bench";

export interface EquipDef {
  id: EquipId;
  name: string;
  /** 一句话说明这件东西现实里长什么样 */
  desc: string;
  /** 四档价格（元），与 CAPITAL.equipmentYuan 对齐 */
  tiers: readonly number[];
  /** 升到第 i+1 档之后的效果说明（给玩家看，不写系数） */
  effects: readonly string[];
}

export const EQUIPMENT: readonly EquipDef[] = [
  {
    id: "stove",
    name: "猛火灶",
    desc: "双环猛火，一锅水翻得起来，出碗快",
    tiers: CAPITAL.equipmentYuan,
    effects: ["出碗快 15%", "出碗快 28%", "出碗快 39%", "出碗快 48%"],
  },
  {
    id: "strainer",
    name: "粉篓与汤勺",
    desc: "漏勺大小、汤勺刻度，决定每碗抓得准不准",
    tiers: CAPITAL.equipmentYuan,
    effects: ["一碗省 ¥0.14", "一碗省 ¥0.29", "一碗省 ¥0.43", "一碗省 ¥0.56"],
  },
  {
    id: "bench",
    name: "案台与备料区",
    desc: "切配、过水、装碗的地方够宽，才接得住更多人",
    tiers: CAPITAL.equipmentYuan,
    effects: ["日上限 +40 碗", "日上限 +80 碗", "日上限 +120 碗", "日上限 +160 碗"],
  },
] as const;

export const EQUIP_BY_ID: ReadonlyMap<string, EquipDef> = new Map(EQUIPMENT.map((e) => [e.id, e]));

/** 每档出碗时间系数（基准 6 分钟一碗，见 customer.ts 的 SERVE_MINUTES） */
export const STOVE_SERVE_FACTOR = 0.85;
/** 每档食材成本系数 */
export const STRAINER_COST_FACTOR = 0.97;
/** 每档日上限加成 */
export const BENCH_CAPACITY_STEP = 40;
export const MAX_EQUIP_LEVEL = 4;
