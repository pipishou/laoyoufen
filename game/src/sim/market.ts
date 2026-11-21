import { MARKET_BY_ID, MARKETS, type MarketDef, type MarketId } from "../data/market";
import { hashString } from "./rng";
import type { GameState } from "./state";

/** 行情乘数相加之后的硬上限：任何一天的效果都夹在 ±35% 内（账本 P154 的要求） */
export const MARKET_CAP = 0.35;

/**
 * 每条行情能在哪些月份出现。
 *
 * 这不是「随机抽天气」—— 南宁的天气是有季节的：回南天在二三月，
 * 台风在七到九月，寒潮在十二到二月。抽到不该来的月份，比没有行情更假。
 */
const SEASON: Record<MarketId, readonly number[]> = {
  huiNanTian: [2, 3],
  storm: [7, 8, 9],
  heat: [6, 7, 8],
  coldSnap: [12, 1, 2],
  marketRush: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
  inspection: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
  porkUp: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
  schoolOpen: [3, 9],
};

/** 每天有行情的概率：太平凡了就不叫「行情」（每三天来一天左右） */
const MARKET_CHANCE = 0.34;

function roll(state: GameState, salt: string): number {
  // hashString 给的是 32 位无符号整数，这里折回 0–1
  return hashString(`${state.playerId}:market:${state.month}:${state.day}:${salt}`) / 4294967296;
}

/** 今天有没有行情、是哪一条（**不消耗 state.rng** —— 与街坊报同一个做法） */
export function todayMarket(state: GameState): MarketDef | null {
  if (roll(state, "has") > MARKET_CHANCE) return null;
  const pool = MARKETS.filter((m) => SEASON[m.id].includes(state.month));
  if (pool.length === 0) return null;
  const idx = Math.floor(roll(state, "pick") * pool.length) % pool.length;
  return pool[idx] ?? null;
}

/** 今天的行情（给界面与接线读） */
export function marketOf(state: GameState): MarketDef | null {
  return todayMarket(state);
}

export interface MarketTotals {
  attract: number;
  patience: number;
  wallet: number;
  cost: number;
}

const clampCap = (v: number): number => Math.max(-MARKET_CAP, Math.min(MARKET_CAP, v));

/** 今天所有行情叠起来的总效果（每条一条，同向相加后夹 ±35%） */
export function marketTotals(state: GameState): MarketTotals {
  const m = marketOf(state);
  if (!m) return { attract: 0, patience: 0, wallet: 0, cost: 0 };
  return {
    attract: clampCap(m.effect.attractPct ?? 0),
    patience: clampCap(m.effect.patiencePct ?? 0),
    wallet: clampCap(m.effect.walletPct ?? 0),
    cost: clampCap(m.effect.costPct ?? 0),
  };
}

/** 进店倍率 */
export function marketAttractMult(state: GameState): number {
  return 1 + marketTotals(state).attract;
}

/** 耐心倍率 */
export function marketPatienceMult(state: GameState): number {
  return 1 + marketTotals(state).patience;
}

/** 钱包倍率（客人愿意花多少） */
export function marketWalletMult(state: GameState): number {
  return 1 + marketTotals(state).wallet;
}

/** 料钱倍率 */
export function marketCostFactor(state: GameState): number {
  return 1 + marketTotals(state).cost;
}

/** 「回南天 · 进店 −12% · 耐心 +10%」这样一行话（界面与钩子用） */
export function marketWords(def: MarketDef): string {
  const parts: string[] = [];
  const e = def.effect;
  const pct = (v: number): string => `${v > 0 ? "+" : "−"}${Math.round(Math.abs(v) * 100)}%`;
  if (e.attractPct) parts.push(`进店 ${pct(e.attractPct)}`);
  if (e.patiencePct) parts.push(`耐心 ${pct(e.patiencePct)}`);
  if (e.walletPct) parts.push(`客单价 ${pct(e.walletPct)}`);
  if (e.costPct) parts.push(`料钱 ${pct(e.costPct)}`);
  return parts.join(" · ");
}

/** 今天一行话：有行情就点名，没有就说「今天街上没什么事」 */
export function marketSummary(state: GameState): string {
  const m = marketOf(state);
  if (!m) return "今天街上没什么特别的";
  return `${m.name} · ${marketWords(m)}`;
}

export const MARKET_TOTAL = MARKETS.length;

export function marketById(id: string): MarketDef | undefined {
  return MARKET_BY_ID.get(id);
}
