import {
  CHANNELS,
  CHANNEL_BY_ID,
  CHANNEL_TOTAL,
  PRICE_CEIL,
  PRICE_FLOOR,
  RETAILS,
  RETAIL_LOAD_BOWL,
  type ChannelDef,
  type ChannelId,
  type RetailDef,
  type RetailId,
} from "../data/retail";
import type { GameState } from "./state";

/**
 * 零售线的业务层（批次七）。
 *
 * 三条纪律：
 *  1. **货与碗抢同一份产能**：每天能做的件数很少，且每件都从当天的碗数里扣。
 *     这是这条线唯一的取舍，不能免费 —— 不然「多开一条线」就变成白拿钱。
 *  2. 价格越高量越低（弹性），但压到出厂价以下不许卖（那是做慈善）。
 *  3. 抽成与退货都按渠道算；渠道有段位门槛（门口无门槛、便利店段 4、电商段 7）。
 */

export interface RetailStock {
  channel: ChannelId;
  /** 每款自己定的零售价（元） */
  prices: Record<string, number>;
  /** 累计卖出的件数（每款），用来触发「第一次卖到五十件」 */
  sold: Record<string, number>;
}

export function defaultRetail(): RetailStock {
  const prices: Record<string, number> = {};
  for (const g of RETAILS) prices[g.id] = g.suggestYuan;
  return { channel: "door", prices, sold: {} };
}

/** 兼容老档：面板与结算都从这里取，不许直接摸 state.retail。 */
export function retailOf(state: GameState): RetailStock {
  if (!state.retail) {
    state.retail = defaultRetail() as unknown as GameState["retail"];
  }
  const r = state.retail as unknown as RetailStock;
  if (!r.prices) r.prices = defaultRetail().prices;
  if (!r.sold) r.sold = {};
  if (!CHANNEL_BY_ID.has(r.channel)) r.channel = "door";
  return r;
}

export function channelOf(state: GameState): ChannelDef {
  return CHANNEL_BY_ID.get(retailOf(state).channel) ?? CHANNELS[0]!;
}

export function setChannel(state: GameState, id: string): boolean {
  const def = CHANNEL_BY_ID.get(id);
  if (!def) return false;
  if ((state.gradeLevel ?? 0) < def.gradeGate) return false;
  const r = retailOf(state);
  if (r.channel === def.id) return false;
  r.channel = def.id;
  return true;
}

/** 定价：只认表内款，且夹在建议价的 70%–130%。 */
export function priceOf(state: GameState, id: string): number {
  const def = RETAILS.find((g) => g.id === id);
  if (!def) return 0;
  const r = retailOf(state);
  const raw = r.prices[id];
  const fallback = def.suggestYuan;
  const v = typeof raw === "number" && Number.isFinite(raw) ? raw : fallback;
  return Math.round(clamp(v, def.suggestYuan * PRICE_FLOOR, def.suggestYuan * PRICE_CEIL) * 10) / 10;
}

export function setPrice(state: GameState, id: string, next: number): boolean {
  const def = RETAILS.find((g) => g.id === id);
  if (!def) return false;
  const r = retailOf(state);
  const clamped = Math.round(clamp(next, def.suggestYuan * PRICE_FLOOR, def.suggestYuan * PRICE_CEIL) * 10) / 10;
  if (Math.abs(priceOf(state, id) - clamped) < 0.05) return false;
  r.prices[id] = clamped;
  return true;
}

/**
 * 每天能做几件货：案台档位 × 店员数。
 *
 * 为什么是这两个：做货是**备料活**，压在同一张案台、同一双手上（开罗同理：干面饼占制作时间）。
 * 新局一台案台、一个人，一天只出得了三四件 —— 想多出就得多请人、多买案台，
 * 而这两样本来也是堂食要的东西，于是取舍自然出现。
 */
export function retailThroughput(state: GameState): number {
  const bench = Math.max(0, state.equipment?.bench ?? 0);
  const crew = (state.staff?.roster ?? []).length;
  const raw = 3 + bench * 2 + crew * 1.5;
  return Math.max(1, Math.round(raw));
}

/** 价格弹性：以建议零售价为 1.0，卖便宜量涨、卖贵量跌。 */
export function demandFactor(def: RetailDef, price: number): number {
  const ratio = price / Math.max(0.01, def.suggestYuan);
  return clamp(1.6 - 0.6 * ratio, 0.25, 1.4);
}

/** 某款一天能卖几件（受总产能、渠道走量、价格弹性一起限）。 */
export function unitsOf(state: GameState, id: string): number {
  const def = RETAILS.find((g) => g.id === id);
  if (!def) return 0;
  const ch = channelOf(state);
  const budget = retailThroughput(state) / Math.max(0.4, def.load);
  const raw = budget * ch.volume * demandFactor(def, priceOf(state, id)) * 0.9;
  return Math.max(0, Math.round(raw));
}

export interface RetailLine {
  def: RetailDef;
  price: number;
  units: number;
  revenue: number;
  cost: number;
  net: number;
}

/** 一天整条线的明细（面板与日结共用）。 */
export function retailLines(state: GameState): RetailLine[] {
  const ch = channelOf(state);
  return RETAILS.map((def) => {
    const price = priceOf(state, def.id);
    const units = unitsOf(state, def.id);
    const gross = units * price * (1 - ch.cut) * (1 - ch.returnRate);
    const cost = units * def.costYuan;
    return {
      def,
      price,
      units,
      revenue: Math.round(gross * 100) / 100,
      cost: Math.round(cost * 100) / 100,
      net: Math.round((gross - cost) * 100) / 100,
    };
  });
}

export function retailTotals(state: GameState): { units: number; revenue: number; cost: number; net: number } {
  const lines = retailLines(state);
  const units = lines.reduce((n, l) => n + l.units, 0);
  const revenue = lines.reduce((n, l) => n + l.revenue, 0);
  const cost = lines.reduce((n, l) => n + l.cost, 0);
  return {
    units,
    revenue: Math.round(revenue * 100) / 100,
    cost: Math.round(cost * 100) / 100,
    net: Math.round((revenue - cost) * 100) / 100,
  };
}

/** 做货占掉的碗数：与堂食抢产能，直接从当天上限里扣。 */
export function retailBowlLoad(state: GameState): number {
  return Math.round(retailTotals(state).units * RETAIL_LOAD_BOWL * 10) / 10;
}

/**
 * 打烊结算：把今天做的货卖出去。
 *
 * 与 `settlePack` 并列（A7 那台机器是「一号货」的老版本，货架是它的扩展）。
 * 只有在货架上真定了价、且段位够得着渠道时才出货。
 */
export function settleRetail(state: GameState): { units: number; net: number } {
  const t = retailTotals(state);
  if (t.units <= 0) return { units: 0, net: 0 };
  state.cash += t.net;
  state.tally.retailSold = (state.tally.retailSold ?? 0) + t.units;
  const r = retailOf(state);
  for (const line of retailLines(state)) {
    r.sold[line.def.id] = (r.sold[line.def.id] ?? 0) + line.units;
  }
  return { units: t.units, net: t.net };
}

/** 第一次卖到五十件的那一款（没有就 null）—— AI 落点 16 的触发条件。 */
export function firstRetailMilestone(state: GameState): RetailDef | null {
  const r = retailOf(state);
  for (const g of RETAILS) {
    const sold = r.sold[g.id] ?? 0;
    if (sold >= 50 && !state.flow.retailVoiceDone?.includes(g.id)) return g;
  }
  return null;
}

export function markRetailVoice(state: GameState, id: string): void {
  const done = state.flow.retailVoiceDone ?? [];
  if (!done.includes(id)) state.flow.retailVoiceDone = [...done, id];
}

export function retailSummary(state: GameState): string {
  const t = retailTotals(state);
  const ch = channelOf(state);
  return `${ch.name} · 每天 ${t.units} 件 · 净 ¥${Math.round(t.net).toLocaleString("zh-CN")}`;
}

export function channelSummary(state: GameState): string {
  return CHANNELS.map((c) => (c.id === channelOf(state).id ? `「${c.name}」` : c.name)).join(" ／ ");
}
export { CHANNEL_TOTAL };

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

export type { ChannelId, RetailId };
