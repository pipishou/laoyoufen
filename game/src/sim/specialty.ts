/**
 * 店员专精（A9）的结算与学艺。
 *
 * 与 `sim/master.ts`（老师傅的方子）区别：
 *   方子钉的是**一款粉**，专精钉的是**一个人**。
 * 所以方子进 `item.master`，专精进 `member.specialty`。
 */

import { SPECIALTIES, SPECIALTY_BY_ID, specialtyById, specialtiesOfRole, type SpecialtyDef } from "../data/specialty";
import type { GameState, StaffMember } from "./state";

export interface SpecialtyResult {
  ok: boolean;
  reason?: string;
  line?: string;
  def?: SpecialtyDef;
}

export function specialtyOf(member: StaffMember | null | undefined): SpecialtyDef | null {
  return member ? specialtyById(member.specialty) : null;
}

export function hasSpecialty(member: StaffMember | null | undefined): boolean {
  return specialtyOf(member) !== null;
}

/** 这一位能学什么（岗位对不上就不给） */
export function learnableOf(member: StaffMember): readonly SpecialtyDef[] {
  return specialtiesOfRole(member.role);
}

export interface SpecialtyView {
  def: SpecialtyDef;
  owned: boolean;
  affordable: boolean;
}

export function specialtyViews(state: GameState, member: StaffMember): SpecialtyView[] {
  const own = member.specialty ?? "";
  return learnableOf(member).map((def) => ({
    def,
    owned: own === def.id,
    affordable: state.cash >= def.costYuan && state.favor >= def.favorCost,
  }));
}

/** 场上所有学过手艺的人 */
export function masteredStaff(state: GameState): StaffMember[] {
  return (state.staff?.roster ?? []).filter((m) => hasSpecialty(m));
}

export function specialtyCount(state: GameState): number {
  return masteredStaff(state).length;
}

export function specialtySummary(state: GameState): string {
  const roster = state.staff?.roster ?? [];
  if (roster.length === 0) return "还没雇人";
  const n = masteredStaff(state).length;
  return `${n} / ${roster.length} 位学出手艺`;
}

/**
 * 学艺：岗位必须对得上、还不能已经学过、人情与钱都要够。
 * 失败不扣任何东西。
 */
export function learnSpecialty(state: GameState, uid: string, id: string): SpecialtyResult {
  const member = (state.staff?.roster ?? []).find((m) => m.uid === uid);
  if (!member) return { ok: false, reason: "店里没有这个人" };
  const def = SPECIALTY_BY_ID.get(id);
  if (!def) return { ok: false, reason: "没有这门手艺" };
  if (def.role !== member.role) {
    return { ok: false, reason: `${member.name} 是${roleWord(member.role)}的，学不了${def.name}` };
  }
  if (member.specialty) {
    const cur = specialtyOf(member);
    return { ok: false, reason: `${member.name} 已经学过「${cur?.name ?? "一门手艺"}」，一个人只学一门` };
  }
  if (state.favor < def.favorCost) {
    return { ok: false, reason: `要 ${def.favorCost} 点人情，现在只有 ${Math.floor(state.favor)} 点` };
  }
  if (state.cash < def.costYuan) {
    return { ok: false, reason: `送他去学要 ¥${def.costYuan.toLocaleString("zh-CN")}` };
  }
  state.favor = Math.max(0, state.favor - def.favorCost);
  state.cash -= def.costYuan;
  member.specialty = def.id;
  member.skill = Math.min(5, member.skill + 1);
  return { ok: true, line: def.line, def };
}

function roleWord(role: string): string {
  if (role === "cook") return "煮粉";
  if (role === "prep") return "备料";
  return "跑堂";
}

/** 场上三门手艺各自的乘数（多人学同一门不叠加，取最好的一档） */
function sumPct(pct: number | undefined, n: number): number {
  return n > 0 && pct ? pct : 0;
}

function countBy(state: GameState, id: string): number {
  return masteredStaff(state).filter((m) => m.specialty === id).length;
}

export function specialtyServeFactor(state: GameState): number {
  const wok = SPECIALTIES.find((d) => d.id === "wok");
  return 1 - sumPct(wok?.effect.servePct, countBy(state, "wok"));
}

export function specialtyCostFactor(state: GameState): number {
  const knife = SPECIALTIES.find((d) => d.id === "knife");
  return 1 - sumPct(knife?.effect.costPct, countBy(state, "knife"));
}

export function specialtyPatienceMult(state: GameState): number {
  const mem = SPECIALTIES.find((d) => d.id === "memory");
  return 1 + sumPct(mem?.effect.patiencePct, countBy(state, "memory"));
}

export function specialtySatBonus(state: GameState): number {
  const mem = SPECIALTIES.find((d) => d.id === "memory");
  return sumPct(mem?.effect.satBonus, countBy(state, "memory"));
}
