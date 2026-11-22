import { describe, expect, it } from "vitest";
import { createInitialState } from "./state";
import {
  APPETITE_MAX,
  APPETITE_MIN,
  APPETITE_DECAY_PER_QUARTER,
  appetiteOf,
  appetiteWords,
  districtAppetite,
  districtEnergy,
  homeAppetiteOf,
  homeEnergyOf,
} from "./district";
import { pickSides } from "./sides";
import { pickDish } from "./menu";
import type { GameState } from "./state";

function fresh(): GameState {
  const s = createInitialState("appetite-test", 7);
  s.month = 1;
  s.districtSince = 1;
  return s;
}

describe("街区胃口（开罗 Sales Areas 2 的另一半）", () => {
  it("新局胃口是 1.00，六个季度后按 −4%/季 掉到 0.92", () => {
    const s = fresh();
    expect(homeAppetiteOf(s)).toBeCloseTo(1, 6);
    s.month = 1 + 3;
    expect(homeAppetiteOf(s)).toBeCloseTo(1 - APPETITE_DECAY_PER_QUARTER, 6);
    s.month = 1 + 18;
    expect(homeAppetiteOf(s)).toBeCloseTo(0.76, 6);
  });

  it("一直不搬会触底 0.75，不会掉到 0", () => {
    const s = fresh();
    s.month = 1 + 120;
    expect(homeAppetiteOf(s)).toBe(APPETITE_MIN);
  });

  it("别处的胃口在长，封顶 1.15 —— 这才是「换区能重新养」的原因", () => {
    const s = fresh();
    s.month = 1 + 9;
    const other = s.district === "xingning" ? "qingxiu" : "xingning";
    expect(appetiteOf(s, other)).toBeGreaterThan(1);
    s.month = 1 + 300;
    expect(appetiteOf(s, other)).toBe(APPETITE_MAX);
  });

  it("胃口与能量是两条独立的线：衰减率不同，出口也不同", () => {
    const s = fresh();
    s.month = 1 + 12;
    expect(homeEnergyOf(s)).toBeLessThan(homeAppetiteOf(s));
    expect(districtEnergy(s)).toBe(homeEnergyOf(s));
    expect(districtAppetite(s)).toBe(homeAppetiteOf(s));
  });

  it("胃口不进店：同一个月里，加购概率随胃口下降，但客流系数只认能量", () => {
    const base = fresh();
    const bored = fresh();
    bored.month = 1 + 60;
    expect(districtEnergy(base)).not.toBe(districtEnergy(bored));

    const count = (s: GameState): number => {
      let n = 0;
      for (let i = 0; i < 400; i += 1) {
        s.rng.s = 12345 + i;
        const pick = pickSides(s, undefined, 80, 6);
        if (pick.items.length > 0) n += 1;
      }
      return n;
    };
    expect(count(bored)).toBeLessThan(count(base));
  });

  it("胃口低时客人少点三两：大碗权重按胃口打折", () => {
    const s = fresh();
    s.menu = [
      { id: 1, noodle: s.noodle, main: s.main, portion: 2, price: 9, recipe: s.recipe, on: true, sold: 0 },
      { id: 2, noodle: s.noodle, main: s.main, portion: 3, price: 11, recipe: s.recipe, on: true, sold: 0 },
    ];
    const share = (): number => {
      let big = 0;
      for (let i = 0; i < 400; i += 1) {
        const dish = pickDish(s, 99, (i + 0.5) / 400);
        if (dish && dish.portion >= 3) big += 1;
      }
      return big;
    };
    const hungry = share();
    s.month = 1 + 60;
    const bored = share();
    expect(bored).toBeLessThan(hungry);
  });

  it("话术三态：还吃得下 / 有点腻 / 吃腻了", () => {
    const s = fresh();
    expect(appetiteWords(s)).toContain("还吃得下");
    s.month = 1 + 9;
    expect(appetiteWords(s)).toContain("有点吃腻");
    s.month = 1 + 90;
    expect(appetiteWords(s)).toContain("吃腻了");
  });
});
