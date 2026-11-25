import { HIRE_FEE_RATE, monthlyWageOf, nextStaffNeed, staffSlots } from "../data/staff";
import {
  COOK_GAIN_NOISE,
  crewCostWords,
  crewFitWords,
  crewGapWords,
  crewGateWords,
  crewNoneWords,
  crewWhyWords,
} from "../data/crew";
import { capacityOf, capacityWithCooks } from "./bottleneck";
import { cookSlots } from "./staff";
import type { GameState } from "./state";

/**
 * 灶位与掌勺的人（批 AR′；批 AS′ 补了「补一个人多少钱、补得上吗」）。
 *
 * 为什么要有这一句：`serveParallel` 实际开火的灶位是
 * `Math.min(stoves, cookSlots)`（见 `sim/staff.ts` 的 `cookSlots`）——
 * 老板自己算一个人，每多一个在职煮粉师傅 +1。
 *
 * 于是「买了灶却没雇人」这件事在数值上是**零收益**：实测（`game/src/sim/
 * kitchen-never-binds.test.ts`）6 座 × 灶 1/2/3/4 口全部不是瓶颈，卖碗数一碗不涨。
 *
 * 批 AS′ 又量了一层，结论更难看：**雇了人也不多卖**。座 4/6/8 × 灶 1/2 ×
 * 有人/没人 十二格实测（种子 1/2/3，6 天取后 3 天均值）：
 *   座 6 · 灶 1 · 无人 111.2 / 一个煮粉 111.8；座 6 · 灶 2 · 无人 111.2 / 一个煮粉 111.8
 *   座 8 · 灶 1 · 无人 111.8 / 一个煮粉 112.1；座 4 · 灶 1 · 无人 77.0 / 一个煮粉 76.6
 * `capacityGain` 也印证：雇人把 `stove` 从 360 抬到 600，但四道闸里最紧的一直是座位
 * 或来客（座 4 → seats 65、座 6/8 → demand 70.6），`total` 一格不动。
 *
 * 所以这个模块只说事实，不劝买什么、不给建议、不算划算不划算：
 *   ① 几口灶、几个人、第几口起没人看（`words`）；
 *   ② 就算把人补齐，眼下多开火也不会多卖 —— 除非厨房真是最紧那一道（`why`）；
 *   ③ 补一个人要多少钱、招不招得到（`hire` / `gate`，批 AS′ 解 P458）。
 *
 * 价钱那两句只在**真有人手缺口**时给：没缺口时说「招人要 ¥220」等于催人白花钱。
 */
export interface CrewHire {
  /** 今天候选人里最该看的那个煮粉师傅 */
  name: string;
  /** 技能等级（1–5）：这才决定这口灶能开多快，日薪只是价钱 */
  skill: number;
  /** 日薪（元） */
  wage: number;
  /** 介绍费（元）= 日薪 × 2，**一次性** */
  fee: number;
  /** 一个月约多少（按 21.75 个工作日折算） */
  monthly: number;
}

export interface CrewFacts {
  /** 店里有几口灶 */
  stoves: number;
  /** 眼下能同时开火的灶（= 能掌勺的人） */
  slots: number;
  /** 有几口灶没人看 */
  idle: number;
  /** 厨房（灶）今天是不是四道闸里最紧的那一道 */
  kitchenBinds: boolean;
  /** 再添一个人掌勺，当天上限能抬多少碗（模型算的，批 AV′ 解 P469） */
  cookGain: number;
  /** 今天候选人里最该看的那个煮粉师傅（每一块钱技能最高的）；今天没有煮粉候选就是 null */
  hire: CrewHire | null;
  /** 人手槽还差多少累计接待量（招不到人时才有值） */
  gate: { need: number; short: number } | null;
  /** 主句：几口灶、几个人 */
  words: string;
  /** 打烊单那一行用的短句（批 AS′ 解 P460：同一件事实，打烊单也要有） */
  brief: string;
  /** 副句：多开火有没有用；没什么可说的时候是空串 */
  why: string;
  /** 价钱句：补一个人要多少、招不招得到；没有缺口时是空串 */
  cost: string;
}

export function crewFacts(state: GameState): CrewFacts {
  const stoves = Math.max(1, state.venue.stoves);
  const slots = Math.max(1, cookSlots(state));
  const idle = Math.max(0, stoves - slots);
  const now = capacityOf(state);
  const kitchenBinds = now.tight === "stove";
  /**
   * 批 AV′（解 P469）：那两句「补人也换不来碗」不再从 `tight` 反推。
   *
   * 「灶不是最紧那道」推不出「补人不多卖」—— 中间那一档可能只差半碗，也可能差二十碗。
   * 这里让模型自己再算一遍「多一个人掌勺」的当天上限，差值才是那句话的依据。
   */
  const cookGain = capacityWithCooks(state, 1).total - now.total;
  const cookAddsBowls = cookGain > COOK_GAIN_NOISE;

  const words = idle === 0 ? crewFitWords(stoves, slots) : crewGapWords(stoves, slots);

  // 只在「有人手缺口」时说第二句：没有缺口时这句话是废话（而且会把打烊单撑长）
  const why = idle === 0 ? "" : crewWhyWords(kitchenBinds, cookGain);

  // 批 AT′（解 P461 / P463）：候选池里挑的不是「最便宜」那个，而是**每一块钱技能最高**那个 ——
  // 日薪由技能定（`WAGE_BY_SKILL` 110/130/150/180/220），贵的那个技能一定更高，
  // 而技能才决定这口灶开得多快（`serveMultiplier` 的煮技那一项）。三处口径：
  //   ① 价钱说清「介绍费」是**一次性**的（周薪式误解是 P463）；
  //   ② 报技能等级，让玩家看得出贵的那个人强在哪；
  //   ③ 一个候选都没有就直说，不编一个价钱。
  const cooks = state.staff.candidates.filter((m) => m.role === "cook");
  const cand = cooks
    .slice()
    .sort((a, b) => b.skill / Math.max(1, b.wage) - a.skill / Math.max(1, a.wage) || a.wage - b.wage)[0];
  const hire: CrewHire | null = cand
    ? {
        name: cand.name,
        skill: cand.skill,
        wage: cand.wage,
        fee: cand.wage * HIRE_FEE_RATE,
        monthly: monthlyWageOf(cand.wage),
      }
    : null;

  // 「人手槽还差多少位」只在**眼下招不进来**时才说：店里还有空位却说
  // 「还差 500 位」会把能立刻雇的人挡住（首跑就被这条判红）。
  const full = state.staff.roster.length >= staffSlots(state.totalCustomers);
  const need = full ? nextStaffNeed(state.totalCustomers) : null;
  const gate = need ? { need: need.need, short: need.short } : null;

  let cost = "";
  if (idle > 0) {
    if (gate) {
      // 招不到人的时候，价钱不是重点，「还得忙到多少」才是
      cost = crewGateWords(gate);
    } else if (hire) {
      // 批 AT′：技能跟着报（相同日薪下技能才是差别），介绍费标明「一次」
      // 批 AU′（解 P466）：补人换不来碗时补一句前提 —— 实测默认配平下
      // 换谁都只多卖 0.6–1.3 碗，光报价钱等于让人白花钱。
      // 批 AV′（解 P469 / P471）：前提的判据改成模型算的 `cookGain`，
      // 且这个参数不再有默认值 —— 忘传会被类型系统挡住。
      cost = crewCostWords(hire, cookAddsBowls);
    } else {
      cost = crewNoneWords();
    }
  }

  // 打烊单那一行要短的：面板能写长句，打烊单只能占一行（P406 折行）
  const brief = idle > 0 ? crewGapWords(stoves, slots, true) : "";

  return { stoves, slots, idle, kitchenBinds, cookGain, hire, gate, words, brief, why, cost };
}
