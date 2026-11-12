import { UPGRADE_BY_ID, type UpgradeDef } from "../data/shop";
import type { GameState } from "./state";

export function upgradeLevel(state: GameState, id: string): number {
  return state.venue.upgrades[id] ?? 0;
}

export function upgradeCost(state: GameState, id: string): number {
  const def = UPGRADE_BY_ID.get(id);
  if (!def) return Infinity;
  return Math.round(def.baseCost * Math.pow(def.growth, upgradeLevel(state, id)));
}

export interface PurchaseResult {
  ok: boolean;
  reason?: string;
}

export function buyUpgrade(state: GameState, id: string): PurchaseResult {
  const def: UpgradeDef | undefined = UPGRADE_BY_ID.get(id);
  if (!def) return { ok: false, reason: "没有这个项目" };
  const level = upgradeLevel(state, id);
  if (level >= def.maxLevel) return { ok: false, reason: "已经满级" };
  const cost = upgradeCost(state, id);
  if (state.cash < cost) return { ok: false, reason: `还差 ¥${cost - Math.floor(state.cash)}` };

  state.cash -= cost;
  state.venue.upgrades[id] = level + 1;
  if (id === "seats") state.venue.seats += 1;
  if (id === "stove") state.venue.stoves += 1;
  if (id === "hall") {
    // 大厅扩建：现实里就是「多摆两张桌」，所以增长落在座位上，不是落在一个
    // 和产能无关的日销闸上。capacity 只是兜底闸（见 state.ts），+10 仅防呆。
    state.venue.seats += 2;
    state.capacity += 10;
  }
  return { ok: true };
}

/** 空调：候餐耐心倍率 */
export function shopPatienceMultiplier(state: GameState): number {
  return 1 + upgradeLevel(state, "ac") * 0.1;
}

/** 招牌：门店魅力加成，只进 storeScore，不动口味分回归锁 */
export function shopCharmBonus(state: GameState): number {
  return upgradeLevel(state, "sign") * 3;
}

/** 摆件：进店客流倍率 */
export function shopAttractMultiplier(state: GameState): number {
  return 1 + upgradeLevel(state, "decor") * 0.06;
}
