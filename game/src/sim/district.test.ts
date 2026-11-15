import { describe, expect, it } from "vitest";
import { createInitialState, type GameState } from "./state";
import { openForBusiness } from "./setup";
import {
  DEMAND_TRAFFIC_SCALE,
  ENERGY_MIN,
  demandCapOf,
  districtOptions,
  energyOf,
  homeEnergyOf,
  moveShop,
} from "./district";
import { dailyTrafficOf } from "../data/nanning";

function fresh(cash = 30_000): GameState {
  const s = createInitialState("district-test", 7);
  // 先按正常流程开张（巷内小店扣 ¥15,000 转让费），再把现金调成要测的数
  s.cash = Math.max(cash, 20_000);
  openForBusiness(s, "alley", "测试老友粉");
  s.cash = cash;
  return s;
}

describe("区能量与换区（S6 的一半）", () => {
  it("本区能量每季度 -9%，最低 0.55", () => {
    const s = fresh();
    expect(homeEnergyOf(s)).toBeCloseTo(1, 6);
    s.month = 3;
    expect(homeEnergyOf(s)).toBeCloseTo(0.91, 6);
    s.month = 12;
    expect(homeEnergyOf(s)).toBeCloseTo(0.64, 6);
    s.month = 36;
    expect(homeEnergyOf(s)).toBe(ENERGY_MIN);
  });

  it("别区能量每季度 +6%，封顶 1.25", () => {
    const s = fresh();
    s.month = 3;
    expect(energyOf(s, "qingxiu")).toBeCloseTo(1.06, 6);
    s.month = 60;
    expect(energyOf(s, "qingxiu")).toBe(1.25);
    // 本区永远走自己的衰减曲线
    expect(energyOf(s, "xingning")).toBe(ENERGY_MIN);
  });

  it("客流池 = 区潜在客流 × 2.25 × 本区能量", () => {
    const s = fresh();
    const full = Math.round(dailyTrafficOf("xingning") * DEMAND_TRAFFIC_SCALE);
    expect(demandCapOf(s)).toBe(full);
    s.month = 36;
    expect(demandCapOf(s)).toBe(Math.round(full * ENERGY_MIN));
  });

  it("换区只在开门前；同区拒绝；钱不够不扣钱", () => {
    const s = fresh();
    s.phase = "open";
    expect(moveShop(s, "qingxiu").ok).toBe(false);
    expect(moveShop(s, "qingxiu").reason).toContain("打烊");

    s.phase = "prep";
    expect(moveShop(s, "xingning").ok).toBe(false);

    const poor = fresh(1_000);
    const r = moveShop(poor, "qingxiu");
    expect(r.ok).toBe(false);
    expect(r.reason).toContain("转让费还差");
    expect(poor.cash).toBe(1_000);
  });

  it("转让费是一次性解锁：第一次扣钱，之后搬回免费", () => {
    const s = fresh(100_000);
    const first = moveShop(s, "liangqing");
    expect(first.ok).toBe(true);
    expect(first.paid).toBe(40_000);
    expect(s.cash).toBe(60_000);
    expect(s.tally.districts).toContain("liangqing");

    expect(moveShop(s, "xingning").paid).toBe(0);
    const back = moveShop(s, "liangqing");
    expect(back.ok).toBe(true);
    expect(back.paid).toBe(0);
    expect(s.cash).toBe(60_000);
  });
  it("换区会把能量时钟拨回 1.0", () => {
    const s = fresh(100_000);
    s.month = 12;
    expect(homeEnergyOf(s)).toBeLessThan(0.7);
    moveShop(s, "liangqing");
    expect(s.districtSince).toBe(12);
    expect(homeEnergyOf(s)).toBeCloseTo(1, 6);
  });

  it("换区面板按实际客流降序，标出当前区与买不买得起", () => {
    const s = fresh(30_000);
    const opts = districtOptions(s);
    for (let i = 1; i < opts.length; i += 1) {
      expect(opts[i - 1]!.effective).toBeGreaterThanOrEqual(opts[i]!.effective);
    }
    const cur = opts.find((o) => o.current)!;
    expect(cur.id).toBe("xingning");
    expect(cur.feeYuan).toBe(0);
    expect(opts.find((o) => o.id === "qingxiu")!.affordable).toBe(false);
    expect(opts.find((o) => o.id === "mashan")!.affordable).toBe(true);
  });
});
