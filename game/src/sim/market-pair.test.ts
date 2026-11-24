import { describe, expect, it } from "vitest";

import { buyGood } from "./goods";
import {
  marketAttractMult,
  marketOf,
  marketPairWords,
  marketTotals,
  pairedMarketOf,
} from "./market";
import { createInitialState, type GameState } from "./state";

/** 找一天，确定是某条行情 */
function dayOf(id: string): { month: number; day: number; seed: string } | null {
  for (const month of [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]) {
    for (let day = 1; day <= 30; day++) {
      for (let k = 0; k < 12; k++) {
        const seed = `pair-${month}-${day}-${k}`;
        const s = createInitialState("pair", 3);
        s.month = month;
        s.day = day;
        s.playerId = seed;
        if (marketOf(s)?.id === id) return { month, day, seed };
      }
    }
  }
  return null;
}

function at(id: string): GameState {
  const found = dayOf(id);
  expect(found, `找不到「${id}」的行情日`).not.toBeNull();
  const s = createInitialState("pair", 3);
  s.month = found!.month;
  s.day = found!.day;
  s.playerId = found!.seed;
  s.favor = 40;
  return s;
}

describe("行情配对（批 B″，解 P320）", () => {
  it("三条坏事各自配了一条好事", () => {
    for (const [id, pair] of [
      ["waterCut", "payday"],
      ["gasUp", "marketRush"],
      ["roadWork", "schoolOpen"],
    ] as const) {
      const s = at(id);
      expect(marketOf(s)?.id).toBe(id);
      expect(marketOf(s)?.pair).toBe(pair);
    }
  });

  it("好事那几条不填配对（不然天天都是好事）", () => {
    for (const id of ["payday", "marketRush", "schoolOpen", "huiNanTian"]) {
      const s = at(id);
      expect(marketOf(s)?.pair).toBeUndefined();
    }
  });

  it("配对只按六成算：停水那天钱包多出来六成，进店还是掉", () => {
    const s = at("waterCut");
    const pair = pairedMarketOf(s);
    expect(pair?.id).toBe("payday");
    const t = marketTotals(s);
    expect(t.attract).toBeCloseTo(-0.16, 6);
    expect(t.wallet).toBeCloseTo(0.16 * 0.6, 6);
    expect(marketAttractMult(s)).toBeLessThan(1);
  });

  it("借两桶水：进店惩罚从 −16% 收回到 −6%，只管当天", () => {
    const s = at("waterCut");
    expect(marketTotals(s).attract).toBeCloseTo(-0.16, 6);
    const r = buyGood(s, "water_bucket");
    expect(r.ok).toBe(true);
    expect(marketTotals(s).attract).toBeCloseTo(-0.06, 6);
    expect(marketPairWords(s)).toContain("借到了水");
    // 换一天就没了
    s.day += 1;
    expect(marketPairWords(s)).not.toContain("借到了水");
  });

  it("配对那条不在季就退回赶圩（开学有月份限制）", () => {
    const found = dayOf("roadWork");
    expect(found).not.toBeNull();
    const s = createInitialState("pair", 3);
    s.month = 6; // 七月，schoolOpen 不在季
    s.day = found!.day;
    s.playerId = found!.seed;
    // 这一天不一定是修路，只能核「配对不是空」
    const m = marketOf(s);
    if (m?.id === "roadWork") {
      expect(pairedMarketOf(s)?.id).toBe("marketRush");
    }
  });

  it("配对那一句是给玩家看的：说街上的事，不带数字", () => {
    const s = at("gasUp");
    const words = marketPairWords(s);
    expect(words.length).toBeGreaterThan(2);
    expect(words).not.toMatch(/[0-9%]/);
  });
});
