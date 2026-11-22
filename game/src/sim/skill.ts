/**
 * 手上的功夫（批次 6）：十二支技法 × 三级 = 三十六个节点。
 *
 * 数据在 `data/skill.ts`；这一层只管三件事：
 * 1. 能不能练（钱、人情、上一级练没练）；
 * 2. 练完了落成哪几个乘数（统一夹在 `SKILL_CAP` 里）；
 * 3. 面板要看的视图。
 *
 * 与店员专精（A9）的分界：专精是**店里的人**学会了，人走了加成还在但只算一份；
 * 手上的功夫是**老板自己**的，一辈子跟着走，所以两条链各算各、各自封顶。
 */

import { SKILL_BRANCHES, SKILL_BY_ID, SKILL_TOTAL, skillById, type SkillBranch, type SkillEffect } from "../data/skill";
import type { GameState } from "./state";
import { pushSkillNews } from "./news";

/** 五条出口的封顶：三十六节点全练满也只能到这里，否则乘数会失真 */
export const SKILL_CAP = {
  servePct: 0.15,
  costPct: 0.12,
  patiencePct: 0.15,
  satBonus: 4,
  attractPct: 0.12,
} as const;

export interface SkillResult {
  ok: boolean;
  reason?: string;
  line?: string;
  level?: number;
}

/** 这一支练到第几级（0 = 还没练） */
export function skillLevelOf(state: GameState, id: string): number {
  const v = (state.skills ?? {})[id];
  return typeof v === "number" && v > 0 ? Math.min(3, Math.floor(v)) : 0;
}

/** 已经练过多少个节点（面板抬头用） */
export function skillCount(state: GameState): number {
  return SKILL_BRANCHES.reduce((n, b) => n + skillLevelOf(state, b.id), 0);
}

export function skillSummary(state: GameState): string {
  return `${skillCount(state)} / ${SKILL_TOTAL} 节点`;
}

/** 一支三级全练满了吗 */
export function branchMastered(state: GameState, id: string): boolean {
  return skillLevelOf(state, id) >= 3;
}

function addEffect(acc: Required<SkillEffect>, e: SkillEffect): void {
  acc.servePct += e.servePct ?? 0;
  acc.costPct += e.costPct ?? 0;
  acc.patiencePct += e.patiencePct ?? 0;
  acc.satBonus += e.satBonus ?? 0;
  acc.attractPct += e.attractPct ?? 0;
}

/** 十二支加起来的效果，逐项夹进 SKILL_CAP */
export function skillBonus(state: GameState): Required<SkillEffect> {
  const acc: Required<SkillEffect> = { servePct: 0, costPct: 0, patiencePct: 0, satBonus: 0, attractPct: 0 };
  for (const b of SKILL_BRANCHES) {
    const lv = skillLevelOf(state, b.id);
    for (let i = 0; i < lv; i += 1) addEffect(acc, b.levels[i]!.effect);
  }
  return {
    servePct: Math.min(SKILL_CAP.servePct, acc.servePct),
    costPct: Math.min(SKILL_CAP.costPct, acc.costPct),
    patiencePct: Math.min(SKILL_CAP.patiencePct, acc.patiencePct),
    satBonus: Math.min(SKILL_CAP.satBonus, acc.satBonus),
    attractPct: Math.min(SKILL_CAP.attractPct, acc.attractPct),
  };
}

export function skillServeFactor(state: GameState): number {
  return Math.max(0.4, 1 - skillBonus(state).servePct);
}

export function skillCostFactor(state: GameState): number {
  return Math.max(0.5, 1 - skillBonus(state).costPct);
}

export function skillPatienceMult(state: GameState): number {
  return 1 + skillBonus(state).patiencePct;
}

export function skillSatBonus(state: GameState): number {
  return skillBonus(state).satBonus;
}

export function skillAttractMult(state: GameState): number {
  return 1 + skillBonus(state).attractPct;
}

export interface SkillView {
  branch: SkillBranch;
  level: number;
  /** 下一级要花什么；已满级为 null */
  next: { line: string; favorCost: number; costYuan: number; effect: SkillEffect } | null;
  /** 现在就能练 */
  affordable: boolean;
  /** 钱与人情不够时的人话 */
  reason?: string;
}

export function skillViews(state: GameState): SkillView[] {
  return SKILL_BRANCHES.map((branch) => {
    const level = skillLevelOf(state, branch.id);
    const next = level >= 3 ? null : branch.levels[level]!;
    if (!next) return { branch, level, next: null, affordable: false };
    if (state.favor < next.favorCost) {
      return { branch, level, next, affordable: false, reason: `要 ${next.favorCost} 点人情，现在只有 ${Math.floor(state.favor)} 点` };
    }
    if (state.cash < next.costYuan) {
      return { branch, level, next, affordable: false, reason: `要 ¥${next.costYuan.toLocaleString("zh-CN")}` };
    }
    return { branch, level, next, affordable: true };
  });
}

/**
 * 练一级。必须按顺序练，所以只有「下一级」这一种可能。
 * 人情是「街坊认你」，钱是「买料自己练」—— 与店员专精同口径。
 */
export function learnSkill(state: GameState, id: string): SkillResult {
  const branch = SKILL_BY_ID.get(id);
  if (!branch) return { ok: false, reason: "没有这一支" };
  if (branch.prev) {
    const need = skillById(branch.prev);
    if ((state.skills?.[branch.prev] ?? 0) < 1) {
      return { ok: false, reason: `先练「${need?.name ?? branch.prev}」` };
    }
  }
  const level = skillLevelOf(state, id);
  if (level >= 3) return { ok: false, reason: `「${branch.name}」已经练满了` };
  const next = branch.levels[level]!;
  if (state.favor < next.favorCost) {
    return { ok: false, reason: `要 ${next.favorCost} 点人情，现在只有 ${Math.floor(state.favor)} 点` };
  }
  if (state.cash < next.costYuan) {
    return { ok: false, reason: `要 ¥${next.costYuan.toLocaleString("zh-CN")}` };
  }
  state.favor = Math.max(0, state.favor - next.favorCost);
  state.cash -= next.costYuan;
  state.skills = { ...(state.skills ?? {}), [id]: level + 1 };
  // 批次十一：练满一支就在街坊报上留一行 —— 手上的功夫也该被街上看见
  if (level + 1 >= 3) pushSkillNews(state, branch.name);
  return { ok: true, line: next.line, level: level + 1 };
}

/** 面板一句：这一支练到哪、下一级练什么 */
export function skillLine(view: SkillView): string {
  if (!view.next) return "练满了";
  if (view.level === 0) return `${view.next.line}（人情 ${view.next.favorCost} · ¥${view.next.costYuan}）`;
  return `下一级：${view.next.line}（人情 ${view.next.favorCost} · ¥${view.next.costYuan}）`;
}

export function skillEffectWords(e: SkillEffect): string {
  const parts: string[] = [];
  if (e.servePct) parts.push(`出碗快 ${Math.round(e.servePct * 100)}%`);
  if (e.costPct) parts.push(`料钱省 ${Math.round(e.costPct * 100)}%`);
  if (e.patiencePct) parts.push(`耐心 +${Math.round(e.patiencePct * 100)}%`);
  if (e.satBonus) parts.push(`满意 +${e.satBonus}`);
  if (e.attractPct) parts.push(`进店 +${Math.round(e.attractPct * 100)}%`);
  return parts.join(" · ");
}
