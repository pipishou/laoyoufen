import { describe, expect, it } from "vitest";
import { CAPITAL } from "../data/anchors";
import { GRADES, applyGrade, checkGrade, gradeOf } from "./grade";
import { openForBusiness } from "./setup";
import { createInitialState, type DayRecord } from "./state";

function fresh() {
  const s = createInitialState("p1", 1);
  openForBusiness(s, "alley", "测试店");
  return s;
}

function pushDay(s: ReturnType<typeof fresh>, served: number): void {
  const rec: DayRecord = {
    month: s.month,
    day: s.day,
    revenue: served * 12,
    served,
    lost: 0,
    avgSat: 70,
    price: s.price,
    taste: 70,
    cash: s.cash,
  };
  s.days.push(rec);
}

describe("段位评定：差多少客人要说清是三天的还是三周的（试玩二轮 F11）", () => {
  it("昨天卖了 40 碗、差 80 位 → 约 2 天", () => {
    const s = fresh();
    s.gradeLevel = 0;
    s.totalCustomers = gradeOf(1)!.minCustomers - 80;
    s.cash = 100_000;
    pushDay(s, 40);
    const r = applyGrade(s);
    expect(r.ok).toBe(false);
    expect(r.reason).toContain("还差 80 位客人");
    expect(r.reason).toContain("昨天卖了 40 碗");
    expect(r.reason).toContain("约 2 天");
  });

  it("没有营业记录就只报差多少，不编天数", () => {
    const s = fresh();
    s.gradeLevel = 0;
    s.totalCustomers = 0;
    s.cash = 100_000;
    const r = applyGrade(s);
    expect(r.ok).toBe(false);
    expect(r.reason).toContain("位客人");
    expect(r.reason).not.toContain("天");
  });

  it("钱不够的话也要说清差多少", () => {
    const s = fresh();
    s.gradeLevel = 0;
    s.totalCustomers = gradeOf(1)!.minCustomers;
    s.cash = 0;
    pushDay(s, 40);
    const r = applyGrade(s);
    expect(r.ok).toBe(false);
    expect(r.reason).toContain("还差 ¥");
    expect(checkGrade(s).ready).toBe(false);
    expect(CAPITAL.gradeFeeYuan[0]).toBeGreaterThan(0);
  });

describe("批次四：段位只降费，评语交给评委说出来", () => {
  it("十一级评定费逐级递增：合计 ¥660,800，最高一级 ¥184,000", () => {
    const fees = GRADES.map((g) => g.feeYuan);
    expect(fees).toHaveLength(11);
    expect(fees[10]).toBe(0);
    for (let i = 1; i < 10; i++) expect(fees[i]).toBeGreaterThan(fees[i - 1]!);
    const total = fees.reduce((a, b) => a + b, 0);
    expect(total).toBe(660_800);
    expect(Math.max(...fees)).toBe(184_000);
  });

  it("门槛一位不动（这一批只碰钱，不碰门槛）", () => {
    expect(GRADES.map((g) => g.minCustomers)).toEqual([
      110, 350, 1_000, 1_500, 2_000, 2_400, 3_000, 3_400, 4_000, 5_000, 6_000,
    ]);
  });

  it("每段都有一句评委评语，是话不是数字", () => {
    for (const g of GRADES) {
      expect(g.remark.length).toBeGreaterThan(6);
      expect(/[0-9０-９]/.test(g.remark)).toBe(false);
    }
    expect(new Set(GRADES.map((g) => g.remark)).size).toBe(11);
    expect(gradeOf(3)!.remark).toContain("门牌");
  });
});

});
