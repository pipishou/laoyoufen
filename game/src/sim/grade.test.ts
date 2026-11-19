import { describe, expect, it } from "vitest";
import { CAPITAL } from "../data/anchors";
import { applyGrade, checkGrade, gradeOf } from "./grade";
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
});
