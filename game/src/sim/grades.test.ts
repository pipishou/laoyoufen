import { describe, expect, it } from "vitest";
import { createInitialState, SAVE_VERSION, type GameState } from "./state";
import {
  BONE_BY_ID,
  BONE_GRADES,
  DEFAULT_BONE,
  DEFAULT_RICE,
  RICE_BY_ID,
  RICE_GRADES,
} from "../data/grades";
import {
  boneOf,
  boneViews,
  gradeCostDelta,
  gradeSummary,
  riceOf,
  riceViews,
  setBone,
  setRice,
} from "./materials";
import { scoreRecipe } from "./score";
import { deserialize, serialize } from "./save";

function fresh(): GameState {
  return createInitialState("p1", 7);
}

describe("进货档：米与骨（A5）", () => {
  it("三档米三档骨，id 唯一，默认档增减都是 0", () => {
    expect(RICE_GRADES).toHaveLength(3);
    expect(BONE_GRADES).toHaveLength(3);
    expect(new Set(RICE_GRADES.map((g) => g.id)).size).toBe(3);
    expect(new Set(BONE_GRADES.map((g) => g.id)).size).toBe(3);
    for (const g of [...RICE_GRADES, ...BONE_GRADES]) {
      expect(g.name.length).toBeGreaterThan(0);
      expect(g.why.length).toBeGreaterThan(0);
      expect(g.source.url.startsWith("http")).toBe(true);
      expect(g.source.quote.length).toBeGreaterThan(0);
    }
    expect(RICE_BY_ID.get(DEFAULT_RICE)?.costDelta).toBe(0);
    expect(RICE_BY_ID.get(DEFAULT_RICE)?.noodleDelta ?? 0).toBe(0);
    expect(BONE_BY_ID.get(DEFAULT_BONE)?.costDelta).toBe(0);
    expect(BONE_BY_ID.get(DEFAULT_BONE)?.soupDelta ?? 0).toBe(0);
  });

  it("新局默认晚籼米 + 脊骨，料钱不动", () => {
    const s = fresh();
    expect(s.rice).toBe(DEFAULT_RICE);
    expect(s.bone).toBe(DEFAULT_BONE);
    expect(riceOf(s).id).toBe(DEFAULT_RICE);
    expect(boneOf(s).id).toBe(DEFAULT_BONE);
    expect(gradeCostDelta(s)).toBe(0);
    expect(gradeSummary(s)).toContain("料钱不动");
    expect(riceViews(s).filter((v) => v.active)).toHaveLength(1);
    expect(boneViews(s).filter((v) => v.active)).toHaveLength(1);
  });

  it("换米只动米粉分与料钱，不动汤分", () => {
    const s = fresh();
    const recipe = s.recipe;
    const base = scoreRecipe(recipe, s.price, "round", { rice: "late", bone: "spine" });
    const early = scoreRecipe(recipe, s.price, "round", { rice: "early", bone: "spine" });
    const aged = scoreRecipe(recipe, s.price, "round", { rice: "aged", bone: "spine" });
    expect(early.noodle).toBeLessThan(base.noodle);
    expect(aged.noodle).toBeLessThan(early.noodle);
    expect(early.cost).toBeLessThan(base.cost);
    expect(aged.cost).toBeLessThan(early.cost);
    // 汤分完全不受米影响
    expect(early.soup).toBeCloseTo(base.soup, 5);
    expect(aged.soup).toBeCloseTo(base.soup, 5);
  });

  it("换骨只动汤分与料钱，不动米粉分", () => {
    const s = fresh();
    const recipe = s.recipe;
    const base = scoreRecipe(recipe, s.price, "round", { rice: "late", bone: "spine" });
    const tube = scoreRecipe(recipe, s.price, "round", { rice: "late", bone: "tube" });
    const head = scoreRecipe(recipe, s.price, "round", { rice: "late", bone: "head" });
    expect(tube.soup).toBeGreaterThan(base.soup);
    expect(head.soup).toBeLessThan(base.soup);
    expect(tube.cost).toBeGreaterThan(base.cost);
    expect(head.cost).toBeLessThan(base.cost);
    // 米粉分完全不受骨影响
    expect(tube.noodle).toBeCloseTo(base.noodle, 5);
    expect(head.noodle).toBeCloseTo(base.noodle, 5);
  });

  it("setRice / setBone 只认表里的 id，相同档返回 false", () => {
    const s = fresh();
    expect(setRice(s, "late")).toBe(false);
    expect(setRice(s, "nope")).toBe(false);
    expect(s.rice).toBe("late");
    expect(setRice(s, "early")).toBe(true);
    expect(s.rice).toBe("early");
    expect(setBone(s, "tube")).toBe(true);
    expect(s.bone).toBe("tube");
    expect(gradeSummary(s)).toContain("每碗多花");
  });

  it("便宜档的 summary 写「每碗省」，贵档写「每碗多花」", () => {
    const s = fresh();
    setRice(s, "aged");
    setBone(s, "head");
    expect(gradeCostDelta(s)).toBeLessThan(0);
    expect(gradeSummary(s)).toContain("每碗省");
    setRice(s, "late");
    setBone(s, "tube");
    expect(gradeCostDelta(s)).toBeCloseTo(0.5, 5);
    expect(gradeSummary(s)).toContain("每碗多花 ¥0.50");
  });

  it("存档往返保住进货档，坏 id 退回默认档", () => {
    const s = fresh();
    setRice(s, "aged");
    setBone(s, "tube");
    const raw = serialize(s);
    const back = deserialize(raw);
    expect(back?.rice).toBe("aged");
    expect(back?.bone).toBe("tube");
    expect(SAVE_VERSION).toBe(30);

    // 坏值兜底：喂一个不在表里的米与骨
    const dirty = { ...JSON.parse(raw), rice: "jasmine", bone: "fishbone", saveVersion: 28 };
    const loaded = deserialize(JSON.stringify(dirty));
    expect(loaded?.rice).toBe(DEFAULT_RICE);
    expect(loaded?.bone).toBe(DEFAULT_BONE);
  });
});
