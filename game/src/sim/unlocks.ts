import { FLOW } from "../data/balance";
import { UNLOCKS, UNLOCK_BY_ID, type UnlockDef } from "../data/unlocks";
import type { GameState } from "./state";

/** 当前段位（0 = 还没评过段） */
export function gradeOf(state: GameState): number {
  return state.gradeLevel ?? 0;
}

export function isUnlocked(state: GameState, id: string): boolean {
  const def = UNLOCK_BY_ID.get(id);
  if (!def || def.pending) return false;
  return gradeOf(state) >= def.grade;
}

export interface UnlockView extends UnlockDef {
  unlocked: boolean;
  /** 还差几段；已解锁为 0 */
  short: number;
}

export function unlockViews(state: GameState): UnlockView[] {
  const g = gradeOf(state);
  return UNLOCKS.map((u) => ({
    ...u,
    unlocked: !u.pending && g >= u.grade,
    short: Math.max(0, u.grade - g),
  }));
}

/** 下一件能拿到的手艺（只算已经接进模拟的），都已拿到返回 null */
export function nextUnlock(state: GameState): UnlockView | null {
  const g = gradeOf(state);
  return (
    unlockViews(state).find((u) => !u.pending && !u.unlocked && u.grade > g) ?? null
  );
}

// ── 生效点 1：排队位（开罗 More Line Tiles）
export function queueMaxOf(state: GameState): number {
  let q = FLOW.queueMax;
  if (isUnlocked(state, "queue2")) q += 2;
  if (isUnlocked(state, "queue4")) q += 4;
  return q;
}

// ── 生效点 2：巷口灯箱（开罗 Road Work）——乘在本区客流池上
export const ROADWORK_BOOST = 1.15;

export function roadworkBoostOf(state: GameState): number {
  return isUnlocked(state, "roadwork") ? ROADWORK_BOOST : 1;
}
