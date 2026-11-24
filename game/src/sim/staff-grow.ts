import {
  ATTR_BY_ROLE,
  ATTR_MAX,
  FINISH_ATTR_NEED,
  FINISH_BY_ROLE,
  STAFF_ATTR_LABEL,
  STAFF_ATTR_ORDER,
  STAFF_SKILLS,
  XP_STEPS,
  finishSkillById,
  staffSkillById,
  type StaffAttr,
  type StaffSkillEffect,
} from "../data/staff-skill";
import type { GameState, StaffMember } from "./state";

/**
 * 店员成长（批 L'）：只存 `xp`，四属性与学会的手艺**全部现算**。
 *
 * 为什么现算而不是存下来：
 * - 存的字段越多，老档迁移越容易出岔（批次 K' 的 `perks` 就为此写了一整段清洗）；
 * - 属性、手艺、毕业技都是 xp 的纯函数，存下来只会出现「xp 涨了但属性没跟上」这种脏状态。
 *
 * 分布规则（为什么按岗位分主项）：煮粉的先长火候，备料的先长耐磨，跑堂的先长待客 ——
 * 与开罗 `clerk.txt` 里每个店员自带主项、`help「Staff 2」`「cooking 高了能一次多煮几份」
 * 的口径一致：主项决定这个人在哪个岗位上真的顶用。
 */

export type StaffAttrs = Record<StaffAttr, number>;

export interface StaffEffects {
  /** 一锅多下几份（仍受 `inNoodlesNum` 的 min(2, …) 封顶） */
  noodle: number;
  /** 问口味速率 +N/分 */
  survey: number;
  /** 疲劳增速打折（0.12 = 慢 12%） */
  fatigue: number;
  /** 休息一天多恢复多少 */
  rest: number;
  /** 每天多练多少 */
  xp: number;
  /** 辞职门槛 +N */
  keep: number;
}

const EMPTY: StaffEffects = { noodle: 0, survey: 0, fatigue: 0, rest: 0, xp: 0, keep: 0 };

export function xpOf(m: StaffMember): number {
  const raw = m.xp ?? 0;
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 0;
}

/** 练到第几级（0 = 还没出头） */
export function levelOfXp(xp: number): number {
  let n = 0;
  for (const need of XP_STEPS) if (xp >= need) n += 1;
  return Math.min(XP_STEPS.length, n);
}

export function staffLevelOf(m: StaffMember): number {
  return levelOfXp(xpOf(m));
}

/**
 * 四属性：都从 1 级起，每升一级给 1 点，按「主项 → 其余三项轮流」派发，各自封顶 8。
 * 满级（7 点）时正好主项 5、其余 2 —— 想四项都到 5 得熬很久，这是刻意的。
 */
export function attrsOf(m: StaffMember): StaffAttrs {
  const out: StaffAttrs = { fire: 1, serve: 1, feet: 1, grit: 1 };
  const primary = ATTR_BY_ROLE[m.role] ?? "fire";
  const others = STAFF_ATTR_ORDER.filter((a) => a !== primary);
  let left = staffLevelOf(m);
  let turn = 0;
  while (left > 0) {
    const target: StaffAttr = turn % 2 === 0 ? primary : others[Math.floor(turn / 2) % others.length]!;
    turn += 1;
    if (out[target] >= ATTR_MAX) continue;
    out[target] += 1;
    left -= 1;
  }
  return out;
}

/** 已经学会的手艺 id（属性到门槛就自动会，不花人情不花钱） */
export function learnedOf(m: StaffMember): string[] {
  const attrs = attrsOf(m);
  return STAFF_SKILLS.filter((d) => attrs[d.attr] >= d.need).map((d) => d.id);
}

/** 四属性都到 5 级才出毕业技 */
export function finishOf(m: StaffMember): string | null {
  const attrs = attrsOf(m);
  for (const a of STAFF_ATTR_ORDER) if (attrs[a] < FINISH_ATTR_NEED) return null;
  return FINISH_BY_ROLE[m.role] ?? null;
}

function addEffect(into: StaffEffects, e: StaffSkillEffect): void {
  switch (e.kind) {
    case "noodle":
      into.noodle += e.amount;
      break;
    case "survey":
      into.survey += e.amount;
      break;
    case "fatigue":
      into.fatigue += e.amount;
      break;
    case "rest":
      into.rest += e.amount;
      break;
    case "xp":
      into.xp += e.amount;
      break;
    case "keep":
      into.keep += e.amount;
      break;
  }
}

/** 一个人身上所有已学手艺 + 毕业技的效果 */
export function effectsOf(m: StaffMember): StaffEffects {
  const out: StaffEffects = { ...EMPTY };
  for (const id of learnedOf(m)) {
    const def = staffSkillById(id);
    if (def) addEffect(out, def.effect);
  }
  const fin = finishOf(m);
  if (fin) {
    const def = finishSkillById(fin);
    if (def) addEffect(out, def.effect);
  }
  // 封顶：一锅最多再多下 2 份（与 `inNoodlesNum` 的老封顶同一口径）
  out.noodle = Math.min(2, out.noodle);
  out.fatigue = Math.min(0.35, out.fatigue);
  out.survey = Math.min(14, out.survey);
  out.rest = Math.min(40, out.rest);
  out.xp = Math.min(3, out.xp);
  out.keep = Math.min(20, out.keep);
  return out;
}

/** 全店在岗（不含今天休息的）员工的合并效果 */
export function staffEffects(state: GameState): StaffEffects {
  const out: StaffEffects = { ...EMPTY };
  for (const m of state.staff.roster) {
    if (m.resting) continue;
    const e = effectsOf(m);
    out.noodle += e.noodle;
    out.survey += e.survey;
    out.fatigue = Math.max(out.fatigue, e.fatigue);
    out.rest = Math.max(out.rest, e.rest);
    out.keep = Math.max(out.keep, e.keep);
  }
  return out;
}

/**
 * 日结的长进：在岗的人每天 +1 点活（学过「早起」「手上不停」的更快），
 * 累到 60 以上只算半格 —— 硬撑着的人学不进东西，这一句是本批唯一的「惩罚」。
 */
export function growDay(state: GameState, restedToday?: ReadonlySet<string>): string[] {
  const lines: string[] = [];
  for (const m of state.staff.roster) {
    if (m.resting) continue;
    if (restedToday?.has(m.uid)) continue;
    const before = learnedOf(m);
    const beforeLevel = staffLevelOf(m);
    const bonus = effectsOf(m).xp;
    const gain = m.fatigue >= 60 ? 0.5 : 1 + bonus;
    m.xp = (m.xp ?? 0) + gain;
    const nowLevel = staffLevelOf(m);
    const after = learnedOf(m);
    if (nowLevel > beforeLevel) lines.push(`${m.name} 又熟了一手（${nowLevel} 级）`);
    for (const id of after) {
      if (before.includes(id)) continue;
      const def = staffSkillById(id);
      if (def) lines.push(`${m.name} 学会了「${def.name}」`);
    }
  }
  return lines;
}

/** 属性一行话：「火候 5 · 待客 2 · 脚力 3 · 耐磨 4」 */
export function attrWords(m: StaffMember): string {
  const attrs = attrsOf(m);
  return STAFF_ATTR_ORDER.map((a) => `${STAFF_ATTR_LABEL[a]} ${attrs[a]}`).join(" · ");
}

/** 面板上的成长一句：还差多少到下一级，学会了什么 */
export function growWords(m: StaffMember): string {
  const xp = xpOf(m);
  const level = levelOfXp(xp);
  const next = XP_STEPS[level];
  const rest = next === undefined ? "到头了" : `再干 ${Math.max(0, next - xp)} 天升一级`;
  const learned = learnedOf(m)
    .map((id) => staffSkillById(id)?.name ?? "")
    .filter(Boolean);
  const fin = finishOf(m);
  const finName = fin ? finishSkillById(fin)?.name ?? "" : "";
  return `${attrWords(m)} · ${rest}${learned.length ? ` · 会：${learned.join("、")}` : ""}${
    finName ? ` · 毕业技：${finName}` : ""
  }`;
}

export const STAFF_XP_MAX = XP_STEPS[XP_STEPS.length - 1] ?? 0;
