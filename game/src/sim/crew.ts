import type { GameState } from "./state";
import { cookSlots } from "./staff";

/**
 * 灶位与掌勺的人（批 AR′）。
 *
 * 为什么要有这一句：`serveParallel` 实际开火的灶位是
 * `Math.min(stoves, cookSlots)`（见 `sim/staff.ts` 的 `cookSlots`）——
 * 老板自己算一个人，每多一个在职煮粉师傅 +1。
 *
 * 于是「买了灶却没雇人」这件事在数值上是**零收益**：
 * 实测（`game/src/sim/kitchen-never-binds.test.ts`）6 座 × 灶 1/2/3/4 口
 * 全部不是瓶颈，卖碗数一碗不涨；8 座下灶 1 口和 3 口卖出 111.4 / 111.4。
 * 但界面上一个字都没提过「灶要有人掌勺」，玩家花 ¥1,500 买第二口灶
 * 只会觉得「买了没反应」。
 *
 * 这个函数只说事实，不劝买什么、不给价钱、不算账。
 */
export interface CrewFacts {
  /** 店里有几口灶 */
  stoves: number;
  /** 眼下能同时开火的灶（= 能掌勺的人） */
  slots: number;
  /** 有几口灶没人看 */
  idle: number;
  /** 一句人话 */
  words: string;
}

export function crewFacts(state: GameState): CrewFacts {
  const stoves = Math.max(1, state.venue.stoves);
  const slots = Math.max(1, cookSlots(state));
  const idle = Math.max(0, stoves - slots);
  const words =
    idle === 0
      ? `灶位 ${stoves} 口，能开火 ${slots} 口 —— 人手够，每一口灶都烧得上`
      : `灶位 ${stoves} 口，眼下只有 ${slots} 个人掌勺 —— 第 ${slots + 1} 口起没人看，火开不起来`;
  return { stoves, slots, idle, words };
}
