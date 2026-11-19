import {
  BENCH_CAPACITY_STEP,
  EQUIP_BY_ID,
  MAX_EQUIP_LEVEL,
  STOVE_SERVE_FACTOR,
  STRAINER_COST_FACTOR,
  type EquipDef,
  type EquipId,
} from "../data/equipment";
import type { GameState } from "./state";

export interface BuyResult {
  ok: boolean;
  reason?: string;
  /** 买成之后这一档到底换来了什么（试玩二轮 F8：原来统一说「明天出碗更快」，买案台也这么说） */
  line?: string;
}

/** 每件设备买下一档时，向玩家交代的那一句话 —— 必须是这一档真的改了的东西 */
function upgradeLine(id: EquipId, level: number): string {
  if (id === "stove") {
    const pct = Math.round((1 - STOVE_SERVE_FACTOR) * 100);
    return `猛火灶第 ${level} 档：出碗时间每档 −${pct}%`;
  }
  if (id === "strainer") {
    const pct = Math.round((1 - STRAINER_COST_FACTOR) * 100);
    return `粉篓第 ${level} 档：料钱每档 −${pct}%`;
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

/** 出碗时间系数（猛火灶） */
export function equipServeMultiplier(state: GameState): number {
  return Math.pow(STOVE_SERVE_FACTOR, equipLevel(state, "stove"));
}

/** 食材成本系数（粉篓与汤勺） */
export function equipCostMultiplier(state: GameState): number {
  return Math.pow(STRAINER_COST_FACTOR, equipLevel(state, "strainer"));
}

/** 当前实际出碗分钟数（给 HUD 与面板用，口径与 customer.ts 一致） */
export function effectiveServeMinutes(state: GameState, baseMinutes: number, staffFactor: number): number {
  return Math.max(0.5, baseMinutes * staffFactor * equipServeMultiplier(state));
}
