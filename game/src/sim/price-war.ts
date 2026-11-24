/**
 * 比价（批次 4.5 的后半）。
 *
 * 开罗 `enemy_store` 里每家同行有自己的菜单与价目，玩家看得见「他卖多少」，
 * 于是「定价」变成一个真的有对手的决策。我们原来只有 `signature.price` 一个数，
 * 比价退化成一条直线：比他便宜就赢 → 唯一策略是往下压价（缺口 P153）。
 *
 * 这一层给同行加上「便宜的引流款 + 贵的主力款」这副真实的牌之后，规则改成：
 *   ① 只看**这条街的中间价**——两家两款的平均数（街坊心里的「这条街一碗粉几多钱」
 *      取的是中位，不是最低那款；拿自家老友粉去比人家六块钱的素粉，本来就不公道）；
 *   ② **味道压得住时，价牌不算数**：你的味道比他最好的那款高出 10 分以上，
 *      这家抢客力度打折（识食的不看价牌）。这条是为了不让压价成为唯一解；
 *   ③ 贵了扣、便宜了加，但两边都有上限（`PRICE_WAR_CAP`），
 *      所以压到成本线以下只是白亏，换不来无限客流。
 */

import { RIVAL_BY_ID, rivalsOfDistrict, type RivalDef } from "../data/rivals";
import { currentDish, menuBestTaste } from "./menu";
import type { GameState } from "./state";

export const PRICE_WAR_CAP = 0.12;
/** 味道领先多少分算「压得住」（不看价牌） */
export const TASTE_SHIELD = 10;

export interface PriceRow {
  id: string;
  shop: string;
  /** 他家两款与价（菜单原文，面板直接念） */
  dish: string;
  /** 这条街的中间价：两款的平均（比价看这个，不看最低那款） */
  price: number;
  /** 我 − 他：正数我贵 */
  gap: number;
  /** 味道压得住，这家的价牌不影响客流 */
  shielded: boolean;
}

function cheapestOf(def: RivalDef): { dish: string; price: number } {
  const s = def.signature;
  const avg = Math.round(((s.price + def.second.price) / 2) * 10) / 10;
  return { dish: `${s.name} ¥${s.price} ／ ${def.second.name} ¥${def.second.price}`, price: avg };
}

function bestTasteOf(def: RivalDef): number {
  return Math.max(def.signature.taste, def.second.taste);
}

/**
 * 味道能不能压住他家的价牌。
 *
 * 单拎出来是为了能直接测：领先 `TASTE_SHIELD` 分以上，这家客人就不看价牌 ——
 * 现实里也是，识食的老客宁愿走两条巷子，不会因为隔壁便宜两块就换。
 */
export function shieldedBy(myTaste: number, rivalBestTaste: number): boolean {
  return myTaste >= rivalBestTaste + TASTE_SHIELD;
}

/** 本区还在开着的同行，每家一行比价 */
export function rivalPrices(state: GameState): PriceRow[] {
  const district = state.district || "xingning";
  const mine = currentDish(state)?.price ?? 0;
  const myTaste = menuBestTaste(state);
  const rows: PriceRow[] = [];
  for (const def of rivalsOfDistrict(district)) {
    const rs = (state.rivals ?? []).find((r) => r.id === def.id);
    if (rs?.closed) continue;
    if ((state.takenOver ?? []).includes(def.id)) continue;
    const c = cheapestOf(def);
    rows.push({
      id: def.id,
      shop: def.name,
      dish: c.dish,
      price: c.price,
      gap: Math.round((mine - c.price) * 10) / 10,
      shielded: shieldedBy(myTaste, bestTasteOf(def)),
    });
  }
  return rows.sort((a, b) => b.gap - a.gap);
}

/** 比价对进店的乘数：0.88–1.06 */
export function priceWarMult(state: GameState): number {
  const rows = rivalPrices(state);
  if (rows.length === 0) return 1;
  // R-5（二次确认）：家数从 8 涨到 16 之后，原来「按条数摊薄」的写法会让
  // 多出来的八家把每家的影响摊成一半 —— 街上一半的店换人，比价乘数几乎不动。
  // 改成两层：① 全街平均（份量不变，按家数取均）；② 最近三家（街坊真会走的那几家）
  // 各给一点权重。两层相加再夹住上限。
  let sum = 0;
  for (const r of rows) {
    const weight = r.shielded ? 0.25 : 1;
    sum += r.gap * weight;
  }
  const avg = sum / rows.length;
  // 最近三家：`rivalPrices` 已按 gap 从大到小排好，取前三就是「比你便宜最多的三家」
  const near = rows.slice(0, 3);
  let nearSum = 0;
  for (const r of near) nearSum += r.gap * (r.shielded ? 0.25 : 1);
  const nearAvg = near.length > 0 ? nearSum / near.length : 0;
  // 贵 ¥1 → −2%；全街占七成、最近三家占三成
  const mult = 1 - (avg * 0.7 + nearAvg * 0.3) * 0.02;
  return Math.max(1 - PRICE_WAR_CAP, Math.min(1 + PRICE_WAR_CAP / 2, mult));
}

/** 面板与打烊单用的一句话 */
export function priceWarWords(state: GameState): string {
  const rows = rivalPrices(state);
  if (rows.length === 0) return "这条街暂时没有同行在卖";
  const mine = currentDish(state)?.price ?? 0;
  const worst = rows[0]!;
  if (worst.gap <= 0) {
    return `你 ¥${mine}，比${worst.shop}的中间价（¥${worst.price}）还便宜 ¥${Math.abs(worst.gap)}`;
  }
  return `你 ¥${mine}，比${worst.shop}的中间价（¥${worst.price}）贵 ¥${worst.gap}`;
}

/** 给 AI 的名词（只用名词，不带数字） */
export function priceWarContext(state: GameState): Record<string, string> {
  const rows = rivalPrices(state);
  const worst = rows[0];
  if (!worst) return { 街: "这条街", 事: "没有同行" };
  const def = RIVAL_BY_ID.get(worst.id);
  return {
    街: def?.name ?? worst.shop,
    事: worst.gap > 0 ? "他家的便宜粉比你便宜" : "你的价比他家低",
    粉: worst.dish,
  };
}
