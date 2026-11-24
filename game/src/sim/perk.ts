/**
 * 手艺点的取数与花法（批 K′）。
 *
 * 点从段位来：晋一段发一次（`PERK_AWARD_BY_LEVEL`，合计 64 点，正好点满 16 项）。
 * 花在 `data/perk.ts` 的四类杠杆上，每类都有封顶（`PERK_CAP`）——
 * 与技法（`SKILL_CAP`）、浇头熟练度（`XP_TASTE_CAP`）同一套纪律：
 * **能感觉出来，但不能越叠越强**。
 */

import {
  PERK_AWARD_BY_LEVEL,
  PERK_BY_ID,
  PERK_CAP,
  PERK_FAMILY_NAMES,
  PERK_POINT_TOTAL,
  PERKS,
  perksOfFamily,
  perkEffectWords,
  type PerkDef,
  type PerkEffectKind,
  type PerkFamily,
} from "../data/perk";
import type { GameState } from "./state";

/** 已经挣到的点数（按当前段位算，不从存档读冗余数） */
export function perkEarned(state: GameState): number {
  const lv = Math.max(0, Math.round(state.gradeLevel ?? 0));
  const n = Math.min(lv, PERK_AWARD_BY_LEVEL.length);
  let sum = 0;
  for (let i = 0; i < n; i += 1) sum += PERK_AWARD_BY_LEVEL[i] ?? 0;
  return Math.min(PERK_POINT_TOTAL, sum);
}

export function perkOwnedIds(state: GameState): string[] {
  return Object.keys(state.perks ?? {}).filter((id) => (state.perks?.[id] ?? 0) > 0);
}

export function perkOwned(state: GameState, id: string): boolean {
  return (state.perks?.[id] ?? 0) > 0;
}

/** 已经花掉的点数 */
export function perkSpent(state: GameState): number {
  let sum = 0;
  for (const id of perkOwnedIds(state)) sum += PERK_BY_ID.get(id)?.cost ?? 0;
  return sum;
}

/** 还剩几点可用 */
export function perkPoints(state: GameState): number {
  return Math.max(0, perkEarned(state) - perkSpent(state));
}

export function perkLevelOf(state: GameState, id: string): number {
  return perkOwned(state, id) ? 1 : 0;
}

function sumOf(state: GameState, kind: PerkEffectKind): number {
  let sum = 0;
  for (const id of perkOwnedIds(state)) {
    const p = PERK_BY_ID.get(id);
    if (p && p.effect.kind === kind) sum += p.effect.amount;
  }
  return Math.min(PERK_CAP[kind], sum);
}

/** 味道末段 +N（与浇头熟练度同一个夹子，score.ts 里 min(100, …)） */
export function perkTasteCap(state: GameState): number {
  return sumOf(state, "taste");
}

/** 加购时能多配几样浇头 */
export function perkToppingBonus(state: GameState): number {
  return Math.round(sumOf(state, "topping"));
}

/** 出碗三段各减多少分钟（正数；实际减到 0.6 分就停） */
export function perkServeDelta(state: GameState): number {
  return sumOf(state, "serve");
}

/** 人情日上限 +N */
export function perkFavorCapBonus(state: GameState): number {
  return Math.round(sumOf(state, "favor"));
}

export interface PerkView {
  def: PerkDef;
  owned: boolean;
  affordable: boolean;
  reason: string;
  /** 这一条现在值多少（含封顶后的实际值） */
  effectWords: string;
}

export function perkViews(state: GameState): PerkView[] {
  const pts = perkPoints(state);
  return PERKS.map((def) => {
    const owned = perkOwned(state, def.id);
    let reason = "";
    if (owned) reason = "已经点过";
    else if (pts < def.cost) reason = `还差 ${def.cost - pts} 点手艺`;
    return {
      def,
      owned,
      affordable: reason === "",
      reason,
      effectWords: perkEffectWords(def.effect),
    };
  });
}

export interface BuyPerkResult {
  ok: boolean;
  line: string;
  reason: string;
}

export function buyPerk(state: GameState, id: string): BuyPerkResult {
  const def = PERK_BY_ID.get(id);
  if (!def) return { ok: false, line: "", reason: "没有这一项" };
  if (perkOwned(state, id)) return { ok: false, line: "", reason: "已经点过" };
  const pts = perkPoints(state);
  if (pts < def.cost) return { ok: false, line: "", reason: `还差 ${def.cost - pts} 点手艺` };
  state.perks = { ...(state.perks ?? {}), [id]: 1 };
  return { ok: true, line: `${def.name} —— ${def.what}`, reason: "" };
}

export interface PerkFamilyView {
  family: PerkFamily;
  name: string;
  rows: PerkView[];
  owned: number;
  total: number;
  /**
   * 这一族里「先点这个」的那一项（解 P306：十六项同质，第一次打开不知点哪条）。
   *
   * 规矩简单到能解释：同族里还没点的、最便宜的那一项。便宜不等于差，
   * 它只是最早能用上一项；贵的留到点数宽松时再说。
   */
  rec?: string;
}

export function perkFamilies(state: GameState): PerkFamilyView[] {
  const all = perkViews(state);
  return (Object.keys(PERK_FAMILY_NAMES) as PerkFamily[]).map((family) => {
    const rows = all.filter((v) => v.def.family === family);
    const next = rows
      .filter((r) => !r.owned)
      .sort((a, b) => a.def.cost - b.def.cost || a.def.id.localeCompare(b.def.id))[0];
    return {
      family,
      name: PERK_FAMILY_NAMES[family],
      rows,
      owned: rows.filter((r) => r.owned).length,
      total: perksOfFamily(family).length,
      rec: next?.def.id,
    };
  });
}

/** 抬头：「手艺 · 还剩 5 点」 */
export function perkSummary(state: GameState): string {
  const left = perkPoints(state);
  const owned = perkOwnedIds(state).length;
  return `手艺 · 点了 ${owned} / ${PERKS.length} 项 · 还剩 ${left} 点`;
}
