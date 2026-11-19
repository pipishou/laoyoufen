/**
 * 具名赛事的报名、推进与展示。
 *
 * 三层规则（都是为了让 14 场在 36 个月里既排得开、又不至于一场都摸不到）：
 *   ① 街道办级「随时可报」—— 前期就有事做，但一天只准一场（打多了会变成刷分）；
 *   ② 城区 / 市级 / 广西 / 全国「跟一年两届走」—— 六月一场、十二月一场（与 `sim/calendar.ts` 同构）；
 *   ③ 跨级晋升看的是「上一级有没有进过前三」，**不是**「上一级打完」——
 *      36 个月只够打 6 届，要求打完 3 场城区才能报市级，就永远摸不到全国。
 *
 * 出成绩一律走 `sim/contest.ts` 的 `runBoardCore()`，和月赛同一个口径：
 * 同一家店、同一个对手池，在两个入口打出来的名次要能对上。
 */

import { tierOf } from "../data/contest";
import {
  TOURNEYS,
  TOURNEY_BY_ID,
  TOURNEY_LEVEL_NAME,
  type TourneyDef,
  type TourneyLevel,
} from "../data/tourneys";
import { contestRoundOf } from "./calendar";
import { runBoardCore } from "./contest";
import type { GameState } from "./state";

/** 一场赛事的历史：打过几次、最好名次（0 = 没打过） */
export interface TourneyRecord {
  played: number;
  best: number;
}

const EMPTY: TourneyRecord = { played: 0, best: 0 };

export function tourneyRecordOf(state: GameState, id: string): TourneyRecord {
  return state.tourneys?.[id] ?? EMPTY;
}

/** 某一层级的最好名次（0 = 这一级一场都没进过名次） */
export function bestRankOfLevel(state: GameState, level: TourneyLevel): number {
  let best = 0;
  for (const def of TOURNEYS) {
    if (def.level !== level) continue;
    const rec = tourneyRecordOf(state, def.id);
    if (rec.best > 0 && (best === 0 || rec.best < best)) best = rec.best;
  }
  return best;
}

export interface TourneyGate {
  ok: boolean;
  reason: string;
}

/** 月份判断：6 月 = month % 12 === 5，12 月 = month % 12 === 11 */
function monthMatches(state: GameState, def: TourneyDef): boolean {
  const m = state.month % 12;
  if (def.when === "june") return m === 5;
  if (def.when === "december") return m === 11;
  return true;
}

export function tourneyGate(state: GameState, def: TourneyDef): TourneyGate {
  if (state.finished) return { ok: false, reason: "这一局已经结束了" };
  if (!monthMatches(state, def)) {
    return { ok: false, reason: def.when === "june" ? "这场只在每年六月办" : "这场只在每年十二月办" };
  }
  if (def.when === "anytime") {
    const today = state.month * 100 + state.day;
    if ((state.tourneyDay ?? -1) === today) {
      return { ok: false, reason: "今天已经打过一场了，明天再来" };
    }
  } else {
    const round = contestRoundOf(state.month);
    if ((state.tourneyRound ?? -1) === round) {
      return { ok: false, reason: "这一届已经报过一场了，下一届再来" };
    }
  }
  if (def.needLevel && def.needRank) {
    const best = bestRankOfLevel(state, def.needLevel);
    if (best === 0 || best > def.needRank) {
      return {
        ok: false,
        reason: `要先在${TOURNEY_LEVEL_NAME[def.needLevel]}进过前 ${def.needRank} 名`,
      };
    }
  }
  const t = tierOf(def.tier);
  if (state.gradeLevel < t.minGrade) {
    return { ok: false, reason: `要评到第 ${t.minGrade} 段才能报` };
  }
  if (state.cash < t.feeYuan) {
    return { ok: false, reason: `报名费 ¥${t.feeYuan}` };
  }
  return { ok: true, reason: "" };
}

export interface TourneyResult {
  def: TourneyDef;
  score: number;
  rank: number;
  prize: number;
  champion: string;
  /** 这场是第几次打（1 起） */
  times: number;
}

/** 报名并当场出成绩；返回 null = 报不上（原因见 `tourneyGate`） */
export function enterTourney(state: GameState, id: string): TourneyResult | null {
  const def = TOURNEY_BY_ID.get(id);
  if (!def) return null;
  if (!tourneyGate(state, def).ok) return null;

  const t = tierOf(def.tier);
  state.cash -= t.feeYuan;

  const roundKey = `T${def.id}|${state.month}|${state.day}`;
  const out = runBoardCore(state, def.type, def.tier, roundKey);
  state.cash += out.prize;

  const prev = tourneyRecordOf(state, def.id);
  const rec: TourneyRecord = {
    played: prev.played + 1,
    best: prev.best === 0 ? out.rank : Math.min(prev.best, out.rank),
  };
  state.tourneys = { ...(state.tourneys ?? {}), [def.id]: rec };

  if (def.when === "anytime") state.tourneyDay = state.month * 100 + state.day;
  else state.tourneyRound = contestRoundOf(state.month);

  return {
    def,
    score: out.score,
    rank: out.rank,
    prize: out.prize,
    champion: out.champion,
    times: rec.played,
  };
}

export interface TourneyView {
  def: TourneyDef;
  played: number;
  best: number;
  gate: TourneyGate;
  feeYuan: number;
  prizeYuan: number;
  minGrade: number;
}

export function tourneyViews(state: GameState): TourneyView[] {
  return TOURNEYS.map((def) => {
    const t = tierOf(def.tier);
    const rec = tourneyRecordOf(state, def.id);
    return {
      def,
      played: rec.played,
      best: rec.best,
      gate: tourneyGate(state, def),
      feeYuan: t.feeYuan,
      prizeYuan: t.prizeYuan,
      minGrade: t.minGrade,
    };
  });
}

export function tourneyViewsOfLevel(state: GameState, level: TourneyLevel): TourneyView[] {
  return tourneyViews(state).filter((v) => v.def.level === level);
}

/** 打过几场 / 一共几场 */
export function tourneyPlayedCount(state: GameState): number {
  return TOURNEYS.filter((def) => tourneyRecordOf(state, def.id).played > 0).length;
}

export function tourneySummary(state: GameState): string {
  const played = tourneyPlayedCount(state);
  let best = 0;
  for (const def of TOURNEYS) {
    const r = tourneyRecordOf(state, def.id).best;
    if (r > 0 && (best === 0 || r < best)) best = r;
  }
  const bestText = best === 0 ? "还没进过名次" : `最好第 ${best} 名`;
  return `打过 ${played} / ${TOURNEYS.length} 场 · ${bestText}`;
}

/** 下一场「差一点就能报」的：前置已满足、只是月份或段位差一点 */
export function nextTourney(state: GameState): TourneyView | null {
  const views = tourneyViews(state);
  const open = views.find((v) => v.gate.ok);
  if (open) return open;
  const ready = views
    .filter((v) => {
      if (!v.def.needLevel) return true;
      const best = bestRankOfLevel(state, v.def.needLevel);
      return best > 0 && best <= (v.def.needRank ?? 3);
    })
    .sort((a, b) => a.minGrade - b.minGrade || a.feeYuan - b.feeYuan);
  return ready[0] ?? null;
}

/** 层级进度：给 UI 的「街道办 3/3 · 城区 1/3 …」 */
export interface LevelProgress {
  level: TourneyLevel;
  name: string;
  played: number;
  total: number;
  best: number;
}

export function levelProgressOf(state: GameState): LevelProgress[] {
  const levels: TourneyLevel[] = [1, 2, 3, 4, 5];
  return levels.map((level) => {
    const defs = TOURNEYS.filter((d) => d.level === level);
    const played = defs.filter((d) => tourneyRecordOf(state, d.id).played > 0).length;
    return {
      level,
      name: TOURNEY_LEVEL_NAME[level],
      played,
      total: defs.length,
      best: bestRankOfLevel(state, level),
    };
  });
}
