import { describe, expect, it } from "vitest";
import { unlock } from "./collection";
import { canEnter, enterContest } from "./contest";
import { closeMonth, closeYear } from "./ledger";
import { rentFor } from "../data/balance";
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
import { dailyWage, hire, serveMultiplier, settleStaffDay, surveyRate, toggleRest } from "./staff";
import { createInitialState, type MonthRecord, type StaffMember } from "./state";

function cook(skill: number, wage = 120): StaffMember {
  return { uid: "u1", templateId: "st.test", name: "测试厨", role: "cook", skill, wage, fatigue: 0, resting: false };
}

function server(skill: number, wage = 90): StaffMember {
  return { uid: "u2", templateId: "st.test", name: "测试跑堂", role: "server", skill, wage, fatigue: 0, resting: false };
}

describe("员工", () => {
  it("雇佣扣介绍费，厨师让出一碗更快", () => {
    const s = createInitialState("staff-1", 7);
    s.cash = 5000;
    const base = serveMultiplier(s);
    s.staff.candidates = [cook(5, 180)];
    const r = hire(s, "u1");
    expect(r.ok).toBe(true);
    expect(s.cash).toBe(5000 - 180 * 2);
    expect(s.staff.roster).toHaveLength(1);
    expect(serveMultiplier(s)).toBeLessThan(base);
    expect(dailyWage(s)).toBe(180);
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

describe("店铺扩建", () => {
  it("加桌 +1 座，价格按倍率上涨", () => {
    const s = createInitialState("shop-1", 7);
    s.cash = 10000;
    const cost1 = upgradeCost(s, "seats");
    expect(buyUpgrade(s, "seats").ok).toBe(true);
    expect(s.venue.seats).toBe(5);
    expect(s.cash).toBe(10000 - cost1);
    expect(upgradeCost(s, "seats")).toBeGreaterThan(cost1);
    expect(upgradeLevel(s, "seats")).toBe(1);
  });

  it("加灶与扩建同时生效", () => {
    const s = createInitialState("shop-2", 7);
    s.cash = 20000;
    buyUpgrade(s, "stove");
    buyUpgrade(s, "hall");
    expect(s.venue.stoves).toBe(2);
    expect(s.capacity).toBe(50);
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

describe("全国竞赛", () => {
  it("报名扣费、同月不能重复、排名与奖金一致", () => {
    const s = createInitialState("contest-1", 7);
    s.cash = 5000;
    expect(canEnter(s).ok).toBe(true);
    const r = enterContest(s, 200);
    expect(r).not.toBeNull();
    expect(r!.rank).toBe(1);
    expect(r!.prize).toBe(5000);
    expect(s.cash).toBe(5000 - 300 + 5000);
    expect(canEnter(s).ok).toBe(false);
    expect(enterContest(s, 200)).toBeNull();
    expect(s.collection.provinces.length).toBeGreaterThan(0);
  });

  it("同存档同月份，NPC 分数可复算", () => {
    const a = createInitialState("contest-2", 7);
    const b = createInitialState("contest-2", 7);
    a.cash = 5000;
    b.cash = 5000;
    const ra = enterContest(a, 70);
    const rb = enterContest(b, 70);
    expect(ra!.rank).toBe(rb!.rank);
    expect(ra!.champion).toBe(rb!.champion);
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
      rent: rentFor(3600),
      profit: 2700,
      target: 3600,
      grade: "A",
    };
  }

  it("月结扣房租、写月报、重置累计", () => {
    const s = createInitialState("ledger-1", 7);
    s.monthRevenue = 4000;
    s.monthServed = 100;
    s.monthLost = 2;
    s.monthSatSum = 7000;
    s.monthSatCount = 100;
    s.monthWages = 500;
    const cash = s.cash;
    const rent = rentFor(s.monthTarget);
    closeMonth(s);
    expect(s.months).toHaveLength(1);
    expect(s.months[0]!.revenue).toBe(4000);
    expect(s.months[0]!.avgSat).toBe(70);
    expect(s.months[0]!.rent).toBe(rent);
    expect(s.cash).toBe(cash - rent);
    expect(s.monthRevenue).toBe(0);
    expect(s.monthWages).toBe(0);
  });

  it("满 12 个月出年度结算单", () => {
    const s = createInitialState("ledger-2", 7);
    s.cash = 10000;
    for (let m = 0; m < 12; m++) {
      s.month = m;
      s.monthRevenue = 5000;
      s.monthServed = 120;
      s.monthSatSum = 8400;
      s.monthSatCount = 120;
      s.monthWages = 300;
      s.monthTarget = 3600;
      closeMonth(s);
    }
    expect(s.months).toHaveLength(12);
    expect(s.years).toHaveLength(1);
    const y = s.years[0]!;
    expect(y.year).toBe(1);
    expect(y.revenue).toBe(60000);
    expect(["S", "A", "B"]).toContain(y.rating);
    expect(s.pendingReport).not.toBeNull();
    expect(s.cash).toBe(10000 - 12 * rentFor(3600) + y.bonus);
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
