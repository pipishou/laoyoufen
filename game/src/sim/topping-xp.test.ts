import { describe, expect, it } from "vitest";
import { createInitialState, SAVE_VERSION } from "./state";
import {
  XP_COST_PER_LEVEL,
  XP_MAX_LEVEL,
  XP_STEPS,
  XP_TASTE_CAP,
  levelOf,
  nextStep,
  rememberToppings,
  toppingLevelOf,
  toppingXpOf,
  xpCostFactor,
  xpKey,
  xpPickyEase,
  xpSummary,
  xpTasteBonus,
  xpWords,
} from "./topping-xp";
import { scoreRecipe } from "./score";
import { serialize, deserialize } from "./save";
import { TOPPINGS } from "../data/ingredients";
import type { NoodleId } from "../data/noodles";

const THREE = ["top.sourbamboo", "top.douchi", "top.pork"] as const;

function fresh() {
  return createInitialState("xp-test", 3);
}

describe("浇头熟练度（批 A′）", () => {
  it("等级门槛是 50 / 150 / 400，封顶 3 级", () => {
    expect(XP_STEPS).toEqual([50, 150, 400]);
    expect(levelOf(0)).toBe(0);
    expect(levelOf(49)).toBe(0);
    expect(levelOf(50)).toBe(1);
    expect(levelOf(149)).toBe(1);
    expect(levelOf(150)).toBe(2);
    expect(levelOf(399)).toBe(2);
    expect(levelOf(400)).toBe(3);
    expect(levelOf(99999)).toBe(XP_MAX_LEVEL);
  });

  it("差多少碗升下一级，满级给 null", () => {
    expect(nextStep(0)).toBe(50);
    expect(nextStep(60)).toBe(90);
    expect(nextStep(200)).toBe(200);
    expect(nextStep(400)).toBeNull();
  });

  it("等级名是生手 / 上手 / 熟练 / 拿手", () => {
    expect([0, 1, 2, 3].map(xpWords)).toEqual(["生手", "上手", "熟练", "拿手"]);
  });

  it("每一碗都长一份经验，按份算不按碗算", () => {
    const s = fresh();
    expect(toppingXpOf(s, "top.pork")).toBe(0);
    rememberToppings(s, ["top.pork", "top.sourbamboo"]);
    rememberToppings(s, ["top.pork"]);
    expect(toppingXpOf(s, "top.pork")).toBe(2);
    expect(toppingXpOf(s, "top.sourbamboo")).toBe(1);
    expect(toppingLevelOf(s, "top.pork")).toBe(0);
  });

  it("味道分按级累加，封顶 +2", () => {
    expect(xpTasteBonus(undefined, THREE)).toBe(0);
    expect(xpTasteBonus({ "top.pork": 50 }, THREE)).toBeCloseTo(0.2, 6);
    const all3 = Object.fromEntries(THREE.map((id) => [id, 400]));
    expect(xpTasteBonus(all3, THREE)).toBeCloseTo(1.8, 6);
    // 五份料全拿手 = 3.0 分，被 +2 的天花板截住
    const five = [...THREE, "top.pigchitterling", "top.egg"];
    const all5 = Object.fromEntries(five.map((id) => [id, 400]));
    expect(xpTasteBonus(all5, five)).toBe(XP_TASTE_CAP);
  });

  it("料钱按件折 2%/级，封底 0.8", () => {
    expect(xpCostFactor(undefined, "top.pork")).toBe(1);
    expect(xpCostFactor({ "top.pork": 50 }, "top.pork")).toBeCloseTo(1 - XP_COST_PER_LEVEL, 6);
    expect(xpCostFactor({ "top.pork": 400 }, "top.pork")).toBeCloseTo(0.94, 6);
    expect(xpCostFactor({ "top.pork": 99999 }, "top.pork")).toBeGreaterThanOrEqual(0.8);
  });

  it("识食客少扣的分取「这一碗里最好的那一手」，封顶 3", () => {
    expect(xpPickyEase(undefined, THREE)).toBe(0);
    expect(xpPickyEase({ "top.pork": 150 }, THREE)).toBe(2);
    expect(xpPickyEase({ "top.pork": 400 }, THREE)).toBe(3);
  });

  it("缓存键只看这一碗用到的那几份料的等级", () => {
    expect(xpKey(undefined, THREE)).toBe("");
    expect(xpKey({ "top.pork": 400 }, THREE)).toBe("003");
  });

  it("同一份配方，练熟了确实更好吃，但最多高 2 分", () => {
    const s = fresh();
    s.recipe.toppings = [...THREE];
    const before = scoreRecipe(s.recipe, s.price, s.noodle as NoodleId, { xp: s.ingredientXp });
    rememberToppings(s, THREE);
    const same = scoreRecipe(s.recipe, s.price, s.noodle as NoodleId, { xp: s.ingredientXp });
    expect(same.total).toBe(before.total);

    for (const id of THREE) s.ingredientXp[id] = 400;
    const after = scoreRecipe(s.recipe, s.price, s.noodle as NoodleId, { xp: s.ingredientXp });
    expect(after.total).toBeGreaterThan(before.total);
    expect(after.total - before.total).toBeLessThanOrEqual(2);
    expect(after.cost).toBeLessThan(before.cost);
  });

  it("练熟了不抬相（相已经被品质档顶到天花板）", () => {
    const s = fresh();
    s.recipe.toppings = [...THREE];
    const before = scoreRecipe(s.recipe, s.price, s.noodle as NoodleId, { xp: {} });
    for (const id of THREE) s.ingredientXp[id] = 400;
    const after = scoreRecipe(s.recipe, s.price, s.noodle as NoodleId, { xp: s.ingredientXp });
    expect(after.charm).toBe(before.charm);
  });

  it("册子上的那句话：没练过 / 全是生手 / 有几手拿手", () => {
    const s = fresh();
    expect(xpSummary(s)).toContain("还没有哪一手");
    rememberToppings(s, ["top.pork"]);
    expect(xpSummary(s)).toContain("生手");
    s.ingredientXp["top.pork"] = 400;
    s.ingredientXp["top.sourbamboo"] = 160;
    expect(xpSummary(s)).toContain("拿手 2 手");
  });

  it("存档 36：熟练度存得住，老档（没有这个字段）按「一手都没练」起算", () => {
    expect(SAVE_VERSION).toBe(37);
    const s = fresh();
    rememberToppings(s, THREE);
    const back = deserialize(serialize(s));
    expect(back).not.toBeNull();
    expect(back?.ingredientXp["top.pork"]).toBe(1);

    const raw = JSON.parse(serialize(s)) as Record<string, unknown>;
    raw.saveVersion = 35;
    delete raw.ingredientXp;
    const old = deserialize(JSON.stringify(raw));
    expect(old?.ingredientXp).toEqual({});

    raw.ingredientXp = { "top.pork": -3, "top.douchi": 12.7, bogus: "x" };
    const messy = deserialize(JSON.stringify(raw));
    expect(messy?.ingredientXp).toEqual({ "top.douchi": 12 });
  });

  it("表里的浇头都能当熟练度的键（不会因为改 id 悄悄断掉）", () => {
    const s = fresh();
    for (const t of TOPPINGS) {
      s.ingredientXp[t.id] = 100;
      expect(toppingLevelOf(s, t.id)).toBe(1);
    }
  });
});
