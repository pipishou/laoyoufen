import { DAYS_PER_MONTH } from "./calendar";
import { DAY_MINUTES } from "./customer";
import type { GameState } from "./state";

/**
 * 开罗 Ramen Frenzy（help.txt `Ramen Frenzy 1/2` 原句）：
 *   1「When you have a line outside your shop and customers are eating ramen that they like,
 *      the ramen frenzy gauge above the vending machine will start to fill up.
 *      When it is completely full, a frenzy will occur.」
 *   2「When a ramen frenzy occurs, many customers come, so you can expect a boost to your sales.
 *      In addition, the stats of customers coming to your shop will increase,
 *      and your staff will get auras.」
 *
 * 翻译成本作的三个条件与三个效果：
 *   · 涨槽：门口有人排队（waiting ≥ 1）且今天吃得满意（今日均分 ≥ 60）
 *   · 满槽：进入「热卖」30 分钟
 *   · 效果：来客 ×2、来客钱包 +15%、店员 aura 让满意度 +4
 *
 * 为什么加它：P24「第 3 个月之后没有决策点」。之前中期只有「等池子掉、等比赛月」两件事，
 * 玩家没有可以主动做、又能立刻看到结果的动作。frenzy 是这样一个动作——
 * 想把槽攒满，就得**故意留一点排队**、同时不能把满意度压下去；
 * 这跟「多扩座把队列消灭掉」是相反的取舍，于是每个月都有得选。
 */
export const FRENZY_MAX = 100;
export const FRENZY_PER_MINUTE = 5;
/** 每碗满意的粉给多少槽（I-07：按碗计，玩家看得见因果） */
export const FRENZY_PER_BOWL = 2;
/** 一分钟最多涨多少，防止一锅端瞬间满槽 */
export const FRENZY_MAX_GAIN = 8;
export const FRENZY_DECAY = 2;
export const FRENZY_MINUTES = 30;
export const FRENZY_COOLDOWN_MINUTES = 240;
export const FRENZY_SPAWN_BOOST = 2;
export const FRENZY_POOL_BOOST = 1.3;
export const FRENZY_SERVE_BOOST = 1.25;
export const FRENZY_BUDGET_BOOST = 0.15;
export const FRENZY_AURA = 4;
export const FRENZY_MIN_SAT = 60;
export const FRENZY_MIN_QUEUE = 1;

/**
 * 全局绝对分钟（跨月跨日可比），用于判「热卖还剩多久」。
 * 注意 `state.month` 是 **0 基**（`createInitialState` 里 `month: 0`，`closeMonth` 之后才 +1），
 * 而 `state.day` 是 1 基 —— 写错基准会让新局算出负数，热卖一开始就被判成「正在进行」。
 */
export function absMinuteOf(state: GameState): number {
  return (
    state.month * DAYS_PER_MONTH * DAY_MINUTES +
    (state.day - 1) * DAY_MINUTES +
    state.flow.minuteOfDay
  );
}

export function frenzyActive(state: GameState): boolean {
  return absMinuteOf(state) < (state.frenzy?.until ?? -1);
}

/** 热卖期间连「区客流池」一起放大：不然来客翻倍会被池子上限吃掉，等于没发生 */
export function frenzyPoolBoost(state: GameState): number {
  return frenzyActive(state) ? FRENZY_POOL_BOOST : 1;
}

/** 热卖期间的来客倍率；平时 1 */
export function frenzySpawnBoost(state: GameState): number {
  return frenzyActive(state) ? FRENZY_SPAWN_BOOST : 1;
}

/** 热卖期间的来客钱包倍率（开罗：来客 stats 会变高） */
export function frenzyBudgetBoost(state: GameState): number {
  return frenzyActive(state) ? 1 + FRENZY_BUDGET_BOOST : 1;
}

/** 热卖期间店员 aura：直接加到满意度上 */
export function frenzyAura(state: GameState): number {
  return frenzyActive(state) ? FRENZY_AURA : 0;
}

/**
 * 热卖期间一并出力：并行槽 ×1.25（开罗 Frenzy 2「staff will get auras」）。
 * 不加这条的话，热卖只是「多来一堆人然后走掉」——需求涨了、产能没涨，
 * 玩家看到的是流失率上升，不是销量上升。
 */
export function frenzyServeBoost(state: GameState): number {
  return frenzyActive(state) ? FRENZY_SERVE_BOOST : 1;
}

/** 还剩几分钟热卖（未触发为 0） */
export function frenzyLeftMinutes(state: GameState): number {
  return Math.max(0, (state.frenzy?.until ?? -1) - absMinuteOf(state));
}

export interface FrenzyTickResult {
  /** 本分钟是否触发了一次热卖 */
  triggered: boolean;
  /** 本分钟后是否处于热卖 */
  active: boolean;
}

/**
 * 每分钟推一次槽。调用点：`tickCustomers` 末尾（此时队列与今日满意度都已定）。
 * `waiting` 是当前排队人数，`goodBowls` 是这一分钟里「吃得满意」的碗数（>= FRENZY_MIN_SAT）。
 */
export function frenzyTick(state: GameState, waiting: number, goodBowls: number): FrenzyTickResult {
  const f = state.frenzy;
  if (!f) return { triggered: false, active: false };

  const now = absMinuteOf(state);
  if (now < f.until) return { triggered: false, active: true }; // 热卖中，槽不动

  // 冷却期：热卖刚结束，槽不涨也不掉，避免「天天热卖」——
  // 实测不加冷却时替身 36 个月触发 1541 次，热卖变成常态而不是事件。
  if (now < (f.restUntil ?? -1)) return { triggered: false, active: false };

  // 判据用「这一分钟有没有满意的碗」，不用当日均值：日均在开场只有两三碗时
  // 忽高忽低（阿兰局能冲到 65%，巷内局又长期压在 58 边缘），玩家看不出规律。
  const satisfying = waiting >= FRENZY_MIN_QUEUE && goodBowls >= 1;
  const gain = Math.min(FRENZY_MAX_GAIN, FRENZY_PER_BOWL * Math.max(1, goodBowls));
  f.gauge = Math.max(0, Math.min(FRENZY_MAX, f.gauge + (satisfying ? gain : -FRENZY_DECAY)));

  if (f.gauge < FRENZY_MAX) return { triggered: false, active: false };

  // 满槽 → 热卖
  f.gauge = 0;
  f.count += 1;
  f.until = now + FRENZY_MINUTES;
  f.restUntil = f.until + FRENZY_COOLDOWN_MINUTES;
  return { triggered: true, active: true };
}
