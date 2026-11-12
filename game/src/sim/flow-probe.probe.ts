import { describe, it } from "vitest";
import { advanceMinute, createInitialState, type GameState } from "./state";
import { resolveEvent } from "./events";
import { FLOW, resetFlowTuning } from "../data/balance";

/**
 * 客流探针：扫描「进店倍率 × 出餐分钟 × 吃东西倍率 × 耐心 × 候餐上限」，
 * 找出能跑到 60–70 碗/日、流失可控的一组。
 *
 * 不操作局（不雇人、不扩建、不换菜谱）是最保守工况。
 * 天花板按两个约束取小：
 *   灶台 = 120 / serveMinutes
 *   座位 = seats × 120 / (serveMinutes + eatSpeed × eatScale)
 */
function playMonths(seed: number, months: number): GameState {
  const s = createInitialState("probe", seed);
  let guard = 0;
  while (!s.finished && s.months.length < months && guard < 5_000_000) {
    if (s.events.pending) {
      resolveEvent(s, 0);
      continue;
    }
    advanceMinute(s);
    guard++;
  }
  return s;
}

type Combo = { spawn: number; serve: number; eat: number; patience: number; queue: number };

const COMBOS: Combo[] = [
  { spawn: 4, serve: 1.5, eat: 0.7, patience: 1.5, queue: 8 },
  { spawn: 6, serve: 1.5, eat: 0.8, patience: 1.5, queue: 12 },
  { spawn: 6, serve: 1, eat: 0.8, patience: 1.5, queue: 12 },
  { spawn: 8, serve: 1, eat: 0.8, patience: 1.5, queue: 12 },
  { spawn: 8, serve: 1, eat: 0.8, patience: 2, queue: 16 },
  { spawn: 10, serve: 1, eat: 0.7, patience: 2, queue: 16 },
];

const SEEDS = [1, 2, 3, 5, 8];

describe("客流探针", () => {
  it("扫描 6 组参数 × 5 种子 × 36 月：碗/日、流失率、月营收、达标率、期末现金", () => {
    const rows: string[] = [];
    for (const c of COMBOS) {
      FLOW.spawnScale = c.spawn;
      FLOW.serveMinutes = c.serve;
      FLOW.eatScale = c.eat;
      FLOW.patienceScale = c.patience;
      FLOW.queueMax = c.queue;

      let bowls = 0;
      let lost = 0;
      let days = 0;
      let rev = 0;
      let cash = 0;
      let hitMonths = 0;
      let months = 0;

      for (const seed of SEEDS) {
        const s = playMonths(seed, 36);
        bowls += s.monthServed + s.months.reduce((n, m) => n + m.customers, 0);
        lost += s.monthLost + s.months.reduce((n, m) => n + m.lost, 0);
        days += s.months.length * 30;
        rev += s.months.reduce((n, m) => n + m.revenue, 0);
        cash += s.cash;
        hitMonths += s.months.filter((m) => m.revenue >= m.target).length;
        months += s.months.length;
      }

      const perDay = bowls / Math.max(1, days);
      const lostRate = lost / Math.max(1, bowls + lost);
      rows.push(
        [
          `spawn×${c.spawn}`.padEnd(9),
          `serve=${c.serve}`.padEnd(9),
          `eat×${c.eat}`.padEnd(7),
          `pat×${c.patience}`.padEnd(6),
          `q=${c.queue}`.padEnd(5),
          `${perDay.toFixed(1).padStart(5)} 碗/日`,
          `流失 ${(lostRate * 100).toFixed(0).padStart(3)}%`,
          `月均 ¥${Math.round(rev / Math.max(1, months)).toString().padStart(6)}`,
          `达标 ${((hitMonths / Math.max(1, months)) * 100).toFixed(0).padStart(3)}%`,
          `期末 ¥${Math.round(cash / SEEDS.length)}`,
        ].join(" | "),
      );
    }
    resetFlowTuning();
    console.log("\n=== 客流扫描（不操作局，5 seeds × 36 月，目标 21000/月）===");
    rows.forEach((r) => console.log(r));
    console.log("挑选标准：60–70 碗/日、流失 < 30%、达标 30–70%（不操作局不该轻松达标）\n");
  }, 600_000);
});
