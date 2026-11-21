/**
 * 四维九档的**读法**（不算分，只说话）。
 *
 * 三个入口：
 *   `dimValues(item, score)` —— 把 `RecipeScore` 摊成味/镬/饱/相四个 0–100
 *   `tierBoard(item, score)` —— 四维各自的档位与评语（HUD 四条九格用这个）
 *   `tierLine(item, score)` —— 一行短句（菜单卡片、打烊单用）
 *
 * 为什么「饱」要自己算：`score.ts` 里没有份量维——份量和主料只动成本
 * （P46 的决定：口味是配方的事，卖什么不归口味管）。但客人确实会因为
 * 「吃不饱」骂人，所以这一维在评分之外单独推，且**只读不写**。
 */

import { mainCostYuan } from "../data/mains";
import type { RecipeScore } from "./score";
import {
  DIMS,
  DIM_ORDER,
  TIER_CUTS,
  TIER_TOTAL,
  tierOf,
  tierWord,
  tierWords,
  type DimId,
} from "../data/tier";

/** 一维的读数 */
export interface DimReading {
  id: DimId;
  name: string;
  /** 0–100 */
  value: number;
  /** 1–9 */
  tier: number;
  /** 这一档客人的原话 */
  words: string;
  /** 「第五档」 */
  word: string;
}

/** 只看这两格，别的字段不参与——方便测试与外部复用 */
export interface FillInput {
  portion: number;
  main: string;
  toppingCount: number;
}

/**
 * 饱度：42 分起步（二两碎肉、不放料），三样东西往上抬——
 *   ① 份量：三两 +16（这是唯一一份「真的多下了粉」的钱）
 *   ② 主料：按料钱折算，封顶 +14（牛腩比碎肉压饿，贵也贵在这）
 *   ③ 配料件数：每件 +3，封顶 +15（四件以上不再加：碗就这么大）
 * 三项都是「多下料」，所以都封顶，不许靠堆料堆出一个九档的饱。
 */
export function fillOf(input: FillInput): number {
  const portion = Number.isFinite(input.portion) ? input.portion : 2;
  const more = Math.max(0, portion - 2) * 16;
  const main = Math.min(14, Math.max(0, mainCostYuan(input.main)) * 5);
  const tops = Math.min(15, Math.max(0, input.toppingCount) * 3);
  const v = 42 + more + main + tops;
  return Math.round(Math.min(100, Math.max(0, v)));
}

/** 摊成四维：味←汤分、镬←粉分、饱←份量主料配料、相←魅力 */
export function dimValues(
  item: { main: string; portion: number; recipe: { toppings: readonly string[] } },
  score: Pick<RecipeScore, "soup" | "noodle" | "charm">,
): Record<DimId, number> {
  return {
    taste: Math.round(score.soup),
    wok: Math.round(score.noodle),
    fill: fillOf({ portion: item.portion, main: item.main, toppingCount: item.recipe.toppings.length }),
    look: Math.round(score.charm),
  };
}

/** 四维档位表（HUD 四条九格） */
export function tierBoard(
  item: { main: string; portion: number; recipe: { toppings: readonly string[] } },
  score: Pick<RecipeScore, "soup" | "noodle" | "charm">,
): DimReading[] {
  const values = dimValues(item, score);
  return DIM_ORDER.map((id) => {
    const def = DIMS.find((d) => d.id === id)!;
    const value = values[id];
    const tier = tierOf(value);
    return { id, name: def.name, value, tier, words: tierWords(id, tier), word: tierWord(tier) };
  });
}

/** 四维里最低的那一维（评语、钩子、评委都用它找「差在哪」） */
export function weakestDim(
  item: { main: string; portion: number; recipe: { toppings: readonly string[] } },
  score: Pick<RecipeScore, "soup" | "noodle" | "charm">,
): DimReading {
  const board = tierBoard(item, score);
  return board.reduce((a, b) => (b.tier < a.tier ? b : a), board[0]!);
}

/** 一行短句：「味 七 · 镬 五 · 饱 六 · 相 四」 */
export function tierLine(
  item: { main: string; portion: number; recipe: { toppings: readonly string[] } },
  score: Pick<RecipeScore, "soup" | "noodle" | "charm">,
): string {
  const board = tierBoard(item, score);
  return board.map((r) => `${r.name} ${numOf(r.tier)}`).join(" · ");
}

/** 档位数字用中文，避免界面上出现「味 7」这种生硬写法 */
const CN_NUM = ["", "一", "二", "三", "四", "五", "六", "七", "八", "九"] as const;

export function numOf(tier: number): string {
  const t = Math.min(TIER_TOTAL, Math.max(1, Math.round(tier)));
  return CN_NUM[t]!;
}

/** 四维平均档（0–100 的加权平均后再落桶，只用于「整体几档」） */
export function overallTier(
  item: { main: string; portion: number; recipe: { toppings: readonly string[] } },
  score: Pick<RecipeScore, "soup" | "noodle" | "charm">,
): number {
  const v = dimValues(item, score);
  const avg = (v.taste + v.wok + v.fill + v.look) / 4;
  return tierOf(avg);
}

/** 九格条的填充数（HUD 直接铺 on/off） */
export function tierCells(tier: number): boolean[] {
  const t = Math.min(TIER_TOTAL, Math.max(0, Math.round(tier)));
  return Array.from({ length: TIER_TOTAL }, (_, i) => i < t);
}

/**
 * 客人的一句评价（AI 落点 `tier_voice` 的触发条件）。
 *
 * 只在高档或低档才说：中间几档是「家常」，家家户户都是这个味，
 * 客人不会特意开口——**在没有可说之处开口，是机器味的第一来源**。
 * 低档挑最差的那一维（人先记住的是缺点），高档挑最亮的那一维。
 */
export interface TierRemark {
  dim: DimId;
  name: string;
  tier: number;
  words: string;
}

export function tierRemark(
  item: { main: string; portion: number; recipe: { toppings: readonly string[] } },
  score: Pick<RecipeScore, "soup" | "noodle" | "charm">,
): TierRemark | null {
  const board = tierBoard(item, score);
  const low = board.reduce((a, b) => (b.tier < a.tier ? b : a), board[0]!);
  if (low.tier <= 3) return { dim: low.id, name: low.name, tier: low.tier, words: low.words };
  const high = board.reduce((a, b) => (b.tier > a.tier ? b : a), board[0]!);
  if (high.tier >= 8) return { dim: high.id, name: high.name, tier: high.tier, words: high.words };
  return null;
}

/** 边界表给 UI 与测试共用 */
export const TIER_BOUNDS: readonly number[] = TIER_CUTS;
