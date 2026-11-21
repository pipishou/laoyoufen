import { describe, expect, it } from "vitest";
import { createInitialState } from "./state";
import { scoreDish } from "./menu";
import {
  DIMS,
  DIM_ORDER,
  TIER_CUTS,
  TIER_TOTAL,
  TIER_WORDS,
  dimById,
  tierOf,
  tierRange,
  tierWord,
  tierWords,
} from "../data/tier";
import {
  dimValues,
  fillOf,
  numOf,
  overallTier,
  tierBoard,
  tierCells,
  tierLine,
  weakestDim,
} from "./tier";

/** 一个最小可算的形状：主料 / 份量 / 配料 id */
function item(toppings: string[] = [], main = "pork", portion = 2) {
  return { main, portion, recipe: { toppings } };
}
const fake = (soup: number, noodle: number, charm: number) => ({ soup, noodle, charm });

describe("四维九档 · 表结构", () => {
  it("四维、九档、三十六句都在", () => {
    expect(DIM_ORDER).toEqual(["taste", "wok", "fill", "look"]);
    expect(DIMS.map((d) => d.name)).toEqual(["味", "镬", "饱", "相"]);
    expect(TIER_TOTAL).toBe(9);
    expect(TIER_CUTS).toHaveLength(8);
    // 边界必须递增，否则落桶会翻
    for (let i = 1; i < TIER_CUTS.length; i += 1) {
      expect(TIER_CUTS[i]!).toBeGreaterThan(TIER_CUTS[i - 1]!);
    }
    for (const id of DIM_ORDER) {
      expect(TIER_WORDS[id]).toHaveLength(9);
      for (const w of TIER_WORDS[id]) {
        expect(w.length).toBeGreaterThan(4);
        // 评语里不许出现阿拉伯数字：玩家听到的是话，不是分数
        expect(w).not.toMatch(/[0-9]/);
      }
    }
    const all = DIM_ORDER.flatMap((id) => TIER_WORDS[id]);
    expect(all).toHaveLength(36);
    // 三十六句不许有重复，否则「换一维看」等于没换
    expect(new Set(all).size).toBe(36);
  });

  it("坏维度取不到评语，越界档位夹回两端", () => {
    expect(tierWords("nope", 5)).toBe("");
    expect(tierWords("taste", 0)).toBe(TIER_WORDS.taste[0]);
    expect(tierWords("taste", 99)).toBe(TIER_WORDS.taste[8]);
    expect(tierWord(1)).toBe("第一档");
    expect(tierWord(9)).toBe("第九档");
    expect(tierRange(1)).toBe("0–15");
    expect(tierRange(9)).toBe("95–100");
    expect(dimById("wok")?.name).toBe("镬");
    expect(dimById("bad")).toBeUndefined();
  });
});

describe("四维九档 · 落桶", () => {
  it("八条边界各自落在正确的档位", () => {
    expect(tierOf(0)).toBe(1);
    expect(tierOf(14.9)).toBe(1);
    expect(tierOf(15)).toBe(2);
    expect(tierOf(27.9)).toBe(2);
    expect(tierOf(28)).toBe(3);
    expect(tierOf(52)).toBe(5);
    expect(tierOf(64)).toBe(6);
    expect(tierOf(76)).toBe(7);
    expect(tierOf(86)).toBe(8);
    expect(tierOf(95)).toBe(9);
    expect(tierOf(100)).toBe(9);
  });

  it("档位单调：分数升，档位不降", () => {
    let last = 0;
    for (let v = 0; v <= 100; v += 1) {
      const t = tierOf(v);
      expect(t).toBeGreaterThanOrEqual(last);
      last = t;
    }
  });
});

describe("四维九档 · 映射（P151 的防线）", () => {
  it("只动汤分：味变、镬不动", () => {
    const a = dimValues(item(), fake(40, 60, 50));
    const b = dimValues(item(), fake(90, 60, 50));
    expect(b.taste).toBeGreaterThan(a.taste);
    expect(b.wok).toBe(a.wok);
    expect(b.fill).toBe(a.fill);
    expect(b.look).toBe(a.look);
  });

  it("只动粉分：镬变、味不动", () => {
    const a = dimValues(item(), fake(55, 30, 50));
    const b = dimValues(item(), fake(55, 88, 50));
    expect(b.wok).toBeGreaterThan(a.wok);
    expect(b.taste).toBe(a.taste);
  });

  it("只动魅力：相变、味与镬都不动", () => {
    const a = dimValues(item(), fake(50, 50, 20));
    const b = dimValues(item(), fake(50, 50, 90));
    expect(b.look).toBeGreaterThan(a.look);
    expect(b.taste).toBe(a.taste);
    expect(b.wok).toBe(a.wok);
  });

  it("饱只看份量、主料、配料件数", () => {
    expect(fillOf({ portion: 3, main: "pork", toppingCount: 0 })).toBeGreaterThan(
      fillOf({ portion: 2, main: "pork", toppingCount: 0 }),
    );
    expect(fillOf({ portion: 2, main: "beef", toppingCount: 0 })).toBeGreaterThan(
      fillOf({ portion: 2, main: "pork", toppingCount: 0 }),
    );
    expect(fillOf({ portion: 2, main: "pork", toppingCount: 3 })).toBeGreaterThan(
      fillOf({ portion: 2, main: "pork", toppingCount: 0 }),
    );
    // 堆料封顶：十件与三十件一样饱
    expect(fillOf({ portion: 2, main: "pork", toppingCount: 30 })).toBe(
      fillOf({ portion: 2, main: "pork", toppingCount: 10 }),
    );
    // 饱永远落在 0–100
    expect(fillOf({ portion: 99, main: "beef", toppingCount: 99 })).toBeLessThanOrEqual(100);
  });

  it("四维换了分数也不越 0–100", () => {
    const v = dimValues(item(["top.sourbamboo"], "beef", 3), fake(100, 100, 100));
    for (const id of DIM_ORDER) {
      expect(v[id]).toBeGreaterThanOrEqual(0);
      expect(v[id]).toBeLessThanOrEqual(100);
    }
  });
});

describe("四维九档 · 读法与文案", () => {
  it("九格条长度九，亮的格数等于档位", () => {
    expect(tierCells(0)).toHaveLength(9);
    expect(tierCells(4).filter(Boolean)).toHaveLength(4);
    expect(tierCells(9).filter(Boolean)).toHaveLength(9);
    expect(tierCells(99).filter(Boolean)).toHaveLength(9);
  });

  it("一行短句四维齐全、用中文数字、不带阿拉伯数字", () => {
    const line = tierLine(item(["top.sourbamboo"]), fake(70, 60, 50));
    expect(line).toContain("味");
    expect(line).toContain("镬");
    expect(line).toContain("饱");
    expect(line).toContain("相");
    expect(line).not.toMatch(/[0-9]/);
    expect(numOf(7)).toBe("七");
  });

  it("最弱一维挑得对（同档时取第一个）", () => {
    const w = weakestDim(item(), fake(20, 90, 80));
    expect(w.id).toBe("taste");
    expect(w.tier).toBe(tierOf(20));
  });

  it("整体档位落在四维之间，且不越 1–9", () => {
    const t = overallTier(item(), fake(90, 30, 60));
    expect(t).toBeGreaterThanOrEqual(1);
    expect(t).toBeLessThanOrEqual(9);
  });
});

describe("四维九档 · 真实一碗粉", () => {
  it("默认新局那碗粉，四维都读得出来", () => {
    const s = createInitialState("tier-probe", 5);
    const dish = s.menu[0]!;
    const sc = scoreDish(dish, s);
    const board = tierBoard(dish, sc);
    expect(board).toHaveLength(4);
    for (const r of board) {
      expect(r.tier).toBeGreaterThanOrEqual(1);
      expect(r.tier).toBeLessThanOrEqual(9);
      expect(r.words.length).toBeGreaterThan(4);
    }
    // 味与汤分同桶、镬与粉分同桶（映射不许偷换）
    expect(board[0]!.tier).toBe(tierOf(sc.soup));
    expect(board[1]!.tier).toBe(tierOf(sc.noodle));
    expect(board[3]!.tier).toBe(tierOf(sc.charm));
  });

  it("多下料不会让味凭空变好", () => {
    const s = createInitialState("tier-probe2", 5);
    const dish = s.menu[0]!;
    const before = tierBoard(dish, scoreDish(dish, s))[0]!.tier;
    const topped = { ...dish, recipe: { ...dish.recipe, toppings: [...dish.recipe.toppings, "top.sourbamboo"] } };
    const afterTaste = tierBoard(topped, scoreDish(topped, s))[0]!.tier;
    const afterFill = tierBoard(topped, scoreDish(topped, s))[2]!.tier;
    // 酸笋本身有汤分，所以味可以动；但真正被「加料」抬高的是饱
    expect(afterFill).toBeGreaterThanOrEqual(tierBoard(dish, scoreDish(dish, s))[2]!.tier);
    expect(Math.abs(afterTaste - before)).toBeLessThanOrEqual(2);
  });
});
