import { describe, expect, it } from "vitest";
import { STREETS, STREET_BY_ID, STREET_TOTAL_YUAN } from "../data/streets";
import { SAVE_VERSION, createInitialState, type GameState } from "./state";
import { openForBusiness } from "./setup";
import { deserialize, serialize } from "./save";
import { queueMaxOf } from "./unlocks";
import { demandCapOf } from "./district";
import {
  buyStreet,
  dayPartOf,
  hasStreet,
  nextRequest,
  streetAttractMult,
  streetDrinkMult,
  streetGiftMult,
  streetLeft,
  streetMap,
  streetPatienceMult,
  streetPoolMult,
  streetQueuePlus,
  streetSummary,
  streetViews,
} from "./streets";

function fresh(): GameState {
  const s = createInitialState("streets-test", 11);
  const r = openForBusiness(s, "alley", "测试老友粉");
  if (!r.ok) throw new Error("建店失败：" + r.reason);
  return s;
}

/** 把手头的东西都修上（钱给够） */
function build(s: GameState, ids: string[]): void {
  s.cash = 999_999;
  for (const id of ids) {
    const r = buyStreet(s, id);
    if (!r.ok) throw new Error(`修 ${id} 失败：${r.reason}`);
  }
}

describe("街面（M2）：十二件事", () => {
  it("十二件结构完整、id 不重复、价格在 4,000–30,000", () => {
    expect(STREETS).toHaveLength(12);
    expect(new Set(STREETS.map((s) => s.id)).size).toBe(12);
    for (const s of STREETS) {
      expect(s.name.length).toBeGreaterThan(1);
      expect(s.effect.length).toBeGreaterThan(3);
      // 每件都要有一句居民请求与一句到店台词（M2 的 AI 落点靠它）
      expect(s.request.length).toBeGreaterThan(4);
      expect(s.line.length).toBeGreaterThan(4);
      expect(s.costYuan).toBeGreaterThanOrEqual(4_000);
      expect(s.costYuan).toBeLessThanOrEqual(30_000);
    }
    expect(STREET_BY_ID.size).toBe(12);
    expect(STREET_TOTAL_YUAN).toBeGreaterThan(150_000);
  });

  it("时段限定的三件带 daypart，其余都全天", () => {
    const limited = STREETS.filter((s) => s.daypart !== undefined);
    expect(limited.map((s) => s.id).sort()).toEqual(["court", "crosswalk", "mahjong"]);
  });
});

describe("买街面", () => {
  it("扣钱、记进存档、返回一句台词", () => {
    const s = fresh();
    s.cash = 10_000;
    const before = s.cash;
    const r = buyStreet(s, "banyan_bench");
    expect(r.ok).toBe(true);
    expect(r.line).toContain("青秀山下石凳");
    expect(s.cash).toBe(before - 8_000);
    expect(hasStreet(s, "banyan_bench")).toBe(true);
    expect(s.streetSeen).toContain("banyan_bench");
  });

  it("同一件不能修第二次，且不扣钱", () => {
    const s = fresh();
    build(s, ["notice_board"]);
    const cash = s.cash;
    const r = buyStreet(s, "notice_board");
    expect(r.ok).toBe(false);
    expect(r.reason).toContain("已经修好");
    expect(s.cash).toBe(cash);
  });

  it("钱不够不扣钱", () => {
    const s = fresh();
    s.cash = 3_000;
    const r = buyStreet(s, "billboard");
    expect(r.ok).toBe(false);
    expect(r.reason).toContain("还差一点");
    expect(s.cash).toBe(3_000);
    expect(hasStreet(s, "billboard")).toBe(false);
  });

  it("街上没有这件东西就拒绝", () => {
    const s = fresh();
    expect(buyStreet(s, "ufo").ok).toBe(false);
  });
});

describe("六个乘数", () => {
  it("进店率：全天那件任何时段都算，时段限定只在自己那段算", () => {
    const s = fresh();
    s.cash = 999_999;
    expect(streetAttractMult(s)).toBe(1);
    build(s, ["lane_lamp"]);
    expect(streetAttractMult(s)).toBeCloseTo(1.08, 5);
    build(s, ["crosswalk"]);
    // 早市（分钟 0–29）
    s.flow.minuteOfDay = 10;
    expect(dayPartOf(s)).toBe(0);
    expect(streetAttractMult(s)).toBeCloseTo(1.2, 5);
    // 傍晚（分钟 90–119）
    s.flow.minuteOfDay = 100;
    expect(dayPartOf(s)).toBe(3);
    expect(streetAttractMult(s)).toBeCloseTo(1.08, 5);
  });

  it("客流池 ×1.2、排队位 +2、耐心 ×1.15、饮料 ×1.3、回礼 ×1.5", () => {
    const s = fresh();
    build(s, ["market_back"]);
    expect(streetPoolMult(s)).toBeCloseTo(1.2, 5);
    const poolBefore = demandCapOf(s);

    build(s, ["banyan_bench"]);
    expect(streetQueuePlus(s)).toBe(2);
    const queueBase = queueMaxOf(s);
    expect(queueBase).toBeGreaterThanOrEqual(14);

    build(s, ["market_canopy"]);
    expect(streetPatienceMult(s)).toBeCloseTo(1.15, 5);

    build(s, ["tea_shop"]);
    expect(streetDrinkMult(s)).toBeCloseTo(1.3, 5);

    build(s, ["charger"]);
    expect(streetGiftMult(s)).toBeCloseTo(1.5, 5);

    // 池子真的变大了（乘数不是只算不用）
    s.cash = 0;
    expect(demandCapOf(s)).toBe(poolBefore);
    expect(poolBefore).toBeGreaterThan(8);
  });
});

describe("面板视图", () => {
  it("十二行、已修/买得起/时段都标出来", () => {
    const s = fresh();
    s.cash = 6_500;
    build(s, ["notice_board"]);
    s.cash = 6_500;
    const views = streetViews(s);
    expect(views).toHaveLength(12);
    const board = views.find((v) => v.def.id === "notice_board")!;
    expect(board.built).toBe(true);
    const lamp = views.find((v) => v.def.id === "lane_lamp")!;
    expect(lamp.built).toBe(false);
    expect(lamp.affordable).toBe(true); // 6,000 ≤ 6,500
    expect(lamp.scope).toBe("全天");
    const cross = views.find((v) => v.def.id === "crosswalk")!;
    expect(cross.scope).toContain("早市");
    expect(cross.affordable).toBe(false); // 15,000
  });

  it("摘要与剩余件数", () => {
    const s = fresh();
    expect(streetSummary(s)).toContain("什么都没修");
    expect(streetLeft(s)).toBe(12);
    build(s, ["notice_board", "lane_lamp"]);
    expect(streetSummary(s)).toContain("修了 2/12");
    expect(streetSummary(s)).toContain("10,000");
    expect(streetLeft(s)).toBe(10);
  });

  it("居民下次提哪一件：优先买得起的", () => {
    const s = fresh();
    s.cash = 5_000; // 只买得起 5,000 的公厕指示牌（更便宜的公告栏排在它后面）
    const first = nextRequest(s);
    expect(first?.id).toBe("toilet_sign");
    build(s, ["notice_board"]);
    s.cash = 0;
    // 一件都买不起时，仍提第一件没修的
    expect(nextRequest(s)).not.toBeNull();
  });
});

describe("俯视小地图", () => {
  it("16×16，中间横竖两条街，我在街口", () => {
    const s = fresh();
    const grid = streetMap(s);
    expect(grid).toHaveLength(16);
    expect(grid.every((row) => row.length === 16)).toBe(true);
    expect(grid[7]![7]).toBe("s");
    // 横街与竖巷都是路（被我与同行占掉的位置除外）
    expect(grid[7]![0]).toBe("r");
    expect(grid[0]![7]).toBe("r");
    // 菜市与榕树
    expect(grid[1]![12]).toBe("m");
    expect(grid[5]![3]).toBe("t");
  });

  it("修好的街面在图上变成绿点", () => {
    const s = fresh();
    expect(streetMap(s).flat().includes("k")).toBe(false);
    build(s, ["lane_lamp"]);
    expect(streetMap(s).flat()).toContain("k");
  });

  it("本区同行画成棕点，别区的不画", () => {
    const s = fresh();
    s.district = "xingning";
    const xingning = streetMap(s).flat().filter((c) => c === "v").length;
    expect(xingning).toBe(2); // 老甘 + 三姐
    s.district = "qingxiu";
    expect(streetMap(s).flat().filter((c) => c === "v").length).toBe(2); // 南湖 + 凤岭
  });
});

describe("存档", () => {
  it("v20 存读往返，街面还在", () => {
    const s = fresh();
    build(s, ["lane_lamp", "banyan_bench"]);
    const back = deserialize(serialize(s))!;
    expect(back.streets.sort()).toEqual(["banyan_bench", "lane_lamp"]);
    expect(back.streetSeen.length).toBeGreaterThanOrEqual(1);
    expect(SAVE_VERSION).toBe(22);
  });

  it("v19 老档没有街面 → 补空；坏 id 丢掉", () => {
    const s = fresh();
    const raw = JSON.parse(serialize(s)) as Record<string, unknown>;
    raw.saveVersion = 19;
    delete raw.streets;
    delete raw.streetSeen;
    const back = deserialize(JSON.stringify(raw))!;
    expect(back.streets).toEqual([]);
    expect(back.streetSeen).toEqual([]);

    const raw2 = JSON.parse(serialize(s)) as Record<string, unknown>;
    raw2.streets = ["lane_lamp", "ufo", 42];
    const back2 = deserialize(JSON.stringify(raw2))!;
    expect(back2.streets).toEqual(["lane_lamp"]);
  });
});
