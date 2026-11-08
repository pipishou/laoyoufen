import { EVENTS, EVENTS_BY_ID, type EventEffect, type EventView, type GameEventDef } from "../data/events";
import { dayIndex } from "./calendar";
import { favoriteArchetypes } from "./regulars";
import { nextFloat } from "./rng";
import type { GameState } from "./state";

/**
 * 事件脚本运行时：每个抽取日开店时抽一件，挂起 pending，等玩家在 HUD 里选完再结算。
 * 所有随机都走 state.rng，保证「同种子同结局」。
 *
 * 节奏取自开罗拉面店 Player.ProEconomy（GameAssembly.dll RVA 0x406090 静态反汇编）：
 * - 固定时点抽取，不是「按概率掷骰」；
 * - 池子先按月份窗口过滤（对应开罗 economy 表的 month_），再按权重抽（ratio_ 1–30）；
 * - 开罗在子窗体压栈时整个时钟不推进（GameForm.Update 的 IsTopForm 闸门），
 *   对应这里的「弹窗未处理时 advanceMinute 直接返回」。
 *
 * 偏离开罗的一处：开罗是「每天抽一次」，MVP 改成「每 7 天抽一次」。
 * 三年 1080 天 ≈ 154 个抽取点，32 条事件平均各出现 4.8 次、平均间隔 220 天，
 * 玩家记不住重复；同时每周空池概率极低（通用池平均 4.9 条可用）。这是内容量取舍，不是还原。
 */

/** 每天第几分钟抽事件。开罗在 01:00（开门前）结算，这里对应一天的起点。 */
export const EVENT_ROLL_MINUTE = 0;
/** 开档第一天不抽，避免开场教学被弹窗打断（对应开罗「开业后才解锁」的标记位）。 */
export const EVENT_START_ABS_DAY = 1;
/** 抽取间隔（天）。MVP 定为 7：每周一个叙事事件。 */
export const EVENT_ROLL_INTERVAL_DAYS = 7;
/** 事件日志保留条数 */
export const EVENT_LOG_LIMIT = 20;

function viewOf(state: GameState): EventView {
  return {
    cash: state.cash,
    reputation: state.reputation,
    month: state.month,
    absDay: dayIndex(state.month, state.day),
    // 只算真熟客（喂对味累计够的），不是「来过的原型数」——访客记录人手一条，旧口径恒等于 24
    regularCount: favoriteArchetypes(state).length,
    seats: state.venue.seats,
    stoves: state.venue.stoves,
  };
}

/** 月份窗口、冷却、一次性、门槛、自定义判据，五道都得过 */
export function eventEligible(state: GameState, def: GameEventDef, today: number): boolean {
  const seen = state.events.seen;
  if (def.once && seen.includes(def.id)) return false;
  // 开罗 economy 表的 month_ 是硬窗口：不在当月就不进池，不是「优先」。
  if (def.season && !def.season.includes(state.month)) return false;
  if (def.minDay !== undefined && today < def.minDay) return false;
  const last = state.events.lastFired[def.id];
  if (last !== undefined && today - last < def.cooldownDays) return false;
  if (def.require && !def.require(viewOf(state))) return false;
  return true;
}

/**
 * 每个游戏分钟调一次。每 EVENT_ROLL_INTERVAL_DAYS 天才掷一次，掷完当期的额度就用掉；
 * 池子为空（全在冷却/门槛没过/月份窗口不对）就空过这一期，不开概率后门。
 * 已有 pending 时不再掷，避免事件叠事件。
 */
export function tickEvents(state: GameState): void {
  const ev = state.events;
  if (ev.pending) return;
  if (state.flow.minuteOfDay !== EVENT_ROLL_MINUTE) return;

  const today = dayIndex(state.month, state.day);
  if (today < EVENT_START_ABS_DAY) return;
  if ((today - EVENT_START_ABS_DAY) % EVENT_ROLL_INTERVAL_DAYS !== 0) return;
  if (ev.rolledDay === today) return;
  ev.rolledDay = today;

  const pool = EVENTS.filter((def) => eventEligible(state, def, today));
  if (pool.length === 0) return;

  let total = 0;
  for (const def of pool) total += def.weight;
  let roll = nextFloat(state.rng) * total;
  let picked = pool[pool.length - 1] as GameEventDef;
  for (const def of pool) {
    roll -= def.weight;
    if (roll <= 0) {
      picked = def;
      break;
    }
  }
  ev.pending = { id: picked.id, absDay: today };
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

function applyEffect(state: GameState, effect: EventEffect): void {
  if (effect.kind === "cash") {
    state.cash += effect.amount;
    return;
  }
  if (effect.kind === "reputation") {
    state.reputation = clamp(state.reputation + effect.amount, 0, 5);
    return;
  }
  const key = effect.key;
  state.trend[key] = clamp(state.trend[key] + effect.amount, 0, 100);
}

/**
 * 玩家在 HUD 里点选一个选项后结算。返回结果文案（给飘字用）；
 * 没有 pending 或下标越界返回 null，不抛异常——HUD 重复点击不能弄坏存档。
 */
export function resolveEvent(state: GameState, choiceIndex: number): string | null {
  const pending = state.events.pending;
  if (!pending) return null;
  const def = EVENTS_BY_ID.get(pending.id);
  if (!def) {
    state.events.pending = null;
    return null;
  }
  const choice = def.choices[choiceIndex];
  if (!choice) return null;

  for (const effect of choice.effects) applyEffect(state, effect);

  const today = dayIndex(state.month, state.day);
  state.events.pending = null;
  state.events.lastFired[def.id] = today;
  state.events.count += 1;
  if (!state.events.seen.includes(def.id)) state.events.seen.push(def.id);
  state.events.log.unshift({ day: today, title: def.title, result: choice.result });
  if (state.events.log.length > EVENT_LOG_LIMIT) {
    state.events.log.length = EVENT_LOG_LIMIT;
  }
  return choice.result;
}
