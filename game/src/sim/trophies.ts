import { FAVOR_MAX } from "../data/favor";
import { TROPHIES, TROPHY_BY_ID, type TrophyDef, type TrophyGroup } from "../data/trophies";
import type { GameState } from "./state";

/**
 * 成就的判定与发奖（B 批）。
 *
 * 只做三件事：判（读现成字段）、发（人情优先，现金只给长期组）、记（进图鉴）。
 * **不碰任何机制数值** —— 成就的奖金不计入营收、不改客流、不改评分，
 * 否则替身跑出来的成长曲线会被这批"奖励"污染。
 *
 * 与 `sim/favor.ts` 的关系：这里直接改 `state.favor` / `state.favorTotal`，
 * 不走 `addFavor()`。原因是 `addFavor` 有每日上限（40 点，按碗数算），
 * 成就奖金不该被当天的碗数卡住；两处都写 `favorToday` 会让上限算不清。
 */
export interface TrophyHit {
  def: TrophyDef;
  favor: number;
  cash: number;
}

/** 已经拿到的 id 集合（读 state，不缓存）。 */
export function earnedTrophies(state: GameState): Set<string> {
  return new Set(state.trophies ?? []);
}

export function hasTrophy(state: GameState, id: string): boolean {
  return (state.trophies ?? []).includes(id);
}

export function trophyCount(state: GameState): number {
  return (state.trophies ?? []).length;
}

/**
 * 判一次，把新达成的记进 `state.trophies` 并发奖。
 *
 * 调用点只有一个：`endDay()`（日结之后、换日之前）。
 * 原因：成就里多数读的是「今天为止的累计」，日结前读会漏掉当天最后一分钟；
 * 而换日之后 `flow` 已经清零，读不到今天的峰值。
 */
export function checkTrophies(state: GameState): TrophyHit[] {
  const got = new Set(state.trophies ?? []);
  const hits: TrophyHit[] = [];
  for (const def of TROPHIES) {
    if (got.has(def.id)) continue;
    let ok = false;
    try {
      ok = def.goal(state);
    } catch {
      ok = false;
    }
    if (!ok) continue;
    got.add(def.id);
    const favor = def.reward.favor ?? 0;
    const cash = def.reward.cash ?? 0;
    if (favor > 0) {
      state.favor = Math.min(FAVOR_MAX, (state.favor ?? 0) + favor);
      state.favorTotal = (state.favorTotal ?? 0) + favor;
    }
    if (cash > 0) state.cash += cash;
    hits.push({ def, favor, cash });
  }
  if (hits.length > 0) {
    state.trophies = [...got];
    // 播报队列：main.ts 的 tickFeedback 一帧弹一条，多条依次弹完
    state.pendingTrophies = [...(state.pendingTrophies ?? []), ...hits.map((h) => h.def.id)];
  }
  return hits;
}

export interface TrophyView {
  def: TrophyDef;
  earned: boolean;
  /** 现在 / 目标，两者同源，进度条直接用 */
  cur: number;
  target: number;
  /** 0–1，仅用于画条 */
  pct: number;
  /** 未达成时的人话进度，如「42 / 100」；达成了给空串 */
  progressText: string;
}

const fmt = (n: number): string => (Number.isInteger(n) ? String(n) : n.toFixed(1));

export function trophyViews(state: GameState): TrophyView[] {
  const got = earnedTrophies(state);
  return TROPHIES.map((def) => {
    const earned = got.has(def.id);
    let cur = 0;
    let target = 1;
    try {
      const pair = def.progress(state);
      cur = pair[0];
      target = pair[1];
    } catch {
      cur = 0;
      target = 1;
    }
    const pct = target > 0 ? Math.max(0, Math.min(1, cur / target)) : 0;
    return {
      def,
      earned,
      cur,
      target,
      pct,
      progressText: earned ? "" : `${fmt(cur)} / ${fmt(target)}`,
    };
  });
}

export function trophyViewsOfGroup(state: GameState, group: TrophyGroup): TrophyView[] {
  return trophyViews(state).filter((v) => v.def.group === group);
}

export function trophySummary(state: GameState): string {
  const n = trophyCount(state);
  const total = TROPHIES.length;
  if (n === 0) return `0 / ${total} 枚`;
  if (n >= total) return `${total} / ${total} 枚 · 全部收齐`;
  return `${n} / ${total} 枚`;
}

/** 图鉴顶部那句：下一条最容易拿到的是什么 */
export function nextTrophy(state: GameState): TrophyView | null {
  const left = trophyViews(state).filter((v) => !v.earned);
  if (left.length === 0) return null;
  return left.sort((a, b) => b.pct - a.pct)[0] ?? null;
}

/**
 * HUD 左栏只放得下两行（176px 宽）：取「离得最近、还没拿到」的两枚。
 *
 * 试玩二轮 F6：左栏原来跑的是 `sim/achievements.ts` 那套 11 条老成就，
 * 图鉴页跑的是这一套 30 条 —— 同一局里两套「成就」并存，字段大量重叠，
 * 玩家在左栏看到的名字和图鉴里对不上。现在只留这一套。
 * 全收齐（30/30）时退回展示最近拿到的两枚，别让左栏空掉。
 */
export function nextTrophies(state: GameState, n = 2): TrophyView[] {
  const all = trophyViews(state);
  const left = all.filter((v) => !v.earned);
  if (left.length === 0) return all.slice(-n);
  return left.sort((a, b) => b.pct - a.pct).slice(0, n);
}

/** AI 落点 `trophy_voice` 的上下文：只递名词，递给模型的是「哪一枚」而不是条件 */
export function trophyVoiceContext(def: TrophyDef): Record<string, string> {
  const groupLabel: Record<TrophyGroup, string> = {
    start: "刚开张",
    craft: "做粉的手艺",
    business: "店里的生意",
    street: "这条街",
    rival: "同条街的对手",
    long: "做了几年之后",
  };
  return { 成就: def.name, 时候: groupLabel[def.group] };
}

export { TROPHY_BY_ID };
