import { CANDIDATE_COUNT, HIRE_FEE_RATE, MAX_STAFF, STAFF_POOL, type StaffTemplate } from "../data/staff";
import { dayIndex } from "./calendar";
import { shuffled } from "./rng";
import type { GameState, StaffMember } from "./state";

/** 每天涨多少疲劳，以及休息一天恢复多少 */
const FATIGUE_PER_DAY: Record<StaffMember["role"], number> = { cook: 26, prep: 16, server: 20 };
const REST_RECOVERY = 55;
/** 疲劳到这个值，次日辞职 */
const QUIT_FATIGUE = 100;
/** 疲劳对技能的影响上限（-40%） */
const FATIGUE_MAX_PENALTY = 0.4;

function makeMember(t: StaffTemplate, uid: string): StaffMember {
  return {
    uid,
    templateId: t.id,
    name: t.name,
    role: t.role,
    skill: t.skill,
    wage: t.wage,
    fatigue: 0,
    resting: false,
  };
}

/** 每天开门重掷候选池。只消费传进来的 rng，保证可复现。 */
export function refreshCandidates(state: GameState): void {
  const today = dayIndex(state.month, state.day);
  if (state.staff.candidateDay === today && state.staff.candidates.length > 0) return;
  const picks = shuffled(state.rng, STAFF_POOL).slice(0, CANDIDATE_COUNT);
  state.staff.candidates = picks.map((t, i) => makeMember(t, `${t.id}-${today}-${i}`));
  state.staff.candidateDay = today;
}

/** 单个人的有效技能：疲劳越高越打折 */
function effectiveSkill(m: StaffMember): number {
  if (m.resting) return 0;
  const penalty = Math.min(FATIGUE_MAX_PENALTY, (m.fatigue / QUIT_FATIGUE) * FATIGUE_MAX_PENALTY);
  return m.skill * (1 - penalty);
}

function sumSkill(state: GameState, role: StaffMember["role"]): number {
  let sum = 0;
  for (const m of state.staff.roster) {
    if (m.role === role) sum += effectiveSkill(m);
  }
  return sum;
}

/**
 * 出碗时间的倍率：煮面段 × 上菜段 ÷ 灶位数。
 *
 * 开罗把出一碗拆成两个工种阶段（HumanClerk.COOK_CATEGORY_BOIL / COOK_CATEGORY_SETOUT），
 * 分别由 boostCookTime_ / boostServiceTime_ 缩短；灶位数对应可并行锅炉数
 * （StoreInfo.AVAILABLE_EQUIP_ADD_BOILE）。
 * REA 原来只算了厨师段，跑堂对产能完全无效——雇一堆跑堂就是纯亏工资，
 * 与开罗「BOIL 与 SETOUT 分工」口径不符。这里补上上菜段。
 *
 * 截断与斜率仍是自定标定：dump 只有方法签名，取不到真实时间常数 [GUESS, LOW]。
 */
const COOK_CUT_MAX = 0.55;
const COOK_CUT_PER_SKILL = 0.045;
const SETOUT_CUT_MAX = 0.4;
const SETOUT_CUT_PER_SKILL = 0.05;

/**
 * 每口灶一轮能下几份。
 *
 * 开罗 HumanClerk.GetInNoodlesNum() / hotWaterLimit_ 是一个「批量」上限：
 * 一锅水里同时煮 N 份，而不是一锅只出一碗。REA 原来是一锅一碗，
 * 所以厨师只线性降时间，边际收益跑不过工资。
 * 1 + 厨师总技能/50，封顶 +2，是自定标定 [GUESS, LOW]。
 */
export function inNoodlesNum(state: GameState): number {
  return 1 + Math.min(2, Math.floor(sumSkill(state, "cook") / 50));
}

export function serveMultiplier(state: GameState): number {
  const boil = 1 - Math.min(COOK_CUT_MAX, sumSkill(state, "cook") * COOK_CUT_PER_SKILL);
  const setout = 1 - Math.min(SETOUT_CUT_MAX, sumSkill(state, "server") * SETOUT_CUT_PER_SKILL);
  const parallel = Math.max(1, state.venue.stoves) * inNoodlesNum(state);
  return (boil * setout) / parallel;
}

/** 跑堂让顾客更愿意等 */
export function patienceMultiplier(state: GameState): number {
  return 1 + sumSkill(state, "server") * 0.08;
}

/**
 * 问口味的速率（每分钟进度，满 100 揭示一维偏好）。
 *
 * 开罗实证：Clerk.PARAM_SERVICE = 1（服务是独立技能项，SKILL_LV_MAX = 8）；
 * help「Staff 3」原文：顾客买完券后店员会问偏好，服务技能越高问出得越快，
 * 且只有主店顾客会被问。本作只有一间店，不做「主店/拉面馆」筛选。
 * 两个常数是自定标定，不是开罗原值——方法体不可反汇编，取不到真实速率。
 */
const SURVEY_BASE_RATE = 5;
const SURVEY_RATE_PER_SKILL = 7;
export function surveyRate(state: GameState): number {
  return SURVEY_BASE_RATE + sumSkill(state, "server") * SURVEY_RATE_PER_SKILL;
}

/** 备料工压低食材成本，最低七折 */
export function costMultiplier(state: GameState): number {
  return Math.max(0.7, 1 - sumSkill(state, "prep") * 0.05);
}

export interface HireResult {
  ok: boolean;
  reason?: string;
}

export function hire(state: GameState, uid: string): HireResult {
  const i = state.staff.candidates.findIndex((c) => c.uid === uid);
  if (i < 0) return { ok: false, reason: "这个人已经不在了" };
  if (state.staff.roster.length >= MAX_STAFF) return { ok: false, reason: `最多雇 ${MAX_STAFF} 人` };
  const cand = state.staff.candidates[i] as StaffMember;
  const fee = cand.wage * HIRE_FEE_RATE;
  if (state.cash < fee) return { ok: false, reason: `介绍费要 ¥${fee}` };

  state.cash -= fee;
  state.staff.roster.push({ ...cand, fatigue: 0, resting: false });
  state.staff.candidates.splice(i, 1);
  state.staff.lastEvent = `${cand.name} 入职，付介绍费 ¥${fee}`;
  return { ok: true };
}

export function fire(state: GameState, uid: string): HireResult {
  const i = state.staff.roster.findIndex((m) => m.uid === uid);
  if (i < 0) return { ok: false, reason: "查无此人" };
  const [gone] = state.staff.roster.splice(i, 1);
  state.staff.lastEvent = `${gone?.name ?? "员工"} 已离职`;
  return { ok: true };
}

export function toggleRest(state: GameState, uid: string): HireResult {
  const m = state.staff.roster.find((x) => x.uid === uid);
  if (!m) return { ok: false, reason: "查无此人" };
  m.resting = !m.resting;
  return { ok: true };
}

/**
 * 日结：发工资、涨疲劳、处理辞职。返回当天工资金额。
 * 休息的人半薪、恢复体力，第二天自动回到岗位。
 */
export function settleStaffDay(state: GameState): number {
  let wages = 0;
  for (const m of state.staff.roster) {
    wages += Math.round(m.wage * (m.resting ? 0.5 : 1));
    if (m.resting) {
      m.fatigue = Math.max(0, m.fatigue - REST_RECOVERY);
      m.resting = false;
    } else {
      m.fatigue = Math.min(QUIT_FATIGUE + 20, m.fatigue + FATIGUE_PER_DAY[m.role]);
    }
  }
  state.cash -= wages;

  const quitters = state.staff.roster.filter((m) => m.fatigue >= QUIT_FATIGUE);
  if (quitters.length > 0) {
    state.staff.roster = state.staff.roster.filter((m) => m.fatigue < QUIT_FATIGUE);
    state.staff.lastEvent = `${quitters.map((q) => q.name).join("、")} 体力透支，辞职了`;
  }
  return wages;
}

/** 当前日薪总额，HUD 用 */
export function dailyWage(state: GameState): number {
  return state.staff.roster.reduce((sum, m) => sum + Math.round(m.wage * (m.resting ? 0.5 : 1)), 0);
}

/** 平均疲劳，HUD 用 */
export function averageFatigue(state: GameState): number {
  if (state.staff.roster.length === 0) return 0;
  const sum = state.staff.roster.reduce((a, m) => a + m.fatigue, 0);
  return Math.round(sum / state.staff.roster.length);
}
