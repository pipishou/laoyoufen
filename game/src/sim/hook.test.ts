import { describe, expect, it } from "vitest";
import { createInitialState, type DayRecord, type GameState } from "./state";
import { openForBusiness } from "./setup";
import { CAPACITY_LOST_RATE, hookVoiceContext, lostRateOf, nextHook, nextHookOf } from "./hook";
import { spawnScaleByDay } from "./customer";
import { checkGrade } from "./grade";
import { buyGear } from "./gear";
import { buyStreet } from "./streets";
import { GRADES } from "./grade";

function fresh(): GameState {
  const s = createInitialState("hook-player", 11);
  expect(openForBusiness(s, "alley", "测试老友粉").ok).toBe(true);
  return s;
}

describe("打烊单的「明天」", () => {
  it("新局第一段要 110 位客人：差值在一天量内就给客人目标", () => {
    const s = fresh();
    expect(GRADES[0]!.minCustomers).toBe(110);
    expect(s.totalCustomers).toBe(0);
    const hook = nextHookOf(s);
    // 新局差 110 人 > 80 的阈值，所以不该说「明天再来 N 位」
    expect(hook).not.toContain("再来");
  });

  it("差 80 位以内会说「明天再来 N 位客人」", () => {
    const s = fresh();
    s.totalCustomers = 90; // 差 60
    s.cash = 0;
    expect(nextHookOf(s)).toContain("再来 20 位客人");
  });

  it("人次够了但钱不够：提示凑钱", () => {
    const s = fresh();
    s.totalCustomers = 400;
    s.cash = 100; // 判定费还不够
    const g = checkGrade(s);
    expect(g.shortCustomers).toBe(0);
    expect(g.shortCash).toBeGreaterThan(0);
    expect(nextHookOf(s)).toContain("凑到");
  });

  it("钱和人次都够：提示明天去评", () => {
    const s = fresh();
    s.totalCustomers = 400;
    s.cash = 200_000;
    expect(nextHookOf(s)).toContain("去评");
  });

  it("段位说不了话时，退到「明天添一件家当」", () => {
    const s = fresh();
    s.totalCustomers = 400;
    s.cash = 5_000;
    // 把钱花到买不起下一段，但也买得起塑料矮凳
    const g = checkGrade(s);
    s.cash = Math.max(0, (g.next?.feeYuan ?? 0) - 1);
    // 差钱但差值 > 0 且不是「凑到」场景：shortCustomers > 0 时不说凑钱
    s.totalCustomers = 0;
    expect(nextHookOf(s)).toContain("添一件");
  });

  it("家当都买完之后退到街面", () => {
    const s = fresh();
    s.totalCustomers = 0;
    s.cash = 1_000_000;
    // 先把最便宜的几件家当买掉，让第一条 affordable 的家当不存在
    for (const id of ["plastic_stool", "wall_fan", "wash_sink", "big_board", "aroma_fan", "serve_manual"]) {
      buyGear(s, id);
    }
    s.cash = 1_000_000;
    // 把剩下的家当也买完
    for (const id of ["bamboo_chair", "hood", "sour_plum", "freezer", "banner", "lucky_statue"]) {
      buyGear(s, id);
    }
    s.cash = 1_000_000;
    expect(nextHookOf(s)).toContain("修");
  });

  it("街面也修完之后退到落场", () => {
    const s = fresh();
    s.cash = 1_000_000;
    for (const id of [
      "plastic_stool", "wall_fan", "wash_sink", "big_board", "aroma_fan", "serve_manual",
      "bamboo_chair", "hood", "sour_plum", "freezer", "banner", "lucky_statue",
    ]) {
      buyGear(s, id);
    }
    for (const id of [
      "lane_lamp", "market_canopy", "tea_shop", "crosswalk", "court", "banyan_bench",
      "toilet_sign", "billboard", "charger", "notice_board", "market_back", "mahjong",
    ]) {
      buyStreet(s, id);
    }
    s.cash = 1_000_000;
    expect(nextHookOf(s)).toContain("落一场");
  });

  it("段位满了、什么都买完了：给空串，不编目标", () => {
    const s = fresh();
    s.gradeLevel = 11;
    s.cash = 1_000_000;
    for (const id of [
      "plastic_stool", "wall_fan", "wash_sink", "big_board", "aroma_fan", "serve_manual",
      "bamboo_chair", "hood", "sour_plum", "freezer", "banner", "lucky_statue",
    ]) {
      buyGear(s, id);
    }
    for (const id of [
      "lane_lamp", "market_canopy", "tea_shop", "crosswalk", "court", "banyan_bench",
      "toilet_sign", "billboard", "charger", "notice_board", "market_back", "mahjong",
    ]) {
      buyStreet(s, id);
    }
    s.tally.arenaRuns = 99;
    s.arenaDay = s.month * 100 + s.day;
    s.arenaRuns = 99;
    expect(nextHookOf(s)).toBe("");
  });
});

describe("开局客流分档（P67）", () => {
  it("只压首日 ×0.55、第 2–7 天 ×0.85、第 8 天起 ×1", () => {
    const s = fresh();
    s.month = 0;
    for (const [day, want] of [[1, 0.55], [2, 0.85], [7, 0.85], [8, 1]] as const) {
      s.day = day;
      expect(spawnScaleByDay(s)).toBe(want);
    }
  });

  it("第二个月起不再压客流（换区、重开都不该回到新手期）", () => {
    const s = fresh();
    s.month = 1;
    s.day = 1;
    expect(spawnScaleByDay(s)).toBe(1);
  });
});

/** 造一张打烊单快照：endDay 会把 flow 里的计数清零，只有快照留得住 */
function report(s: GameState, lost: number, served: number): void {
  const rec: DayRecord = {
    month: s.month,
    day: s.day,
    revenue: 0,
    served,
    lost,
    avgSat: -1,
    price: s.price,
    taste: 0,
    cash: s.cash,
  };
  s.dayReport = rec;
}

describe("产能优先（P70）", () => {
  it("当天流失过 45%：钩子换成「先把灶台加上」，并标成 high", () => {
    const s = fresh();
    s.cash = 200_000;
    report(s, 60, 40); // 60 / 100 = 60%
    const plan = nextHook(s);
    expect(plan.kind).toBe("capacity");
    expect(plan.urgency).toBe("high");
    expect(plan.text).toContain("今天走了 60 位");
    expect(plan.text).toMatch(/¥/);
  });

  it("流失刚好不到 45%：还是按原来的顺序走，不说产能", () => {
    const s = fresh();
    s.cash = 200_000;
    report(s, 44, 56); // 44%
    expect(nextHook(s).kind).not.toBe("capacity");
  });

  it("产能压过段位：能评段位但今天流失六成，先说产能", () => {
    const s = fresh();
    s.totalCustomers = 400;
    s.cash = 200_000;
    report(s, 70, 30);
    expect(checkGrade(s).ready).toBe(true);
    expect(nextHook(s).kind).toBe("capacity");
  });

  it("钱不够也照说，只是把「先添」换成「卖了钱先添」", () => {
    const s = fresh();
    s.cash = 0;
    report(s, 80, 20);
    expect(nextHook(s).text).toContain("卖了钱先添");
  });

  it("lostRateOf 优先读打烊单快照（flow 已清零也不影响）", () => {
    const s = fresh();
    s.flow.lostToday = 0;
    s.flow.servedToday = 0;
    report(s, 50, 50);
    expect(lostRateOf(s)).toBeCloseTo(0.5, 5);
  });

  it("没客人的一天不算流失（0 人不该除出 0/0）", () => {
    const s = fresh();
    expect(lostRateOf(s)).toBe(0);
    expect(CAPACITY_LOST_RATE).toBeGreaterThan(0);
  });

  it("给 AI 的上下文只有名词、没有数字", () => {
    const s = fresh();
    s.cash = 200_000;
    report(s, 60, 40);
    const ctx = hookVoiceContext(nextHook(s));
    const text = JSON.stringify(ctx);
    expect(text).not.toMatch(/\d/);
    expect(Object.keys(ctx).length).toBeGreaterThan(0);
    // kind none 时没有上下文
    expect(hookVoiceContext({ text: "", kind: "none", key: "none", urgency: "normal" })).toEqual({});
  });
});
