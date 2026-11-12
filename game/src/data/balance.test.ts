import { describe, expect, it } from "vitest";
import {
  GUANGXI,
  KAIRO_REF,
  KCU_TO_YUAN,
  RENT_RATIO,
  TARGET_BASE_YUAN,
  bowlMargin,
  bowlsCap,
  breakEvenBowls,
  kcuToYuan,
  monthTargetFor,
  rentFor,
} from "./balance";

/**
 * 这个文件的职责不是测「对不对」，而是锁住三件事：
 * 1) 换算锚点不许漂（KCU→元一变，全表数值都变）；
 * 2) 租金比例确实按目标恒比，而不是常量；
 * 3) 开罗原始阶梯被完整搬进来，删一个字都能测出来。
 */
describe("平衡数值：换算锚点", () => {
  it("上班族的开罗预算换算成元，应等于一碗老友粉的价格（±5%）", () => {
    const budget = kcuToYuan(KAIRO_REF.customerBudgetKcu.salaryman);
    expect(budget).toBeGreaterThanOrEqual(GUANGXI.bowlPriceYuan * 0.95);
    expect(budget).toBeLessThanOrEqual(GUANGXI.bowlPriceYuan * 1.05);
  });

  it("KCU→元 就是 10 / 1050 的取整，不能被悄悄改成 0.02 之类", () => {
    expect(KCU_TO_YUAN).toBe(0.01);
    expect(kcuToYuan(1050)).toBe(10.5);
    expect(kcuToYuan(0)).toBe(0);
  });

  it("开罗的价格阶梯保持原样（面粉 7 档、区间内单调递增）", () => {
    expect(KAIRO_REF.flourKcu).toHaveLength(7);
    const arr = [...KAIRO_REF.flourKcu];
    expect(arr).toEqual([...arr].sort((a, b) => a - b));
    expect(arr[0]!).toBe(500);
    expect(arr[arr.length - 1]!).toBe(14000);
  });
});

describe("平衡数值：月营收目标与房租", () => {
  it("首月目标 = 日均稳定碗数 × 售价 × 30 天", () => {
    expect(TARGET_BASE_YUAN).toBe(70 * 10 * 30);
    expect(monthTargetFor(1)).toBe(21000);
  });

  it("目标按月增长 2%，第 36 月约为首月的 2 倍", () => {
    const m1 = monthTargetFor(1);
    const m36 = monthTargetFor(36);
    expect(m36 / m1).toBeGreaterThan(1.9);
    expect(m36 / m1).toBeLessThan(2.1);
  });

  it("房租按比例跟随目标，而不是常量", () => {
    for (const target of [3600, 21000, 42000]) {
      expect(rentFor(target)).toBe(Math.round(target * RENT_RATIO));
    }
    expect(rentFor(21000)).toBe(4620);
    expect(rentFor(42000)).toBeGreaterThan(rentFor(21000));
  });

  it("现实校验：租金占目标 22% 时，约等于南宁临街小铺月租量级", () => {
    const rent = rentFor(monthTargetFor(1));
    expect(rent).toBeGreaterThanOrEqual(GUANGXI.rentYuan * 0.9);
    expect(rent).toBeLessThanOrEqual(GUANGXI.rentYuan * 1.15);
  });
});

describe("平衡数值：产能与保本", () => {
  it("一碗毛利 = 售价 − 食材成本", () => {
    expect(bowlMargin()).toBeCloseTo(5.8, 5);
  });

  it("保本碗数覆盖房租+一个帮工，折成日均落在现实区间（45–55 碗/日）", () => {
    const bowls = breakEvenBowls();
    // (4500 + 3800) / 5.8 ≈ 1432 碗/月 ≈ 47.7 碗/日 —— 这正是「4 座小店撑一个帮工很薄」的证据
    expect(bowls).toBeGreaterThan(1200);
    expect(bowls).toBeLessThan(1600);
    const perDay = bowls / 30;
    expect(perDay).toBeGreaterThan(45);
    expect(perDay).toBeLessThan(55);
  });

  it("座位数决定日产能上限（4 座 × 10 翻台 = 40 碗/日）", () => {
    expect(bowlsCap(4)).toBe(40);
    expect(bowlsCap(4, 20)).toBe(80);
  });
});
