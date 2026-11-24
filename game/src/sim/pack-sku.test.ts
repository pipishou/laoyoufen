import { describe, expect, it } from "vitest";
import { PACK_SKUS, PACK_SKU_TOTAL, packSkuById } from "../data/pack";
import {
  packDailyOf,
  packNetAll,
  packSkuLines,
  packSkuNet,
  packSkuWords,
  settlePack,
} from "./pack";
import { createInitialState, type GameState } from "./state";

/**
 * 批 W′：袋装线从「一档」变成四档。
 *
 * 判据：
 * 1. 三档都从今天那点基础袋数里分，**不新增产能**；
 * 2. 每档都有出处、有话；礼盒有段位门槛；
 * 3. 没置办包装机时三档也是空的；
 * 4. 结算时基础货与三档一起进现金，账目对得上（不出现「机器里多出几袋」）。
 */

function withTaste(s: GameState, taste: number): GameState {
  s.dayReport = {
    month: s.month,
    day: s.day,
    revenue: 500,
    served: 40,
    lost: 10,
    avgSat: 60,
    price: s.price,
    taste,
    cash: s.cash,
  };
  return s;
}

function fresh(): GameState {
  return withTaste(Object.assign(createInitialState("w1", 7), { pack: true }), 90);
}

describe("三档货的表（批 W′）", () => {
  it("三档：汤底包 / 酸笋包 / 礼盒，份额加起来不到四成", () => {
    expect(PACK_SKU_TOTAL).toBe(3);
    expect(PACK_SKUS.map((k) => k.id)).toEqual(["soup", "sour", "gift"]);
    const share = PACK_SKUS.reduce((sum, k) => sum + k.share, 0);
    expect(share).toBeLessThan(0.4);
  });

  it("每档都带出处、带一句白话、卖价高于料钱", () => {
    for (const k of PACK_SKUS) {
      expect(k.source.length).toBeGreaterThan(0);
      for (const src of k.source) {
        expect(src.url.startsWith("http")).toBe(true);
        expect(src.quote.length).toBeGreaterThan(8);
      }
      expect(k.line.length).toBeGreaterThan(5);
      expect(k.why.length).toBeGreaterThan(10);
      expect(k.priceYuan).toBeGreaterThan(k.costPerPack);
    }
  });

  it("礼盒要段位，另外两档一开始就能卖", () => {
    expect(packSkuById("soup")?.minGrade).toBe(0);
    expect(packSkuById("sour")?.minGrade).toBe(0);
    expect(packSkuById("gift")?.minGrade).toBeGreaterThan(0);
    expect(packSkuById("nope")).toBeNull();
  });
});

describe("分货（批 W′）", () => {
  it("没置办包装机时三档都是空的", () => {
    const s = withTaste(createInitialState("w2", 7), 90);
    expect(packSkuLines(s)).toHaveLength(0);
    expect(packSkuNet(s)).toBe(0);
    expect(packSkuWords(s)).toBe("");
  });

  it("段位不够时礼盒不出现，但另外两档照卖", () => {
    const s = fresh();
    s.gradeLevel = 0;
    const ids = packSkuLines(s).map((l) => l.def.id);
    expect(ids).toEqual(["soup", "sour"]);
    expect(packSkuWords(s)).toContain("还差段位");
  });

  it("段位够了礼盒才上车", () => {
    const s = fresh();
    s.gradeLevel = 3;
    const ids = packSkuLines(s).map((l) => l.def.id);
    expect(ids).toContain("gift");
  });

  it("三档加起来不超过基础袋数（不新增产能）", () => {
    const s = fresh();
    s.gradeLevel = 6;
    s.reputation = 8;
    const base = packDailyOf(s);
    const extra = packSkuLines(s).reduce((sum, l) => sum + l.count, 0);
    expect(extra).toBeLessThan(base);
  });

  it("味道越好，三档分到的件数越多", () => {
    const bad = withTaste(Object.assign(createInitialState("w3", 7), { pack: true }), 5);
    const good = withTaste(Object.assign(createInitialState("w4", 7), { pack: true }), 98);
    bad.gradeLevel = 4;
    good.gradeLevel = 4;
    const sum = (s: GameState): number => packSkuLines(s).reduce((n, l) => n + l.count, 0);
    expect(sum(good)).toBeGreaterThan(sum(bad));
  });
});

describe("结算（批 W′）", () => {
  it("三档与基础货一起进现金，净额等于基础 + 三档", () => {
    const s = fresh();
    s.gradeLevel = 4;
    s.cash = 1_000;
    const expectNet = packNetAll(s);
    const r = settlePack(s);
    expect(r.sold).toBeGreaterThan(0);
    expect(r.net).toBeCloseTo(expectNet, 2);
    expect(s.cash).toBeCloseTo(1_000 + expectNet, 2);
    expect(Object.keys(r.extra).length).toBeGreaterThan(0);
    expect(r.extraNet).toBeGreaterThan(0);
  });

  it("账目对得上：extraNet 就是三档各件 × 各毛利", () => {
    const s = fresh();
    s.gradeLevel = 4;
    const lines = packSkuLines(s);
    const manual = lines.reduce(
      (sum, l) => sum + l.count * (l.def.priceYuan - l.def.costPerPack),
      0,
    );
    expect(packSkuNet(s)).toBeCloseTo(manual, 2);
  });
});
