import type { GameState } from "./state";
import { TIERS, DEFAULT_TIER, tierById, type TierDef, type TierId } from "../data/guest-tier";

/**
 * 顾客等级的抽样与四个出口（A8）。
 *
 * 抽样：先算「识食的」概率（口碑与段位抬），再算「街坊」概率（口碑抬），
 * 剩下的都是路过的。常客一律按街坊 —— 常客的定义就是「他认识这家店」，
 * 不该再被抽成路过的。
 *
 * 为什么不用 state.rng 之外的东西：这里拿到的 rand 由调用方从 state.rng 取，
 * 保证同种子同结局（1000 局确定性测试守着）。
 */

/** 识食的出现概率：0.04 起，口碑每点 +0.055，段位每级 +0.008，封顶 0.34 */
export function pickyChanceOf(state: GameState): number {
  const rep = Math.max(0, Math.min(5, state.reputation));
  const raw = 0.04 + rep * 0.055 + state.gradeLevel * 0.008;
  return Math.max(0.02, Math.min(0.34, raw));
}

/** 街坊的出现概率：0.32 起，口碑每点 +0.05，封顶 0.6；剩下的给路过的 */
export function neighborChanceOf(state: GameState): number {
  const rep = Math.max(0, Math.min(5, state.reputation));
  const raw = 0.32 + rep * 0.05 + state.gradeLevel * 0.006;
  return Math.max(0.2, Math.min(0.6, raw));
}

/**
 * 抽一位客人的等级。
 * `regular` 为真时直接给街坊 —— 老客不是被抽中的，是他自己回来的。
 */
export function rollTier(state: GameState, rand: number, regular: boolean): TierDef {
  if (regular) return tierById(DEFAULT_TIER);
  const picky = pickyChanceOf(state);
  const neighbor = neighborChanceOf(state);
  if (rand < picky) return tierById("picky");
  if (rand < picky + neighbor) return tierById("neighbor");
  return tierById("passer");
}

/** 钱包系数 */
export function tierBudgetPct(tier: TierDef): number {
  return tier.budgetPct;
}

/** 耐心系数 */
export function tierPatiencePct(tier: TierDef): number {
  return tier.patiencePct;
}

/** 口碑权重：他这一句话抵几句 */
export function tierRepWeight(tier: TierDef): number {
  return tier.repWeight;
}

/**
 * 挑剔扣分：识食的吃到不满意的，会当场说，而且说得比谁都准。
 * 只对低于 `pickMin` 的碗扣分，且扣的是**满意度**，不是口碑 ——
 * 口碑那一层已经由权重管着，不要两处都罚。
 */
export function tierSatPenalty(tier: TierDef, total: number): number {
  if (tier.pickMin === undefined || tier.pickPenalty === undefined) return 0;
  const gap = tier.pickMin - total;
  if (gap <= 0) return 0;
  return Math.min(18, gap * tier.pickPenalty);
}

/** 今日队列里各档几位（HUD 与图鉴用，只读不改状态） */
export function tierHeadcount(state: GameState): Record<TierId, number> {
  const out: Record<TierId, number> = { passer: 0, neighbor: 0, picky: 0 };
  for (const c of state.flow.customers) {
    const id = (c.tier ?? DEFAULT_TIER) as TierId;
    if (id in out) out[id] += 1;
  }
  return out;
}

export function tierSummary(state: GameState): string {
  const n = tierHeadcount(state);
  if (n.passer + n.neighbor + n.picky === 0) return "店里还没人";
  return `路过 ${n.passer} · 街坊 ${n.neighbor} · 识食 ${n.picky}`;
}

/** 给 AI 用：只说「哪一档客人」与「他为什么愿意等」，不带数字 */
export function tierVoiceContext(tier: TierDef): Record<string, string> {
  return { 客: tier.name, 脾气: tier.note };
}

export const TIER_TOTAL = TIERS.length;
