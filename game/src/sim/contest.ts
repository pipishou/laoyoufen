import { CONTEST_ENTRY_FEE, CONTEST_PRIZE, CONTEST_RIVALS, CONTEST_TOP10_PRIZE } from "../data/contest";
import { unlock } from "./collection";
import type { ContestResult, GameState } from "./state";

/** FNV-1a，把 (玩家, 月份, 对手) 折成 0-1 的确定性噪声 */
function noise(seed: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return (h >>> 0) / 4294967296;
}

/** 对手当天发挥：实力 ±4.5，纯函数，服务端可复算 */
export function rivalScore(state: GameState, rivalId: string, strength: number): number {
  const n = noise(`${state.playerId}|${state.month}|${rivalId}`);
  return Math.round(strength + (n - 0.5) * 9);
}

export interface ContestGate {
  ok: boolean;
  reason: string;
}

export function canEnter(state: GameState): ContestGate {
  if (state.finished) return { ok: false, reason: "本届赛事已结束" };
  if (state.contest.lastMonth === state.month) return { ok: false, reason: "本月已经报过名" };
  if (state.cash < CONTEST_ENTRY_FEE) return { ok: false, reason: `报名费 ¥${CONTEST_ENTRY_FEE}` };
  return { ok: true, reason: "" };
}

/**
 * 报名参赛：口味分越高排名越好。
 * 结果、名次、奖金全部落进 state.contest.results，可回看。
 */
export function enterContest(state: GameState, tasteScore: number): ContestResult | null {
  if (!canEnter(state).ok) return null;

  state.cash -= CONTEST_ENTRY_FEE;
  state.contest.lastMonth = state.month;

  const board = CONTEST_RIVALS.map((r) => ({
    id: r.id,
    name: `${r.province}·${r.city}`,
    signature: r.signature,
    score: rivalScore(state, r.id, r.strength),
  }));
  board.push({ id: "player", name: "你的店", signature: "老友粉", score: Math.round(tasteScore) });
  board.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));

  const rank = board.findIndex((e) => e.id === "player") + 1;
  const champion = board[0]?.name ?? "—";

  let prize = 0;
  if (rank <= 3) prize = CONTEST_PRIZE[rank - 1] ?? 0;
  else if (rank <= 10) prize = CONTEST_TOP10_PRIZE;

  state.cash += prize;
  if (rank === 1) state.reputation = Math.min(5, state.reputation + 0.5);
  else if (rank <= 3) state.reputation = Math.min(5, state.reputation + 0.3);
  else if (rank <= 10) state.reputation = Math.min(5, state.reputation + 0.1);

  // 赢过的省进图鉴
  const playerScore = tasteScore;
  for (const entry of board) {
    if (entry.id === "player") continue;
    if (entry.score < playerScore) unlock(state, "provinces", entry.id);
  }

  const result: ContestResult = {
    month: state.month,
    score: Math.round(tasteScore),
    rank,
    champion,
    prize,
  };
  state.contest.results.push(result);
  return result;
}
