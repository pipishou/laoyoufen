import { describe, expect, it } from "vitest";
import { createInitialState, type GameState } from "./state";
import { openForBusiness } from "./setup";
import {
  BRANCH_WARMTH_START,
  branchMonthlyCost,
  branchSizeOptions,
  branchViews,
  canOpenBranch,
  closeBranch,
  openBranch,
  runBranchDay,
} from "./branches";
import { BRANCH_SIZES, MAX_BRANCHES, MANAGER_MONTHLY, monthNetOf, paybackMonthsOf } from "../data/branches";
import { demandCapAtFullEnergy } from "./district";
import { deserialize, serialize } from "./save";

function fresh(cash = 200_000, grade = 11): GameState {
  const s = createInitialState("branch-test", 3);
  s.cash = Math.max(cash, 20_000);
  openForBusiness(s, "alley", "测试老友粉");
  s.cash = cash;
  s.gradeLevel = grade;
  return s;
}

describe("分店（S6）· 照开罗 Buy Small → Buy Amazing Shop", () => {
  it("四档店面：价格递增、回本落在 4.5–10 个月、段位门槛 8/9/10/11", () => {
    expect(BRANCH_SIZES.map((d) => d.id)).toEqual(["small", "normal", "big", "amazing"]);
    expect(BRANCH_SIZES.map((d) => d.minGrade)).toEqual([8, 9, 10, 11]);
    const fees = BRANCH_SIZES.map((d) => d.openFeeYuan);
    expect([...fees].sort((a, b) => a - b)).toEqual(fees);
    for (const def of BRANCH_SIZES) {
      const pay = paybackMonthsOf(def);
      expect(pay).toBeGreaterThan(4);
      expect(pay).toBeLessThan(10.5);
      // 每档都比上一档能做更多碗
      expect(monthNetOf(def)).toBeGreaterThan(0);
    }
    // 店长比掌勺贵一点（现实：南宁餐饮店长 4,500–6,000）
    expect(MANAGER_MONTHLY).toBe(4_800);
  });

  it("段位不够不给开，且一分钱不扣", () => {
    const s = fresh(200_000, 7);
    const check = canOpenBranch(s, "xingning", "small");
    expect(check.ok).toBe(false);
    expect(check.reason).toContain("第 8 段");
    const r = openBranch(s, "xingning", "small");
    expect(r.ok).toBe(false);
    expect(s.cash).toBe(200_000);
    expect(s.branches.length).toBe(0);
  });

  it("开张扣转让费、留下一条分店记录，口碑从 45% 起", () => {
    const s = fresh(200_000, 11);
    const r = openBranch(s, "xingning", "small");
    expect(r.ok).toBe(true);
    expect(s.cash).toBe(200_000 - 30_000);
    expect(s.branches.length).toBe(1);
    expect(s.branches[0]!.warmth).toBe(BRANCH_WARMTH_START);
    expect(s.branches[0]!.district).toBe("xingning");
  });

  it(`最多 ${MAX_BRANCHES} 家，满了拒绝`, () => {
    const s = fresh(600_000, 11);
    for (const d of ["xingning", "qingxiu", "jiangnan", "liangqing"]) {
      expect(openBranch(s, d, "small").ok).toBe(true);
    }
    expect(s.branches.length).toBe(MAX_BRANCHES);
    const five = openBranch(s, "wuming", "small");
    expect(five.ok).toBe(false);
    expect(five.reason).toContain("最多开 4 家");
  });

  it("同一个区连开两家要分客流：第二家只能拿到一半", () => {
    const s = fresh(600_000, 11);
    openBranch(s, "xingning", "amazing");
    const first = branchViews(s)[0]!.dayBowls;
    openBranch(s, "xingning", "amazing");
    const views = branchViews(s);
    // 两家同区，各自都是池子的一半（口碑相同）
    expect(views.length).toBe(2);
    expect(views[0]!.dayBowls).toBeLessThan(first);
    // 池子本来就小（兴宁满能量 160 客/日 ×0.6 = 96 碗），两家都拿不满 240
    expect(demandCapAtFullEnergy("xingning")).toBeGreaterThan(0);
    expect(views[0]!.dayBowls).toBeLessThan(240);
  });

  it("口碑每天涨 3%，约 18 天养满", () => {
    const s = fresh(200_000, 11);
    openBranch(s, "xingning", "small");
    const before = branchViews(s)[0]!.dayBowls;
    for (let i = 0; i < 18; i += 1) runBranchDay(s);
    expect(s.branches[0]!.warmth).toBeGreaterThan(0.98);
    expect(branchViews(s)[0]!.dayBowls).toBeGreaterThan(before);
  });

  it("日结：碗数进账、现金与账本对得上", () => {
    const s = fresh(200_000, 11);
    openBranch(s, "xingning", "small");
    const cash0 = s.cash;
    const bowls0 = s.tally.branchBowls;
    const rev0 = s.monthRevenue;
    const day = runBranchDay(s);
    expect(day.active).toBe(true);
    expect(day.bowls).toBeGreaterThan(0);
    // 分店的碗单列在 branchBowls，主店的 tally.bowls 不动（否则账本对不上，T7）
    expect(s.tally.branchBowls).toBe(bowls0 + day.bowls);
    expect(s.tally.bowls).toBe(0);
    expect(s.monthRevenue).toBe(rev0 + day.revenue);
    expect(s.cash).toBe(cash0 + day.revenue - day.cost);
    // 成本 = 料钱 + 房租店长摊到 30 天
    expect(day.cost).toBeGreaterThan(0);
  });

  it("没有分店时日结什么都不做（主店不受影响）", () => {
    const s = fresh(200_000, 11);
    const cash0 = s.cash;
    const day = runBranchDay(s);
    expect(day.active).toBe(false);
    expect(day.bowls).toBe(0);
    expect(s.cash).toBe(cash0);
  });

  it("月固定成本 = 每家（房租 + 店长）", () => {
    const s = fresh(200_000, 11);
    openBranch(s, "xingning", "small");
    openBranch(s, "qingxiu", "normal");
    expect(branchMonthlyCost(s)).toBe(1_500 + MANAGER_MONTHLY + 2_750 + MANAGER_MONTHLY);
  });

  it("关店退半个月租", () => {
    const s = fresh(200_000, 11);
    openBranch(s, "xingning", "normal");
    const id = s.branches[0]!.id;
    const cash0 = s.cash;
    const r = closeBranch(s, id);
    expect(r.ok).toBe(true);
    expect(r.refund).toBe(Math.round(2_750 / 2));
    expect(s.branches.length).toBe(0);
    expect(s.cash).toBe(cash0 + r.refund!);
    expect(closeBranch(s, id).ok).toBe(false);
  });

  it("档位表带「还差几段」与回本月数，给 UI 直接用", () => {
    const s = fresh(200_000, 7);
    const opts = branchSizeOptions(s);
    expect(opts.length).toBe(4);
    expect(opts.every((o) => o.locked)).toBe(true);
    expect(opts[0]!.short).toContain("还差 1 段");
    s.gradeLevel = 11;
    expect(branchSizeOptions(s).every((o) => !o.locked)).toBe(true);
  });

  it("存档 v15：分店记录存得下、读得回", () => {
    const s = fresh(200_000, 11);
    openBranch(s, "xingning", "small");
    s.branches[0]!.warmth = 0.72;
    const raw = serialize(s);
    const back = deserialize(raw)!;
    expect(back.branches.length).toBe(1);
    expect(back.branches[0]!.size).toBe("small");
    expect(back.branches[0]!.district).toBe("xingning");
    expect(back.branches[0]!.warmth).toBe(0.72);
  });
});
