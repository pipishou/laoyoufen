/**
 * 店的样子（A1 空间层）的逻辑层：买、换、三个乘数、面板视图。
 *
 * 与 `sim/gear.ts` 的差别只有一条：**同一时间只有一套生效**，
 * 所以不需要像家当那样把同类效果加起来做封顶 —— 单套数值就是上限。
 *
 * 三个入口全是既有的：
 *   attractPct  → sim/customer.ts 的 spawnChance
 *   satBonus    → sim/customer.ts 的 satisfactionOf bonus
 *   patiencePct → sim/customer.ts 的 patienceScale
 *
 * 换店面不花时间、不掉客人（开罗换部件要施工，我们一局太短，施工期玩家感知不到）。
 */
import { STYLES, STYLE_BY_ID, styleById, type StyleDef, type StyleId } from "../data/style";
import type { GameState } from "./state";

export interface StyleBuyResult {
  ok: boolean;
  reason?: string;
  /** 成功后给玩家的一行字 */
  line?: string;
  /** 换上的是哪一套（给 AI 与动画用） */
  id?: StyleId;
}

/** 已经买下的店面 */
export function styleOwned(state: GameState, id: string): boolean {
  return (state.styles ?? []).includes(id);
}

/** 现在店里摆的是哪一套（没买过就是 null：还是那间空铺） */
export function currentStyle(state: GameState): StyleDef | null {
  const id = state.style;
  if (!id) return null;
  if (!styleOwned(state, id)) return null;
  return styleById(id) ?? null;
}

/** 买一套门面：钱够、没买过；买完自动换上 */
export function buyStyle(state: GameState, id: string): StyleBuyResult {
  const def = styleById(id);
  if (!def) return { ok: false, reason: "没有这套店面" };
  if (styleOwned(state, id)) return { ok: false, reason: `${def.name}已经装修过了` };
  if (state.cash < def.costYuan) {
    return { ok: false, reason: `${def.name}要 ¥${def.costYuan.toLocaleString("zh-CN")}，还差一点` };
  }
  state.cash -= def.costYuan;
  state.styles = [...(state.styles ?? []), id];
  state.style = id;
  return { ok: true, line: `${def.name}装修好了：${def.line}`, id: def.id };
}

/** 换上已经买过的另一套（免费，不出人不出力） */
export function setStyle(state: GameState, id: string): StyleBuyResult {
  const def = styleById(id);
  if (!def) return { ok: false, reason: "没有这套店面" };
  if (!styleOwned(state, id)) return { ok: false, reason: `${def.name}还没装修过` };
  if (state.style === id) return { ok: false, reason: `现在用的就是${def.name}` };
  state.style = id;
  return { ok: true, line: `换回${def.name}：${def.parts.entrance}一开，街坊就认得出`, id: def.id };
}

/** 进店倍率（没装修就是 1） */
export function styleAttractMult(state: GameState): number {
  const def = currentStyle(state);
  return 1 + (def?.effect.attractPct ?? 0);
}

/** 每碗满意加成（绝对分） */
export function styleSatBonus(state: GameState): number {
  const def = currentStyle(state);
  return def?.effect.satBonus ?? 0;
}

/** 耐心倍率 */
export function stylePatienceMult(state: GameState): number {
  const def = currentStyle(state);
  return 1 + (def?.effect.patiencePct ?? 0);
}

export interface StyleView {
  def: StyleDef;
  owned: boolean;
  /** 现在是店里摆着的那一套 */
  active: boolean;
  /** 钱够不够（已拥有的永远是 true） */
  affordable: boolean;
}

export function styleViews(state: GameState): StyleView[] {
  return STYLES.map((def) => {
    const owned = styleOwned(state, def.id);
    return {
      def,
      owned,
      active: state.style === def.id && owned,
      affordable: owned || state.cash >= def.costYuan,
    };
  });
}

/** 面板抬头：「已装 2/6 · 现在「骑楼老铺」」/ 没装修时「店里还是空铺」 */
export function styleSummary(state: GameState): string {
  const owned = (state.styles ?? []).filter((id) => STYLE_BY_ID.has(id)).length;
  const cur = currentStyle(state);
  const head = `已装 ${owned}/${STYLES.length}`;
  return cur ? `${head} · 现在「${cur.name}」` : `${head} · 店里还是空铺`;
}

/** 下一套值得装的（未拥有里最便宜的那套），全买齐就是 null */
export function nextStyle(state: GameState): StyleView | null {
  const left = styleViews(state).filter((v) => !v.owned);
  if (left.length === 0) return null;
  return left.sort((a, b) => a.def.costYuan - b.def.costYuan)[0] ?? null;
}
