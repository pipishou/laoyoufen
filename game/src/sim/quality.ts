/**
 * 配料品质档：状态、乘数、文案。
 *
 * 只做三件事：
 *   ① 读 / 写 `state.quality`（免费切换，随时可换 —— 换的是明天进货的档次，不是当场做手脚）；
 *   ② 把 `charmBoost` / `costMult` 交给 `sim/score.ts`（它负责算分，本文件不重复算）；
 *   ③ 给界面一句人话。
 *
 * 为什么不收钱：这一档不是「买一件东西」，是**每一碗都在多花的料钱**。
 * 钱从 `costMult` 走，看得见地在每碗毛利里 —— 再收一次钱就是重复收费。
 */
import type { GameState } from "./state";
import { DEFAULT_QUALITY, QUALITIES, qualityById, type QualityDef } from "../data/quality";

/** 当前进货档（坏值退默认） */
export function qualityOf(state: GameState): QualityDef {
  return qualityById(state.quality ?? DEFAULT_QUALITY);
}

/** 切换进货档：认表内的，切换本身免费（代价在每碗料钱里） */
export function setQuality(state: GameState, id: string): boolean {
  if (!QUALITIES.some((q) => q.id === id)) return false;
  if ((state.quality ?? DEFAULT_QUALITY) === id) return false;
  state.quality = id;
  return true;
}

/** 魅力（相）超出 30 那部分抬高多少 */
export function qualityCharmBoost(state: GameState): number {
  return qualityOf(state).charmBoost;
}

/** 配料料钱乘数 */
export function qualityCostMult(state: GameState): number {
  return qualityOf(state).costMult;
}

export interface QualityView {
  def: QualityDef;
  active: boolean;
}

export function qualityViews(state: GameState): QualityView[] {
  const cur = qualityOf(state).id;
  return QUALITIES.map((def) => ({ def, active: def.id === cur }));
}

/** 「靓货 · 料钱 ×1.8」 */
export function qualitySummary(state: GameState): string {
  const q = qualityOf(state);
  if (q.costMult === 1) return "平常货 · 料钱照旧";
  return `${q.name} · 料钱 ×${q.costMult}`;
}

/** 面板上那行小字 */
export function qualityWords(state: GameState): string {
  const q = qualityOf(state);
  if (q.charmBoost === 0) return "档口送什么用什么，最省料钱";
  return `卖相与分量抬高 ${Math.round(q.charmBoost * 100)}%，料钱 ×${q.costMult}`;
}
