/**
 * 家当搭配（D 批）的逻辑层：哪几组成立、凑齐总量、面板视图。
 *
 * 不 import `sim/gear.ts`（那边要反过来 import 本文件算乘数），
 * 直接读 `state.gear`，避免循环依赖。
 *
 * 总量上限（CAP）的来历：八组全凑齐硬加是 进店 +5%、出碗 −7%、料钱 −4%、
 * 耐心 +15%、疲劳 −8%、满意 +2、抢客 −8%。单看都不算大，但家当本身已经
 * 叠了九个乘数，所以这里给每一类都留一个封顶，封顶之后多凑的那一组不再涨
 * ——「凑齐」是目标感，不是数值爆炸。
 */
import { COMBOS, COMBO_TOTAL, type ComboDef, type ComboEffect } from "../data/combo";
import { GEAR_BY_ID } from "../data/gear";
import type { GameState } from "./state";

export const COMBO_CAP: Required<ComboEffect> = {
  attractPct: 0.15,
  servePct: 0.1,
  costPct: 0.1,
  satBonus: 3,
  patiencePct: 0.2,
  drinkPct: 0.2,
  fatiguePct: 0.2,
  rivalShieldPct: 0.15,
};

function owns(state: GameState, id: string): boolean {
  return (state.gear ?? []).includes(id);
}

/** 任一对件都在，这一组就成立（照开罗「同组合名多行件对」） */
export function comboActive(state: GameState, def: ComboDef): boolean {
  return def.pairs.some(([a, b]) => owns(state, a) && owns(state, b));
}

export function activeCombos(state: GameState): ComboDef[] {
  return COMBOS.filter((def) => comboActive(state, def));
}

export interface ComboView {
  def: ComboDef;
  active: boolean;
  /** 这一组里哪几件还没买（去重、保持件对的先后） */
  missing: string[];
  /** 离凑齐只差一件 */
  nearly: boolean;
}

export function comboViews(state: GameState): ComboView[] {
  return COMBOS.map((def) => {
    const active = comboActive(state, def);
    const missing: string[] = [];
    let best = Number.POSITIVE_INFINITY;
    for (const pair of def.pairs) {
      const lack = pair.filter((id) => !owns(state, id));
      if (lack.length < best) {
        best = lack.length;
        missing.length = 0;
        for (const id of lack) if (!missing.includes(id)) missing.push(id);
      }
    }
    return { def, active, missing, nearly: !active && best <= 1 };
  });
}

/** 八组合并后的总加成（已按 CAP 夹住） */
export function comboTotals(state: GameState): Required<ComboEffect> {
  const sum = {
    attractPct: 0,
    servePct: 0,
    costPct: 0,
    satBonus: 0,
    patiencePct: 0,
    drinkPct: 0,
    fatiguePct: 0,
    rivalShieldPct: 0,
  };
  for (const def of activeCombos(state)) {
    sum.attractPct += def.effect.attractPct ?? 0;
    sum.servePct += def.effect.servePct ?? 0;
    sum.costPct += def.effect.costPct ?? 0;
    sum.satBonus += def.effect.satBonus ?? 0;
    sum.patiencePct += def.effect.patiencePct ?? 0;
    sum.drinkPct += def.effect.drinkPct ?? 0;
    sum.fatiguePct += def.effect.fatiguePct ?? 0;
    sum.rivalShieldPct += def.effect.rivalShieldPct ?? 0;
  }
  return {
    attractPct: Math.min(COMBO_CAP.attractPct, sum.attractPct),
    servePct: Math.min(COMBO_CAP.servePct, sum.servePct),
    costPct: Math.min(COMBO_CAP.costPct, sum.costPct),
    satBonus: Math.min(COMBO_CAP.satBonus, sum.satBonus),
    patiencePct: Math.min(COMBO_CAP.patiencePct, sum.patiencePct),
    drinkPct: Math.min(COMBO_CAP.drinkPct, sum.drinkPct),
    fatiguePct: Math.min(COMBO_CAP.fatiguePct, sum.fatiguePct),
    rivalShieldPct: Math.min(COMBO_CAP.rivalShieldPct, sum.rivalShieldPct),
  };
}

export function comboSummary(state: GameState): string {
  const on = activeCombos(state).length;
  const nearly = comboViews(state).filter((v) => v.nearly)[0];
  const tail = nearly ? ` · 再添一件${GEAR_BY_ID.get(nearly.missing[0]!)?.name ?? "家当"}就能凑「${nearly.def.name}」` : "";
  return `${on}/${COMBO_TOTAL} 组${tail}`;
}

/** 只差一件的那组里，缺的那件（面板与替身共用） */
export function nextCombo(state: GameState): ComboView | null {
  const views = comboViews(state).filter((v) => v.nearly);
  return views[0] ?? null;
}
