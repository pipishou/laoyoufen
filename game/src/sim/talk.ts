/**
 * 客人说话（A12）的取句：按**处境**选场面，再按哈希选句。
 *
 * 不消耗 `state.rng` —— 同一局读档回来，同一个人说的还是同一句。
 */

import { TALKS, talkById, type TalkDef, type TalkKind } from "../data/talk";
import type { GameState, QueueCustomer } from "./state";

function hash(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/** 这个客人此刻属于哪种场面 */
export function talkKindOf(state: GameState, c: QueueCustomer): TalkKind {
  if (c.status === "waiting") return "queue";
  if (c.regular) return "regular";
  // 吃完的人看不出满意度 —— 用他这一轮等的时长与当前口碑近似
  const late = c.waited > 4;
  if (state.reputation >= 3.8 && !late) return "praise";
  if (late) return "complain";
  return "plain";
}

export function talkFor(state: GameState, c: QueueCustomer): { def: TalkDef; text: string } {
  const kind = talkKindOf(state, c);
  const def = talkById(kind) ?? TALKS[0]!;
  const key = `${state.playerId}:${c.archetypeId}:${c.id}:${state.month}:${state.day}`;
  const text = def.lines[hash(key) % def.lines.length] ?? def.lines[0]!;
  return { def, text };
}

/** AI 语境：只放名词，够模型知道「谁在什么处境下说话」 */
export function talkVoiceContext(state: GameState, c: QueueCustomer, archetypeName: string): Record<string, string> {
  const kind = talkKindOf(state, c);
  const def = talkById(kind);
  return { 人: archetypeName, 场面: def?.label ?? "吃完了" };
}
