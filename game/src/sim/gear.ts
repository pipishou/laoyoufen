/**
 * 家当（M3）的逻辑层：买、九个乘数、面板视图。
 *
 * 九个入口全是既有的（不新开引擎）：
 *   seats     → 买下当场加到 venue.seats（与 `sim/equipment.ts` 的案台加 capacity 同一手法）
 *   servePct  → sim/customer.ts 的 serveCooldown
 *   costPct   → sim/customer.ts 的 settle() 料钱
 *   satBonus  → sim/customer.ts 的 satisfactionOf bonus
 *   patiencePct / attractPct / drinkPct / fatiguePct → 各自既有乘数处
 *   rivalShieldPct → sim/rivals.ts 的 rivalShareOf（街坊认你家，同行抢不走那么多）
 */
import { GEARS, GEAR_BY_ID, GEAR_TOTAL_YUAN, gearById, type GearDef } from "../data/gear";
import { comboTotals } from "./combo";
import type { GameState } from "./state";

export interface GearBuyResult {
  ok: boolean;
  reason?: string;
  line?: string;
}

export function hasGear(state: GameState, id: string): boolean {
  return (state.gear ?? []).includes(id);
}

/** 买一件家当：钱够、没买过；带座位的当场加座 */
export function buyGear(state: GameState, id: string): GearBuyResult {
  const def = gearById(id);
  if (!def) return { ok: false, reason: "店里没有这件家当" };
  if (hasGear(state, id)) return { ok: false, reason: `${def.name}已经买过了` };
  if (state.cash < def.costYuan) {
    return { ok: false, reason: `${def.name}要 ¥${def.costYuan.toLocaleString("zh-CN")}，还差一点` };
  }
  state.cash -= def.costYuan;
  state.gear = [...(state.gear ?? []), id];
  if (def.seats) state.venue.seats += def.seats;
  return { ok: true, line: `${def.name}搬进来了：${def.line}` };
}

/** 乘数汇总：同类效果相加，都有下限，免得叠到 0 */
function sumPct(state: GameState, pick: (g: GearDef) => number | undefined): number {
  let pct = 0;
  for (const id of state.gear ?? []) {
    const def = GEAR_BY_ID.get(id);
    const v = def ? pick(def) : undefined;
    if (v) pct += v;
  }
  return pct;
}

/** 出碗时间倍率（越快越接近 0.7） */
export function gearServeFactor(state: GameState): number {
  return Math.max(0.7, 1 - sumPct(state, (g) => g.servePct) - comboTotals(state).servePct);
}

/** 料钱倍率 */
export function gearCostFactor(state: GameState): number {
  return Math.max(0.7, 1 - sumPct(state, (g) => g.costPct) - comboTotals(state).costPct);
}

/** 每碗满意加成（绝对分） */
export function gearSatBonus(state: GameState): number {
  return sumPct(state, (g) => g.satBonus) + comboTotals(state).satBonus;
}

export function gearPatienceMult(state: GameState): number {
  return 1 + sumPct(state, (g) => g.patiencePct) + comboTotals(state).patiencePct;
}

export function gearAttractMult(state: GameState): number {
  return 1 + sumPct(state, (g) => g.attractPct) + comboTotals(state).attractPct;
}

export function gearDrinkMult(state: GameState): number {
  return 1 + sumPct(state, (g) => g.drinkPct) + comboTotals(state).drinkPct;
}

/** 员工疲劳倍率（越低越不累） */
export function gearFatigueMult(state: GameState): number {
  return Math.max(0.4, 1 - sumPct(state, (g) => g.fatiguePct) - comboTotals(state).fatiguePct);
}

/** 同行抢客的遮蔽倍率（越接近 0.5 抢得越少） */
export function gearRivalShield(state: GameState): number {
  return Math.max(0.5, 1 - sumPct(state, (g) => g.rivalShieldPct) - comboTotals(state).rivalShieldPct);
}

export interface GearView {
  def: GearDef;
  owned: boolean;
  affordable: boolean;
}

export function gearViews(state: GameState): GearView[] {
  return GEARS.map((def) => ({
    def,
    owned: hasGear(state, def.id),
    affordable: state.cash >= def.costYuan,
  }));
}

export function gearSummary(state: GameState): string {
  const owned = (state.gear ?? []).length;
  if (owned === 0) return "店里还都是最基础的家当";
  const spent = (state.gear ?? []).reduce((sum, id) => sum + (gearById(id)?.costYuan ?? 0), 0);
  return `${owned}/${GEARS.length} 件 · 花了 ¥${spent.toLocaleString("zh-CN")}`;
}

/** 还没买、且买得起的最便宜那件（面板提示 + 替身决策共用） */
export function nextGear(state: GameState): GearDef | null {
  const left = GEARS.filter((g) => !hasGear(state, g.id));
  if (left.length === 0) return null;
  return left.find((g) => state.cash >= g.costYuan) ?? left[0]!;
}

export { GEAR_TOTAL_YUAN };
