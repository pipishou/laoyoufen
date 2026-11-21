import {
  BENCH_CAPACITY_STEP,
  EQUIP_BY_ID,
  MAX_EQUIP_LEVEL,
  PARALLEL_BY_TIER,
  STAGE_MINUTES,
  STATION_EQUIP,
  STATION_NAMES,
  STATION_ORDER,
  STRAINER_COST_FACTOR,
  type EquipDef,
  type EquipId,
  type StationId,
} from "../data/equipment";
import type { GameState } from "./state";

export interface BuyResult {
  ok: boolean;
  reason?: string;
  /** 买成之后这一档到底换来了什么（试玩二轮 F8：原来统一说「明天出碗更快」，买案台也这么说） */
  line?: string;
}

/** 某一段现在开到几口（设备 0 档 = 1 口） */
export function stationCount(state: GameState, station: StationId): number {
  const table = PARALLEL_BY_TIER[station];
  const lv = Math.min(equipLevel(state, STATION_EQUIP[station]), table.length - 1);
  return table[Math.max(0, lv)] ?? 1;
}

/** 升一档后这一段开到几口（满档返回当前值） */
export function stationCountAfter(state: GameState, station: StationId): number {
  const table = PARALLEL_BY_TIER[station];
  const lv = Math.min(equipLevel(state, STATION_EQUIP[station]) + 1, table.length - 1);
  return table[Math.max(0, lv)] ?? 1;
}

/** 三段各要几分钟（已按口数摊开）+ 合计 */
export function stageMinutes(state: GameState): Record<StationId, number> & { total: number } {
  const wok = STAGE_MINUTES.wok / Math.max(1, stationCount(state, "wok"));
  const pot = STAGE_MINUTES.pot / Math.max(1, stationCount(state, "pot"));
  const basket = STAGE_MINUTES.basket / Math.max(1, stationCount(state, "basket"));
  return { wok, pot, basket, total: wok + pot + basket };
}

/**
 * 三段合起来的出碗系数（相对基准 6.0 分钟）。
 * **单出口**：HUD 的「分/碗」、打烊单的产能、钩子挑件都读这一个函数（合并 P117 / P152）。
 */
export function stationServeFactor(state: GameState): number {
  const base = STAGE_MINUTES.wok + STAGE_MINUTES.pot + STAGE_MINUTES.basket;
  return stageMinutes(state).total / base;
}

/** 哪一段最慢（面板与钩子用） */
export function slowestStation(state: GameState): { station: StationId; minutes: number } {
  const m = stageMinutes(state);
  let best: StationId = "wok";
  for (const s of STATION_ORDER) if (m[s] > m[best]) best = s;
  return { station: best, minutes: m[best] };
}

/** 每件设备买下一档时，向玩家交代的那一句话 —— 必须是这一档真的改了的东西 */
function upgradeLine(id: EquipId, level: number): string {
  const station = (Object.keys(STATION_EQUIP) as StationId[]).find((s) => STATION_EQUIP[s] === id);
  if (station) {
    const after = PARALLEL_BY_TIER[station][Math.min(level, PARALLEL_BY_TIER[station].length - 1)] ?? 1;
    const unit = station === "basket" ? "筒" : "口";
    return `${STATION_NAMES[station]}第 ${level} 档：开到 ${after} ${unit}`;
  }
  return `案台第 ${level} 档：每天多备 ${BENCH_CAPACITY_STEP} 碗的料`;
}

export function equipLevel(state: GameState, id: string): number {
  return state.equipment[id] ?? 0;
}

/** 下一档要多少钱；满级返回 Infinity */
export function equipNextCost(state: GameState, id: string): number {
  const def = EQUIP_BY_ID.get(id);
  if (!def) return Infinity;
  const lv = equipLevel(state, id);
  if (lv >= MAX_EQUIP_LEVEL) return Infinity;
  return def.tiers[lv] ?? Infinity;
}

/** 买下一档：钱不够/满级都拒绝且不扣钱，案台当场提升日上限 */
export function buyEquipment(state: GameState, id: string): BuyResult {
  const def: EquipDef | undefined = EQUIP_BY_ID.get(id);
  if (!def) return { ok: false, reason: "没有这台设备" };
  const lv = equipLevel(state, id);
  if (lv >= MAX_EQUIP_LEVEL) return { ok: false, reason: "已经换到顶档" };
  const cost = equipNextCost(state, id);
  if (state.cash < cost) return { ok: false, reason: `还差 ¥${Math.ceil(cost - state.cash)}` };

  state.cash -= cost;
  state.equipment[id] = lv + 1;
  if (id === ("bench" satisfies EquipId)) state.capacity += BENCH_CAPACITY_STEP;
  return { ok: true, line: upgradeLine(def.id, lv + 1) };
}

/** 出碗时间系数（三段并行后的合计，旧名保留，调用处不必全改） */
export function equipServeMultiplier(state: GameState): number {
  return stationServeFactor(state);
}

/** 食材成本系数（粉篓与汤勺的第二效果） */
export function equipCostMultiplier(state: GameState): number {
  return Math.pow(STRAINER_COST_FACTOR, equipLevel(state, "strainer"));
}

/** 当前实际出碗分钟数（给 HUD 与面板用，口径与 customer.ts 一致） */
export function effectiveServeMinutes(state: GameState, baseMinutes: number, staffFactor: number): number {
  return Math.max(0.5, baseMinutes * staffFactor * equipServeMultiplier(state));
}
