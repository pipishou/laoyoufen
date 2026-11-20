import { describe, expect, it } from "vitest";
import { CONTEST_TIERS, tierOf } from "../data/contest";
import { TOURNEYS, TOURNEY_BY_ID, tourneysOfLevel } from "../data/tourneys";
import { deserialize, serialize } from "./save";
import { SAVE_VERSION, createInitialState, type GameState } from "./state";
import {
  bestRankOfLevel,
  enterTourney,
  levelProgressOf,
  tourneyGate,
  tourneyRecordOf,
  tourneySummary,
  tourneyViews,
} from "./tourneys";

/** 12 月 = month % 12 === 11；6 月 = month % 12 === 5 */
const JUNE = 5;
const DEC = 11;

function fresh(): GameState {
  const s = createInitialState("p1", 7);
  s.cash = 200_000;
  s.gradeLevel = 11;
  s.reputation = 4.6;
  s.totalCustomers = 9000;
  s.tally.bowls = 9000;
  s.month = JUNE;
  s.day = 1;
  return s;
}

/** 直接塞一条「上一级进过前三」的记录，省掉真的打一场 */
function seedRank(s: GameState, id: string, rank: number): void {
  s.tourneys = { ...(s.tourneys ?? {}), [id]: { played: 1, best: rank } };
}

/** 已经在街道办级进过前三：城区级及以上的前置条件 */
function freshPassed(): GameState {
  const s = fresh();
  seedRank(s, "chaoyang_street", 2);
  return s;
}

describe("赛事阶梯：14 场具名赛事", () => {
  it("14 场，五级 3/3/3/3/2，id 唯一", () => {
    expect(TOURNEYS.length).toBe(14);
    expect(([1, 2, 3, 4, 5] as const).map((l) => tourneysOfLevel(l).length)).toEqual([3, 3, 3, 3, 2]);
    expect(new Set(TOURNEYS.map((t) => t.id)).size).toBe(14);
    expect(TOURNEY_BY_ID.size).toBe(14);
  });

  it("每场都有主办方、一句南宁话，tier 落在已有 5 档里", () => {
    for (const t of TOURNEYS) {
      expect(t.host.length).toBeGreaterThan(1);
      expect(t.pitch.length).toBeGreaterThan(6);
      expect(CONTEST_TIERS.some((x) => x.tier === t.tier)).toBe(true);
    }
  });

  it("tier 随层级不下降：越往上报名越贵、对手越强", () => {
    for (const level of [1, 2, 3, 4, 5] as const) {
      for (const t of tourneysOfLevel(level)) {
        const base = tierOf(t.tier);
        expect(base.rivalScore).toBeGreaterThanOrEqual(level === 1 ? 0 : 130);
      }
    }
    const top = tourneysOfLevel(5).map((t) => tierOf(t.tier).prizeYuan);
    expect(Math.max(...top)).toBe(50_000);
  });

  it("只有街道办级「随时可报」，往上一律跟一年两届走", () => {
    for (const t of TOURNEYS) {
      if (t.level === 1) expect(t.when).toBe("anytime");
      else expect(t.when).not.toBe("anytime");
    }
  });

  it("跨级前置一律「上一级进过前三」", () => {
    for (const t of TOURNEYS) {
      if (t.level === 1) {
        expect(t.needLevel).toBeUndefined();
      } else {
        expect(t.needLevel).toBe(t.level - 1);
        expect(t.needRank).toBe(3);
      }
    }
  });
});

describe("报名门槛", () => {
  it("城区级只在六月：别的月份报不上，理由说清是哪个月", () => {
    const s = fresh();
    s.month = 0;
    const def = TOURNEY_BY_ID.get("xingning_skill")!;
    const gate = tourneyGate(s, def);
    expect(gate.ok).toBe(false);
    expect(gate.reason).toContain("六月");
  });

  it("六月能报城区；十二月（有前置）能报市级", () => {
    const s = freshPassed();
    expect(tourneyGate(s, TOURNEY_BY_ID.get("xingning_skill")!).ok).toBe(true);

    s.month = DEC;
    seedRank(s, "xingning_skill", 2);
    expect(tourneyGate(s, TOURNEY_BY_ID.get("nanning_skill")!).ok).toBe(true);
  });

  it("街道办级一天只准一场，第二天又能报", () => {
    const s = fresh();
    const def = TOURNEY_BY_ID.get("chaoyang_street")!;
    expect(tourneyGate(s, def).ok).toBe(true);
    expect(enterTourney(s, def.id)).not.toBeNull();

    const again = tourneyGate(s, def);
    expect(again.ok).toBe(false);
    expect(again.reason).toContain("今天已经打过");

    s.day += 1;
    expect(tourneyGate(s, def).ok).toBe(true);
  });

  it("非街道办级一届只准一场，下一届再来", () => {
    const s = freshPassed();
    expect(enterTourney(s, "xingning_skill")).not.toBeNull();
    const other = tourneyGate(s, TOURNEY_BY_ID.get("qingxiu_foodfest")!);
    expect(other.ok).toBe(false);
    expect(other.reason).toContain("这一届");

    s.month = JUNE + 12;
    seedRank(s, "xingning_skill", 2);
    expect(tourneyGate(s, TOURNEY_BY_ID.get("qingxiu_foodfest")!).ok).toBe(true);
  });

  it("没在城区进过前三，市级报不上", () => {
    const s = fresh();
    s.month = DEC;
    const gate = tourneyGate(s, TOURNEY_BY_ID.get("nanning_skill")!);
    expect(gate.ok).toBe(false);
    expect(gate.reason).toContain("城区级");
  });

  it("段位不够、钱不够各有一句人话", () => {
    const s = fresh();
    s.month = DEC;
    seedRank(s, "xingning_skill", 1);
    s.gradeLevel = 0;
    expect(tourneyGate(s, TOURNEY_BY_ID.get("nanning_skill")!).reason).toContain("第 4 段");

    s.gradeLevel = 11;
    s.cash = 100;
    expect(tourneyGate(s, TOURNEY_BY_ID.get("nanning_skill")!).reason).toContain("报名费");
  });
});

describe("报名与成绩", () => {
  it("报名扣钱、发奖金、记下打过几次与最好名次", () => {
    const s = freshPassed();
    const def = TOURNEY_BY_ID.get("xingning_skill")!;
    const cash0 = s.cash;
    const fee = tierOf(def.tier).feeYuan;

    const r = enterTourney(s, def.id)!;
    expect(r).not.toBeNull();
    expect(r.times).toBe(1);
    expect(s.cash).toBe(cash0 - fee + r.prize);

    const rec = tourneyRecordOf(s, def.id);
    expect(rec.played).toBe(1);
    expect(rec.best).toBe(r.rank);
    expect(s.tourneyRound).toBeGreaterThanOrEqual(0);
  });

  it("打两次：best 取更好的那个名次，played 累加", () => {
    const s = fresh();
    const def = TOURNEY_BY_ID.get("chaoyang_street")!;
    const first = enterTourney(s, def.id)!;
    s.day += 1;
    const second = enterTourney(s, def.id)!;

    const rec = tourneyRecordOf(s, def.id);
    expect(rec.played).toBe(2);
    expect(rec.best).toBe(Math.min(first.rank, second.rank));
  });

  it("打不进前三就没有「跨级凭证」", () => {
    const s = fresh();
    // 把分数拉到极低：一间刚开的小店
    s.totalCustomers = 0;
    s.tally.bowls = 0;
    s.reputation = 0.5;
    s.gradeLevel = 0;
    s.staff = { roster: [] } as unknown as GameState["staff"];
    enterTourney(s, "zhongshan_night");
    for (const level of [1, 2, 3, 4, 5] as const) {
      const best = bestRankOfLevel(s, level);
      if (best > 0) expect(best).toBeGreaterThan(3);
    }
  });

  it("未知 id 返回 null", () => {
    const s = fresh();
    expect(enterTourney(s, "nope")).toBeNull();
  });
});

describe("展示", () => {
  it("summary 说清「打过几场 / 共几场 / 最好名次」", () => {
    const s = fresh();
    expect(tourneySummary(s)).toContain("打过 0 / 14 场");
    expect(tourneySummary(s)).toContain("还没进过名次");
    enterTourney(s, "chaoyang_street");
    expect(tourneySummary(s)).toContain("打过 1 / 14 场");
  });

  it("levelProgressOf 五级、每级 total 对得上、best 从记录算", () => {
    const s = fresh();
    seedRank(s, "xingning_skill", 2);
    const rows = levelProgressOf(s);
    expect(rows.map((r) => r.level)).toEqual([1, 2, 3, 4, 5]);
    expect(rows.map((r) => r.total)).toEqual([3, 3, 3, 3, 2]);
    const district = rows.find((r) => r.level === 2)!;
    expect(district.played).toBe(1);
    expect(district.best).toBe(2);
    expect(district.name).toBe("城区级");
  });

  it("views 把 gate 与钱一起给 UI，报不了的那场也照样列出", () => {
    const s = fresh();
    s.month = 0;
    const views = tourneyViews(s);
    expect(views.length).toBe(14);
    const juneOnly = views.find((v) => v.def.when === "june")!;
    expect(juneOnly.gate.ok).toBe(false);
    expect(juneOnly.feeYuan).toBeGreaterThan(0);
    expect(juneOnly.prizeYuan).toBeGreaterThan(juneOnly.feeYuan);
  });
});

describe("存档", () => {
  it("v25：成绩表与当届标记存得住", () => {
    const s = fresh();
    enterTourney(s, "chaoyang_street");
    expect(SAVE_VERSION).toBe(26);

    const back = deserialize(serialize(s))!;
    expect(back).not.toBeNull();
    expect(back.tourneys?.chaoyang_street?.played).toBe(1);
    expect(back.tourneyDay).toBe(s.tourneyDay);
  });

  it("v24 老档：没有成绩表就补空，坏值一律丢弃", () => {
    const s = fresh();
    const raw = JSON.parse(serialize(s)) as Record<string, unknown>;
    raw.saveVersion = 24;
    delete raw.tourneys;
    delete raw.tourneyDay;
    delete raw.tourneyRound;

    const back = deserialize(JSON.stringify(raw))!;
    expect(back.tourneys).toEqual({});
    expect(back.tourneyDay).toBe(-1);
    expect(back.tourneyRound).toBe(-1);
  });
});
