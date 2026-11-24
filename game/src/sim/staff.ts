import {
  CANDIDATE_COUNT,
  HIRE_FEE_RATE,
  MAX_STAFF,
  STAFF_POOL,
  nextStaffNeed,
  staffSlots,
  type StaffTemplate,
} from "../data/staff";
import { dayIndex } from "./calendar";
import { equipLevel } from "./equipment";
import { gearFatigueMult } from "./gear";
import { shuffled } from "./rng";
import { specialtyCostFactor, specialtyPatienceMult, specialtyServeFactor } from "./specialty";
import { growDay, staffEffects } from "./staff-grow";
import { rallyCheck } from "./rally";
import type { GameState, StaffMember } from "./state";

/**
 * 每天涨多少疲劳，以及休息一天恢复多少。
 *
 * 口径修正（2026-11-15，S2 招人）：原来是 26/16/20 —— 煮粉的干 4 天就到 100 辞职，
 * 等于「雇来的人一周内必走」，替身 36 个月里雇了 36 次人（每月一个）。
 * 这与开罗不一致：开罗的店员只有「雇佣费 + 月给」两笔钱，不会自己跑（`clerk.txt`）。
 * 现在改成 7–10 天需要休一天（休息半薪、恢复 55），辞职只在连续硬撑到 100 时发生，
 * 所以一个正常排班的员工能一直在职，工资变成真实成本而不是流水。
 */
const FATIGUE_PER_DAY: Record<StaffMember["role"], number> = { cook: 10, prep: 7, server: 8 };
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

/** 某一工种的技能总和（含疲劳折损）。比赛评分与 UI 都用这一个口径。 */
export function skillTotal(state: GameState, role: StaffMember["role"]): number {
  return sumSkill(state, role);
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
 * 开罗 Staff 2 原文：「When a staff member's cooking skill increases, they will be
 * **able to boil more noodles at once**」——产能是**同时煮的份数**，不是把时间除一下。
 *
 * 所以：基础 3 份（粉篓本来就有几格，南宁粉店的粉篓也是多格的）＋粉篓设备等级
 * ＋厨师总技能每 50 点 +1（封顶 +2）。
 */
export function inNoodlesNum(state: GameState): number {
  // 批 L'：学出来的手艺（看火/捞面/一锅下…）也在同一个封顶里，不会越学越离谱
  const grown = staffEffects(state).noodle;
  return 3 + equipLevel(state, "strainer") + Math.min(2, Math.floor(sumSkill(state, "cook") / 50) + grown);
}

/**
 * 能同时开几口锅 —— 「有人掌勺的灶位」。
 *
 * 老板自己算一个（`+1`），每多一个在职的煮粉师傅 +1。
 *
 * 为什么必须这么算：旧版 `parallel = stoves × inNoodlesNum` 只看灶位，
 * 于是**扩建加灶就是唯一有效的产能杠杆，雇厨师只会降 boil（最多 45%）**。
 * 替身 36 个月实测（2026-11-15）：4 座店雇满 4 人，月工资 ¥3,053，
 * 期末现金从 ¥98,539 掉到 ¥2,040 —— 雇人纯亏，因为灶只有 1 口。
 * 开罗里 clerk 是「操作者」而不是加成：没有店员，多买的那口锅没人看。
 * 现在灶位变成「上限」、人手变成「实际开火数」，两件资本开支才串成一条线：
 * 想用上第二口灶，得先雇到第二个人。
 */
export function cookSlots(state: GameState): number {
  const cooks = state.staff.roster.filter((m) => m.role === "cook" && !m.resting).length;
  return 1 + cooks;
}

/**
 * 一轮（一个 `serveCooldown`）能同时端出几碗 —— 真正的日产能上限。
 *
 * 开罗 Staff 2 还说：「When service increases, they will be **able to carry more at
 * once**」——上菜也是一批一批端。所以并行槽 = 开着的灶 × 每灶的批量。
 *
 * 2026-11-15 改这一条的原因：旧版是「一段全局冷却、冷却到点出**一碗**」，
 * 于是 8 座满编实测也只有 63 碗/日，加座位、加灶、雇人都只改小数位（P35）。
 * 现在冷却到点一次出 `serveParallel()` 碗，日产能 = 120 分钟 / 冷却 × 并行槽。
 */
export function serveParallel(state: GameState): number {
  const stoves = Math.max(1, state.venue.stoves);
  return Math.max(1, Math.min(stoves, cookSlots(state))) * inNoodlesNum(state);
}

/** 一碗的平均出餐时间（分钟），给 HUD / 面板显示用 */
export function bowlMinutes(state: GameState, baseMinutes: number, equipFactor: number): number {
  // 一轮出 N 碗，摊到每碗就是 cooldown / N；空锅也不可能是 0，钉 0.1 分钟。
  return Math.max(0.1, (baseMinutes * serveMultiplier(state) * equipFactor) / serveParallel(state));
}

/** 技法熟练度只影响「一轮有多快」，不再承担并行度 */
export function serveMultiplier(state: GameState): number {
  const boil = 1 - Math.min(COOK_CUT_MAX, sumSkill(state, "cook") * COOK_CUT_PER_SKILL);
  const setout = 1 - Math.min(SETOUT_CUT_MAX, sumSkill(state, "server") * SETOUT_CUT_PER_SKILL);
  // 专精（A9）：掌勺有人学过「锅气」，这口灶再快一档
  return boil * setout * specialtyServeFactor(state);
}

/** 跑堂让顾客更愿意等 */
export function patienceMultiplier(state: GameState): number {
  // 专精（A9）：跑堂学过「记性」，等的人更有底
  return (1 + sumSkill(state, "server") * 0.08) * specialtyPatienceMult(state);
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
  return SURVEY_BASE_RATE + sumSkill(state, "server") * SURVEY_RATE_PER_SKILL + staffEffects(state).survey;
}

/** 备料工压低食材成本，最低七折 */
export function costMultiplier(state: GameState): number {
  // 专精（A9）：备料学过「刀工」，边角料少
  return Math.max(0.7, 1 - sumSkill(state, "prep") * 0.05) * specialtyCostFactor(state);
}

export interface HireResult {
  ok: boolean;
  reason?: string;
}

export function hire(state: GameState, uid: string): HireResult {
  const i = state.staff.candidates.findIndex((c) => c.uid === uid);
  if (i < 0) return { ok: false, reason: "这个人已经不在了" };
  const slots = staffSlots(state.totalCustomers);
  if (state.staff.roster.length >= slots) {
    const nxt = nextStaffNeed(state.totalCustomers);
    return {
      ok: false,
      reason: nxt
        ? `店里还忙不过来——累计接待 ${nxt.need} 位才有人愿意来（还差 ${nxt.short} 位）`
        : `最多雇 ${MAX_STAFF} 人`,
    };
  }
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
  // 批 L'：熬得住 / 不喊累 / 不误工 都落在「累得慢」这一格；不新开乘数层
  const grown = staffEffects(state);
  const fatigueMult = (1 - grown.fatigue) * gearFatigueMult(state);
  // 今天歇的人不长进 —— 旗子在这一轮里会被清掉，所以先记名字
  const restedToday = new Set(state.staff.roster.filter((m) => m.resting).map((m) => m.uid));
  let wages = 0;
  for (const m of state.staff.roster) {
    wages += Math.round(m.wage * (m.resting ? 0.5 : 1));
    if (m.resting) {
      m.fatigue = Math.max(0, m.fatigue - (REST_RECOVERY + grown.rest));
      m.resting = false;
    } else {
      m.fatigue = Math.min(QUIT_FATIGUE + 20, m.fatigue + FATIGUE_PER_DAY[m.role] * fatigueMult);
    }
  }
  state.cash -= wages;

  const quitAt = QUIT_FATIGUE + grown.keep;
  /**
   * 批 V′：第一次顶到门槛不立刻走人，先挂一次「要不要留」。
   * 判据在 `sim/rally.ts` —— 劝过一次还顶着，第二天才走。
   */
  const today = dayIndex(state.month, state.day);
  const quitters = rallyCheck(state, quitAt, today);
  if (quitters.length > 0) {
    state.staff.roster = state.staff.roster.filter((m) => m.fatigue < quitAt);
    state.staff.lastEvent = `${quitters.map((q) => q.name).join("、")} 体力透支，辞职了`;
  }
  // 收市以后才长进：今天干了活的人 +1 点
  const lines = growDay(state, restedToday);
  if (lines.length > 0) state.staff.lastEvent = lines.join(" · ");
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
