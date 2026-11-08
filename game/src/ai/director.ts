import type { GameEventDef } from "../data/events";
import type { GameState } from "../sim/state";

/**
 * AI 事件导演（前端侧）。
 *
 * 边界（照需求 §5/§11）：
 * - AI 只从已经选好的事件里写「叙述」，不选事件、不产出任何数值；
 * - 远程文案出现阿拉伯数字 → 丢弃，回落本地；
 * - 800ms 超时；没有代理地址时纯本地，游戏离线可完整通关。
 *
 * 本地文案是确定性模板（哈希 id+日期），不消耗 state.rng，
 * 所以「同种子同结局」不受影响。
 */

export interface EventNarrative {
  body: string;
  reactions: string[];
  source: "local" | "remote";
}

const OPENERS = [
  "清晨的骑楼还带着潮气，卷帘门刚推上去。",
  "锅里的水刚响，巷口已经有人探头。",
  "酸笋味先一步出了门，街坊跟着味道过来。",
  "早市刚散，门口的水泥地还湿着。",
  "收音机里播着本地新闻，你把第一锅汤点上。",
] as const;

const POSITIVE = [
  "街坊把这事记在了心里。",
  "这条街的消息传得比粉还快。",
  "第二天就有人点名要这一口。",
  "隔壁摊主路过，冲你竖了个大拇指。",
] as const;

const NEGATIVE = [
  "有人在本地的群里嘀咕了两句。",
  "门口的风声不太对，熟客来得少了。",
  "账是省下了，人情薄了一层。",
  "这条街忘性不大。",
] as const;

const NEUTRAL = [
  "你把这事在心里过了一遍。",
  "日子照旧，锅气没断。",
  "收摊时你想起白天那一幕。",
] as const;

function hash(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

function keyOf(state: GameState, def: GameEventDef): string {
  return `${def.id}:${state.month}:${state.day}`;
}

export function localNarrative(state: GameState, def: GameEventDef): EventNarrative {
  const h = hash(keyOf(state, def));
  const opener = OPENERS[h % OPENERS.length] ?? OPENERS[0];
  return {
    body: `${opener}${def.body}`,
    reactions: [],
    source: "local",
  };
}

/** 结算后的一句街坊反应，按效果正负挑语气，避免和选项结果打架 */
export function localReaction(state: GameState, def: GameEventDef, choiceIndex: number): string {
  const choice = def.choices[choiceIndex];
  if (!choice) return "";
  let positive = 0;
  let negative = 0;
  for (const e of choice.effects) {
    if (e.amount > 0) positive += 1;
    if (e.amount < 0) negative += 1;
  }
  const pool = positive > negative ? POSITIVE : negative > positive ? NEGATIVE : NEUTRAL;
  const h = hash(`${keyOf(state, def)}:${choiceIndex}`);
  const line = pool[h % pool.length] ?? NEUTRAL[0];
  return `${choice.result}${line}`;
}

interface RemotePayload {
  body?: unknown;
  reactions?: unknown;
}

/**
 * 有 VITE_AI_PROXY_URL 时才联网；代理由服务端持 key。
 * 任何异常、超时、含数字、结构不对 → 返回 null，调用方保持本地文案。
 */
export async function fetchEventNarrative(
  state: GameState,
  def: GameEventDef,
): Promise<EventNarrative | null> {
  const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env;
  const url = env?.VITE_AI_PROXY_URL;
  if (!url) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 800);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        eventId: def.id,
        month: state.month + 1,
        day: state.day,
        tone: "nanning-hua",
        forbidNumbers: true,
      }),
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const data = (await res.json()) as RemotePayload;
    if (typeof data.body !== "string") return null;
    const body = data.body.trim();
    if (body.length === 0 || /\d/.test(body)) return null;
    const reactions = Array.isArray(data.reactions)
      ? data.reactions.filter((r): r is string => typeof r === "string" && !/\d/.test(r)).slice(0, 2)
      : [];
    return { body: body.slice(0, 240), reactions, source: "remote" };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
