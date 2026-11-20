/**
 * 碗的计算（A4）。同一时间只有一只碗在用，所以这里没有 CAP ——
 * 单只碗的数值就是上限（与 `sim/style.ts` 的门面同一个判断）。
 *
 * 只用四个已经在算的入口：出碗时间、满意度、耐心、料钱。
 * 谁调用谁负责把 state 递进来；这里不 import `sim/customer.ts`，避免循环。
 */
import {
  BOWLS,
  BOWL_TOTAL,
  DEFAULT_BOWL_ID,
  bowlById,
  type BowlDef,
  type BowlEffect,
  type BowlId,
} from "../data/bowl";
import type { GameState } from "./state";

export interface BowlBuyResult {
  ok: boolean;
  reason?: string;
  /** 买/换成功时给玩家的一句实话（toast 用） */
  line?: string;
  id?: BowlId;
}

function belt(state: GameState, id: string): boolean {
  return state.bowl === id;
}

/** 拥有这只碗吗：免费的默认碗恒为 true，其它看存档 */
export function bowlOwned(state: GameState, id: string): boolean {
  const def = bowlById(id);
  if (!def) return false;
  if (def.free) return true;
  return (state.bowls ?? []).includes(id);
}

/** 现在用的碗（存档里没有或坏了就退回默认碗） */
export function currentBowl(state: GameState): BowlDef {
  const id = state.bowl;
  const def = id ? bowlById(id) : undefined;
  if (def && bowlOwned(state, def.id)) return def;
  return bowlById(DEFAULT_BOWL_ID)!;
}

function effectOf(state: GameState): Required<BowlEffect> {
  const e = currentBowl(state).effect;
  return {
    servePct: e.servePct ?? 0,
    sat: e.sat ?? 0,
    patiencePct: e.patiencePct ?? 0,
    costPct: e.costPct ?? 0,
  };
}

// ── 四个乘数入口（与 gear / flavor / combo 同一个写法：只乘，不加） ──

/** 出碗时间：消毒钢碗 0.97、打包碗 0.95、瓦煲 1.06 */
export function bowlServeFactor(state: GameState): number {
  return 1 - effectOf(state).servePct;
}

/** 满意度点数（进 settle 的 bonus 链） */
export function bowlSatBonus(state: GameState): number {
  return effectOf(state).sat;
}

/** 耐心：瓦煲 1.12 */
export function bowlPatienceMult(state: GameState): number {
  return 1 + effectOf(state).patiencePct;
}

/** 料钱：大盆 1.03、打包碗 1.02 */
export function bowlCostFactor(state: GameState): number {
  return 1 + effectOf(state).costPct;
}

// ── 面板 ──

export interface BowlView {
  def: BowlDef;
  owned: boolean;
  active: boolean;
  affordable: boolean;
}

export function bowlViews(state: GameState): BowlView[] {
  return BOWLS.map((def) => ({
    def,
    owned: bowlOwned(state, def.id),
    active: belt(state, def.id),
    affordable: state.cash >= def.costYuan,
  }));
}

/** 「现在用「消毒不锈钢碗」· 买了 1/5 只」 */
export function bowlSummary(state: GameState): string {
  const owned = BOWLS.filter((b) => bowlOwned(state, b.id)).length;
  return `现在用「${currentBowl(state).name}」 · 买了 ${owned}/${BOWL_TOTAL} 只`;
}

/** 还没买的最便宜那只（面板提示用） */
export function nextBowl(state: GameState): BowlDef | null {
  const left = BOWLS.filter((b) => !bowlOwned(state, b.id)).sort(
    (a, b) => a.costYuan - b.costYuan,
  );
  return left[0] ?? null;
}

function money(n: number): string {
  return `¥${n.toLocaleString("zh-CN")}`;
}

/** 买一只碗：钱够、没买过。买下就换上（省一步） */
export function buyBowl(state: GameState, id: string): BowlBuyResult {
  const def = bowlById(id);
  if (!def) return { ok: false, reason: "没有这只碗" };
  if (bowlOwned(state, id)) return { ok: false, reason: "这只碗已经有了" };
  if (state.cash < def.costYuan) {
    return { ok: false, reason: `钱不够：要 ${money(def.costYuan)}，手上 ${money(state.cash)}` };
  }
  state.cash -= def.costYuan;
  state.bowls = [...(state.bowls ?? []), def.id];
  state.bowl = def.id;
  return { ok: true, id: def.id, line: `换上「${def.name}」：${def.effectText}` };
}

/** 换碗：只能换已经买过的，不要钱 */
export function setBowl(state: GameState, id: string): BowlBuyResult {
  const def = bowlById(id);
  if (!def) return { ok: false, reason: "没有这只碗" };
  if (!bowlOwned(state, id)) return { ok: false, reason: "这只碗还没买" };
  if (state.bowl === id) return { ok: false, reason: "现在已经用着这只" };
  state.bowl = def.id;
  return { ok: true, id: def.id, line: `换成「${def.name}」：${def.effectText}` };
}
