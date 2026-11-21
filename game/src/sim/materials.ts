import {
  BONE_BY_ID,
  BONE_GRADES,
  DEFAULT_BONE,
  DEFAULT_RICE,
  RICE_BY_ID,
  RICE_GRADES,
  type GradeDef,
} from "../data/grades";
import type { GameState } from "./state";

/**
 * 进货档（A5）：米与骨。
 *
 * 与家当/碗/店面不同，这一层**不买东西、不攒钱**：换档随时可以，代价直接落进
 * 每碗料钱与分数。理由是一局只有两分钟、一天进一次货，把这个做成「购买」
 * 会让玩家在一堆 ¥20 的东西上点来点去，而它真正的取舍是「今天这锅要不要熬厚一点」。
 *
 * 层里只有读写与三个视图，没有缓存 —— 值直接进 `scoreRecipe` 的 `extra`。
 */

export function riceOf(state: GameState): GradeDef<string> {
  return (state.rice && RICE_BY_ID.get(state.rice)) || (RICE_BY_ID.get(DEFAULT_RICE) as GradeDef<string>);
}

export function boneOf(state: GameState): GradeDef<string> {
  return (state.bone && BONE_BY_ID.get(state.bone)) || (BONE_BY_ID.get(DEFAULT_BONE) as GradeDef<string>);
}

/** 换米档：只认表里的 id；返回是否真的换了（面板据此决定要不要重算） */
export function setRice(state: GameState, id: string): boolean {
  if (!RICE_BY_ID.has(id) || state.rice === id) return false;
  state.rice = id;
  return true;
}

export function setBone(state: GameState, id: string): boolean {
  if (!BONE_BY_ID.has(id) || state.bone === id) return false;
  state.bone = id;
  return true;
}

export interface GradeView {
  def: GradeDef<string>;
  active: boolean;
}

export function riceViews(state: GameState): GradeView[] {
  const cur = riceOf(state).id;
  return RICE_GRADES.map((def) => ({ def, active: def.id === cur }));
}

export function boneViews(state: GameState): GradeView[] {
  const cur = boneOf(state).id;
  return BONE_GRADES.map((def) => ({ def, active: def.id === cur }));
}

/** 每碗料钱的净增减（两档相加），负数是省 */
export function gradeCostDelta(state: GameState): number {
  const v = riceOf(state).costDelta + boneOf(state).costDelta;
  return Math.round(v * 100) / 100;
}

/** 面板抬头：「晚籼米 · 脊骨 · 每碗多花/省 ¥x」 */
export function gradeSummary(state: GameState): string {
  const d = gradeCostDelta(state);
  const money = d === 0 ? "料钱不动" : d > 0 ? `每碗多花 ¥${d.toFixed(2)}` : `每碗省 ¥${Math.abs(d).toFixed(2)}`;
  return `${riceOf(state).name} · ${boneOf(state).name} · ${money}`;
}
