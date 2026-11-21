import { MASTERS, MASTER_BY_ID, PRICE_SET_BONUS, type MasterDef, type MasterId } from "../data/master";
import type { GameState, MenuItem } from "./state";

/**
 * 老师傅的方子（A6）的业务层。
 *
 * 三条纪律：
 *  1. 每款只能定一条 —— 定死不是「全都要」，是「这一碗以后就照这个做」。
 *  2. 一次买断、永久生效 —— 不退、不能改，想换就换一款重做。
 *  3. 人情是门槛、钱是成本 —— 人情不够就是师傅不肯教，跟钱没关系。
 */

export interface MasterResult {
  ok: boolean;
  reason?: string;
  line?: string;
  def?: MasterDef;
}

export function masterOf(item: MenuItem | null | undefined): MasterDef | null {
  if (!item) return null;
  return (item.master && MASTER_BY_ID.get(item.master)) || null;
}

export interface MasterView {
  def: MasterDef;
  active: boolean;
  affordable: boolean;
}

export function masterViews(state: GameState, item: MenuItem | null | undefined): MasterView[] {
  const cur = masterOf(item)?.id ?? null;
  return MASTERS.map((def) => ({
    def,
    active: def.id === cur,
    affordable: !cur && state.favor >= def.favorCost && state.cash >= def.costYuan,
  }));
}

/** 定了哪几条（面板抬头用） */
export function masterCount(state: GameState): number {
  return (state.menu ?? []).filter((d) => !!d.master).length;
}

export function masterSummary(state: GameState): string {
  const n = masterCount(state);
  const total = (state.menu ?? []).length;
  if (n === 0) return "还没请师傅定过方子";
  return `${n} / ${total} 款定了方子`;
}

/**
 * 定一条方子。
 *
 * `taste_set` 要把「定的时候那碗值多少」记下来 —— 否则读档/换滑条之后
 * 「锁住的味道」就跟着变了，等于没锁。所以先算一次 `lockedTaste`。
 */
export function applyMaster(state: GameState, index: number, id: string): MasterResult {
  const item = state.menu[index];
  if (!item) return { ok: false, reason: "没有这一款" };
  const def = MASTER_BY_ID.get(id);
  if (!def) return { ok: false, reason: "没有这条方子" };
  if (item.master) return { ok: false, reason: `这一款已经定了「${masterOf(item)?.name ?? ""}」，一锅只能定一条` };
  if (state.favor < def.favorCost) return { ok: false, reason: `师傅要 ${def.favorCost} 点人情，现在只有 ${state.favor} 点` };
  if (state.cash < def.costYuan) return { ok: false, reason: `这次要花 ¥${def.costYuan.toLocaleString("zh-CN")}，钱不够` };

  state.favor -= def.favorCost;
  state.cash -= def.costYuan;
  item.master = def.id;
  if (def.id === "taste_set") {
    // 定死的味道 = 定的时候这一碗的分。算不出来就按 0 存，至少不会 NaN。
    const sc = state.menu[index];
    item.lockedTaste = sc ? Math.round(lockedTasteOf(state, index)) : 0;
  }
  return { ok: true, line: def.line, def };
}

/**
 * 把「这一刻这碗值多少」算出来记进 `lockedTaste`。
 *
 * 这里不能 import `menu.ts` 的 `scoreDish`：`menu.ts` 要用本文件的
 * `masterCostFactor` 算成本，互相 import 会成环。所以由调用方（main / 面板）
 * 传进来的分数优先；本函数只做兜底 —— 拿不到就算 0，等于没锁住味道。
 */
let lastKnownScore: (state: GameState, index: number) => number = () => 0;

/** 由 `menu.ts` 在模块加载时注入（避免循环依赖） */
export function injectScoreReader(fn: (state: GameState, index: number) => number): void {
  lastKnownScore = fn;
}

export function lockedTasteOf(state: GameState, index: number): number {
  return lastKnownScore(state, index);
}

/** 料钱定死：每碗料钱 −8% */
export function masterCostFactor(item: MenuItem | null | undefined): number {
  return masterOf(item)?.id === "cost_set" ? 0.92 : 1;
}

/** 出碗定死：每锅出碗 −6% */
export function masterServeFactor(item: MenuItem | null | undefined): number {
  return masterOf(item)?.id === "serve_set" ? 0.94 : 1;
}

/** 售价顶住：这碗可以卖贵 ¥2 而不更容易被嫌贵 */
export function masterPriceBonus(item: MenuItem | null | undefined): number {
  return masterOf(item)?.id === "price_set" ? PRICE_SET_BONUS : 0;
}

/** 面板用的四选一清单（当前款） */
export function masterSection(state: GameState, index: number): { views: MasterView[]; current: MasterDef | null } {
  const item = state.menu[index];
  return { views: masterViews(state, item), current: masterOf(item) };
}

export type { MasterId };
