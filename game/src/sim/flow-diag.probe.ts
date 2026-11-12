import { describe, it } from "vitest";
import { advanceMinute, createInitialState } from "./state";
import { resolveEvent } from "./events";
import { FLOW } from "../data/balance";
import { serveMultiplier } from "./staff";

/** 一次性诊断：把一天里的 到达/服务/流失/座位占用 打出来，找出真正的天花板。 */
describe("客流诊断", () => {
  it("单日逐分钟跟踪", () => {
    FLOW.spawnScale = 4;
    FLOW.serveMinutes = 1.5;
    FLOW.eatScale = 0.7;
    FLOW.patienceScale = 1.5;
    const s = createInitialState("diag", 1);
    // 先跑 10 天让口碑/人气稳定
    for (let d = 0; d < 10; d++) {
      for (let m = 0; m < 120; m++) {
        if (s.events.pending) resolveEvent(s, 0);
        advanceMinute(s);
      }
    }
    console.log("serveMultiplier =", serveMultiplier(s), " capacity =", s.capacity, " seats =", s.venue.seats);
    // 第 11 天：停在 119 分钟（第 120 分钟会 endDay 清零，读数就没了）
    let maxEating = 0;
    for (let m = 0; m < 119; m++) {
      if (s.events.pending) resolveEvent(s, 0);
      advanceMinute(s);
      const eating = s.flow.customers.filter((c) => c.status === "eating").length;
      maxEating = Math.max(maxEating, eating);
    }
    console.log(
      "今日到达", s.todayCustomers,
      "| 服务", s.flow.servedToday,
      "| 流失", s.flow.lostToday,
      "| 当日营收", Math.round(s.flow.revenueToday),
      "| 同时在吃峰值", maxEating,
      "| 队列剩余", s.flow.customers.length,
    );
  }, 120_000);
});
