import { describe, expect, it } from "vitest";
import { CUSTOMER_ARCHETYPES, ARCHETYPE_BY_ID } from "../data/customers";
import { bowlCost, charmOf, scoreRecipe, valueScoreOf } from "./score";
import { createInitialState } from "./state";

describe("魅力 / 价格 / 成本", () => {
  it("空配料时魅力为 30，且四维分都在 0-100", () => {
    const s = scoreRecipe(createInitialState("p", 1).recipe);
    expect(s.charm).toBe(30);
    for (const v of [s.soup, s.noodle, s.total, s.charm, s.valueScore, s.storeScore]) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(100);
    }
  });

  it("加料提升魅力，但不是线性堆叠：第 4 种之后的边际远小于第 1 种", () => {
    const one = charmOf(["top.sourbamboo"]);
    const three = charmOf(["top.sourbamboo", "top.douchi", "top.chili"]);
    const many = charmOf([
      "top.sourbamboo",
      "top.douchi",
      "top.chili",
      "top.beef",
      "top.offal",
      "top.lean",
      "top.mince",
      "top.quail",
      "top.friedegg",
      "top.youtiao",
    ]);
    expect(three).toBeGreaterThan(one);
    expect(many).toBeGreaterThan(three);
    expect(many).toBeLessThan(100);
  });

  it("老友三件套 + 青菜 + 西红柿有组合加成", () => {
    const combo = charmOf(["top.sourbamboo", "top.douchi", "top.chili", "top.kongxincai", "top.tomato"]);
    const sameCountNoCombo = charmOf(["top.beef", "top.offal", "top.lean", "top.mince", "top.quail"]);
    expect(combo).toBeGreaterThan(sameCountNoCombo);
  });

  it("价格分：9 元满分（街坊价），越贵越低", () => {
    expect(valueScoreOf(9)).toBe(100);
    expect(valueScoreOf(10)).toBeLessThan(valueScoreOf(9));
    expect(valueScoreOf(12)).toBeLessThan(valueScoreOf(10));
    expect(valueScoreOf(20)).toBeLessThan(valueScoreOf(12));
  });

  it("成本随加料增加，毛利随售价变化", () => {
    expect(bowlCost([])).toBeLessThan(bowlCost(["top.offal", "top.beef"]));
    const cheap = scoreRecipe({ soup: [40, 45, 55, 50, 50, 45, 40, 55], noodle: [50, 40, 55, 50, 35, 1, 0], toppings: [] }, 9);
    const pricey = scoreRecipe({ soup: [40, 45, 55, 50, 50, 45, 40, 55], noodle: [50, 40, 55, 50, 35, 1, 0], toppings: [] }, 15);
    expect(pricey.margin).toBeGreaterThan(cheap.margin);
    expect(cheap.marginRate).toBeCloseTo(cheap.margin / 9, 6);
  });

  it("回归锁不变：口味仍是汤 59 / 粉 79 / 综合 68 / B", () => {
    const s = scoreRecipe(createInitialState("p", 1).recipe);
    expect(s.soup).toBe(59);
    expect(s.noodle).toBe(79);
    expect(s.total).toBe(68);
    expect(s.grade).toBe("B");
  });
});

describe("顾客原型表", () => {
  it("24 个原型，id 唯一，预算落在 8-15 元", () => {
    expect(CUSTOMER_ARCHETYPES).toHaveLength(24);
    expect(new Set(CUSTOMER_ARCHETYPES.map((c) => c.id)).size).toBe(24);
    for (const c of CUSTOMER_ARCHETYPES) {
      expect(c.budget).toBeGreaterThanOrEqual(8);
      expect(c.budget).toBeLessThanOrEqual(15);
      expect(c.eatSpeed).toBeGreaterThan(0);
      expect(c.lineLimit).toBeGreaterThan(0);
      expect(c.weight).toBeGreaterThan(0);
    }
  });

  it("每个原型都能按 id 反查", () => {
    for (const c of CUSTOMER_ARCHETYPES) expect(ARCHETYPE_BY_ID.get(c.id)).toBe(c);
  });
});
