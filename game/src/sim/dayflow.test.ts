import { describe, expect, it } from "vitest";
import { DAY_MINUTES } from "./customer";
import { DAYS_PER_MONTH } from "./calendar";
import {
  ackDayReport,
  advanceMinute,
  createInitialState,
  openShop,
  tickMinute,
  type GameState,
} from "./state";

/**
 * 一天三态（prep / open / closing）的守门测试。
 *
 * 起因（玩家实测反馈 m03752 第 1 条）：一进游戏就在营业，第一分钟就开始
 * 流失顾客，玩家还没有任何决策。这里把「时间什么时候才允许走」钉成断言。
 */

function fresh(seed = 20261114): GameState {
  return createInitialState("p-test", seed);
}

/** 把某一天推到打烊（走 tickMinute，和玩家侧一致；事件弹窗直接当玩家选第一项关掉） */
function runToClose(s: GameState): void {
  openShop(s);
  let guard = 0;
  while (!s.dayReport && guard < DAY_MINUTES + 5) {
    if (s.events.pending) s.events.pending = null;
    tickMinute(s);
    guard += 1;
  }
}

describe("一天三态", () => {
  it("新局是准备阶段：时钟不走，一个顾客都不会来", () => {
    const s = fresh();
    expect(s.phase).toBe("prep");
    expect(s.dayReport).toBeNull();
    for (let i = 0; i < 30; i++) tickMinute(s);
    expect(s.flow.minuteOfDay).toBe(0);
    expect(s.flow.servedToday).toBe(0);
    expect(s.flow.customers.length).toBe(0);
  });

  it("开门后才走时间：一分钟一格", () => {
    const s = fresh();
    expect(openShop(s)).toBe(true);
    expect(s.phase).toBe("open");
    tickMinute(s);
    expect(s.flow.minuteOfDay).toBe(1);
    tickMinute(s);
    expect(s.flow.minuteOfDay).toBe(2);
  });

  it("重复开门无效：营业中不能再开一次", () => {
    const s = fresh();
    expect(openShop(s)).toBe(true);
    expect(openShop(s)).toBe(false);
    expect(s.phase).toBe("open");
  });

  it("打烊时生成日结单，时间停住等玩家确认", () => {
    const s = fresh();
    runToClose(s);
    expect(s.dayReport).not.toBeNull();
    const rep = s.dayReport!;
    expect(rep.served).toBeGreaterThan(0);
    expect(rep.revenue).toBeGreaterThan(0);
    expect(s.phase).toBe("closing");
    // 日结单没确认前，时间不许往前走
    const before = JSON.stringify(s.flow);
    for (let i = 0; i < 10; i++) tickMinute(s);
    expect(JSON.stringify(s.flow)).toBe(before);
    // 也不许直接开门
    expect(openShop(s)).toBe(false);
  });

  it("日结单里记的是当天的数，且进了 days 账", () => {
    const s = fresh();
    runToClose(s);
    const rep = s.dayReport!;
    expect(rep.day).toBe(1);
    expect(rep.month).toBe(0);
    expect(rep.avgSat).toBeGreaterThanOrEqual(0);
    expect(s.days.length).toBe(1);
    expect(s.days[0]!.served).toBe(rep.served);
  });

  it("「明天继续」进次日准备：第二天 0 分钟、计数器归零", () => {
    const s = fresh();
    runToClose(s);
    expect(ackDayReport(s)).toBe(true);
    expect(s.dayReport).toBeNull();
    expect(s.phase).toBe("prep");
    expect(s.day).toBe(2);
    expect(s.flow.minuteOfDay).toBe(0);
    expect(s.flow.servedToday).toBe(0);
    expect(s.flow.satCountToday).toBe(0);
  });

  it("一个月最后一天打烊后，次日进下个月（月结还在）", () => {
    const s = fresh();
    s.day = DAYS_PER_MONTH;
    runToClose(s);
    expect(ackDayReport(s)).toBe(true);
    expect(s.months.length).toBe(1);
    expect(s.month).toBe(1);
    expect(s.day).toBe(1);
    expect(s.phase).toBe("prep");
  });

  it("事件弹窗期间 tickMinute 不动：读文案时不偷偷推进营业", () => {
    const s = fresh();
    openShop(s);
    s.events.pending = { id: "rival_shop", absDay: 0 };
    const before = s.flow.minuteOfDay;
    expect(tickMinute(s)).toBe(false);
    expect(s.flow.minuteOfDay).toBe(before);
  });

  it("advanceMinute 保留原始语义（测试与探针直接调它）", () => {
    const s = fresh();
    // 不判 phase：老调用方（89→131 个用例与三套 probe）都能照跑
    advanceMinute(s);
    expect(s.flow.minuteOfDay).toBe(1);
  });
});
