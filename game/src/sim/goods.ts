/**
 * 杂货铺（批 B′）—— 花人情，买一天的方便。
 *
 * 三件杂货各自只落一个**已有出口**：
 *
 * - `noodle_pile`（多备一筐粉）→ 当天产能 +15 碗，进 `capacityOf`；
 * - `fan`（借三台电扇）→ 当天耐心 ×1.2，进 `patienceScale`；
 * - `dough`（现炸一筐油条）→ 当天加购概率 ×1.5，进 `pickSides` 的 chance。
 *
 * 都是**当天**，第二天自动失效：状态记 `month * 100 + day` 那个日戳（与「摆一桌」
 * `state.treatDay` 同一套写法），老档缺省当作「今天没买」。
 * 这样杂货不需要库存、不需要到期清理，也不升存档版本（P205 仍然没库存）。
 */

import { GOODS, GOOD_BY_ID, type GoodDef } from "../data/goods";
import { favorOf } from "./favor";
import type { GameState } from "./state";

/** 今天的日戳（与 treatDay 同构：month * 100 + day） */
export function todayStamp(state: GameState): number {
  return state.month * 100 + state.day;
}

/** 这一件杂货买到哪一天 */
export function goodDayOf(state: GameState, id: string): number {
  return Math.max(0, Math.round(state.goods?.[id] ?? 0));
}

/** 今天还灵不灵 */
export function goodToday(state: GameState, id: string): boolean {
  return goodDayOf(state, id) === todayStamp(state);
}

/** 今天买着的杂货 */
export function todayGoods(state: GameState): GoodDef[] {
  return GOODS.filter((def) => goodToday(state, def.id));
}

export interface GoodView {
  def: GoodDef;
  active: boolean;
  affordable: boolean;
  /** 买不了的原因；能买就是空串 */
  reason: string;
}

export function goodsViews(state: GameState): GoodView[] {
  const pts = favorOf(state);
  return GOODS.map((def) => {
    const active = goodToday(state, def.id);
    let reason = "";
    if (active) reason = "今天已经在用了";
    else if (pts < def.favorCost) reason = `还差 ${def.favorCost - pts} 点人情`;
    return { def, active, affordable: reason === "", reason };
  });
}

export interface BuyGoodResult {
  ok: boolean;
  line: string;
  reason: string;
}

/** 买一件杂货：扣人情、记日戳 */
export function buyGood(state: GameState, id: string): BuyGoodResult {
  const def = GOOD_BY_ID.get(id);
  if (!def) return { ok: false, line: "", reason: "没有这一件" };
  if (goodToday(state, def.id)) return { ok: false, line: "", reason: "今天已经在用了" };
  const pts = favorOf(state);
  if (pts < def.favorCost) {
    return { ok: false, line: "", reason: `还差 ${def.favorCost - pts} 点人情` };
  }
  state.favor = pts - def.favorCost;
  state.goods = { ...(state.goods ?? {}), [def.id]: todayStamp(state) };
  return { ok: true, line: def.line, reason: "" };
}

/** 当天产能 +N 碗 */
export function goodsCapacityBonus(state: GameState): number {
  return todayGoods(state).reduce((n, d) => n + (d.capacity ?? 0), 0);
}

/** 当天耐心乘数 */
export function goodsPatienceMult(state: GameState): number {
  const pct = todayGoods(state).reduce((n, d) => n + (d.patiencePct ?? 0), 0);
  return 1 + pct;
}

/** 当天加购乘数 */
export function goodsSideMult(state: GameState): number {
  return todayGoods(state).reduce((n, d) => n * (d.sideMult ?? 1), 1);
}

/**
 * 当天进店乘数（批 J′ 新加的那一条出口）。
 *
 * 只有「门口多亮一盏灯」「门口挂块价牌」两件用它；进店率本身已经叠了
 * 行情、物产、技法、门路、抢客五层，所以这里只做**加法累加**（+8%、+5%），
 * 不再乘出第六层（P154 / R-1 的同一条纪律）。
 */
export function goodsAttractMult(state: GameState): number {
  const pct = todayGoods(state).reduce((n, d) => n + (d.attractPct ?? 0), 0);
  return 1 + pct;
}

/** 面板上的一行 */
export function goodWords(def: GoodDef): string {
  const bits: string[] = [];
  if (def.capacity) bits.push(`当天产能 +${def.capacity} 碗`);
  if (def.attractPct) bits.push(`进店 +${Math.round(def.attractPct * 100)}%`);
  if (def.patiencePct) bits.push(`耐心 +${Math.round(def.patiencePct * 100)}%`);
  if (def.sideMult) bits.push(`加购 ×${def.sideMult}`);
  return bits.join(" · ");
}

/** 抬头：「杂货铺」/「今天买了：借三台电扇过来」 */
export function goodsSummary(state: GameState): string {
  const live = todayGoods(state);
  if (live.length === 0) return "今天没买东西";
  return `今天买了：${live.map((d) => d.name).join("、")}`;
}
