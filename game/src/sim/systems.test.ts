import { describe, expect, it } from "vitest";
import { unlock } from "./collection";
import { canEnter, contestScore, enterContest } from "./contest";
import { closeMonth, closeYear } from "./ledger";
import { monthlyRentOf } from "./setup";
import {
  collectGift,
  favoriteArchetypes,
  isFavorite,
  maybePickRegular,
  recordVisit,
  regularLikeHitsNeed,
  regularReturnChance,
} from "./regulars";
import { buyUpgrade, upgradeCost, upgradeLevel } from "./shop";
import { buyExpansion, expansionLevel, expansionNextCost, nextExpansion } from "./expansion";
import { dailyWage, hire, serveMultiplier, settleStaffDay, surveyRate, toggleRest } from "./staff";
import { STAFF_POOL, WAGE_BY_SKILL, monthlyWageOf, nextStaffNeed, staffSlots, wageOf } from "../data/staff";
import { createInitialState, type MonthRecord, type StaffMember } from "./state";

function cook(skill: number, wage = 120): StaffMember {
  return { uid: "u1", templateId: "st.test", name: "测试厨", role: "cook", skill, wage, fatigue: 0, resting: false };
}

function server(skill: number, wage = 90): StaffMember {
  return { uid: "u2", templateId: "st.test", name: "测试跑堂", role: "server", skill, wage, fatigue: 0, resting: false };
}

describe("员工", () => {
  it("雇佣扣介绍费，厨师让出一碗更快（先做到 300 位客人才招得到人）", () => {
    const s = createInitialState("staff-1", 7);
    s.cash = 5000;
    s.totalCustomers = 300;
    const base = serveMultiplier(s);
    s.staff.candidates = [cook(5, 180)];
    const r = hire(s, "u1");
    expect(r.ok).toBe(true);
    expect(s.cash).toBe(5000 - 180 * 2);
    expect(s.staff.roster).toHaveLength(1);
    expect(serveMultiplier(s)).toBeLessThan(base);
    expect(dailyWage(s)).toBe(180);
  });

  it("累计接待不到门槛就招不到人：明确说还差多少位", () => {
    const s = createInitialState("staff-0", 7);
    s.cash = 5000;
    s.totalCustomers = 120;
    s.staff.candidates = [cook(3, 150)];
    const r = hire(s, "u1");
    expect(r.ok).toBe(false);
    expect(r.reason).toContain("还差 180 位");
    expect(s.cash).toBe(5000);
    expect(s.staff.roster).toHaveLength(0);
  });

  it("人手随累计接待量逐人解锁：300/800/1600/2600 → 1/2/3/4 个坑位", () => {
    expect(staffSlots(299)).toBe(0);
    expect(staffSlots(300)).toBe(1);
    expect(staffSlots(800)).toBe(2);
    expect(staffSlots(1600)).toBe(3);
    expect(staffSlots(2600)).toBe(4);
    expect(staffSlots(99_999)).toBe(4);
    expect(nextStaffNeed(0)).toEqual({ slot: 1, need: 300, short: 300 });
    expect(nextStaffNeed(2600)).toBeNull();
  });

  it("日薪按技能走现实尺度（技能 1 贴最低工资折算线，技能 5 是老师傅价）", () => {
    expect(WAGE_BY_SKILL).toEqual([110, 130, 150, 180, 220]);
    expect(wageOf(1)).toBe(110);
    expect(wageOf(5)).toBe(220);
    // 110 × 21.75 ≈ 2393，与南宁最低工资 2200 同阶
    expect(monthlyWageOf(110)).toBeGreaterThan(2200);
    expect(monthlyWageOf(110)).toBeLessThan(2600);
    for (const t of STAFF_POOL) expect(t.wage).toBe(wageOf(t.skill));
  });

  it("跑堂服务技能越高，问口味越快（开罗 PARAM_SERVICE）", () => {
    const s = createInitialState("staff-survey", 7);
    const base = surveyRate(s);
    s.staff.roster = [server(5)];
    expect(surveyRate(s)).toBeGreaterThan(base);
    s.staff.roster[0]!.resting = true;
    expect(surveyRate(s)).toBe(base);
  });

  it("疲劳累积到 100 会辞职；休息一天恢复", () => {
    const s = createInitialState("staff-2", 7);
    s.cash = 5000;
    s.staff.roster = [cook(3), { ...cook(2), uid: "u2", name: "二厨" }];
    s.staff.roster[0]!.fatigue = 95;
    s.staff.roster[1]!.fatigue = 50;
    toggleRest(s, "u2");
    settleStaffDay(s);
    expect(s.staff.roster).toHaveLength(1);
    expect(s.staff.roster[0]!.uid).toBe("u2");
    expect(s.staff.roster[0]!.fatigue).toBe(0);
    expect(s.staff.roster[0]!.resting).toBe(false);
  });
});

describe("店铺扩建（S5 两档资本开支）", () => {
  it("第一档先打隔墙：座位 +2、日上限 +60、钱按 CAPITAL 扣", () => {
    const s = createInitialState("shop-1", 7);
    s.cash = 20_000;
    const capBefore = s.capacity;
    const seatsBefore = s.venue.seats;
    const cost = expansionNextCost(s);
    expect(cost).toBe(12_000);
    expect(buyExpansion(s).ok).toBe(true);
    expect(s.cash).toBe(20_000 - cost);
    expect(s.venue.seats - seatsBefore).toBe(2);
    expect(s.venue.stoves).toBe(1);
    expect(s.capacity - capBefore).toBe(60);
    expect(expansionLevel(s)).toBe(1);
  });

  it("第二档加后厨：座位再 +2、灶 +1、日上限 +140；再往上一档卡段位", () => {
    const s = createInitialState("shop-2", 7);
    s.cash = 50_000;
    buyExpansion(s);
    const cash = s.cash;
    const seats = s.venue.seats;
    const stoves = s.venue.stoves;
    const cap = s.capacity;
    expect(expansionNextCost(s)).toBe(35_000);
    expect(buyExpansion(s).ok).toBe(true);
    expect(s.cash).toBe(cash - 35_000);
    expect(s.venue.seats - seats).toBe(2);
    expect(s.venue.stoves - stoves).toBe(1);
    expect(s.capacity - cap).toBe(140);
    // 第三档（后巷雨棚 ¥60,000）挂第 3 段门槛：没评段就是拒绝，且不扣钱
    const cashAfter = s.cash;
    expect(expansionNextCost(s)).toBe(60_000);
    const locked = buyExpansion(s);
    expect(locked.ok).toBe(false);
    expect(locked.reason).toContain("第 3 段");
    expect(s.cash).toBe(cashAfter);
  });

  it("后两档（P39）：第 3 段→后巷 +3 座，第 6 段→二楼 +4 座 +1 灶，买完到顶", () => {
    const s = createInitialState("shop-2b", 7);
    s.cash = 300_000;
    buyExpansion(s);
    buyExpansion(s);
    s.gradeLevel = 3;
    const seats = s.venue.seats;
    expect(buyExpansion(s).ok).toBe(true);
    expect(s.venue.seats - seats).toBe(3);
    // 第四档要第 6 段
    expect(buyExpansion(s).ok).toBe(false);
    s.gradeLevel = 6;
    const stoves = s.venue.stoves;
    expect(buyExpansion(s).ok).toBe(true);
    expect(s.venue.stoves - stoves).toBe(1);
    expect(expansionLevel(s)).toBe(4);
    expect(nextExpansion(s)).toBeNull();
    expect(expansionNextCost(s)).toBe(Infinity);
  });

  it("钱不够买扩建：明确拒绝，现金不动", () => {
    const s = createInitialState("shop-3", 7);
    s.cash = 3_000;
    const r = buyExpansion(s);
    expect(r.ok).toBe(false);
    expect(r.reason).toContain("还差");
    expect(s.cash).toBe(3_000);
    expect(expansionLevel(s)).toBe(0);
  });

  it("摆件仍然按倍率涨价（招牌/空调/装饰 三件留在 data/shop.ts）", () => {
    const s = createInitialState("shop-4", 7);
    s.cash = 10_000;
    const cost1 = upgradeCost(s, "sign");
    expect(buyUpgrade(s, "sign").ok).toBe(true);
    expect(upgradeLevel(s, "sign")).toBe(1);
    expect(upgradeCost(s, "sign")).toBeGreaterThan(cost1);
    // 旧的空间类升级已经退场：座位/灶位只能靠扩建
    expect(buyUpgrade(s, "seats").ok).toBe(false);
    expect(buyUpgrade(s, "hall").ok).toBe(false);
  });
});

describe("常客", () => {
  it("喂对味累计够才成为熟客（开罗 AddRegularCount 口径）", () => {
    const s = createInitialState("reg-1", 7);
    recordVisit(s, "regular", 80, ["top.offal"], true);
    recordVisit(s, "regular", 90, ["top.offal"], true);
    expect(favoriteArchetypes(s)).not.toContain("regular");
    recordVisit(s, "regular", 70, ["top.offal"], true);
    expect(s.regulars.regular!.likeHits).toBe(3);
    expect(isFavorite(s.regulars.regular!)).toBe(true);
    expect(favoriteArchetypes(s)).toContain("regular");
  });

  it("只来得多、没喂对味，不会转常客", () => {
    const s = createInitialState("reg-1b", 7);
    for (let i = 0; i < 8; i++) recordVisit(s, "regular", 95, ["top.offal"], false);
    expect(s.regulars.regular!.visits).toBe(8);
    expect(s.regulars.regular!.likeHits).toBe(0);
    expect(isFavorite(s.regulars.regular!)).toBe(false);
  });

  it("老客回访率是扁平常数", () => {
    // 已删除「喜好发现率 → 回访率」的自造联动，回访率与状态无关
    expect(regularReturnChance()).toBeCloseTo(0.35, 10);
  });

  it("有熟客时会掷出回访，且不越界", () => {
    const s = createInitialState("reg-3", 7);
    for (let i = 0; i < 3; i++) recordVisit(s, "regular", 90, ["top.offal"], true);
    s.regulars.regular!.lastDay = 0;
    s.month = 1;
    let hits = 0;
    for (let i = 0; i < 300; i++) {
      if (maybePickRegular(s) === "regular") hits += 1;
    }
    expect(hits).toBeGreaterThan(0);
  });

  it("常客门槛随月份抬高（对齐 Region.regularCountMax_ 的递增表）", () => {
    const s = createInitialState("reg-need", 7);
    const early = regularLikeHitsNeed(s);
    s.month = 35;
    const late = regularLikeHitsNeed(s);
    expect(early).toBe(3);
    expect(late).toBeGreaterThan(early);
  });

  it("熟客按对味次数送回礼，最多四份（对齐 Customer.gift_ / GetGiftRatio）", () => {
    const s = createInitialState("reg-gift", 7);
    for (let i = 0; i < 3; i++) recordVisit(s, "regular", 90, ["top.offal"], true);
    expect(collectGift(s, "regular")).toBe(0); // 刚成常客，还没到下一档

    for (let i = 0; i < 12; i++) recordVisit(s, "regular", 90, ["top.offal"], true);
    const gains: number[] = [];
    for (let g = collectGift(s, "regular"); g > 0; g = collectGift(s, "regular")) gains.push(g);
    expect(gains).toEqual([60, 100, 160, 240]);
    expect(s.regulars.regular!.giftCount).toBe(4);
    expect(collectGift(s, "regular")).toBe(0);
  });
});

describe("全国竞赛（开罗式：一年两场 / 三种 / 段位卡档）", () => {
  it("非比赛月报不了名 —— 官方口径是六月和十二月", () => {
    const s = createInitialState("contest-1", 7);
    s.month = 0; // 一月
    const g = canEnter(s, 1);
    expect(g.ok).toBe(false);
    expect(g.reason).toContain("还要等");
    expect(enterContest(s, "shop")).toBeNull();
  });

  it("比赛月能报名，结果入档，同一届不能报第二次", () => {
    const s = createInitialState("contest-2", 7);
    s.month = 5; // 六月
    s.cash = 5_000;
    const before = s.cash;
    expect(canEnter(s, 1).ok).toBe(true);
    const r = enterContest(s, "shop", 1);
    expect(r).not.toBeNull();
    expect(r!.tier).toBe(1);
    expect(r!.type).toBe("shop");
    // 一档报名费 0，所以现金只增（奖金）不减
    expect(s.cash).toBeGreaterThanOrEqual(before);
    expect(s.contest.results.length).toBe(1);
    expect(canEnter(s, 1).ok).toBe(false);
    expect(enterContest(s, "shop", 1)).toBeNull();
  });

  it("段位不够报不了高档 —— 这就是「评段位」的意义", () => {
    const s = createInitialState("contest-3", 7);
    s.month = 5;
    s.cash = 100_000;
    const g = canEnter(s, 4);
    expect(g.ok).toBe(false);
    expect(g.reason).toContain("第 6 段");
    s.gradeLevel = 6;
    expect(canEnter(s, 4).ok).toBe(true);
  });

  it("同存档同月份同类型可复算：名次与冠军一致", () => {
    const a = createInitialState("contest-4", 7);
    const b = createInitialState("contest-4", 7);
    a.month = 5;
    b.month = 5;
    a.cash = 9_000;
    b.cash = 9_000;
    const ra = enterContest(a, "staff", 1);
    const rb = enterContest(b, "staff", 1);
    expect(ra!.rank).toBe(rb!.rank);
    expect(ra!.champion).toBe(rb!.champion);
    expect(ra!.score).toBe(rb!.score);
  });

  it("三种比赛的口径不同：雇人不涨街坊分，卖粉不涨后厨分", () => {
    const s = createInitialState("contest-5", 7);
    const base = {
      staff: contestScore(s, "staff"),
      customers: contestScore(s, "customers"),
      shop: contestScore(s, "shop"),
    };
    s.totalCustomers = 1_800;
    s.tally.bowls = 1_200;
    expect(contestScore(s, "customers")).toBeGreaterThan(base.customers);
    expect(contestScore(s, "staff")).toBe(base.staff);
    expect(contestScore(s, "shop")).toBe(base.shop);
  });
});

describe("月结 / 年结", () => {
  function monthRecord(month: number): MonthRecord {
    return {
      month,
      revenue: 4000,
      customers: 100,
      lost: 2,
      avgSat: 70,
      wages: 500,
      rent: monthlyRentOf({ site: "alley", month: 1 } as never),
      profit: 2700,
      target: 3600,
      grade: "A",
    };
  }

  it("月结扣固定月租、写月报、重置累计", () => {
    const s = createInitialState("ledger-1", 7);
    s.monthRevenue = 4000;
    s.monthServed = 100;
    s.monthLost = 2;
    s.monthSatSum = 7000;
    s.monthSatCount = 100;
    s.monthWages = 500;
    const cash = s.cash;
    const rent = monthlyRentOf(s);
    expect(rent).toBe(4_600); // 未选铺位时按巷内小店预演
    closeMonth(s);
    expect(s.months).toHaveLength(1);
    expect(s.months[0]!.revenue).toBe(4000);
    expect(s.months[0]!.avgSat).toBe(70);
    expect(s.months[0]!.rent).toBe(rent);
    expect(s.cash).toBe(cash - rent);
    expect(s.monthRevenue).toBe(0);
    expect(s.monthWages).toBe(0);
  });

  it("满 12 个月出年度结算单（房租是固定月租，不随 KPI 涨）", () => {
    const s = createInitialState("ledger-2", 7);
    s.cash = 60_000;
    let rentTotal = 0;
    for (let m = 0; m < 12; m++) {
      s.month = m;
      s.monthRevenue = 5000;
      s.monthServed = 120;
      s.monthSatSum = 8400;
      s.monthSatCount = 120;
      s.monthWages = 300;
      s.monthTarget = 3600;
      rentTotal += monthlyRentOf(s);
      closeMonth(s);
    }
    expect(s.months).toHaveLength(12);
    expect(s.years).toHaveLength(1);
    const y = s.years[0]!;
    expect(y.year).toBe(1);
    expect(y.revenue).toBe(60000);
    expect(["S", "A", "B"]).toContain(y.rating);
    expect(s.pendingReport).not.toBeNull();
    // 第一年内不涨租：12 × ¥4,600
    expect(rentTotal).toBe(12 * 4_600);
    expect(s.cash).toBe(60_000 - rentTotal + y.bonus);
    expect(y.bonus).toBeGreaterThanOrEqual(2000);
  });

  it("年结后可重复生成下一年", () => {
    const s = createInitialState("ledger-3", 7);
    s.months = Array.from({ length: 12 }, (_, i) => monthRecord(i));
    s.month = 11;
    closeYear(s);
    expect(s.years).toHaveLength(1);
    s.months = Array.from({ length: 12 }, (_, i) => monthRecord(i + 12));
    s.month = 23;
    closeYear(s);
    expect(s.years[1]!.year).toBe(2);
  });
});

describe("图鉴", () => {
  it("同一项只解锁一次", () => {
    const s = createInitialState("col-1", 7);
    expect(unlock(s, "toppings", "top.offal")).toBe(true);
    expect(unlock(s, "toppings", "top.offal")).toBe(false);
    expect(s.collection.toppings).toEqual(["top.offal"]);
  });
});
