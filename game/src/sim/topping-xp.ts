/**
 * 浇头熟练度（批 A′）：一份浇头做过的碗数，换三件事 —— 味道、损耗、识食客的脸色。
 *
 * 为什么是「浇头」而不是「整碗配方」：老友粉的手艺在**备料**上。
 * 酸笋发得干不干净、猪杂切得厚不厚、豆豉爆到什么火候，都是同一份料重复做出来的手熟，
 * 不是某一条方子独有的。所以这一层长在 `recipe.toppings` 上，与方子、与店铺都解耦。
 *
 * 三条硬规则（写给以后改数值的人）：
 * 1. **只加不减的只有味道**，封顶 +2 分。一碗粉本来 60 分，练满一手只值零点几分，
 *    是因为「手熟」不该盖过「方子对」。
 * 2. **料钱按件折**（每级 2%），不是整碗打折 —— 只有这一份料损耗少了。
 * 3. **不许再抬 `charm`**：`sim/score.ts` 里 `Math.min(100, 30 + (charmBase - 30) * (1 + qualityCharmBoost))`
 *    已经被「头手货 ×1.55」顶到天花板，再抬相等于白送。
 */
import type { GameState } from "./state";

/** 升到 1/2/3 级各需要做过多少碗（下标 0 → 1 级） */
export const XP_STEPS = [50, 150, 400] as const;
export const XP_MAX_LEVEL = 3;
/** 每一级给多少味道分 */
export const XP_TASTE_PER_LEVEL = 0.2;
export const XP_TASTE_CAP = 2;
/** 每一级把这一份料的损耗压掉多少 */
export const XP_COST_PER_LEVEL = 0.02;
/** 每一级让识食客少扣几分 */
export const XP_PICKY_PER_LEVEL = 1;
export const XP_PICKY_CAP = 3;

/** 碗数 → 等级（0–3） */
export function levelOf(xp: number): number {
  let level = 0;
  for (const step of XP_STEPS) {
    if (xp >= step) level += 1;
  }
  return Math.min(XP_MAX_LEVEL, level);
}

/** 距离下一级还要多少碗；满级返回 null */
export function nextStep(xp: number): number | null {
  const level = levelOf(xp);
  if (level >= XP_MAX_LEVEL) return null;
  const need = XP_STEPS[level] as number;
  return Math.max(0, need - xp);
}

/** 一句人话（等级名） */
export function xpWords(level: number): string {
  if (level <= 0) return "生手";
  if (level === 1) return "上手";
  if (level === 2) return "熟练";
  return "拿手";
}

function xpMap(state: GameState): Record<string, number> {
  if (!state.ingredientXp) state.ingredientXp = {};
  return state.ingredientXp;
}

export function toppingXpOf(state: GameState, id: string): number {
  return xpMap(state)[id] ?? 0;
}

export function toppingLevelOf(state: GameState, id: string): number {
  return levelOf(toppingXpOf(state, id));
}

/** 这一碗做出去，每份用到的料各长一碗的经验 */
export function rememberToppings(state: GameState, ids: readonly string[]): void {
  const map = xpMap(state);
  for (const id of ids) map[id] = (map[id] ?? 0) + 1;
}

/** 这一碗用到的料，合起来给多少味道分（封顶 +2） */
export function xpTasteBonus(
  xp: Readonly<Record<string, number>> | undefined,
  ids: readonly string[],
): number {
  if (!xp) return 0;
  let sum = 0;
  for (const id of ids) sum += XP_TASTE_PER_LEVEL * levelOf(xp[id] ?? 0);
  return Math.min(XP_TASTE_CAP, Math.round(sum * 100) / 100);
}

/** 某一份料这一级的损耗系数 */
export function xpCostFactor(
  xp: Readonly<Record<string, number>> | undefined,
  id: string,
): number {
  if (!xp) return 1;
  const level = levelOf(xp[id] ?? 0);
  return Math.max(0.8, 1 - XP_COST_PER_LEVEL * level);
}

/** 这一碗用到的料里，手最熟的那一手能让识食客少扣几分 */
export function xpPickyEase(
  xp: Readonly<Record<string, number>> | undefined,
  ids: readonly string[],
): number {
  if (!xp) return 0;
  let best = 0;
  for (const id of ids) best = Math.max(best, levelOf(xp[id] ?? 0));
  return Math.min(XP_PICKY_CAP, best * XP_PICKY_PER_LEVEL);
}

/** 缓存键：只跟这一碗用到的那几份料的等级有关 */
export function xpKey(
  xp: Readonly<Record<string, number>> | undefined,
  ids: readonly string[],
): string {
  if (!xp) return "";
  return ids.map((id) => levelOf(xp[id] ?? 0)).join("");
}

/** 册子上的一句：手里有几手是拿手的 */
export function xpSummary(state: GameState): string {
  const map = xpMap(state);
  const ids = Object.keys(map);
  if (ids.length === 0) return "还没有哪一手是练出来的";
  const levels = ids.map((id) => levelOf(map[id] ?? 0));
  const top = Math.max(...levels);
  const hands = levels.filter((lv) => lv >= 2).length;
  if (top <= 0) return `做过 ${ids.length} 种料，都还是生手`;
  return `拿手 ${hands} 手 · 最高「${xpWords(top)}」`;
}
