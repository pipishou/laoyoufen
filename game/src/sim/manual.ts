import type { GameState } from "./state";
import { MANUAL_TOTAL } from "../data/manual";

/**
 * 手册「读过」标记（批 AD′，解 P387）。
 *
 * 纪律：
 * - 只记读没读，**不给任何奖励**（手册是说明书，不是收集品）；
 * - 存的是页 id，不是索引 —— 以后页顺序变了也不会认错；
 * - 老档没有这个字段就当一页没读，不升存档版本。
 */

export function manualRead(state: GameState): readonly string[] {
  return state.manual?.read ?? [];
}

export function manualHasRead(state: GameState, id: string): boolean {
  return manualRead(state).includes(id);
}

/** 记一笔；已经读过返回 false，免得反复触发重画 */
export function markManualRead(state: GameState, id: string): boolean {
  if (id === "") return false;
  if (!state.manual) state.manual = { read: [] };
  if (state.manual.read.includes(id)) return false;
  state.manual.read.push(id);
  return true;
}

export function manualReadCount(state: GameState): number {
  return Math.min(MANUAL_TOTAL, manualRead(state).length);
}

/** 「读过五页，还剩十一页」—— 图鉴抬头用 */
export function manualReadWords(state: GameState): string {
  const n = manualReadCount(state);
  if (n === 0) return "还没翻过";
  if (n >= MANUAL_TOTAL) return "全翻过了";
  return `翻过 ${n} 页，还剩 ${MANUAL_TOTAL - n} 页`;
}
