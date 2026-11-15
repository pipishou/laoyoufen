/**
 * 主料与份量 · 运行时（读 state，改 state 只通过这里的两个 set）。
 *
 * 主料解锁靠累计客流（`MAINS[].needCustomers`），跟加料台同一套门槛口径；
 * 份量（二两/三两）不设门槛 —— 真店里说一句就行。
 */

import {
  DEFAULT_PORTION,
  MAINS,
  MAIN_BY_ID,
  portionOf,
  suggestPriceWithMain,
  type MainDef,
  type MainId,
  type Portion,
} from "../data/mains";
import { BOWL } from "../data/anchors";
import { mainCostYuan, portionPriceDelta } from "../data/mains";
import type { GameState } from "./state";

export interface MainView {
  def: MainDef;
  /** 现在卖的是这一味 */
  on: boolean;
  unlocked: boolean;
  /** 还差几位客人解锁 */
  short: number;
}

export function mainOfState(state: GameState): MainDef {
  return MAIN_BY_ID.get(state.main as MainId) ?? MAIN_BY_ID.get("pork")!;
}

export function mainUnlocked(state: GameState, id: string): boolean {
  const def = MAIN_BY_ID.get(id as MainId);
  if (!def) return false;
  return state.totalCustomers >= def.needCustomers;
}

export function mainViews(state: GameState): MainView[] {
  return MAINS.map((def) => ({
    def,
    on: def.id === mainOfState(state).id,
    unlocked: mainUnlocked(state, def.id),
    short: Math.max(0, def.needCustomers - state.totalCustomers),
  }));
}

/** 换主料：未解锁返回原因，成功只改 state.main */
export function setMain(state: GameState, id: string): { ok: boolean; reason?: string } {
  const def = MAIN_BY_ID.get(id as MainId);
  if (!def) return { ok: false, reason: "没有这味主料" };
  if (!mainUnlocked(state, id)) {
    const short = Math.max(0, def.needCustomers - state.totalCustomers);
    return { ok: false, reason: `${def.name}还差 ${short} 位客人` };
  }
  state.main = def.id;
  return { ok: true };
}

export function setPortion(state: GameState, size: number): { ok: boolean; reason?: string } {
  if (size !== 2 && size !== 3) return { ok: false, reason: "只有二两和三两" };
  state.portion = size;
  return { ok: true };
}

export function mainSummary(state: GameState): string {
  const def = mainOfState(state);
  const cost = BOWL.costYuan + mainCostYuan(def.id);
  return `${def.name} · 料钱 ¥${cost.toFixed(1)}/碗 · 建议卖 ¥${suggestPriceWithMain(def.id, state.portion)}`;
}

export function portionSummary(state: GameState): string {
  const p = portionOf(state.portion);
  const cost = BOWL.costYuan + mainCostYuan(state.main) + p.costYuan;
  return p.size === DEFAULT_PORTION
    ? `${p.name} · 成本 ¥${cost.toFixed(1)}`
    : `${p.name} · 成本 ¥${cost.toFixed(1)} · 实收 = 菜单价 +¥${portionPriceDelta(p.size)}`;
}

/** 这碗的实收价（菜单价 + 份量加成），UI 与结算共用 */
export function bowlPriceOf(state: GameState): number {
  return state.price + portionPriceDelta(state.portion);
}

export function portionSizeOfState(state: GameState): Portion {
  return portionOf(state.portion).size;
}
