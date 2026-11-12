import { describe, expect, it } from "vitest";
import { createInitialState, TOTAL_MONTHS, type GameState } from "./state";
import {
  ACHIEVEMENTS,
  board,
  finalSummary,
  nextThree,
  progressSummary,
  totalRevenue,
  viewOf,
} from "./achievements";
import { MAX_GRADE, applyGrade, checkGrade, gradeOf, GRADES } from "./grade";

function fresh(): GameState {
  return createInitialState("test-player", 42);
}

describe("K1 成就（开罗 trophy 南宁化）", () => {
  it("共 12 条，全部只增不减（新档进度为 0、无负数）", () => {
    expect(ACHIEVEMENTS).toHaveLength(12);
    const s = fresh();
    for (const a of ACHIEVEMENTS) {
      const v = viewOf(a, s);
      expect(v.progress, a.id).toBeGreaterThanOrEqual(0);
      expect(v.level, a.id).toBeGreaterThanOrEqual(0);
    }
  });

  it("门槛全部升序，且单条最高档不超过 4 档", () => {
    for (const a of ACHIEVEMENTS) {
      expect(a.tiers.length, a.id).toBeGreaterThanOrEqual(1);
      expect(a.tiers.length, a.id).toBeLessThanOrEqual(4);
      for (let i = 1; i < a.tiers.length; i += 1) {
        expect(a.tiers[i]!, a.id).toBeGreaterThan(a.tiers[i - 1]!);
      }
    }
  });

  it("累计出碗与营收随经营增长，成就跟着解锁", () => {
    const s = fresh();
    s.tally.bowls = 1_500;
    s.months.push({
      month: 0,
      revenue: 120_000,
      customers: 1_100,
      lost: 0,
      avgSat: 82,
      wages: 0,
      rent: 4_000,
      profit: 100_000,
      target: 21_000,
      grade: "S",
    });
    const bowls = viewOf(ACHIEVEMENTS.find((a) => a.id === "bowls")!, s);
    const revenue = viewOf(ACHIEVEMENTS.find((a) => a.id === "revenue")!, s);
    expect(bowls.level).toBe(1);
    expect(revenue.level).toBe(1);
    expect(totalRevenue(s)).toBe(120_000);
  });

  it("HUD 只取三条未满成就，且按完成度排序", () => {
    const s = fresh();
    s.tally.bowls = 9_900; // 99% 到 10000
    const three = nextThree(s);
    expect(three).toHaveLength(3);
    expect(three[0]!.id).toBe("bowls");
    expect(three.every((v) => !v.maxed)).toBe(true);
  });

  it("三年结束按累计成就结算，而不是「达标月数」", () => {
    const s = fresh();
    s.finished = true;
    s.totalCustomers = 6_000;
    s.tally.bowls = 50_000;
    const sum = finalSummary(s);
    expect(sum.customers).toBe(6_000);
    expect(sum.achievements.total).toBe(
      ACHIEVEMENTS.reduce((n, a) => n + a.tiers.length, 0),
    );
    expect(sum.achievements.got).toBeGreaterThan(0);
    expect(progressSummary(s).got).toBe(sum.achievements.got);
  });

  it("TOTAL_MONTHS 仍是 36，成就里的「三年之约」对齐它", () => {
    expect(TOTAL_MONTHS).toBe(36);
    const s = fresh();
    s.finished = true;
    const done = viewOf(ACHIEVEMENTS.find((a) => a.id === "finished")!, s);
    expect(done.level).toBe(1);
    expect(board(s).every((v) => v.tiers >= 1)).toBe(true);
  });
});

describe("K1 段位（开罗 grade_review 11 级）", () => {
  it("11 级，费与人次门槛都升序", () => {
    expect(GRADES).toHaveLength(11);
    expect(MAX_GRADE).toBe(11);
    for (let i = 1; i < GRADES.length; i += 1) {
      expect(GRADES[i]!.minCustomers).toBeGreaterThan(GRADES[i - 1]!.minCustomers);
      // 第 11 级是终局称号，不收判定费 —— 只校验 1–10 级递增
      if (i < 10) expect(GRADES[i]!.feeYuan).toBeGreaterThanOrEqual(GRADES[i - 1]!.feeYuan);
    }
    expect(GRADES[10]!.feeYuan).toBe(0);
    expect(gradeOf(1)!.title).toBe("摆摊仔");
    expect(gradeOf(11)!.title).toContain("非遗");
  });

  it("人次不够时不许评，且不扣钱", () => {
    const s = fresh();
    s.cash = 100_000;
    const r = applyGrade(s);
    expect(r.ok).toBe(false);
    expect(s.cash).toBe(100_000);
    expect(s.gradeLevel).toBe(0);
    expect(r.reason).toContain("还差");
  });

  it("钱不够时也不许评", () => {
    const s = fresh();
    s.totalCustomers = 500;
    s.cash = 10;
    const check = checkGrade(s);
    expect(check.ready).toBe(false);
    expect(check.shortCash).toBe(40);
    expect(check.next!.level).toBe(1);
  });

  it("条件都够 → 扣判定费、升段位、加口碑", () => {
    const s = fresh();
    s.totalCustomers = 500;
    s.cash = 1_000;
    const repBefore = s.reputation;
    const r = applyGrade(s);
    expect(r.ok).toBe(true);
    expect(s.gradeLevel).toBe(1);
    expect(s.cash).toBe(1_000 - 50 + 1);
    expect(s.reputation).toBeGreaterThan(repBefore);
  });

  it("升到顶后不再可评", () => {
    const s = fresh();
    s.gradeLevel = 11;
    const check = checkGrade(s);
    expect(check.next).toBeNull();
    expect(applyGrade(s).ok).toBe(false);
  });
});
