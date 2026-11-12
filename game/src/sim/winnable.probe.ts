import { describe, it } from "vitest";
import { advanceMinute, createInitialState, type GameState } from "./state";
import { resolveEvent } from "./events";
import { FLOW } from "../data/balance";

/**
 * 可赢性对照：同样参数下，「扩到 8 座 + 雇 1 名帮工」能不能把目标追回来。
 * 这一条决定数值是「有张力」还是「必输」。
 */
function play(seed: number, seats: number): GameState {
  const s = createInitialState("probe", seed);
  s.venue.seats = seats;
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

describe("可赢性对照", () => {
  it("4 座不操作 / 8 座不雇人 / 8 座雇 1 人", () => {
    FLOW.spawnScale = 6;
    FLOW.serveMinutes = 1;
    FLOW.eatScale = 0.8;
    FLOW.patienceScale = 1.5;
    FLOW.queueMax = 12;

    for (const eat of [1.0, 0.8, 0.9]) {
      FLOW.eatScale = eat;
      const cases = [
        { label: `4 座·不操作 eat×${eat}`, seats: 4 },
        { label: `8 座·不操作 eat×${eat}`, seats: 8 },
      ];
      for (const c of cases) {
        let hit = 0;
        let months = 0;
        let rev = 0;
        let bowls = 0;
        let lost = 0;
        let cash = 0;
        for (const seed of [1, 2, 3, 5, 8]) {
          const s = play(seed, c.seats);
          hit += s.months.filter((m) => m.revenue >= m.target).length;
          months += s.months.length;
          rev += s.months.reduce((n, m) => n + m.revenue, 0);
          bowls += s.months.reduce((n, m) => n + m.customers, 0);
          lost += s.months.reduce((n, m) => n + m.lost, 0);
          cash += s.cash;
        }
        console.log(
          `${c.label.padEnd(22)} 达标 ${((hit / months) * 100).toFixed(0).padStart(3)}%` +
            ` | 日均 ${(bowls / (months * 30)).toFixed(1)} 碗` +
            ` | 流失 ${((lost / (bowls + lost)) * 100).toFixed(0).padStart(2)}%` +
            ` | 月均营收 ¥${Math.round(rev / months)}` +
            ` | 期末现金 ¥${Math.round(cash / 5)}`,
        );
      }
    }
  }, 600_000);
});
