import { describe, expect, it } from "vitest";
import { PACK_SETUP, PACK_SOURCES } from "../data/pack";
import { buyPack, packDailyOf, packNetOf, packOwned, packRate, packSummary, settlePack } from "./pack";
import { createInitialState, type GameState } from "./state";

function fresh(): GameState {
  return createInitialState("p1", 7);
}

/** 造一条昨天的营业记录（还原度看的就是这份 taste） */
function withTaste(s: GameState, taste: number): GameState {
  s.dayReport = {
    month: s.month,
    day: s.day,
    revenue: 500,
    served: 40,
    lost: 10,
    avgSat: 60,
    price: s.price,
    taste,
    cash: s.cash,
  };
  return s;
}

describe("表结构", () => {
  it("三条出处都带链接与原话，且不许出现别的作品名", () => {
    expect(PACK_SOURCES.length).toBe(3);
    for (const src of PACK_SOURCES) {
      expect(src.url.startsWith("http")).toBe(true);
      expect(src.quote.length).toBeGreaterThan(10);
      expect(src.label.length).toBeGreaterThan(3);
      expect(/开罗|Ramen|Kairo/.test(src.label + src.quote)).toBe(false);
    }
  });

  it("价格是人民币口径：一袋十块、成本五块 —— 不是开罗的日元量级", () => {
    expect(PACK_SETUP.priceYuan).toBe(10);
    expect(PACK_SETUP.costPerPack).toBe(5);
    expect(PACK_SETUP.costYuan).toBeLessThan(5_000);
    expect(PACK_SETUP.capPacks).toBeLessThanOrEqual(40);
  });
});

describe("置办包装机", () => {
  it("新局没有包装机，也出不了货", () => {
    const s = fresh();
    expect(packOwned(s)).toBe(false);
    expect(packDailyOf(s)).toBe(0);
    expect(packNetOf(s)).toBe(0);
    expect(packSummary(s)).toContain("还没置办");
  });

  it("钱不够置办不下来，且不扣钱", () => {
    const s = fresh();
    s.cash = 100;
    const r = buyPack(s);
    expect(r.ok).toBe(false);
    expect(r.reason ?? "").toContain("钱不够");
    expect(s.cash).toBe(100);
    expect(packOwned(s)).toBe(false);
  });

  it("置办成功扣钱、可以使用，重复置办被拒", () => {
    const s = fresh();
    s.cash = 10_000;
    expect(buyPack(s).ok).toBe(true);
    expect(s.cash).toBe(10_000 - PACK_SETUP.costYuan);
    expect(packOwned(s)).toBe(true);
    const again = buyPack(s);
    expect(again.ok).toBe(false);
    expect(again.reason ?? "").toContain("已经在转");
  });
});

describe("出货量", () => {
  it("味道越好，还原度越高，出的袋数越多", () => {
    const bad = withTaste(Object.assign(fresh(), { pack: true }), 10);
    const good = withTaste(Object.assign(fresh(), { pack: true }), 95);
    expect(packRate(good)).toBeGreaterThan(packRate(bad));
    expect(packDailyOf(good)).toBeGreaterThan(packDailyOf(bad));
  });

  it("口碑与段位抬量，但有天花板（小铺子不是工厂）", () => {
    const s = withTaste(Object.assign(fresh(), { pack: true }), 100);
    s.reputation = 0;
    s.gradeLevel = 0;
    const low = packDailyOf(s);
    s.reputation = 5;
    s.gradeLevel = 12;
    const high = packDailyOf(s);
    expect(high).toBeGreaterThan(low);
    expect(high).toBeLessThanOrEqual(PACK_SETUP.capPacks);
    expect(packDailyOf(s)).toBeLessThanOrEqual(40);
  });

  it("没营业记录时按最低还原度算，不会开门第一天就爆单", () => {
    const s = Object.assign(fresh(), { pack: true });
    s.dayReport = null;
    expect(packRate(s)).toBeCloseTo(PACK_SETUP.floorRate, 5);
  });
});

describe("打烊结算", () => {
  it("卖了货就进现金、记进账面、抬头也跟着变", () => {
    const s = withTaste(Object.assign(fresh(), { pack: true }), 90);
    s.cash = 1_000;
    const before = s.cash;
    const r = settlePack(s);
    expect(r.sold).toBeGreaterThan(0);
    expect(s.cash).toBeGreaterThan(before);
    expect(s.tally.packSold).toBe(r.sold);
    expect(packSummary(s)).toContain("每天出");
  });

  it("没置办包装机时结算什么也不发生", () => {
    const s = fresh();
    s.cash = 1_000;
    const r = settlePack(s);
    expect(r.sold).toBe(0);
    expect(r.net).toBe(0);
    expect(s.cash).toBe(1_000);
  });

  it("净收入就是「袋数 × 每袋毛利」，一分不多", () => {
    const s = withTaste(Object.assign(fresh(), { pack: true }), 80);
    const sold = packDailyOf(s);
    expect(packNetOf(s)).toBeCloseTo(sold * (PACK_SETUP.priceYuan - PACK_SETUP.costPerPack), 2);
  });
});
