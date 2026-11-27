import { MARKET_BY_ID, MARKETS, type MarketDef, type MarketId } from "../data/market";
import { goodFixesApplied } from "./goods";
import { hedgedMarketIds } from "./invest";
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
  qingming: [4],
  dragonBoat: [5, 6],
  summerBreak: [7, 8],
  payday: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
  waterCut: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
  gasUp: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
  roadWork: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
  expoSeason: [9],
};

/** 每天有行情的概率：太平凡了就不叫「行情」（每三天来一天左右） */
const MARKET_CHANCE = 0.34;

function roll(state: GameState, salt: string): number {
  // hashString 给的是 32 位无符号整数，这里折回 0–1
  return hashString(`${state.playerId}:market:${state.month}:${state.day}:${salt}`) / 4294967296;
}

/** 今天有没有行情、是哪一条（**不消耗 state.rng** —— 与街坊报同一个做法） */
/**
 * 配对的权重（批 B″）：好事只按六成算。
 *
 * 定六成的理由：它要「抵一抵」，不能「抹平」。停水 −16% 撞上发薪日 +16%
 * 只剩 −3.4%，玩家能感觉到这一天不至于白过，可也不会觉得停水没影响。
 */
const PAIR_WEIGHT = 0.6;

/** 配对的兜底：开学有月份限制，别的月份撞上修路就配赶圩 */
const PAIR_FALLBACK: MarketId = "marketRush";

function hasMarketAt(month: number, day: number, seed: string): boolean {
  return hashString(`${seed}:market:${month}:${day}:has`) / 4294967296 <= MARKET_CHANCE;
}

/**
 * 抽一条：先按老办法抽，抽到被买断的那条才改抽（批 BB′）。
 *
 * 为什么不直接把被买断的那条从 `pool` 里剔掉：剔池子会让**每一天**的下标整体错位，
 * 哪怕那天的行情本来与对冲无关 —— 存档里「昨天预告的是赶圩，今天变成了台风」。
 * 所以这里走「先抽、抽中了才避让」：没买对冲的日子与原来自洽（替身不买门路，
 * 数字逐位不变），买了对冲的日子只会少那一条。
 */
function pickMarketAt(
  month: number,
  day: number,
  seed: string,
  hedged: ReadonlySet<MarketId> = new Set(),
): MarketDef | null {
  const pool = MARKETS.filter((m) => SEASON[m.id].includes(month));
  if (pool.length === 0) return null;
  const r = hashString(`${seed}:market:${month}:${day}:pick`) / 4294967296;
  const picked = pool[Math.floor(r * pool.length) % pool.length] ?? null;
  if (!picked || !hedged.has(picked.id)) return picked;
  // 抽中了被买断的那条：从剩下的里再抽一次（换一个盐，免得与原来同一条）
  const rest = pool.filter((m) => !hedged.has(m.id));
  if (rest.length === 0) return null;
  const r2 = hashString(`${seed}:market:${month}:${day}:hedge`) / 4294967296;
  return rest[Math.floor(r2 * rest.length) % rest.length] ?? null;
}

/** 某一天（不一定是今天）的行情：给「明天」的预告用，不碰 state.rng */
export function marketOnDay(state: GameState, month: number, day: number): MarketDef | null {
  if (!hasMarketAt(month, day, state.playerId)) return null;
  // 预告看的是「那一天还剩几天对冲」，不是今天
  const ahead = Math.max(0, (month - state.month) * 30 + (day - state.day));
  return pickMarketAt(month, day, state.playerId, hedgedMarketIds(state, ahead));
}

export function todayMarket(state: GameState): MarketDef | null {
  if (roll(state, "has") > MARKET_CHANCE) return null;
  const pool = MARKETS.filter((m) => SEASON[m.id].includes(state.month));
  if (pool.length === 0) return null;
  const idx = Math.floor(roll(state, "pick") * pool.length) % pool.length;
  const picked = pool[idx] ?? null;
  const hedged = hedgedMarketIds(state);
  if (!picked || !hedged.has(picked.id)) return picked;
  const rest = pool.filter((m) => !hedged.has(m.id));
  if (rest.length === 0) return null;
  const idx2 = Math.floor(roll(state, "hedge") * rest.length) % rest.length;
  return rest[idx2] ?? null;
}

/** 今天的行情（给界面与接线读） */
export function marketOf(state: GameState): MarketDef | null {
  return todayMarket(state);
}

/**
 * 今天跟坏事配在一起的那件好事（批 B″，解 P320）。
 *
 * 只给填了 `pair` 的行情算；配对那条要是当月不在季（比如八月撞上修路，
 * 「开学」还没到），退回赶圩 —— 街上总有摊子，别让配对空着。
 */
export function pairedMarketOf(state: GameState): MarketDef | null {
  const m = marketOf(state);
  if (!m || !m.pair) return null;
  const def = MARKET_BY_ID.get(m.pair);
  if (def && SEASON[def.id]?.includes(state.month)) return def;
  return MARKET_BY_ID.get(PAIR_FALLBACK) ?? null;
}

/**
 * 明天的行情（解 P339：配对是当天的，玩家昨天看不出「明天会配哪条」）。
 *
 * 南宁人天天看天气预报，所以「预告一条」不是作弊；预告只给名字，
 * 不给乘数，也不保证玩家能拿它做什么。
 */
export function tomorrowMarketOf(state: GameState): MarketDef | null {
  const day = state.day + 1;
  const month = day > 30 ? state.month + 1 : state.month;
  return marketOnDay(state, month, day > 30 ? 1 : day);
}

/** 明天那条行情配的好事（配对那条不在季就按兜底走） */
export function tomorrowPairOf(state: GameState): MarketDef | null {
  const day = state.day + 1;
  const month = day > 30 ? state.month + 1 : state.month;
  const m = tomorrowMarketOf(state);
  if (!m || !m.pair) return null;
  const def = MARKET_BY_ID.get(m.pair);
  if (def && SEASON[def.id]?.includes(month)) return def;
  return MARKET_BY_ID.get(PAIR_FALLBACK) ?? null;
}

/** 「明天：停水（配发薪日）」—— 没有就返回空串 */
export function tomorrowMarketWords(state: GameState): string {
  const m = tomorrowMarketOf(state);
  if (!m) return "";
  const pair = tomorrowPairOf(state);
  return pair ? `明天：${m.name}（配${pair.name}）` : `明天：${m.name}`;
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
  const pair = pairedMarketOf(state);
  const sum = (a?: number, b?: number): number =>
    (a ?? 0) + (b ?? 0) * PAIR_WEIGHT;
  const totals = {
    attract: sum(m.effect.attractPct, pair?.effect.attractPct),
    patience: sum(m.effect.patiencePct, pair?.effect.patiencePct),
    wallet: sum(m.effect.walletPct, pair?.effect.walletPct),
    cost: sum(m.effect.costPct, pair?.effect.costPct),
  };
  // 借两桶水（批 B″）：停水那条的进店惩罚从 −16% 收回到 −6%
  if (m.id === "waterCut" && goodFixesApplied(state, "waterCut")) {
    totals.attract = -0.06;
  }
  return {
    attract: clampCap(totals.attract),
    patience: clampCap(totals.patience),
    wallet: clampCap(totals.wallet),
    cost: clampCap(totals.cost),
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
/** 「偏偏今天还发薪」这类一句（界面挂在行情后面） */
export function marketPairWords(state: GameState): string {
  const m = marketOf(state);
  const pair = pairedMarketOf(state);
  if (!m || !pair) return "";
  if (m.id === "waterCut" && goodFixesApplied(state, "waterCut")) {
    return "借到了水，人还没散";
  }
  return `好在今天还${pair.name}`;
}

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
