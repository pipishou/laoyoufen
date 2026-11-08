import { describe, expect, it } from "vitest";
import { RAMEN_CALC } from "../data/ramen-calc";
import { evalRpn } from "./rpn";
import { recipeVars, scoreRecipe } from "./score";
import { createInitialState, type Recipe } from "./state";

function withRecipe(soup: number[], noodle: number[]): Recipe {
  return {
    soup: soup.slice() as Recipe["soup"],
    noodle: noodle.slice() as Recipe["noodle"],
    toppings: [],
  };
}

describe("配方评分", () => {
  it("程序表本身可求值，且每条都落在 0-100", () => {
    const vars = recipeVars(createInitialState("p", 1).recipe);
    for (const p of RAMEN_CALC) {
      const v = evalRpn(p.expr, vars);
      expect(Number.isFinite(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(-400);
      expect(v).toBeLessThanOrEqual(400);
    }
  });

  it("初始配方：汤 59 / 粉 79 / 综合 68 / B（回归锁）", () => {
    const s = scoreRecipe(createInitialState("p", 1).recipe);
    expect(s.soup).toBe(59);
    expect(s.noodle).toBe(79);
    expect(s.total).toBe(68);
    expect(s.grade).toBe("B");
  });

  it("各项取理想值时拿 S，且总分高于初始配方", () => {
    const ideal = scoreRecipe(withRecipe([55, 50, 100, 45, 100, 80, 80, 100], [50, 40, 100, 100, 35, 1, 0]));
    const base = scoreRecipe(createInitialState("p", 1).recipe);
    expect(ideal.total).toBeGreaterThan(base.total);
    expect(ideal.grade).toBe("S");
    expect(ideal.soup).toBeGreaterThan(90);
  });

  it("越偏离基准越差：酸笋从 55 推到 0 分变低", () => {
    const base = scoreRecipe(withRecipe([55, 50, 60, 45, 60, 50, 50, 60], [50, 40, 60, 60, 35, 1, 0]));
    const off = scoreRecipe(withRecipe([0, 50, 60, 45, 60, 50, 50, 60], [50, 40, 60, 60, 35, 1, 0]));
    expect(off.soup).toBeLessThan(base.soup);
  });

  it("参数越界会被钳位，不会溢出成负分或爆表", () => {
    const s = scoreRecipe(withRecipe([400, -50, 400, 400, 400, 400, 400, 400], [400, 400, 400, 400, 400, 400, 400]));
    expect(s.soup).toBeGreaterThanOrEqual(0);
    expect(s.soup).toBeLessThanOrEqual(100);
    expect(s.noodle).toBeGreaterThanOrEqual(0);
    expect(s.noodle).toBeLessThanOrEqual(100);
    expect(s.total).toBeGreaterThanOrEqual(0);
    expect(s.total).toBeLessThanOrEqual(100);
  });

  it("纯函数：同配方同分，且不改输入", () => {
    const r = createInitialState("p", 1).recipe;
    const before = JSON.stringify(r);
    expect(scoreRecipe(r)).toEqual(scoreRecipe(r));
    expect(JSON.stringify(r)).toBe(before);
  });

  it("子项数量与程序表一致，且 8+7 变量全部映射进变量表", () => {
    const vars = recipeVars(createInitialState("p", 1).recipe);
    expect(Object.keys(vars).sort()).toEqual(
      ["s0", "s1", "s2", "s3", "s4", "s5", "s6", "s7", "n0", "n1", "n2", "n3", "n4", "n5", "n6"].sort(),
    );
    expect(scoreRecipe(createInitialState("p", 1).recipe).subs).toHaveLength(RAMEN_CALC.length);
  });
});
