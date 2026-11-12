import { describe, it } from "vitest";
import { advanceMinute, createInitialState, type GameState } from "./state";
import { resolveEvent } from "./events";
import { FLOW } from "../data/balance";

/** 把选定参数下的月度曲线打出来：哪几个月达标、现金最低点在哪。 */
function play(seed: number): GameState {
  const s = createInitialState("probe", seed);
  let guard = 0;
  while (!s.finished && s.months.length < 36 && guard < 5_000_000) {
    if (s.events.pending) {
      resolveEvent(s, 0);
      continue;
    }
    advanceMinute(s);
    guard++;
  }
  return s;
}

describe("客流选定参数曲线", () => {
  it("spawn×6 / serve=1 / eat×0.8 / pat×1.5 / q=12 的月度明细", () => {
    FLOW.spawnScale = 6;
    FLOW.serveMinutes = 1;
    FLOW.eatScale = 0.8;
    FLOW.patienceScale = 1.5;
    FLOW.queueMax = 12;
    for (const seed of [1, 3]) {
      const s = play(seed);
      console.log(`\n--- seed ${seed} ---`);
      let cash = createInitialState("probe", seed).cash;
      s.months.forEach((m, i) => {
        cash += m.revenue - m.wages - m.rent;
        if ([0, 1, 2, 5, 11, 17, 23, 29, 35].includes(i)) {
          console.log(
            `M${String(m.month + 1).padStart(2)} 营收 ${Math.round(m.revenue).toString().padStart(6)}` +
              ` / 目标 ${Math.round(m.target).toString().padStart(6)}` +
              ` = ${((m.revenue / m.target) * 100).toFixed(0).padStart(3)}%` +
              ` | 客 ${String(m.customers).padStart(4)} | 流失 ${String(m.lost).padStart(3)}` +
              ` | 租 ${String(m.rent).padStart(5)} | 工资 ${String(m.wages).padStart(5)}` +
              ` | 现金 ${Math.round(cash).toString().padStart(7)}`,
          );
        }
      });
      const hits = s.months.filter((m) => m.revenue >= m.target).length;
      console.log(`达标 ${hits}/${s.months.length} 月，期末现金 ${Math.round(s.cash)}`);
    }
  }, 300_000);
});
