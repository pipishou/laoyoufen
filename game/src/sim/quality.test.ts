import { describe, expect, it } from "vitest";
import { DEFAULT_QUALITY, QUALITIES, QUALITY_TOTAL, qualityById } from "../data/quality";
import { createInitialState } from "./state";
import { SAVE_VERSION } from "./state";
import { qualityCharmBoost, qualityCostMult, qualityOf, qualitySummary, qualityViews, qualityWords, setQuality } from "./quality";
import { scoreRecipe } from "./score";
import type { Recipe } from "./state";

function fresh() {
  return createInitialState("tester", 1);
}

describe("进货档表（批次五）", () => {
  it("三档，默认是平常货，效果与料钱都严格递增", () => {
    expect(QUALITY_TOTAL).toBe(3);
    expect(QUALITIES[0]!.id).toBe(DEFAULT_QUALITY);
    expect(QUALITIES.map((q) => q.id)).toEqual(["plain", "good", "top"]);
    for (let i = 1; i < QUALITIES.length; i += 1) {
      expect(QUALITIES[i]!.charmBoost).toBeGreaterThan(QUALITIES[i - 1]!.charmBoost);
      expect(QUALITIES[i]!.costMult).toBeGreaterThan(QUALITIES[i - 1]!.costMult);
    }
  });

  it("默认档两个乘数是 0 与 1，历史回归锁不动", () => {
    const q = qualityById(DEFAULT_QUALITY);
    expect(q.charmBoost).toBe(0);
    expect(q.costMult).toBe(1);
  });

  it("每一档都有出处，出处带链接与原文", () => {
    for (const q of QUALITIES) {
      expect(q.source.url).toMatch(/^https?:\/\//);
      expect(q.source.quote.length).toBeGreaterThan(6);
      expect(q.line.length).toBeGreaterThan(6);
    }
  });

  it("坏 id 一律退默认", () => {
    expect(qualityById("nope").id).toBe(DEFAULT_QUALITY);
    expect(qualityById(null).id).toBe(DEFAULT_QUALITY);
  });
});

describe("切换与文案", () => {
  it("新局是平常货，切到靓货成功，再切同一档返回 false", () => {
    const s = fresh();
    expect(qualityOf(s).id).toBe(DEFAULT_QUALITY);
    expect(setQuality(s, "good")).toBe(true);
    expect(qualityOf(s).id).toBe("good");
    expect(setQuality(s, "good")).toBe(false);
    expect(setQuality(s, "bogus")).toBe(false);
    expect(qualityOf(s).id).toBe("good");
  });

  it("views 每档一条，只有当前那条 active", () => {
    const s = fresh();
    setQuality(s, "top");
    const views = qualityViews(s);
    expect(views).toHaveLength(3);
    expect(views.filter((v) => v.active).map((v) => v.def.id)).toEqual(["top"]);
  });

  it("summary 与 words 说人话，平常货不提乘数", () => {
    const s = fresh();
    expect(qualitySummary(s)).toContain("平常货");
    expect(qualitySummary(s)).not.toContain("×");
    setQuality(s, "good");
    expect(qualitySummary(s)).toContain("×1.8");
    expect(qualityWords(s)).toContain("料钱");
  });
});

describe("进货档只动「相」与料钱", () => {
  const recipe = {
    soup: [3, 3, 2, 1, 2, 2, 3, 2],
    noodle: [2, 3, 2, 1, 1, 2, 2],
    toppings: ["top.sourbamboo", "top.douchi", "top.chili"],
  } as unknown as Recipe;

  it("味道 total 一分不动", () => {
    const plain = scoreRecipe(recipe, 10, "flat", { quality: "plain" });
    const top = scoreRecipe(recipe, 10, "flat", { quality: "top" });
    expect(top.total).toBe(plain.total);
    expect(top.soup).toBe(plain.soup);
    expect(top.noodle).toBe(plain.noodle);
  });

  it("魅力抬高，且只抬 30 以上那一部分", () => {
    const plain = scoreRecipe(recipe, 10, "flat", { quality: "plain" });
    const good = scoreRecipe(recipe, 10, "flat", { quality: "good" });
    const top = scoreRecipe(recipe, 10, "flat", { quality: "top" });
    expect(good.charm).toBeGreaterThan(plain.charm);
    expect(top.charm).toBeGreaterThan(good.charm);
    const expectGood = Math.min(100, 30 + (plain.charm - 30) * 1.25);
    expect(Math.abs(good.charm - expectGood)).toBeLessThanOrEqual(1);
  });

  it("料钱只乘配料那一段，主料与分量不变", () => {
    const plain = scoreRecipe(recipe, 10, "flat", { quality: "plain" });
    const top = scoreRecipe(recipe, 10, "flat", { quality: "top" });
    expect(top.cost).toBeGreaterThan(plain.cost);
    // 没有配料时，三档料钱完全一样
    const bare = { soup: recipe.soup, noodle: recipe.noodle, toppings: [] as string[] } as unknown as Recipe;
    expect(scoreRecipe(bare, 10, "flat", { quality: "top" }).cost).toBe(
      scoreRecipe(bare, 10, "flat", { quality: "plain" }).cost,
    );
  });

  it("魅力不会因为进货贵就顶破 100", () => {
    const rich = { soup: recipe.soup, noodle: recipe.noodle, toppings: ["top.sourbamboo", "top.douchi", "top.chili", "top.tomato", "top.offal", "top.pigflower"] } as unknown as Recipe;
    expect(scoreRecipe(rich, 10, "flat", { quality: "top" }).charm).toBeLessThanOrEqual(100);
  });
});

describe("存档", () => {
  it("版本是 32，老档没有 quality 时按平常货", () => {
    expect(SAVE_VERSION).toBe(35);
    const s = fresh();
    expect(s.quality).toBe(DEFAULT_QUALITY);
  });

  it("qualityCharmBoost / qualityCostMult 跟着档走", () => {
    const s = fresh();
    expect(qualityCharmBoost(s)).toBe(0);
    expect(qualityCostMult(s)).toBe(1);
    setQuality(s, "top");
    expect(qualityCharmBoost(s)).toBeCloseTo(0.55, 5);
    expect(qualityCostMult(s)).toBeCloseTo(2.6, 5);
  });
});
