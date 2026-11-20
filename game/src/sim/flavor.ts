/**
 * 味道层的计算（B1）。纯函数：同样的浇头 + 粉型永远得到同样的结论，
 * 不进存档、不消耗随机数 —— 服务端可以原样复算。
 *
 * 为什么不 import `sim/menu.ts` / `sim/state.ts`：这一层只认
 * 「浇头 id 列表 + 粉型」两个入参，顾客循环、评分、面板三个地方都能直接调，
 * 谁调用谁负责把这两个值递进来。少一层依赖，就少一次循环 import 的机会
 * （`sim/combo.ts` 的教训）。
 */

import { FLAVORS, FLAVOR_TOTAL, type FlavorDef, type FlavorEffect } from "../data/flavor";

/**
 * 总量封顶：六条同时成立也不能把数值顶爆。
 * 取值的思路与 `sim/combo.ts` 的 `COMBO_CAP` 一致 ——
 * 单条能感知，全开也不超过一个「大件」的量级。
 */
export const FLAVOR_CAP = {
  soup: 5,
  charm: 6,
  sat: 4,
  patiencePct: 0.12,
  costPct: 0.06,
  servePct: 0.08,
} as const;

export interface FlavorBonus {
  soup: number;
  charm: number;
  sat: number;
  patiencePct: number;
  costPct: number;
  servePct: number;
}

const EMPTY: FlavorBonus = { soup: 0, charm: 0, sat: 0, patiencePct: 0, costPct: 0, servePct: 0 };

/** 这条成立吗：浇头齐全 + 粉型对得上（没写粉型就是任何粉型都行） */
export function flavorActive(def: FlavorDef, toppings: readonly string[], noodle: string): boolean {
  if (def.noodle && def.noodle !== noodle) return false;
  return def.toppings.every((id) => toppings.includes(id));
}

/** 成立的组合（按表序，面板与播报都按这个顺序，别用 Set 的迭代顺序） */
export function flavorHits(toppings: readonly string[], noodle: string): FlavorDef[] {
  return FLAVORS.filter((def) => flavorActive(def, toppings, noodle));
}

/** 六条加起来的净效果，逐项 clamp 到 `FLAVOR_CAP` */
export function flavorBonus(toppings: readonly string[], noodle: string): FlavorBonus {
  const hits = flavorHits(toppings, noodle);
  if (hits.length === 0) return { ...EMPTY };
  const sum = { ...EMPTY };
  for (const def of hits) {
    const e: FlavorEffect = def.effect;
    sum.soup += e.soup ?? 0;
    sum.charm += e.charm ?? 0;
    sum.sat += e.sat ?? 0;
    sum.patiencePct += e.patiencePct ?? 0;
    sum.costPct += e.costPct ?? 0;
    sum.servePct += e.servePct ?? 0;
  }
  return {
    soup: Math.min(FLAVOR_CAP.soup, sum.soup),
    charm: Math.min(FLAVOR_CAP.charm, sum.charm),
    sat: Math.min(FLAVOR_CAP.sat, sum.sat),
    patiencePct: Math.min(FLAVOR_CAP.patiencePct, sum.patiencePct),
    costPct: Math.min(FLAVOR_CAP.costPct, sum.costPct),
    servePct: Math.min(FLAVOR_CAP.servePct, sum.servePct),
  };
}

// ── 四个乘数入口（与 sim/gear.ts 同一个写法：只乘，不加） ──

/** 料钱：1 → 0.94（省 6% 封顶） */
export function flavorCostFactor(toppings: readonly string[], noodle: string): number {
  return 1 - flavorBonus(toppings, noodle).costPct;
}

/** 出碗时间：1 → 0.92（快 8% 封顶） */
export function flavorServeFactor(toppings: readonly string[], noodle: string): number {
  return 1 - flavorBonus(toppings, noodle).servePct;
}

/** 耐心：1 → 1.12 */
export function flavorPatienceMult(toppings: readonly string[], noodle: string): number {
  return 1 + flavorBonus(toppings, noodle).patiencePct;
}

/** 满意度点数（进 settle 的 bonus 链，与 gear / 当季粉型 / 主料加成相加） */
export function flavorSatBonus(toppings: readonly string[], noodle: string): number {
  return flavorBonus(toppings, noodle).sat;
}

// ── 面板 ──

export interface FlavorView {
  def: FlavorDef;
  active: boolean;
  /** 还差哪几味（未成立时给名字，面板上直接列） */
  missing: string[];
}

export interface FlavorViewInput {
  toppings: readonly string[];
  noodle: string;
  /** 用于把缺失浇头翻译成中文名（不传就退回 id，别让面板崩） */
  nameOf?: (id: string) => string;
}

export function flavorViews(input: FlavorViewInput): FlavorView[] {
  const nameOf = input.nameOf ?? ((id: string) => id);
  return FLAVORS.map((def) => {
    const active = flavorActive(def, input.toppings, input.noodle);
    const missing = active ? [] : def.toppings.filter((id) => !input.toppings.includes(id)).map(nameOf);
    return { def, active, missing };
  });
}

/** 「老友三味 · 猪杂三样（2/6）」—— 没成立就写条数，别空着 */
export function flavorSummary(toppings: readonly string[], noodle: string): string {
  const hits = flavorHits(toppings, noodle);
  if (hits.length === 0) return `没凑成（0/${FLAVOR_TOTAL}）`;
  return `${hits.map((h) => `「${h.name}」`).join(" · ")}（${hits.length}/${FLAVOR_TOTAL}）`;
}

/** 差一味就成的组合（面板顶部提示用），没有就 null */
export function nearlyFlavor(toppings: readonly string[], noodle: string): FlavorDef | null {
  for (const def of FLAVORS) {
    if (flavorActive(def, toppings, noodle)) continue;
    if (def.noodle && def.noodle !== noodle) continue;
    const miss = def.toppings.filter((id) => !toppings.includes(id));
    if (miss.length === 1) return def;
  }
  return null;
}
