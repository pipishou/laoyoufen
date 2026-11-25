/**
 * 试玩 11-21 的病灶：钩子只会喊「加灶」。
 *
 * 三家照打烊单连买三档猛火灶（¥1,500 / ¥3,800 / ¥9,000），第 4 天走失还在 54–61%，
 * 卖出的碗数停在 31–38。真实原因在那一天是**看价牌走的人最多**，
 * 而钩子根本看不见这件事（当时只有一句「走了 N 位」和一个产能候选）。
 *
 * 这里锁三件事：
 * 1. 走人的三种原因各记各的（队满 / 看价牌 / 等不及）；
 * 2. `lossSplitOf` 能指出主因，且打烊快照优先于实时计数；
 * 3. 价牌主因时钩子点名压价，队满与等不及才谈产能。
 */
import { describe, expect, it } from "vitest";
import { createInitialState, type DayRecord, type GameState } from "./state";
import { lossSplitOf } from "./bottleneck";
import { nextHook } from "./hook";

function fresh(): GameState {
  const s = createInitialState("p1", 7);
  s.phase = "closing";
  s.cash = 200_000;
  return s;
}

function closeDay(s: GameState, lostQueue: number, lostPrice: number, lostWait: number): void {
  const rec: DayRecord = {
    month: s.month,
    day: s.day,
    revenue: 0,
    served: 40,
    lost: lostQueue + lostPrice + lostWait,
    lostQueue,
    lostPrice,
    lostWait,
    avgSat: 45,
    price: 10,
    taste: 60,
    cash: s.cash,
  };
  s.dayReport = rec;
}

describe("走人的三种原因（试玩 11-21）", () => {
  it("打烊快照里三档各自记着", () => {
    const s = fresh();
    closeDay(s, 3, 40, 7);
    const split = lossSplitOf(s);
    expect([split.queue, split.price, split.wait]).toEqual([3, 40, 7]);
    expect(split.total).toBe(50);
    expect(split.dominant).toBe("price");
    expect(split.priceShare).toBeCloseTo(0.8, 5);
  });

  it("没有打烊快照时用今天实时计数", () => {
    const s = fresh();
    s.dayReport = null;
    s.flow.lostQueue = 2;
    s.flow.lostPrice = 1;
    s.flow.lostWait = 9;
    const split = lossSplitOf(s);
    expect(split.total).toBe(12);
    expect(split.dominant).toBe("wait");
  });

  it("今天样本太少时退回昨天那条记录", () => {
    const s = fresh();
    s.dayReport = null;
    s.flow.lostQueue = 1;
    s.flow.lostPrice = 0;
    s.flow.lostWait = 0;
    s.days.push({
      month: 0,
      day: 1,
      revenue: 300,
      served: 30,
      lost: 40,
      lostQueue: 32,
      lostPrice: 6,
      lostWait: 2,
      avgSat: 40,
      price: 9,
      taste: 55,
      cash: s.cash,
    });
    const split = lossSplitOf(s);
    expect(split.dominant).toBe("queue");
    expect(split.live).toBe(false);
  });

  it("一个都没走时主因是 none，不编原因", () => {
    const s = fresh();
    closeDay(s, 0, 0, 0);
    const split = lossSplitOf(s);
    expect(split.total).toBe(0);
    expect(split.dominant).toBe("none");
    expect(split.priceShare).toBe(0);
  });
});

describe("钩子先看「为什么走」（试玩 11-21）", () => {
  it("看价牌走的最多时，点名压价而不是加灶", () => {
    const s = fresh();
    s.price = 10;
    closeDay(s, 2, 44, 4);
    const plan = nextHook(s);
    expect(plan.kind).toBe("price");
    expect(plan.key).toBe("price");
    expect(plan.text).toContain("降到");
    expect(plan.why ?? "").toContain("看价牌");
    expect(plan.text).not.toContain("猛火灶");
  });

  it("门口站满没人进来时，仍然谈座位与出碗", () => {
    const s = fresh();
    closeDay(s, 45, 3, 2);
    const plan = nextHook(s);
    expect(plan.kind).toBe("capacity");
    expect(plan.key.startsWith("capacity:")).toBe(true);
  });

  it("等不及走的最多时也走产能那条（人站着就烦）", () => {
    const s = fresh();
    closeDay(s, 2, 3, 45);
    const plan = nextHook(s);
    expect(plan.kind).toBe("capacity");
  });

  it("价牌主因但已经压到成本线时，不硬给一个压不动的目标", () => {
    const s = fresh();
    // 最便宜那款压到 1 元，低于成本 → pricePick 返回 null，退回产能或家当
    for (const item of s.menu) item.price = 1;
    closeDay(s, 50, 10, 0);
    const plan = nextHook(s);
    expect(plan.kind).not.toBe("price");

    // 批 AN′：这一局来客天花板只有 58.7 碗，而四座能坐 65.5 碗 —— 产能已经不是闸，
    // 钩子这时**不该**劝人添凳买灶（8 座实测 72.3 碗已到顶），改说家当那类话才诚实。
    expect(plan.kind).toBe("gear");

    // 街上人再多一点（来客抬到座位的两倍），退回产能才对：
    const busy = fresh();
    for (const item of busy.menu) item.price = 1;
    busy.totalCustomers = 900;
    busy.venue.seats = 4;
    closeDay(busy, 50, 10, 0);
    const plan2 = nextHook(busy);
    expect(plan2.kind).toBe("capacity");
    expect(plan2.ref?.gearId).toBeTruthy();
  });
});
