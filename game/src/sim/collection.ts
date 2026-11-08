import { CUSTOMER_ARCHETYPES, LIKE_DIMS_ORDER, type LikeDim } from "../data/customers";
import type { GameState } from "./state";

export type CollectionKind = "toppings" | "customers" | "grades" | "provinces" | "likes";

/**
 * 图鉴解锁：只增不减，数组上限很小（34 浇头 / 24 顾客 / 5 评级 / 34 省）。
 * 返回 true 表示这次是新解锁，HUD 可以弹提示。
 */
export function unlock(state: GameState, kind: CollectionKind, id: string): boolean {
  const list = state.collection[kind];
  if (list.includes(id)) return false;
  list.push(id);
  return true;
}

export function isUnlocked(state: GameState, kind: CollectionKind, id: string): boolean {
  return state.collection[kind].includes(id);
}

/**
 * 每位顾客 3 个喜好维度：粉宽 / 粉型 / 汤种。
 * 对应开罗 data.Customer.ramen_[3]（RAMEN_N_THICK / RAMEN_N_SHAPE / RAMEN_S_TYPE）。
 */
export const LIKE_DIMS = LIKE_DIMS_ORDER.length;
/** 喜好总数 = 原型数 × 维度数。 */
export const LIKES_TOTAL = CUSTOMER_ARCHETYPES.length * LIKE_DIMS;

export interface CollectionProgress {
  toppings: number;
  customers: number;
  grades: number;
  provinces: number;
  likes: number;
}

export function collectionProgress(state: GameState): CollectionProgress {
  return {
    toppings: state.collection.toppings.length,
    customers: state.collection.customers.length,
    grades: state.collection.grades.length,
    provinces: state.collection.provinces.length,
    likes: state.collection.likes.length,
  };
}

/**
 * 开罗 data.Customer.GetLikeFoundRatio 的对应物：已发现喜好 / 总喜好。
 * 只读派生值，不进存档。
 */
export function likeFoundRatio(state: GameState): number {
  return LIKES_TOTAL === 0 ? 0 : state.collection.likes.length / LIKES_TOTAL;
}

export interface LikeDimStat {
  dim: LikeDim;
  /** 这个维度上已发现的顾客数 */
  found: number;
  /** 这个维度的顾客总数（= 原型数） */
  total: number;
}

/**
 * 开罗 data.RallyData.GetLikeSoupNum / GetLikeNoodlesNum 的对应物：
 * 按维度统计「有多少顾客的这一口已经被发现」，用于图鉴的分维进度。
 */
export function likeStats(state: GameState): LikeDimStat[] {
  return LIKE_DIMS_ORDER.map((dim) => {
    const suffix = `:${dim}`;
    return {
      dim,
      found: state.collection.likes.filter((id) => id.endsWith(suffix)).length,
      total: CUSTOMER_ARCHETYPES.length,
    };
  });
}
