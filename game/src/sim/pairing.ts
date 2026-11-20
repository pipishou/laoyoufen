/**
 * 配料组合的计算（A2）。纯函数：同样的两件浇头永远得到同样的结论，
 * 不进存档、不消耗随机数 —— 服务端可以原样复算。
 *
 * 与 `sim/flavor.ts` 的分工：
 *   pairing（24 条两件套）＝ 顺手，加成小、几乎随时能凑；
 *   flavor（7 条三件套/粉型）＝ 讲究，加成大、要凑齐还得看季节。
 * 两层可以同时成立，但各自有 CAP，加起来也不会把数值顶爆。
 */
import { PAIRINGS, PAIRING_TOTAL, type PairingDef, type PairingEffect } from "../data/pairing";

/**
 * 总量封顶。比味道层再小一档：两件套是「顺手」，不该压过成型的吃法。
 */
export const PAIR_CAP = {
  soup: 3,
  charm: 3,
  sat: 2,
  patiencePct: 0.06,
  costPct: 0.03,
  servePct: 0.04,
} as const;

export interface PairBonus {
  soup: number;
  charm: number;
  sat: number;
  patiencePct: number;
  costPct: number;
  servePct: number;
}

const EMPTY: PairBonus = { soup: 0, charm: 0, sat: 0, patiencePct: 0, costPct: 0, servePct: 0 };

/** 这一搭成立吗：两件都在碗里 */
export function pairingActive(def: PairingDef, toppings: readonly string[]): boolean {
  return def.pair.every((id) => toppings.includes(id));
}

/** 成立的组合（按表序，面板与播报都按这个顺序） */
export function pairingHits(toppings: readonly string[]): PairingDef[] {
  return PAIRINGS.filter((def) => pairingActive(def, toppings));
}

/** 24 条加起来的净效果，逐项 clamp 到 `PAIR_CAP` */
export function pairingBonus(toppings: readonly string[]): PairBonus {
  const hits = pairingHits(toppings);
  if (hits.length === 0) return { ...EMPTY };
  const sum = { ...EMPTY };
  for (const def of hits) {
    const e: PairingEffect = def.effect;
    sum.soup += e.soup ?? 0;
    sum.charm += e.charm ?? 0;
    sum.sat += e.sat ?? 0;
    sum.patiencePct += e.patiencePct ?? 0;
    sum.costPct += e.costPct ?? 0;
    sum.servePct += e.servePct ?? 0;
  }
  return {
    soup: Math.min(PAIR_CAP.soup, sum.soup),
    charm: Math.min(PAIR_CAP.charm, sum.charm),
    sat: Math.min(PAIR_CAP.sat, sum.sat),
    patiencePct: Math.min(PAIR_CAP.patiencePct, sum.patiencePct),
    costPct: Math.min(PAIR_CAP.costPct, sum.costPct),
    servePct: Math.min(PAIR_CAP.servePct, sum.servePct),
  };
}

// ── 四个乘数入口（与 gear / flavor / combo 同一个写法：只乘，不加） ──

/** 料钱：1 → 0.97（省 3% 封顶） */
export function pairCostFactor(toppings: readonly string[]): number {
  return 1 - pairingBonus(toppings).costPct;
}

/** 出碗时间：1 → 0.96（快 4% 封顶） */
export function pairServeFactor(toppings: readonly string[]): number {
  return 1 - pairingBonus(toppings).servePct;
}

/** 耐心：1 → 1.06 */
export function pairPatienceMult(toppings: readonly string[]): number {
  return 1 + pairingBonus(toppings).patiencePct;
}

/** 满意度点数 */
export function pairSatBonus(toppings: readonly string[]): number {
  return pairingBonus(toppings).sat;
}

// ── 面板 ──

export interface PairingView {
  def: PairingDef;
  active: boolean;
  /** 还差哪一件（未成立时给中文名） */
  missing: string[];
}

export interface PairingViewInput {
  toppings: readonly string[];
  nameOf?: (id: string) => string;
}

export function pairingViews(input: PairingViewInput): PairingView[] {
  const nameOf = input.nameOf ?? ((id: string) => id);
  return PAIRINGS.map((def) => {
    const active = pairingActive(def, input.toppings);
    const missing = active ? [] : def.pair.filter((id) => !input.toppings.includes(id)).map(nameOf);
    return { def, active, missing };
  });
}

/** 「凑成 3 / 24 搭」 */
export function pairingSummary(toppings: readonly string[]): string {
  return `凑成 ${pairingHits(toppings).length} / ${PAIRING_TOTAL} 搭`;
}

/** 差一件就成的搭（面板提示用），没有就 null */
export function nearlyPairing(toppings: readonly string[]): PairingDef | null {
  for (const def of PAIRINGS) {
    if (pairingActive(def, toppings)) continue;
    const miss = def.pair.filter((id) => !toppings.includes(id));
    if (miss.length === 1) return def;
  }
  return null;
}
