/**
 * 人情的读写（M3b）。规则与数值都在 `data/favor.ts`，这里只做状态操作。
 *
 * 两条纪律：
 * 1. **人情不进营业额**。它只是「街坊给的面子」，不是钱，日结单与账本里都不该出现。
 * 2. **所有花法都要当场能把效果量出来**：升汤参要能看见味道分涨、教员工要能看见技能档涨、
 *    摆一桌要能看见当天进店率变。否则人情就是一条死数值。
 */

import {
  FAVOR_BY_ID,
  FAVOR_GAIN,
  FAVOR_MAX,
  HINT_STEP,
  TEACH_STEP,
  TREAT_ATTRACT,
  type FavorUseDef,
} from "../data/favor";
import { syncEditing } from "./menu";
import type { GameState } from "./state";

/** 当前人情点数 */
export function favorOf(state: GameState): number {
  return Math.max(0, Math.round(state.favor ?? 0));
}

/** 累计攒过多少（面板上写「一共攒了 N 点」） */
export function favorTotalOf(state: GameState): number {
  return Math.max(0, Math.round(state.favorTotal ?? 0));
}

/**
 * 攒人情。`why` 会进 `flow.lastFavor`，由 `main.ts` 消费成 toast。
 * 「吃到底」这类靠碗的来源受 `FAVOR_GAIN.dailyCapByBowls` 日上限约束，防止挂机刷。
 */
export function addFavor(state: GameState, amount: number, why?: string): number {
  const n = Math.round(amount);
  if (n <= 0) return 0;
  const before = favorOf(state);
  let gained = n;
  if (state.flow.favorToday + gained > FAVOR_GAIN.dailyCapByBowls) {
    gained = Math.max(0, FAVOR_GAIN.dailyCapByBowls - state.flow.favorToday);
  }
  if (gained <= 0) return 0;
  state.flow.favorToday += gained;
  state.favor = Math.min(FAVOR_MAX, before + gained);
  state.favorTotal = favorTotalOf(state) + gained;
  if (why) state.flow.lastFavor = `${why}（+${gained} 点人情）`;
  return gained;
}

/** 不受日上限约束的来源（转手配方、比赛名次、回礼） */
export function addFavorFree(state: GameState, amount: number, why?: string): number {
  const n = Math.round(amount);
  if (n <= 0) return 0;
  state.favor = Math.min(FAVOR_MAX, favorOf(state) + n);
  state.favorTotal = favorTotalOf(state) + n;
  if (why) state.flow.lastFavor = `${why}（+${n} 点人情）`;
  return n;
}

/** 今天是不是摆了桌请街坊 */
function treatToday(state: GameState): boolean {
  return (state.treatDay ?? -1) === state.month * 100 + state.day;
}

/** 「摆一桌」的当天进店率倍率 */
export function favorAttractMult(state: GameState): number {
  return treatToday(state) ? TREAT_ATTRACT : 1;
}

export interface FavorView {
  def: FavorUseDef;
  affordable: boolean;
  /** 用不了的原因；能用就是空串 */
  reason: string;
}

/** 三样花法的可用性 */
export function favorViews(state: GameState): FavorView[] {
  return [...FAVOR_BY_ID.values()].map((def) => {
    const pts = favorOf(state);
    let reason = "";
    if (pts < def.costPoints) reason = `还差 ${def.costPoints - pts} 点人情`;
    if (def.id === "hint_recipe" && reason === "") {
      const soup = state.recipe.soup;
      if (soup.every((v) => v >= 100)) reason = "这碗汤已经没什么可教的了";
    }
    if (def.id === "teach_staff" && reason === "") {
      const roster = state.staff.roster;
      if (roster.length === 0) reason = "还没雇人，师傅没得教";
      else if (roster.every((m) => m.skill >= 5)) reason = "店里的人手艺都到顶了";
    }
    if (def.id === "treat_street" && reason === "") {
      if (treatToday(state)) reason = "今天已经摆过一桌了";
    }
    return { def, affordable: reason === "", reason };
  });
}

export interface FavorResult {
  ok: boolean;
  reason?: string;
  line?: string;
}

/** 花人情。失败一律不扣点数。 */
export function useFavor(state: GameState, id: string): FavorResult {
  const def = FAVOR_BY_ID.get(id);
  if (!def) return { ok: false, reason: "没有这一样" };
  const view = favorViews(state).find((v) => v.def.id === def.id);
  if (!view || !view.affordable) {
    return { ok: false, reason: view?.reason || "人情不够" };
  }
  if (def.id === "hint_recipe") {
    // 汤里最欠的那一味往上提一档；同分取靠前的（酸笋/豆豉/猪骨…）
    const soup = [...state.recipe.soup];
    let idx = 0;
    for (let i = 1; i < soup.length; i += 1) if (soup[i]! < soup[idx]!) idx = i;
    soup[idx] = Math.min(100, soup[idx]! + HINT_STEP);
    state.recipe = { ...state.recipe, soup: soup as typeof state.recipe.soup };
    syncEditing(state);
  } else if (def.id === "teach_staff") {
    const roster = [...state.staff.roster].sort((a, b) => a.skill - b.skill);
    const weakest = roster.find((m) => m.skill < 5);
    if (!weakest) return { ok: false, reason: "店里的人手艺都到顶了" };
    weakest.skill = Math.min(5, weakest.skill + TEACH_STEP);
  } else if (def.id === "treat_street") {
    state.treatDay = state.month * 100 + state.day;
  }
  state.favor = favorOf(state) - def.costPoints;
  return { ok: true, line: def.line };
}

/** 面板标题用：人情 N 点 · 一共攒过 M 点 */
export function favorSummary(state: GameState): string {
  const pts = favorOf(state);
  const total = favorTotalOf(state);
  if (total === 0) return "还没人帮你 —— 把粉卖到底、把不要的配方转手，才有人情";
  return `${pts} 点 · 一共攒过 ${total} 点`;
}

/** 每天开工清零日上限计数 */
export function resetFavorToday(state: GameState): void {
  state.flow.favorToday = 0;
}
