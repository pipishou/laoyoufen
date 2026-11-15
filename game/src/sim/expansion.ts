import { EXPANSION_BY_ID, EXPANSION_ORDER, type ExpansionDef } from "../data/expansion";
import type { GameState } from "./state";

export interface ExpandResult {
  ok: boolean;
  reason?: string;
}

export function expansionLevel(state: GameState): number {
  return state.venue.expansion ?? 0;
}

/** 下一档扩建；已到顶返回 null */
export function nextExpansion(state: GameState): ExpansionDef | null {
  const id = EXPANSION_ORDER[expansionLevel(state)];
  if (!id) return null;
  return EXPANSION_BY_ID.get(id) ?? null;
}

/** 下一档价格；已到顶返回 Infinity */
export function expansionNextCost(state: GameState): number {
  return nextExpansion(state)?.costYuan ?? Infinity;
}

/**
 * 买下一档扩建：钱不够拒绝且不扣钱；买成功后座位/灶位/日上限当场生效。
 * 必须按 EXPANSION_ORDER 顺序买（先隔墙、后后厨），跳档会被拒绝。
 */
export function buyExpansion(state: GameState): ExpandResult {
  const def = nextExpansion(state);
  if (!def) return { ok: false, reason: "已经扩到顶了" };
  if (state.cash < def.costYuan) {
    return { ok: false, reason: `还差 ¥${Math.ceil(def.costYuan - state.cash).toLocaleString("zh-CN")}` };
  }
  state.cash -= def.costYuan;
  state.venue.expansion = expansionLevel(state) + 1;
  state.venue.seats += def.seats;
  state.venue.stoves += def.stoves;
  state.capacity += def.capacity;
  return { ok: true };
}
