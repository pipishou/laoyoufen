import { describe, expect, it } from "vitest";
import { DEFAULT_TIER, TIERS, TIER_BY_ID, tierById } from "../data/guest-tier";
import {
  TIER_TOTAL,
  neighborChanceOf,
  pickyChanceOf,
  rollTier,
  tierBudgetPct,
  tierHeadcount,
  tierPatiencePct,
  tierRepWeight,
  tierSatPenalty,
  tierSummary,
  tierVoiceContext,
} from "./guest-tier";
import { createInitialState, type GameState, type QueueCustomer } from "./state";

function fresh(): GameState {
  const s = createInitialState("tier-test", 11);
  s.gradeLevel = 4;
  s.reputation = 4.2;
  return s;
}

describe("顾客等级（A8）", () => {
  it("三档都在，默认是街坊，id 能查回", () => {
    expect(TIER_TOTAL).toBe(3);
    expect(DEFAULT_TIER).toBe("neighbor");
    for (const d of TIERS) {
      expect(d.name.length).toBeGreaterThan(1);
      expect(d.note.length).toBeGreaterThan(4);
      expect(TIER_BY_ID.get(d.id)).toBe(d);
      expect(tierById(d.id)).toBe(d);
    }
  });

  it("坏值一律当街坊，绝不返回空", () => {
    expect(tierById(undefined).id).toBe("neighbor");
    expect(tierById("nope").id).toBe("neighbor");
    expect(tierById(null).id).toBe("neighbor");
  });

  it("三档的四个乘数方向都对：识食的最有钱也最挑", () => {
    const passer = tierById("passer");
    const neighbor = tierById("neighbor");
    const picky = tierById("picky");
    expect(tierBudgetPct(passer)).toBeLessThan(1);
    expect(tierBudgetPct(neighbor)).toBe(1);
    expect(tierBudgetPct(picky)).toBeGreaterThan(1);
    expect(tierPatiencePct(passer)).toBeLessThan(1);
    expect(tierPatiencePct(picky)).toBeGreaterThan(1);
    expect(tierRepWeight(passer)).toBeLessThan(1);
    expect(tierRepWeight(picky)).toBeGreaterThan(1);
  });

  it("挑剔扣分只对识食的生效，且只在低分时扣", () => {
    const picky = tierById("picky");
    expect(tierSatPenalty(tierById("neighbor"), 40)).toBe(0);
    expect(tierSatPenalty(tierById("passer"), 40)).toBe(0);
    expect(tierSatPenalty(picky, 90)).toBe(0);
    expect(tierSatPenalty(picky, 50)).toBeGreaterThan(0);
    // 越难吃扣得越多，但有上限
    expect(tierSatPenalty(picky, 30)).toBeGreaterThan(tierSatPenalty(picky, 60));
    expect(tierSatPenalty(picky, 0)).toBeLessThanOrEqual(18);
  });

  it("识食的比例随口碑与段位涨，但两头都夹住", () => {
    const low = createInitialState("t1", 3);
    expect(pickyChanceOf(low)).toBeGreaterThanOrEqual(0.02);
    const high = createInitialState("t2", 3);
    high.reputation = 5;
    high.gradeLevel = 11;
    expect(pickyChanceOf(high)).toBeGreaterThan(pickyChanceOf(low));
    expect(pickyChanceOf(high)).toBeLessThanOrEqual(0.34);
    expect(neighborChanceOf(low)).toBeGreaterThanOrEqual(0.2);
    expect(neighborChanceOf(high)).toBeLessThanOrEqual(0.6);
  });

  it("常客回访一定是街坊，不会被抽成识食的", () => {
    const s = fresh();
    // 0.01 会落在最高档区间，但常客必须压回街坊
    expect(rollTier(s, 0.99, true).id).toBe("neighbor");
    expect(rollTier(s, 0.0, true).id).toBe("neighbor");
  });

  it("rollTier 按 rand 落在三档区间里，且区间不重叠", () => {
    const s = fresh();
    const picky = pickyChanceOf(s);
    const neighbor = neighborChanceOf(s);
    expect(rollTier(s, 0, false).id).toBe("picky");
    expect(rollTier(s, Math.min(0.999, picky + 0.001), false).id).toBe("neighbor");
    expect(rollTier(s, Math.min(0.999, picky + neighbor + 0.001), false).id).toBe("passer");
    expect(rollTier(s, 0.999, false).id).toBe("passer");
  });

  it("tierHeadcount 只数场上这几位，没有 tier 的老客算街坊", () => {
    const s = fresh();
    const mk = (id: string, tier?: string): QueueCustomer =>
      ({ id, archetypeId: "student", status: "waiting", tier } as unknown as QueueCustomer);
    s.flow.customers = [mk("a", "picky"), mk("b"), mk("c", "passer"), mk("d", "picky")];
    const h = tierHeadcount(s);
    expect(h.picky).toBe(2);
    expect(h.neighbor).toBe(1);
    expect(h.passer).toBe(1);
  });

  it("tierSummary 说出三种人分别在哪儿，空场不吹", () => {
    const s = fresh();
    s.flow.customers = [];
    // 空场就说没人，别硬报「街坊 0 位」这种假装有数据的句子
    expect(tierSummary(s)).toContain("还没人");
    s.flow.customers = [
      { id: "n", archetypeId: "auntie", status: "waiting", tier: "neighbor" } as unknown as QueueCustomer,
      { id: "x", archetypeId: "student", status: "waiting", tier: "picky" } as unknown as QueueCustomer,
    ];
    const txt = tierSummary(s);
    expect(txt).toContain("街坊");
    expect(txt).toContain("识食");
  });

  it("AI 上下文只有名词，不带任何数字", () => {
    for (const d of TIERS) {
      const ctx = tierVoiceContext(d);
      const joined = Object.values(ctx).join("");
      expect(joined).not.toMatch(/\d/);
      expect(joined.length).toBeGreaterThan(0);
    }
  });
});
