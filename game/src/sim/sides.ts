import {
  MAX_DRINK_ADDS,
  MAX_TOPPING_ADDS,
  MEAL_DEAL_OFF,
  MEAL_DEAL_SAT,
  SIDE_BY_ID,
  SIDE_COMBOS,
  SIDES,
  START_SIDES,
  DRINK_TEMP_WORD,
  sideChanceOf,
  tempFitOf,
  type DrinkTemp,
  type SideDef,
  type SideKind,
} from "../data/sides";
import type { CustomerArchetype } from "../data/customers";
import type { NoodleId, SeasonId } from "../data/noodles";
import { currentSeason, noodleKindOf } from "./noodles";
import { isUnlocked } from "./unlocks";
import { nextFloat } from "./rng";
import type { GameState } from "./state";

export interface SideView {
  def: SideDef;
  on: boolean;
  unlocked: boolean;
  sold: number;
  margin: number;
  /** 还差多少人解锁 */
  short: number;
}

export interface SidePick {
  items: SideDef[];
  /** 加购收入（不含基础价） */
  paid: number;
  /** 加购成本（不含一碗的料钱） */
  cost: number;
  /** 组合满意度加成 */
  combo: string | null;
  satBonus: number;
}

const EMPTY: SidePick = { items: [], paid: 0, cost: 0, combo: null, satBonus: 0 };

export function sideSold(state: GameState, id: string): number {
  return state.sides.sold[id] ?? 0;
}

export function sideUnlocked(state: GameState, def: SideDef): boolean {
  return state.totalCustomers >= def.needCustomers;
}

/** 面板用：全部单品 + 上架状态 + 今日/累计卖出 */
export function sideViews(state: GameState): SideView[] {
  return SIDES.map((def) => ({
    def,
    on: state.sides.active.includes(def.id),
    unlocked: sideUnlocked(state, def),
    sold: sideSold(state, def.id),
    margin: Math.round((def.priceYuan - def.costYuan) * 100) / 100,
    short: Math.max(0, def.needCustomers - state.totalCustomers),
  }));
}

/** 真正在卖的单品（上架 且 已解锁） */
export function activeSides(state: GameState): SideDef[] {
  return state.sides.active
    .map((id) => SIDE_BY_ID.get(id))
    .filter((d): d is SideDef => !!d && sideUnlocked(state, d));
}

/** 上架 / 下架。未解锁的不能上架；至少留一件在架（全下架等于没做这个功能） */
export function toggleSide(state: GameState, id: string): { ok: boolean; reason?: string } {
  const def = SIDE_BY_ID.get(id);
  if (!def) return { ok: false, reason: "没这个加料" };
  const on = state.sides.active.includes(id);
  if (on) {
    if (state.sides.active.length <= 1) return { ok: false, reason: "总得留一件在架上" };
    state.sides.active = state.sides.active.filter((x) => x !== id);
    return { ok: true };
  }
  if (!sideUnlocked(state, def)) {
    return { ok: false, reason: `还没到时候——累计接待 ${def.needCustomers} 位才有人点` };
  }
  state.sides.active = [...state.sides.active, id];
  return { ok: true };
}

/**
 * 组合判定：按 SIDE_COMBOS 顺序取加成最高的一个。
 *
 * P42 起组合可以带条件 —— 冬夏限定的两条（干捞配豆浆 / 砂锅配热浆）
 * 只在「那个粉型 + 那个季节」成立，所以要把粉型与季节传进来。
 */
export function comboOf(
  items: SideDef[],
  noodle: NoodleId = "flat",
  season: SeasonId | null = null,
): { name: string; satBonus: number } | null {
  const ids = new Set(items.map((i) => i.id));
  let best: { name: string; satBonus: number } | null = null;
  for (const c of SIDE_COMBOS) {
    if (c.noodle && c.noodle !== noodle) continue;
    if (c.season && c.season !== season) continue;
    if (!c.needs.every((n) => ids.has(n))) continue;
    if (!best || c.satBonus > best.satBonus) best = { name: c.name, satBonus: c.satBonus };
  }
  return best;
}

/** 一顿最多加几件「加料」：基础 2 件，点了手艺树的 topping4 之后 3 件（照开罗 More Toppings） */
export function maxToppingAdds(state: GameState): number {
  return MAX_TOPPING_ADDS + (isUnlocked(state, "topping4") ? 1 : 0);
}

/** 套餐：粉 + 饮料打包，饮料便宜一块（P42）。返回 null 表示这个客没点套餐。 */
export function mealDealOf(state: GameState, items: SideDef[]): { off: number; sat: number } | null {
  if (!state.sides.mealDeal) return null;
  if (!items.some((i) => i.kind === "drink")) return null;
  return { off: MEAL_DEAL_OFF, sat: MEAL_DEAL_SAT };
}

export function toggleMealDeal(state: GameState): { ok: boolean; reason?: string } {
  state.sides.mealDeal = !state.sides.mealDeal;
  return { ok: true };
}

/** 饮料冰 / 热（P43）：夏天上冰、冬天上热的才对味 */
export function setDrinkTemp(state: GameState, temp: DrinkTemp): { ok: boolean; reason?: string } {
  if (temp !== "ice" && temp !== "hot") return { ok: false, reason: "只有冰的和热的" };
  state.sides.drinkTemp = temp;
  return { ok: true };
}

/** 一句话：现在饮料是冰的还是热的，对不对季 */
export function drinkTempSummary(state: GameState): string {
  const season = currentSeason(state);
  const temp = state.sides.drinkTemp;
  const word = DRINK_TEMP_WORD[temp];
  const fit = tempFitOf(temp, season);
  const seasonWord = season === "summer" ? "夏天" : season === "winter" ? "冬天" : "这季节";
  if (fit > 0) return `饮料上${word}的 · ${seasonWord}就该这么上（满意 +${fit}）`;
  if (fit < 0) return `饮料上${word}的 · 反季，客人不一定受（满意 ${fit}）`;
  return `饮料上${word}的 · ${seasonWord}冰热都行`;
}

/** 初始化一份默认上架表（存档迁移也用） */
export function defaultActive(): string[] {
  return [...START_SIDES];
}

/**
 * 客人点单时决定加什么。
 *
 * @param room  钱包还剩下的钱（= 钱包上限 − 基础价）。为 0 或负就不加。
 * @param sat   这一碗算出来的满意度（用来决定「爱不爱加」）
 */
export function pickSides(
  state: GameState,
  arch: CustomerArchetype | undefined,
  sat: number,
  room: number,
): SidePick {
  if (room < 0.5) return EMPTY;
  const on = activeSides(state);
  if (on.length === 0) return EMPTY;
  if (nextFloat(state.rng) >= sideChanceOf(sat)) return EMPTY;

  const toppings = on.filter((d) => d.kind === "topping").sort((a, b) => a.priceYuan - b.priceYuan);
  const drinks = on.filter((d) => d.kind === "drink").sort((a, b) => a.priceYuan - b.priceYuan);

  const items: SideDef[] = [];
  let budget = room;

  /**
   * 先加料后饮料：加料是「一碗粉的延伸」，饮料是「吃完再带走」。
   * 钱包宽的人（上班族/部长，预算 ≥11）多给一件加料的额度 —— 有钱就想吃全套；
   * 手艺树点了 topping4（第 4 段「浇头台加一格」）再 +1，对齐开罗 More Toppings。
   */
  const rich = arch ? arch.budget >= 11 : false;
  const toppingCap = maxToppingAdds(state) + (rich ? 1 : 0);

  for (const def of toppings) {
    if (items.filter((i) => i.kind === "topping").length >= toppingCap) break;
    if (def.priceYuan > budget) continue;
    items.push(def);
    budget -= def.priceYuan;
  }
  for (const def of drinks) {
    if (items.filter((i) => i.kind === "drink").length >= MAX_DRINK_ADDS) break;
    if (def.priceYuan > budget) continue;
    items.push(def);
    budget -= def.priceYuan;
    break; // 饮料只要一份
  }
  if (items.length === 0) return EMPTY;

  // 组合与套餐都要知道「今天卖什么粉、什么季节」（P42 的冬夏限定）
  const kind = noodleKindOf(state);
  const season = currentSeason(state);
  const combo = comboOf(items, kind, season);
  const meal = mealDealOf(state, items);
  const listPrice = items.reduce((a, d) => a + d.priceYuan, 0);
  const paid = Math.max(0, listPrice - (meal ? meal.off : 0));
  const cost = items.reduce((a, d) => a + d.costYuan, 0);
  const satBonus =
    items.reduce((a, d) => a + d.satBonus, 0) +
    (combo ? combo.satBonus : 0) +
    (meal ? meal.sat : 0) +
    (tempBonus(items, season, state.sides.drinkTemp)) +
    (rich ? 1 : 0);

  return { items, paid, cost, combo: combo?.name ?? null, satBonus };
}

/**
 * 饮料冰热了对不对季（P43）：只有点了饮料才算。
 * 夏天上冰的、冬天上热的 +1，反季节 −1，春秋不加减。
 */
function tempBonus(items: SideDef[], season: SeasonId | null, temp: DrinkTemp): number {
  return items.some((d) => d.kind === "drink") ? tempFitOf(temp, season) : 0;
}

/** 结算记账：卖出计数 + 累计加购收入（测试员判据看这个） */
export function recordSides(state: GameState, pick: SidePick): void {
  if (pick.items.length === 0) return;
  for (const def of pick.items) {
    state.sides.sold[def.id] = (state.sides.sold[def.id] ?? 0) + 1;
  }
  state.tally.sideRevenue += pick.paid;
  if (pick.combo) state.tally.comboHits += 1;
}

/** 加购占营业额的比例（0–1） */
export function sideShareOf(state: GameState): number {
  const total = state.monthRevenue + state.tally.sideRevenue;
  if (total <= 0) return 0;
  return state.tally.sideRevenue / total;
}

/** 一行文案：客单价结构现在是什么样 */
export function sideSummary(state: GameState): string {
  const on = activeSides(state);
  const t = on.filter((d) => d.kind === "topping").length;
  const d = on.filter((x) => x.kind === "drink").length;
  if (on.length === 0) return "加料台空着";
  return `加料 ${t} 样 · 饮料 ${d} 样`;
}

/** 供 UI 判断「这一类还能不能再上」 */
export function kindLabel(kind: SideKind): string {
  return kind === "topping" ? "加料" : "饮料";
}
