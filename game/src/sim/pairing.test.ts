import { describe, expect, it } from "vitest";
import { TOPPINGS } from "../data/ingredients";
import { PAIRINGS, PAIRING_TOTAL, pairingById } from "../data/pairing";
import { SAVE_VERSION, createInitialState } from "./state";
import {
  PAIR_CAP,
  nearlyPairing,
  pairCostFactor,
  pairPatienceMult,
  pairSatBonus,
  pairServeFactor,
  pairingActive,
  pairingBonus,
  pairingHits,
  pairingSummary,
  pairingViews,
} from "./pairing";

const idSet = new Set(TOPPINGS.map((t) => t.id));
const pairOf = (id: string) => PAIRINGS.find((p) => p.id === id)!.pair;

describe("配料组合（A2）", () => {
  it("24 搭：id 与名字不重样，每搭两件不同的真浇头", () => {
    expect(PAIRINGS).toHaveLength(24);
    expect(PAIRING_TOTAL).toBe(24);
    expect(new Set(PAIRINGS.map((p) => p.id)).size).toBe(24);
    expect(new Set(PAIRINGS.map((p) => p.name)).size).toBe(24);
    for (const p of PAIRINGS) {
      expect(p.pair).toHaveLength(2);
      expect(p.pair[0]).not.toBe(p.pair[1]);
      for (const id of p.pair) expect(idSet.has(id)).toBe(true);
    }
  });

  it("每一搭都有出处：链接 + 原话，且不许出现别的作品名", () => {
    const banned = /开罗|Ramen|Kairo|ラーメン/;
    for (const p of PAIRINGS) {
      expect(p.why.length).toBeGreaterThan(0);
      expect(p.line.length).toBeGreaterThan(0);
      expect(p.source.length).toBeGreaterThan(0);
      for (const src of p.source) {
        expect(src.url.startsWith("http")).toBe(true);
        expect(src.quote.length).toBeGreaterThan(0);
        expect(banned.test(src.quote)).toBe(false);
        expect(banned.test(src.label)).toBe(false);
      }
    }
  });

  it("每一搭至少一项效果，而且不出现负数", () => {
    for (const p of PAIRINGS) {
      const vals = [
        p.effect.soup ?? 0,
        p.effect.charm ?? 0,
        p.effect.sat ?? 0,
        p.effect.patiencePct ?? 0,
        p.effect.costPct ?? 0,
        p.effect.servePct ?? 0,
      ];
      expect(vals.some((v) => v > 0)).toBe(true);
      for (const v of vals) expect(v).toBeGreaterThanOrEqual(0);
    }
  });

  it("空碗：一搭都不成立，四个乘数都在 1", () => {
    expect(pairingHits([])).toHaveLength(0);
    expect(pairingBonus([]).soup).toBe(0);
    expect(pairCostFactor([])).toBe(1);
    expect(pairServeFactor([])).toBe(1);
    expect(pairPatienceMult([])).toBe(1);
    expect(pairSatBonus([])).toBe(0);
  });

  it("两件凑齐就成立一搭", () => {
    const pair = pairOf("liver_chitterling");
    expect(pairingActive(pairingById("liver_chitterling")!, pair)).toBe(true);
    expect(pairingHits(pair)).toHaveLength(1);
    expect(pairSatBonus(pair)).toBeGreaterThan(0);
  });

  it("只放一件：不成立，面板写清还差哪一件", () => {
    const pair = pairOf("liver_chitterling");
    const views = pairingViews({ toppings: [pair[0]!], nameOf: (id) => id });
    const v = views.find((x) => x.def.id === "liver_chitterling")!;
    expect(v.active).toBe(false);
    expect(v.missing).toEqual([pair[1]]);
  });

  it("多搭可以同时成立，按表序返回", () => {
    const a = pairOf("sourbamboo_chili");
    const b = pairOf("mince_chili");
    const hits = pairingHits([...new Set([...a, ...b])]);
    expect(hits.length).toBeGreaterThanOrEqual(2);
    const idx = hits.map((h) => PAIRINGS.indexOf(h));
    expect([...idx].sort((x, y) => x - y)).toEqual(idx);
  });

  it("同项加成相加后被 CAP 按住", () => {
    // 把所有 soup 加成的搭全凑上，看 soup 有没有越界
    const soupPairs = PAIRINGS.filter((p) => (p.effect.soup ?? 0) > 0);
    const toppings = [...new Set(soupPairs.flatMap((p) => p.pair))];
    const bonus = pairingBonus(toppings);
    expect(bonus.soup).toBeLessThanOrEqual(PAIR_CAP.soup);
  });

  it("料钱省 2% 封顶 3%、出碗快 2% 封顶 4%", () => {
    const p = pairOf("pork_mince");
    expect(pairCostFactor(p)).toBeCloseTo(1 - Math.min(PAIR_CAP.costPct, 0.02), 6);
    const q = pairOf("shengcai_scallion");
    expect(pairServeFactor(q)).toBeCloseTo(1 - Math.min(PAIR_CAP.servePct, 0.02), 6);
  });

  it("抬头写「凑成 N / 24 搭」", () => {
    expect(pairingSummary([])).toBe("凑成 0 / 24 搭");
    const pair = pairOf("beef_mince");
    expect(pairingSummary(pair)).toBe("凑成 1 / 24 搭");
  });

  it("差一件提示：只放一件时指向那一搭，凑齐后换下一条", () => {
    const pair = pairOf("beef_mince");
    const near = nearlyPairing([pair[0]!]);
    expect(near?.id).toBe("beef_mince");
    const full = pairOf("beef_mince");
    expect(nearlyPairing(full)?.id).not.toBe("beef_mince");
  });

  it("组合不占存档字段：版本仍是 28，新局没有额外状态", () => {
    const s = createInitialState("pair-player", 3);
    expect(SAVE_VERSION).toBe(35);
    expect(Object.keys(s)).not.toContain("pairings");
  });
});
