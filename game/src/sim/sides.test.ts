import { describe, expect, it } from "vitest";
import {
  SIDES,
  SIDE_BY_ID,
  SIDE_COMBOS,
  START_SIDES,
  sideChanceOf,
  type SideDef,
} from "../data/sides";
import { createInitialState } from "./state";
import {
  activeSides,
  comboOf,
  defaultActive,
  pickSides,
  recordSides,
  sideShareOf,
  sideSummary,
  sideUnlocked,
  sideViews,
  toggleSide,
} from "./sides";

function fresh() {
  const s = createInitialState("sides-tester", 7);
  // 存档刚建时是 setup 态，这里不需要开门也能直接调加料逻辑
  return s;
}

describe("加料台与饮料柜（P41 客单价结构）", () => {
  it("开局三样在架（酸笋/豆豉/辣椒），其余要累计接待才解锁", () => {
    const s = fresh();
    expect(s.sides.active).toEqual(START_SIDES);
    const views = sideViews(s);
    expect(views.length).toBe(SIDES.length);
    expect(views.filter((v) => v.unlocked).map((v) => v.def.id)).toEqual(START_SIDES);
    // 卤蛋要 60 位、猪杂 150 位
    const ludan = views.find((v) => v.def.id === "ludan")!;
    expect(ludan.unlocked).toBe(false);
    expect(ludan.short).toBe(60);
  });

  it("上架/下架：未解锁不能上架，至少留一件在架", () => {
    const s = fresh();
    // 未解锁的卤蛋上不了
    const r1 = toggleSide(s, "ludan");
    expect(r1.ok).toBe(false);
    expect(r1.reason).toContain("60");
    // 累计接待够了就能上
    s.totalCustomers = 60;
    expect(toggleSide(s, "ludan").ok).toBe(true);
    expect(s.sides.active).toContain("ludan");
    // 全下架要被拦
    s.sides.active = ["suansun"];
    const r2 = toggleSide(s, "suansun");
    expect(r2.ok).toBe(false);
    expect(r2.reason).toContain("留一件");
  });

  it("钱包不够（room < 0.5）时一件都不加", () => {
    const s = fresh();
    for (let i = 0; i < 50; i += 1) {
      const pick = pickSides(s, undefined, 90, 0.2);
      expect(pick.items.length).toBe(0);
      expect(pick.paid).toBe(0);
    }
  });

  it("钱包宽裕时一定会加，且加购总额不超过钱包剩余", () => {
    const s = fresh();
    let added = 0;
    for (let i = 0; i < 200; i += 1) {
      const room = 6;
      const pick = pickSides(s, undefined, 95, room);
      if (pick.items.length > 0) {
        added += 1;
        expect(pick.paid).toBeLessThanOrEqual(room);
        expect(pick.cost).toBeGreaterThan(0);
        expect(pick.paid).toBeGreaterThan(pick.cost); // 加料必须赚钱
      }
    }
    // 满意 95 时概率 0.4575，200 次至少加十几回
    expect(added).toBeGreaterThan(40);
  });

  it("组合：要凑三件才出「老友味」，酸笋+豆豉（本分）不算组合", () => {
    const pick = (ids: string[]) => ids.map((id) => SIDE_BY_ID.get(id)!) as SideDef[];
    // 酸笋 + 豆豉 = 老友粉的本分，不算组合
    expect(comboOf(pick(["suansun", "douchi"]))).toBeNull();
    const a = comboOf(pick(["suansun", "lazhi"]));
    expect(a?.name).toBe("酸辣开胃");
    const b = comboOf(pick(["suansun", "douchi", "lazhi"]));
    expect(b?.name).toBe("老友味");
    expect(b?.satBonus).toBe(4);
    const c = comboOf(pick(["suansun", "douchi", "ludan"]));
    expect(c?.name).toBe("全套加蛋");
    // 三件凑齐时取加成最高的那个（老友味 4 > 酸辣开胃 2）
    expect(comboOf(pick(["suansun", "douchi", "lazhi", "ludan"]))?.name).toBe("老友味");
    expect(comboOf(pick(["ludan"]))).toBeNull();
    // 饮料不参与组合
    expect(comboOf(pick(["suansun", "huaifen"]))).toBeNull();
  });

  it("记账：卖出计数、加购收入、组合次数都累加，占比算得出来", () => {
    const s = fresh();
    const pick = { items: [SIDE_BY_ID.get("suansun")!, SIDE_BY_ID.get("douchi")!], paid: 4, cost: 0.8, combo: "老友味", satBonus: 5 };
    recordSides(s, pick);
    recordSides(s, pick);
    expect(s.sides.sold.suansun).toBe(2);
    expect(s.tally.sideRevenue).toBe(8);
    expect(s.tally.comboHits).toBe(2);

    s.monthRevenue = 92;
    expect(sideShareOf(s)).toBeCloseTo(8 / 100, 6);
    expect(sideSummary(s)).toContain("加料 3 样");
  });

  it("空 pick 不记账（没加就不该动 tally）", () => {
    const s = fresh();
    recordSides(s, { items: [], paid: 0, cost: 0, combo: null, satBonus: 0 });
    expect(s.tally.sideRevenue).toBe(0);
    expect(Object.keys(s.sides.sold).length).toBe(0);
  });

  it("表结构：每件都有正毛利，售价与成本都是现实量级（1–5 元）", () => {
    for (const def of SIDES) {
      expect(def.priceYuan).toBeGreaterThan(def.costYuan);
      expect(def.costYuan).toBeGreaterThan(0);
      expect(def.priceYuan).toBeLessThanOrEqual(5);
      expect(def.kairo.length).toBeGreaterThan(0);
      expect(def.line.length).toBeGreaterThan(4);
    }
    // 解锁门槛只用这几档（表按「加料在前、饮料在后」排，不是按门槛排）
    const allowed = new Set([0, 60, 150, 300, 600, 1000]);
    for (const n of SIDES.map((d) => d.needCustomers)) expect(allowed.has(n)).toBe(true);
    expect(SIDE_COMBOS.length).toBeGreaterThanOrEqual(2);
    expect(defaultActive()).toEqual(START_SIDES);
  });

  it("满意度越高越爱加（0.22 → 0.47，封顶 0.5）", () => {
    expect(sideChanceOf(0)).toBeCloseTo(0.22, 6);
    expect(sideChanceOf(100)).toBeCloseTo(0.47, 6);
    expect(sideChanceOf(999)).toBeCloseTo(0.5, 6);
    expect(sideChanceOf(-50)).toBeCloseTo(0.22, 6);
  });

  it("activeSides 会滤掉「已上架但还没解锁」的（老档迁移后可能出现）", () => {
    const s = fresh();
    s.sides.active = ["suansun", "ningmeng"];
    const on = activeSides(s).map((d) => d.id);
    expect(on).toEqual(["suansun"]);
    expect(sideUnlocked(s, SIDE_BY_ID.get("ningmeng")!)).toBe(false);
  });
});
