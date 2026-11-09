import { describe, it } from "vitest";
import { advanceMinute, createInitialState, type GameState } from "./state";
import { resolveEvent } from "./events";

/** 临时探针：跑 36 个月不操作局，取每月 revenue/target，离线换租金公式重算。用完即删。 */
function playMonths(seed: number): GameState {
  const s = createInitialState("probe", seed);
  let guard = 0;
  while (!s.finished && s.months.length < 36 && guard < 3_000_000) {
    if (s.events.pending) {
      resolveEvent(s, 0);
      continue;
    }
    advanceMinute(s);
    guard++;
  }
  return s;
}

type Scheme = { name: string; rent: (m: number, target: number, prevRev: number) => number };

const SCHEMES: Scheme[] = [
  { name: "A 现状常量800", rent: () => 800 },
  { name: "B 目标22%", rent: (_m, target) => Math.round(target * 0.22) },
  { name: "C 阶梯800/1280/2048", rent: (m) => [800, 1280, 2048][Math.min(2, Math.floor((m - 1) / 12))] ?? 2048 },
  { name: "D 营收18%保底800", rent: (_m, _t, prevRev) => Math.max(800, Math.round(prevRev * 0.18)) },
  { name: "E 通胀2%月", rent: (m) => Math.round(800 * Math.pow(1.02, m - 1)) },
];

describe("租金公式探针", () => {
  it("36 个月不操作局：五方案现金流对照", () => {
    const seeds = [1, 2, 3, 5, 8, 13, 21, 34];
    const cashStart = createInitialState("probe", 1).cash;
    type Agg = { cash: number[]; revSum: number; rentSum: number; hit: number; neg: number; minCash: number[] };
    const rows: Record<string, Agg> = {};
    let sampleTargets: number[] = [];
    let sampleRevs: number[] = [];
    let sampleWages: number[] = [];
    let monthsPlayed = 0;

    for (const seed of seeds) {
      const s = playMonths(seed);
      if (s.months.length > monthsPlayed) {
        monthsPlayed = s.months.length;
        sampleTargets = s.months.map((m) => m.target);
        sampleRevs = s.months.map((m) => m.revenue);
        sampleWages = s.months.map((m) => m.wages);
      }
      for (const sc of SCHEMES) {
        let cash = cashStart;
        let revSum = 0;
        let rentSum = 0;
        let hit = 0;
        let neg = 0;
        let minCash = cash;
        s.months.forEach((m, i) => {
          const prevRev = i > 0 ? (s.months[i - 1]?.revenue ?? 0) : m.revenue;
          const rent = sc.rent(m.month, m.target, prevRev);
          cash += m.revenue - m.wages - rent;
          revSum += m.revenue;
          rentSum += rent;
          if (m.revenue >= m.target) hit++;
          if (cash < 0) neg++;
          minCash = Math.min(minCash, cash);
        });
        const agg = rows[sc.name] ?? { cash: [], revSum: 0, rentSum: 0, hit: 0, neg: 0, minCash: [] };
        agg.cash.push(cash);
        agg.revSum += revSum;
        agg.rentSum += rentSum;
        agg.hit += hit;
        agg.neg += neg;
        agg.minCash.push(minCash);
        rows[sc.name] = agg;
      }
    }

    const n = seeds.length;
    const avg = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
    console.log(`\n=== 样本：${monthsPlayed} 个月 × ${n} 局不操作（起始现金 ${cashStart}）===`);
    console.log("前6月 目标->营收:", sampleTargets.slice(0, 6).map((t, i) => `${t}->${sampleRevs[i]}`).join("  "));
    console.log("末3月 目标->营收:", sampleTargets.slice(-3).map((t, i) => `${t}->${sampleRevs[sampleRevs.length - 3 + i]}`).join("  "));
    console.log("营收月均:", Math.round(avg(sampleRevs)), "工资月均:", Math.round(avg(sampleWages)));
    console.log("\n方案 | 36月末现金均值 | 最低现金 | 累计营收均值 | 累计租金均值 | 租金/营收 | 达标月均 | 现金<0月数");
    for (const sc of SCHEMES) {
      const r = rows[sc.name]!;
      console.log(
        `${sc.name} | ${Math.round(avg(r.cash))} | ${Math.round(Math.min(...r.cash))} | ${Math.round(r.revSum / n)} | ${Math.round(r.rentSum / n)} | ${((r.rentSum / r.revSum) * 100).toFixed(1)}% | ${(r.hit / n).toFixed(1)} | ${(r.neg / n).toFixed(1)}`,
      );
    }
    const ratio = (i: number) => ((800 / Math.max(1, sampleRevs[i]!)) * 100).toFixed(1);
    console.log("\nA 方案租金占营收：第1月", ratio(0) + "%", " 第18月", ratio(17) + "%", " 第36月", ratio(35) + "%");
  }, 600_000);
});
