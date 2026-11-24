import { SCRIPT_ACTS, SCRIPT_LAST_DAY, scriptActById, type ScriptAct } from "../data/script-days";
import { dayIndex } from "./calendar";
import type { GameState } from "./state";

/**
 * 前三十天十二幕的运行时（批 U′）。
 *
 * 两个出口，都是「说一句话」，都不动数值：
 *
 * 1. `tickScriptAct` 在每天开店那一刻把今天这一幕记下来（写 `state.flow.actToday`），
 *    打烊单上念一遍，然后这件事就算讲过了 —— 同一幕不会再讲第二次。
 * 2. 带 `eventId` 的那几幕，`tickEvents` 会优先把那一件事挂起来（见 sim/events.ts），
 *    这样「回南天」那天真的下雨，「隔壁开螺蛳粉」那天真的有人开张。
 *
 * 已经讲过哪几幕存在 `state.script.seen`（可选字段，老档没有就当空表，不升存档版本）。
 */

export function scriptSeen(state: GameState): readonly string[] {
  return state.script?.seen ?? [];
}

export function actSeen(state: GameState, id: string): boolean {
  return scriptSeen(state).includes(id);
}

/**
 * 今天这一幕：日号对得上、还没讲过。剧本只管头三十天，
 * 而且只看**日号**（每个月初一都是第一天）—— 剧本本来就是「开张的头一个月」。
 */
export function scriptActOn(state: GameState): ScriptAct | null {
  const abs = dayIndex(state.month, state.day);
  if (abs > SCRIPT_LAST_DAY) return null;
  const seen = scriptSeen(state);
  for (const act of SCRIPT_ACTS) {
    if (act.day === state.day && !seen.includes(act.id)) return act;
  }
  return null;
}

/** 记下这一幕已经讲过（幂等）。 */
export function markActSeen(state: GameState, id: string): void {
  const box = state.script ?? { seen: [] };
  if (!box.seen.includes(id)) box.seen.push(id);
  state.script = box;
}

/** 还有几幕没讲（打烊单/手册用得到，也是一个「新手期过没过完」的口径）。 */
export function scriptLeft(state: GameState): number {
  const seen = scriptSeen(state);
  return SCRIPT_ACTS.filter((a) => !seen.includes(a.id)).length;
}

export function scriptSummary(state: GameState): string {
  const left = scriptLeft(state);
  if (left === 0) return "头一个月的事都讲完了";
  return `头一个月还有 ${left} 件事没讲`;
}

/** 打烊单上念的那一句：标题 + 阿婆的原话。 */
export function actLine(act: ScriptAct | null): string {
  if (!act) return "";
  return `${act.title} · ${act.body}`;
}

/**
 * 每天开店那一刻调一次：把今天这一幕记下来。
 *
 * 返回今天这一幕（没有就 null）。**必须每分钟都调**——它自己看 `minuteOfDay`，
 * 只在零点那一刻动手，跟 `tickEvents` 同一个时点，谁先谁后都不影响结果。
 */
export function tickScriptAct(state: GameState): ScriptAct | null {
  if (state.flow.minuteOfDay !== 0) return null;
  const act = scriptActOn(state);
  state.flow.actToday = act ? act.id : "";
  if (!act) return null;
  markActSeen(state, act.id);
  return act;
}

/** 打烊单要念的那一句（读今天记下的那一幕；没讲过就是空串）。 */
export function actTodayLine(state: GameState): string {
  const id = state.flow.actToday;
  if (!id) return "";
  return actLine(scriptActById(id));
}
