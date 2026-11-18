/**
 * 同条街的逻辑层：谁在抢客、抢多少、什么时候服气、什么时候贴转让。
 *
 * 三层咬合：
 *   ① **份额**：同区同行的名气换算成「这个区一天有多少人进了他家门」，
 *      直接乘在客流池上（`demandCapOf`），所以「抢回来」不是文案，是算术。
 *   ② **服气**：你赢同一家三次，他不再跟你抢（份额砍半），并每月送你一次食材。
 *      南宁的街坊生意不是零和——把邻居做服气，比做垮更划算。
 *   ③ **接手**：撑不下去的那家会贴「旺铺转让」，接过来那个铺子的租金打折、
 *      那个区的池子变大。这是「同条街」这条线的高潮动作。
 */

import {
  FAME_MAX,
  PACIFY_WINS,
  RIVALS,
  RIVAL_BY_ID,
  SHARE_CAP,
  TAKEOVER_MIN_GRADE,
  TAKEOVER_POOL_BOOST,
  TAKEOVER_RENT_FACTOR,
  TIER_WORD,
  rivalsOfDistrict,
  type RivalDef,
} from "../data/rivals";
import type { GameState } from "./state";
import { gearRivalShield } from "./gear";

export interface RivalState {
  id: string;
  /** 名气，决定他抢走多少客 */
  fame: number;
  /** 你赢过他几次（服气判定） */
  wins: number;
  /** 撑不下去：贴了转让 */
  closed: boolean;
  /** 服气了：不再跟你抢 */
  pacified: boolean;
  /** 最近一句街坊话（AI 或本地兜底） */
  lastLine: string;
}

export function initRivals(): RivalState[] {
  return RIVALS.map((r) => ({
    id: r.id,
    fame: r.fame,
    wins: 0,
    closed: false,
    pacified: false,
    lastLine: r.lines[0] ?? "",
  }));
}

function find(state: GameState, id: string): RivalState | undefined {
  return (state.rivals ?? []).find((r) => r.id === id);
}

/** 单家此刻抢走这个区多少客流（0 表示不抢了） */
export function shareOfOne(rs: RivalState): number {
  if (rs.closed) return 0;
  const base = Math.min(SHARE_CAP, rs.fame / 120);
  return rs.pacified ? base * 0.5 : base;
}

/**
 * 本区同行合计抢走多少（0–0.35）。
 * 接进 `demandCapOf`：池子 × (1 − share)，于是「这条街有几家店」直接决定你能卖多少。
 */
export function rivalShareOf(state: GameState): number {
  const district = state.district || "xingning";
  let sum = 0;
  for (const rs of state.rivals ?? []) {
    const def = RIVAL_BY_ID.get(rs.id);
    if (!def || def.district !== district) continue;
    sum += shareOfOne(rs);
  }
  // 家当（M3）街坊锦旗：街坊认你家，同行抢不走那么多
  return Math.min(SHARE_CAP, sum) * gearRivalShield(state);
}

/** 接手过的铺子给的租金折扣（1 = 没接） */
export function takeoverRentFactor(state: GameState): number {
  const n = (state.takenOver ?? []).length;
  if (n === 0) return 1;
  // 接一家 −25%，接两家再多 −10%，最多 −35%（再低就是白送了）
  return Math.max(0.65, TAKEOVER_RENT_FACTOR - (n - 1) * 0.1);
}

/** 接过的铺子在那个区留下的客流加成（本区 +10%，别区 +0） */
export function takeoverPoolBoostOf(state: GameState): number {
  const district = state.district || "xingning";
  const here = (state.takenOver ?? []).filter((id) => RIVAL_BY_ID.get(id)?.district === district);
  return here.length > 0 ? TAKEOVER_POOL_BOOST : 0;
}

export interface RivalView {
  def: RivalDef;
  state: RivalState;
  tierWord: string;
  /** 他抢走本区多少客流（百分比整数） */
  sharePct: number;
  /** 他还差几次才服气 */
  toPacify: number;
  /** 能不能接手 */
  canTakeOver: boolean;
  takeoverReason: string | null;
  /** 你 vs 他：正数你强 */
  edge: number;
}

/** 你在这条街的站位：0–1，0.5 是平分 */
export function standingOf(state: GameState): number {
  const district = state.district || "xingning";
  const mine = Math.max(1, state.reputation) * 20;
  let best = 0;
  for (const rs of state.rivals ?? []) {
    const def = RIVAL_BY_ID.get(rs.id);
    if (!def || def.district !== district || rs.closed) continue;
    best = Math.max(best, def.signature.taste);
  }
  if (best === 0) return 1; // 这条街没人了
  return mine / (mine + best);
}

/** 面板用：本区同行的每一行 */
export function rivalViews(state: GameState): RivalView[] {
  const district = state.district || "xingning";
  const grade = state.gradeLevel ?? 0;
  return rivalsOfDistrict(district).map((def) => {
    const rs = find(state, def.id) ?? {
      id: def.id,
      fame: def.fame,
      wins: 0,
      closed: false,
      pacified: false,
      lastLine: def.lines[0] ?? "",
    };
    const sharePct = Math.round(shareOfOne(rs) * 100);
    const canTake = rs.closed;
    let reason: string | null = null;
    if ((state.takenOver ?? []).includes(def.id)) reason = "这间铺子已经是你的了";
    else if (!rs.closed) reason = "还在开着";
    else if (grade < TAKEOVER_MIN_GRADE) reason = `要评到第 ${TAKEOVER_MIN_GRADE} 段才接得下来`;
    else if (state.cash < def.takeoverFeeYuan) reason = `转让费 ¥${def.takeoverFeeYuan.toLocaleString("zh-CN")} 还差一点`;
    return {
      def,
      state: rs,
      tierWord: TIER_WORD[def.tier],
      sharePct,
      toPacify: Math.max(0, PACIFY_WINS - rs.wins),
      canTakeOver: canTake && reason === null,
      takeoverReason: reason,
      edge: state.reputation - def.signature.taste / 20,
    };
  });
}

export function streetSummary(state: GameState): string {
  const views = rivalViews(state);
  if (views.length === 0) return "这条街就你一家";
  const share = Math.round(rivalShareOf(state) * 100);
  const pacified = views.filter((v) => v.state.pacified).length;
  return `${views.length} 家在抢 · 他们拿走 ${share}% 的客 · 服气 ${pacified} 家`;
}

/** 名单：本区最强的那家（相对口碑拿它当尺子） */
export function strongestRival(state: GameState): RivalView | null {
  const alive = rivalViews(state).filter((v) => !v.state.closed);
  if (alive.length === 0) return null;
  return alive.reduce((a, b) => (b.def.signature.taste > a.def.signature.taste ? b : a));
}

/**
 * 赢了一场（比赛/落场/口碑赛）就记一笔：赢到 PACIFY_WINS 次，他服气。
 * 服气不是消失：份额砍半，每月还会送你一次食材（见 `pacifyGiftOf`）。
 */
export function noteWin(state: GameState, rivalId: string): boolean {
  const rs = find(state, rivalId);
  if (!rs || rs.closed) return false;
  rs.wins += 1;
  if (!rs.pacified && rs.wins >= PACIFY_WINS) {
    rs.pacified = true;
    return true;
  }
  return false;
}

/** 本月服气了的那几家，各送一次食材：每家抵 ¥1 成本（最多 ¥3） */
export function pacifyGiftOf(state: GameState): number {
  return Math.min(3, (state.rivals ?? []).filter((r) => r.pacified && !r.closed).length);
}

/**
 * 月初结算同条街：同行也在过日子。
 *
 * - 名气自然增长（他在做生意），上限看档位；
 * - 你上月评价高、又开在他隔壁 → 他被你抢走一点；
 * - 名气跌到 0 → 贴「旺铺转让」（closed），可以接手；
 * - 每家的街坊话轮换一句本地兜底（AI 版本由 `main.ts` 拿到后面再覆盖）。
 */
export function rivalMonthTick(state: GameState): { closed: string[]; lines: string[] } {
  const district = state.district || "xingning";
  const mine = Math.max(0.5, state.reputation);
  const closed: string[] = [];
  const lines: string[] = [];

  for (const rs of state.rivals ?? []) {
    const def = RIVAL_BY_ID.get(rs.id);
    if (!def) continue;
    if (rs.closed) {
      lines.push(`${def.name}贴了「旺铺转让」，卷闸门一直拉着。`);
      continue;
    }

    const here = def.district === district;
    // 他自己在进步
    let fame = rs.fame + (rs.pacified ? 0 : 1);
    // 你在隔壁、又比他好吃 → 他掉客
    if (here && mine >= 3 && !rs.pacified) fame -= 2;
    if (here && mine >= 4) fame -= 1;
    fame = Math.max(0, Math.min(FAME_MAX[def.tier], fame));
    rs.fame = fame;

    if (fame <= 0) {
      rs.closed = true;
      closed.push(def.name);
      lines.push(`${def.name}撑不下去了，卷闸门上贴了「旺铺转让」。`);
      continue;
    }

    // 台词按「月:日:店」哈希选，不用 Math.random —— 同一局存档读回来得是同一句，
    // 而且不消耗 state.rng（否则台词会把整条经济链的随机数拨歪）
    const seed = `${state.month}:${state.day}:${def.id}`;
    let h = 0x811c9dc5;
    for (let i = 0; i < seed.length; i++) {
      h ^= seed.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    const line = def.lines[h % def.lines.length] ?? def.lines[0] ?? "";
    rs.lastLine = line;
    if (here) lines.push(line);
  }

  return { closed, lines };
}

export interface TakeoverResult {
  ok: boolean;
  reason?: string;
  feeYuan?: number;
  /** 接手成功时的一句话（面板 toast 用） */
  line?: string;
}

/** 接手铺面：钱 + 段位 + 对方真的倒了 */
export function takeOverShop(state: GameState, rivalId: string): TakeoverResult {
  const rs = find(state, rivalId);
  const def = RIVAL_BY_ID.get(rivalId);
  if (!rs || !def) return { ok: false, reason: "没有这家同行" };
  if (!rs.closed) return { ok: false, reason: `${def.name}还在开着，接不了` };
  if ((state.takenOver ?? []).includes(rivalId)) return { ok: false, reason: "这间铺子已经是你的了" };
  if ((state.gradeLevel ?? 0) < TAKEOVER_MIN_GRADE) {
    return { ok: false, reason: `要评到第 ${TAKEOVER_MIN_GRADE} 段才接得下来` };
  }
  if (state.cash < def.takeoverFeeYuan) {
    return { ok: false, reason: `转让费 ¥${def.takeoverFeeYuan.toLocaleString("zh-CN")} 还差一点` };
  }
  state.cash -= def.takeoverFeeYuan;
  state.takenOver = [...(state.takenOver ?? []), rivalId];
  return {
    ok: true,
    feeYuan: def.takeoverFeeYuan,
    line: `盘下${def.name}的老铺子：这条街租金打七折，门口多一个入口`,
  };
}
