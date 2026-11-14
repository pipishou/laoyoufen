import { describe, it } from "vitest";
import { FLOW } from "../data/balance";
import { advanceMinute, createInitialState, type GameState } from "./state";
import { resolveEvent } from "./events";
import { scoreRecipe } from "./score";
import { buyUpgrade } from "./shop";

/**
 * 「替身」记录：一个按规矩办事的假玩家，完整玩 36 个月。
 *
 * 它**不是**人类证据（我知道答案，会走捷径）——它只是把「一局完整流程」跑一遍，
 * 用来回答三件事：
 *  ① 36 个月里每个月的营收/流失/现金长什么样；
 *  ② 只做「调价 + 扩座」这两件最朴素的操作，能不能活得下去；
 *  ③ 哪个月开始现金吃紧（也就是玩家第一次会卡住的地方）。
 *
 * 策略（刻意朴素，不用最优解）：
 *  - 满意 < 55 → 降价 1 元（最低 8）；满意 ≥ 70 且流失 > 25% → 涨价 1 元（最高 12）；
 *  - 现金 > 25,000 且座位 < 8 → 扩一次大厅；
 *  - 事件一律选第一项。
 */
function play(seed: number): GameState {
  const s = createInitialState("standin", seed);
  let lastMonth = 0;
  let guard = 0;
  const log: string[] = [];

  while (!s.finished && s.months.length < 36 && guard < 5_000_000) {
    if (s.events.pending) {
      resolveEvent(s, 0);
      continue;
    }
    advanceMinute(s);
    guard += 1;

    if (s.months.length !== lastMonth) {
      lastMonth = s.months.length;
      const m = s.months[s.months.length - 1];
      if (!m) continue;
      const sat = s.flow.lastSatisfaction;
      const lostRate = m.lost / Math.max(1, m.customers + m.lost);
      log.push(
        `M${String(m.month).padStart(2, "0")} 现金 ¥${Math.round(s.cash).toLocaleString("zh-CN")}` +
          ` · 营收 ¥${m.revenue.toLocaleString("zh-CN")}` +
          ` · 客 ${m.customers} · 流失 ${(lostRate * 100).toFixed(0)}%` +
          ` · 售价 ¥${s.price} · 座位 ${s.venue.seats}`,
      );

      // 决策点：一个月看一次
      if (sat >= 0 && sat < 55 && s.price > 8) s.price -= 1;
      else if (sat >= 70 && lostRate > 0.25 && s.price < 12) s.price += 1;
      if (s.cash > 25_000 && s.venue.seats < 8) buyUpgrade(s, "hall");
    }
  }

  const sc = scoreRecipe(s.recipe, s.price);
  console.log(`\n=== 种子 ${seed} · 味道 ${sc.total} · 期末现金 ¥${Math.round(s.cash).toLocaleString("zh-CN")} ===`);
  for (const line of log) console.log(line);
  return s;
}

describe("替身 36 个月", () => {
  it("按朴素策略完整玩 3 年", () => {
    FLOW.spawnScale = 6;
    FLOW.serveMinutes = 1;
    FLOW.eatScale = 1;
    FLOW.patienceScale = 1.5;
    FLOW.queueMax = 12;

    for (const seed of [1, 2]) {
      const s = play(seed);
      const months = s.months.length;
      const rev = s.months.reduce((n, m) => n + m.revenue, 0);
      const lost = s.months.reduce((n, m) => n + m.lost, 0);
      const cust = s.months.reduce((n, m) => n + m.customers, 0);
      console.log(
        `\n[替身 ${seed}] ${months} 个月 · 月均营收 ¥${Math.round(rev / months).toLocaleString("zh-CN")}` +
          ` · 日均 ${(cust / (months * 30)).toFixed(1)} 碗 · 总流失率 ${((lost / (cust + lost)) * 100).toFixed(0)}%` +
          ` · 期末现金 ¥${Math.round(s.cash).toLocaleString("zh-CN")}`,
      );
    }
  }, 900_000);
});
