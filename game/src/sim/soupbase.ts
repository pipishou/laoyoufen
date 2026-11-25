/**
 * 汤底三底（批 Z′）—— 读状态那一侧。
 *
 * 与「骨两档」「碗五只」一样，只在**两个已有出口**上加钱加味：
 * `soup`（汤底分）与 `cost`（每碗料钱）。不碰客流、耐心、出碗、满意度。
 */

import type { GameState } from "./state";
import { DEFAULT_SOUP_BASE, SOUP_BASES, soupBaseById, type SoupBaseDef } from "../data/soupbase";

export interface SoupBaseView {
  def: SoupBaseDef;
  /** 现在这一款就在用这一底 */
  on: boolean;
  /** 客人够不够 */
  unlocked: boolean;
  /** 还差几位客人 */
  short: number;
}

/** 现在这一款用的是哪一底 */
export function soupBaseOf(state: GameState): SoupBaseDef {
  return soupBaseById(state.recipe?.base);
}

export function soupBaseViews(state: GameState): SoupBaseView[] {
  const cur = soupBaseOf(state).id;
  return SOUP_BASES.map((def) => ({
    def,
    on: def.id === cur,
    unlocked: state.totalCustomers >= def.needCustomers,
    short: Math.max(0, def.needCustomers - state.totalCustomers),
  }));
}

export interface SoupBaseResult {
  ok: boolean;
  reason?: string;
  /** 成功时回一句（面板给 toast 用） */
  line?: string;
}

/** 换底：改编辑缓冲；落笔由调用方 `syncEditing()` 负责 */
export function setSoupBase(state: GameState, id: string): SoupBaseResult {
  const def = SOUP_BASES.find((b) => b.id === id);
  if (!def) return { ok: false, reason: "没有这一底" };
  if (state.totalCustomers < def.needCustomers) {
    return { ok: false, reason: `还差 ${def.needCustomers - state.totalCustomers} 位客人` };
  }
  if (soupBaseOf(state).id === def.id) return { ok: false, reason: `本来就是${def.name}` };
  state.recipe.base = def.id;
  return { ok: true, line: `换成${def.name}：${def.look}。` };
}

/** 面板摘要：现在拿什么打底 */
export function soupBaseSummary(state: GameState): string {
  const def = soupBaseOf(state);
  const parts: string[] = [def.name];
  if (def.soupDelta !== 0) parts.push(`汤底 ${def.soupDelta > 0 ? "+" : ""}${def.soupDelta}`);
  if (def.costDelta !== 0) parts.push(`料钱 ${def.costDelta > 0 ? "+" : ""}¥${def.costDelta}`);
  return parts.join(" · ");
}

/** 三底里还没解锁的那几档，写一句「还差几位客人」 */
export function soupBaseLockWords(state: GameState): string {
  const locked = soupBaseViews(state).filter((v) => !v.unlocked);
  if (locked.length === 0) return "三底都开得了";
  return locked.map((v) => `${v.def.name}还差 ${v.short} 位`).join("、");
}

export { DEFAULT_SOUP_BASE };
