/**
 * 比赛（对齐开罗 `help.txt` 的 Contest 1-2 与「六月/十二月」赛制）。
 *
 * 三件事共同制造中期决策：
 *   ① 一年只两场（`sim/calendar.ts`）—— 错过要等半年；
 *   ② 三条备战路线（后厨擂台 / 街坊口碑赛 / 招牌评比），同一份资源不可能三条都赢；
 *   ③ 档位被段位卡住 —— 不评段位只能报一档，奖金封顶 ¥1,200。
 *
 * 对手是「12 个其他城市」的确定性样本（同一局同一个月的分数固定，可复算），
 * 分数 = 档位基准 × (1 ± 12% 噪声)，跟玩家到底多强无关 —— 变强只改变你的名次。
 */

import {
  CONTEST_TYPE_BY_ID,
  CONTEST_TIERS,
  type ContestTypeId,
  prizeOf,
  tierOf,
} from "../data/contest";
import type { ContestResult, GameState } from "./state";
import { isContestMonth, contestRoundOf, monthsToContest } from "./calendar";
import { skillTotal } from "./staff";
import { noteWin, strongestRival } from "./rivals";
import { FAVOR_GAIN } from "../data/favor";
import { addFavorFree } from "./favor";

/** FNV-1a：把 (玩家, 月份, 类型, 对手) 折成 0-1 的确定性噪声 */
function noise(seed: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return (h >>> 0) / 4294967296;
}

/** 对手名册：开罗的 Contest 不点名对手，我们沿用「外地城市」的写法 */
const RIVALS: readonly { id: string; name: string; style: string }[] = [
  { id: "cs", name: "长沙·米粉铺", style: "码子给得狠" },
  { id: "gz", name: "广州·肠粉世家", style: "滑得没脾气" },
  { id: "cc", name: "重庆·小面摊", style: "辣得直冒汗" },
  { id: "cd", name: "成都·担担面", style: "麻得后劲足" },
  { id: "gy", name: "贵阳·酸汤粉", style: "酸得开胃" },
  { id: "mz", name: "蒙自·过桥米线", style: "汤面浮油" },
  { id: "xa", name: "西安·油泼面", style: "一勺油泼下去" },
  { id: "lz", name: "兰州·牛肉面", style: "一清二白" },
  { id: "wh", name: "武汉·热干面", style: "芝麻酱拌得稠" },
  { id: "nj", name: "南京·鸭血粉丝", style: "汤清料足" },
  { id: "hz", name: "杭州·片儿川", style: "笋片脆" },
  { id: "nn", name: "南宁·老友粉", style: "酸笋猛火" },
];

export interface ContestEntry {
  type: ContestTypeId;
  /** 玩家能报的最高档（受段位限制） */
  maxTier: number;
  /** 玩家当前竞技分（按该类型的口径算） */
  score: number;
}

/** 玩家在某类比赛上的竞技分 —— 三条口径互不相同，这是「选路线」的根 */
export function contestScore(state: GameState, type: ContestTypeId): number {
  switch (type) {
    case "staff": {
      const onDuty = state.staff.roster.length;
      const skill =
        skillTotal(state, "cook") + skillTotal(state, "server") + skillTotal(state, "prep");
      // 人少但精也算分：技能总和 ×2，加上「人手能开几口灶」
      return Math.round(skill * 2 + onDuty * 8);
    }
    case "customers": {
      const regulars = Object.keys(state.regulars).length;
      return Math.round(state.totalCustomers / 18 + regulars * 3 + state.tally.bowls / 120);
    }
    case "shop": {
      return Math.round(state.reputation * 22 + state.gradeLevel * 8 + state.tally.bestDayRevenue / 12);
    }
    default:
      return 0;
  }
}

/** 段位允许的最高档：0 段只能报 1 档，8 段起可报 5 档 */
export function maxTierOf(state: GameState): number {
  let tier = 1;
  for (const t of CONTEST_TIERS) {
    if (state.gradeLevel >= t.minGrade) tier = t.tier;
  }
  return tier;
}

/** 三类比赛的报名面板数据 */
export function contestEntries(state: GameState): ContestEntry[] {
  return [...CONTEST_TYPE_BY_ID.keys()].map((type) => ({
    type,
    maxTier: maxTierOf(state),
    score: contestScore(state, type),
  }));
}

export interface ContestGate {
  ok: boolean;
  reason: string;
}

/** 这一届能不能报名（月份 + 是否已报 + 现金） */
export function canEnter(state: GameState, tier?: number): ContestGate {
  if (state.finished) return { ok: false, reason: "本届赛事已结束" };
  if (!isContestMonth(state.month)) {
    const wait = monthsToContest(state.month);
    return { ok: false, reason: `比赛在六月和十二月，还要等 ${wait} 个月` };
  }
  if (state.contest.lastRound === contestRoundOf(state.month)) {
    return { ok: false, reason: "这一届已经报过名了" };
  }
  const t = tierOf(tier ?? maxTierOf(state));
  if (state.gradeLevel < t.minGrade) {
    return { ok: false, reason: `要评到第 ${t.minGrade} 段才能进 ${t.tier} 档` };
  }
  if (state.cash < t.feeYuan) {
    return { ok: false, reason: `报名费 ¥${t.feeYuan}` };
  }
  return { ok: true, reason: "" };
}

export interface BoardOutcome {
  score: number;
  rank: number;
  prize: number;
  champion: string;
}

/**
 * 只跑「评分 + 名次 + 名次带来的副作用」（口碑 / 人情 / 同条街服气 / wins）。
 *
 * 月赛（一年两届）与具名赛事（`sim/tourneys.ts` 的十四场）共用这一段 ——
 * 两边唯一的不同是「能不能报名」的规则，出成绩的口径必须一模一样，
 * 否则同一家店在两个入口打出来的名次会不一样，玩家一眼就能看出来。
 */
export function runBoardCore(
  state: GameState,
  type: ContestTypeId,
  tier: number,
  roundKey: string,
): BoardOutcome {
  const t = tierOf(tier);
  const mine = contestScore(state, type);

  const board = RIVALS.map((r) => {
    const n = noise(`${state.playerId}|${roundKey}|${type}|${r.id}`);
    return {
      id: r.id,
      name: r.name,
      style: r.style,
      score: Math.round(t.rivalScore * (0.88 + n * 0.24)),
    };
  });
  const me = { id: "player", name: "你的店", style: "老友粉", score: mine };
  const all = [...board, me].sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
  const rank = all.findIndex((e) => e.id === "player") + 1;

  const prize = prizeOf(tier, rank);

  // 名次 → 口碑（开罗：参赛得名次本身就让店更出名）
  if (rank === 1) state.reputation = Math.min(5, state.reputation + 0.35);
  else if (rank <= 3) state.reputation = Math.min(5, state.reputation + 0.2);
  else if (rank <= 10) state.reputation = Math.min(5, state.reputation + 0.06);

  // 人情（M3b）：比赛名次也是街坊口碑的一种，照开罗 Ramen Arena 的奖品思路给点面子。
  if (rank <= 3) {
    const favor = FAVOR_GAIN.contestTop3[rank - 1] ?? 0;
    if (favor > 0) addFavorFree(state, favor, `比赛第 ${rank} 名`);
  }
  if (rank <= 3) {
    state.contest.wins += 1;
    // M1 同条街：比赛赢的是这条街的脸面 —— 本区最强的那家开始服气，攒够三次份额砍半
    const top = strongestRival(state);
    if (top && noteWin(state, top.def.id)) {
      state.flow.lastStreet = `${top.def.name}服气了：门口挂块「输给你」的牌，抢的客砍半`;
    }
  }

  return { score: mine, rank, prize, champion: all[0]?.name ?? "—" };
}

/**
 * 报名并当场出成绩。
 * 返回 null = 报名不合规（月份不对/已报过/钱不够/段位不够），调用方负责提示。
 */
export function enterContest(
  state: GameState,
  type: ContestTypeId,
  tier?: number,
): ContestResult | null {
  const wantTier = tier ?? maxTierOf(state);
  if (!canEnter(state, wantTier).ok) return null;

  const t = tierOf(wantTier);
  const round = contestRoundOf(state.month);

  state.cash -= t.feeYuan;
  state.contest.lastRound = round;

  const out = runBoardCore(state, type, wantTier, String(round));
  state.cash += out.prize;

  const result: ContestResult = {
    month: state.month,
    round,
    type,
    tier: wantTier,
    score: out.score,
    rank: out.rank,
    champion: out.champion,
    prize: out.prize,
  };
  state.contest.results.push(result);
  return result;
}
