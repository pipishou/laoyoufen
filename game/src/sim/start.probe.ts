import { describe, it } from "vitest";
import { ackDayReport, advanceMinute, createInitialState } from "./state";
import { resolveEvent } from "./events";
import { FLOW } from "../data/balance";
import { checkGrade } from "./grade";

/**
 * 首周节奏探针（P67 / P69 的验收尺子）。
 *
 * 验收判据（`docs/下一步动作建议-2026-11-18.md` 第六节）：
 *   · 首日流失 ≤40%（改前真人实测：巷内局 53%、街边摊 74%）
 *   · 第 1–2 个游戏日就能评第一段（改前第 6 天）
 *
 * 这里跑「不操作」的基线：不调价、不买设备、不雇人。真人会比这好，
 * 所以基线达标就意味着真人不会更差。
 */
interface DayRow {
  served: number;
  lost: number;
  revenue: number;
  sat: number;
}

describe("首周节奏", () => {
  it("前七天：到店/卖出/走掉 + 第一段哪天能评", () => {
    FLOW.spawnScale = 6;
    FLOW.serveMinutes = 1;
    FLOW.eatScale = 1;
    FLOW.patienceScale = 1.5;
    FLOW.queueMax = 12;

    const seeds = [1, 2, 3, 5, 8];
    const perDay: DayRow[][] = [];
    const gradeDay: number[] = [];

    for (const seed of seeds) {
      const s = createInitialState("probe", seed);
      const days: DayRow[] = [];
      let firstReady = 0;
      let guard = 0;
      while (days.length < 7 && !s.finished && guard < 500_000) {
        if (s.events.pending) {
          resolveEvent(s, 0);
          continue;
        }
        advanceMinute(s);
        guard++;
        const rep = s.dayReport;
        if (rep) {
          days.push({ served: rep.served, lost: rep.lost, revenue: rep.revenue, sat: rep.avgSat });
          // 评段位的时机：每天打烊时看一次（钱 + 人次都够才算「能评」）
          if (!firstReady && checkGrade(s).ready) firstReady = days.length;
          ackDayReport(s);
        }
      }
      perDay.push(days);
      gradeDay.push(firstReady);
    }

    const avg = (pick: (d: DayRow) => number): number =>
      perDay.reduce((n, ds) => n + ds.reduce((m, d) => m + pick(d), 0) / Math.max(1, ds.length), 0) /
      perDay.length;

    for (let i = 0; i < 7; i++) {
      const cells = perDay.map((ds) => ds[i]).filter((d): d is DayRow => !!d);
      if (!cells.length) continue;
      const served = cells.reduce((n, d) => n + d.served, 0) / cells.length;
      const lost = cells.reduce((n, d) => n + d.lost, 0) / cells.length;
      const rev = cells.reduce((n, d) => n + d.revenue, 0) / cells.length;
      const rate = lost + served > 0 ? (lost / (lost + served)) * 100 : 0;
      console.log(
        `D${i + 1}  卖出 ${served.toFixed(0).padStart(3)} 碗 · 走 ${lost.toFixed(0).padStart(3)} 位` +
          ` · 流失 ${rate.toFixed(0).padStart(2)}% · 营收 ¥${rev.toFixed(0)}`,
      );
    }

    const first = perDay[0]!;
    const d1Rate = first[0] ? (first[0].lost / (first[0].served + first[0].lost)) * 100 : 0;
    console.log(
      `首日流失 ${d1Rate.toFixed(0)}% · 首周平均流失 ${(
        (avg((d) => d.lost) / (avg((d) => d.lost) + avg((d) => d.served))) *
        100
      ).toFixed(0)}%`,
    );
    console.log(`第一段能评：${gradeDay.map((d) => (d ? `D${d}` : "未到")).join(" / ")}`);
  }, 600_000);
});
