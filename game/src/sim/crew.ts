import { HIRE_FEE_RATE, monthlyWageOf, nextStaffNeed, staffSlots } from "../data/staff";
import { capacityOf } from "./bottleneck";
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
  /** 今天候选人里最便宜的煮粉师傅 */
  name: string;
  /** 日薪（元） */
  wage: number;
  /** 介绍费（元）= 日薪 × 2 */
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
  /** 今天候选人里最便宜的煮粉师傅；今天没有煮粉候选就是 null */
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
  const kitchenBinds = capacityOf(state).tight === "stove";

  const words =
    idle === 0
      ? `灶位 ${stoves} 口，能开火 ${slots} 口 —— 人手够，每一口灶都烧得上`
      : `灶位 ${stoves} 口，眼下只有 ${slots} 个人掌勺 —— 第 ${slots + 1} 口起没人看，火开不起来`;

  // 只在「有人手缺口」时说第二句：没有缺口时这句话是废话（而且会把打烊单撑长）
  const why =
    idle === 0
      ? ""
      : kitchenBinds
        ? "今天卡的就是灶 —— 补齐人手这口灶才烧得上。"
        : "不过今天卡的不是灶：座位和街上的人先顶着天花板，多开一口火也不会多卖。";

  // 批 AS′（解 P458）：知道卡在哪之后，下一句一定是「补得起吗」。
  // 候选池每天重掷，所以这里读今天最便宜的那个煮粉 —— 不给「大概多少」这种虚数。
  const cand = state.staff.candidates
    .filter((m) => m.role === "cook")
    .sort((a, b) => a.wage - b.wage)[0];
  const hire: CrewHire | null = cand
    ? { name: cand.name, wage: cand.wage, fee: cand.wage * HIRE_FEE_RATE, monthly: monthlyWageOf(cand.wage) }
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
      cost = `人手槽还差 ${gate.short} 位累计接待（到 ${gate.need} 位才有人肯来）`;
    } else if (hire) {
      cost = `今天有人来问工：${hire.name} 日薪 ¥${hire.wage} · 介绍费 ¥${hire.fee} · 月薪约 ¥${hire.monthly}`;
    } else {
      cost = "今天没有煮粉的来问工";
    }
  }

  // 打烊单那一行要短的：面板能写长句，打烊单只能占一行（P406 折行）
  const brief = idle > 0 ? `灶 ${stoves} 口，只有 ${slots} 个人掌勺 —— 第 ${slots + 1} 口起没人看` : "";

  return { stoves, slots, idle, kitchenBinds, hire, gate, words, brief, why, cost };
}
