/**
 * 设备（S4 起）—— 对应开罗 `storeequip.txt` 的 24 件设备，压成四件主线设备。
 *
 * **批次二改口径**：开罗的设备表不是百分比，是**并行口数** —— 灶 1/2/4 口、粉篓 4→8 筒。
 * 一碗粉在店里要过三段手：炒（爆香）、汤（滚汤）、粉（烫粉起碗）。哪一段口数少，那一段就是瓶颈，
 * 这时候别的段再多口也没用。本作的灶原来只写「出碗快 15%」，玩家看不出瓶颈在哪，
 * 也解释不了「为什么买了灶还是排队」—— 于是这一批改成三段并行。
 *
 * 三段基准节拍合计 6.0 游戏分钟，与 `sim/customer.ts` 的 `SERVE_MINUTES` 对齐：
 * 炒 2.2 / 汤 2.2 / 粉 1.6。每段各有一条设备线抬它的口数。
 *
 * 价格仍取 `data/anchors.ts` 的 `CAPITAL.equipmentYuan` = ¥1,500 / ¥3,800 / ¥9,000 / ¥30,000
 * （四档都同一套价，因为四件在现实里都是「换一台商用设备」的量级）。
 */

import { CAPITAL } from "./anchors";

export type EquipId = "stove" | "pot" | "strainer" | "bench";

/** 一碗粉的三段手 */
export type StationId = "wok" | "pot" | "basket";

export const STATION_ORDER: readonly StationId[] = ["wok", "pot", "basket"];

/** 三段基准分钟数（合计 6.0 = SERVE_MINUTES） */
export const STAGE_MINUTES: Record<StationId, number> = { wok: 2.2, pot: 2.2, basket: 1.6 };

/**
 * 每段的口数：下标是设备档位 0–4（0 = 还没买，1–4 = 买过的四档）。
 * 三条线各有节奏：灶是「一口一口加」，汤锅越到后面越靠换大锅，粉篓最便宜所以加得最猛。
 */
export const PARALLEL_BY_TIER: Record<StationId, readonly number[]> = {
  wok: [1, 2, 3, 4, 5],
  pot: [1, 2, 3, 4, 6],
  basket: [1, 2, 3, 5, 7],
};

/** 哪件设备管哪一段（案台不进三段，它管日上限） */
export const STATION_EQUIP: Record<StationId, EquipId> = { wok: "stove", pot: "pot", basket: "strainer" };

export const STATION_NAMES: Record<StationId, string> = { wok: "炒锅", pot: "汤锅", basket: "粉篓" };

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
    desc: "双环猛火，一锅水翻得起来，爆香那一段靠它",
    tiers: CAPITAL.equipmentYuan,
    effects: ["炒锅开到 2 口", "炒锅开到 3 口", "炒锅开到 4 口", "炒锅开到 5 口"],
  },
  {
    id: "pot",
    name: "汤锅",
    desc: "一口锅滚一锅汤，汤不够滚，粉下得再快也出不去",
    tiers: CAPITAL.equipmentYuan,
    effects: ["汤锅添到 2 口", "汤锅还是 2 口，火更稳", "汤锅添到 3 口", "汤锅添到 4 口"],
  },
  {
    id: "strainer",
    name: "粉篓与汤勺",
    desc: "漏勺大小、汤勺刻度，决定每碗抓得准不准、起得快不快",
    tiers: CAPITAL.equipmentYuan,
    effects: ["粉篓添到 2 筒", "粉篓添到 3 筒", "粉篓添到 4 筒", "粉篓添到 5 筒"],
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

/** 每档食材成本系数（粉篓与汤勺的第二效果：抓得准就少浪费） */
export const STRAINER_COST_FACTOR = 0.97;
/** 每档日上限加成 */
export const BENCH_CAPACITY_STEP = 40;
/** 四档（0 档 = 还没买） */
export const MAX_EQUIP_LEVEL = 4;
