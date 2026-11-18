import { describe, expect, it } from "vitest";
import { createInitialState, type GameState, type MonthRecord } from "./state";
import { auditPlaytest, quantOf } from "./playtest";

function month(i: number, revenue: number, opts: Partial<MonthRecord> = {}): MonthRecord {
  return {
    month: i,
    revenue,
    customers: Math.round(revenue / 10),
    lost: 0,
    avgSat: 70,
    wages: 3000,
    rent: 4600,
    profit: revenue - 7600,
    target: 21000,
    grade: "B",
    ...opts,
  };
}

/** 造一局「正常成长」的三年：营收每月 +6%，36 个月从 1.8 万爬到 12 万 */
function goodState(): GameState {
  const s = createInitialState("tester", 1);
  s.months = Array.from({ length: 36 }, (_, i) =>
    month(i, Math.round(18_000 * Math.pow(1.06, i))),
  );
  s.cash = 80_000;
  s.price = 10;
  s.gradeLevel = 6;
  s.tally.bowls = s.months.reduce((n, m) => n + m.customers, 0);
  s.frenzy = { gauge: 0, until: -1, restUntil: -1, count: 24 };
  // P41：客单价结构也得真的用起来，否则 T9 会说「加料台没被用起来」
  s.tally.sideRevenue = 42_000;
  s.tally.comboHits = 120;
  // 街面（M2）：三年下来街上总得修点东西，否则 T13 会说「这条街一点没变」
  s.streets = ["lane_lamp", "notice_board", "banyan_bench"];
  s.gear = ["plastic_stool", "wall_fan", "wash_sink", "freezer"];
  // 人情：既攒过也花过，免得 T15 把 PASS 变 PASS_WITH_NOTES
  s.favorTotal = 140;
  s.favor = 12;
  // P47：多款菜单也得真的挂起来，否则 T10 会说「一年下来只有一款」
  s.menu.push({ ...s.menu[0]!, id: 2, main: "beef", price: 12, sold: 420 });
  s.menu[0]!.sold = 900;
  s.contest.results = Array.from({ length: 6 }, (_, i) => ({
    month: i * 6,
    round: i,
    type: "shop",
    tier: 2,
    score: 300,
    rank: i === 0 ? 1 : 3,
    champion: "对手",
    prize: 3000,
  }));
  return s;
}

describe("游戏测试员判据", () => {
  it("跑不满 36 个月 → 无法评估（NOT_ASSESSED），且点名缺什么", () => {
    const s = createInitialState("tester", 2);
    s.months = [month(0, 18_000), month(1, 18_200)];
    const rep = auditPlaytest(s);
    expect(rep.verdict).toBe("NOT_ASSESSED");
    expect(rep.findings[0]!.title).toContain("2/36");
  });

  it("三年长大、现金为正、内容走完 → 通过（PASS）", () => {
    const rep = auditPlaytest(goodState());
    expect(rep.verdict).toBe("PASS");
    expect(rep.findings).toHaveLength(0);
    expect(rep.quant.growth).toBeGreaterThan(1.15);
  });

  it("营收连着 5 个月不动 → 判「中期没决策」（design/high），并给开罗依据", () => {
    const s = goodState();
    // 第 10-15 月同一水平，之后继续涨
    s.months = s.months.map((m, i) => (i >= 10 && i <= 15 ? month(i, 22_000) : m));
    // 重算累计碗数，否则 T7（账本对不上）会先跳出来，把 T3 挤掉
    s.tally.bowls = s.months.reduce((n, m) => n + m.customers, 0);
    const rep = auditPlaytest(s);
    const f = rep.findings.find((x) => x.id === "T3");
    expect(f).toBeDefined();
    expect(f!.bucket).toBe("design");
    expect(f!.severity).toBe("high");
    expect(f!.kairo).toContain("Contests");
    // design/high 不是 blocker，所以是「通过（有问题清单）」
    expect(rep.verdict).toBe("PASS_WITH_NOTES");
  });

  it("期末现金转负 → 不通过（BLOCKED），标题点名亏钱", () => {
    const s = goodState();
    s.cash = -12_000;
    const rep = auditPlaytest(s);
    expect(rep.verdict).toBe("BLOCKED");
    expect(rep.findings.some((x) => x.id === "T1")).toBe(true);
    expect(rep.top3[0]!.severity).toBe("high");
  });

  it("累计碗数与月报客人对不上 → 账本 bug（BLOCKED）", () => {
    const s = goodState();
    s.tally.bowls = 10;
    const rep = auditPlaytest(s);
    const f = rep.findings.find((x) => x.id === "T7");
    expect(f).toBeDefined();
    expect(f!.bucket).toBe("bug");
    expect(rep.verdict).toBe("BLOCKED");
  });

  it("均价掉到 ¥8 → 报 balance；热卖太少 → 报 polish", () => {
    const s = goodState();
    s.days = Array.from({ length: 30 }, (_, i) => ({
      month: 0,
      day: i + 1,
      revenue: 500,
      served: 60,
      lost: 0,
      avgSat: 65,
      price: 8,
      taste: 60,
      cash: 50_000,
    }));
    s.frenzy.count = 3;
    const rep = auditPlaytest(s);
    expect(rep.findings.some((x) => x.id === "T5")).toBe(true);
    expect(rep.findings.some((x) => x.id === "T6")).toBe(true);
  });

  it("quantOf 的最长持平段按「相邻月变化 <5%」数", () => {
    const s = createInitialState("tester", 3);
    s.months = [20_000, 20_300, 20_100, 20_400, 30_000, 30_200, 30_100].map((v, i) => month(i, v));
    expect(quantOf(s).flatStreak).toBe(4);
  });
});
