import { describe, expect, it } from "vitest";
import { MARKETS, MARKET_BY_ID, marketById } from "../data/market";
import { goodFixesApplied } from "./goods";
import {
  MARKET_CAP,
  MARKET_TOTAL,
  marketAttractMult,
  marketById as marketByIdSim,
  marketCostFactor,
  marketOf,
  marketPatienceMult,
  marketSummary,
  marketTotals,
  marketWalletMult,
  marketWords,
  pairedMarketOf,
} from "./market";
import { createInitialState, type GameState } from "./state";

/** 造一个指定月/日的新局 */
function at(month: number, day: number, playerId = "p-market"): GameState {
  const s = createInitialState(playerId, 7);
  s.month = month;
  s.day = day;
  return s;
}

/** 一年里所有出现的行情（够跑出分布） */
function scan(): Array<{ month: number; day: number; id: string }> {
  const out: Array<{ month: number; day: number; id: string }> = [];
  for (let month = 1; month <= 12; month++) {
    for (let day = 1; day <= 30; day++) {
      const m = marketOf(at(month, day, `scan-${month}-${day}`));
      if (m) out.push({ month, day, id: m.id });
    }
  }
  return out;
}

describe("data/market 十六条南宁行情", () => {
  it("十六条、id 唯一、说明齐、能被 marketById 查到", () => {
    expect(MARKET_TOTAL).toBe(16);
    expect(MARKETS).toHaveLength(16);
    expect(new Set(MARKETS.map((m) => m.id)).size).toBe(16);
    for (const m of MARKETS) {
      expect(m.name.length).toBeGreaterThan(1);
      expect(m.when.length).toBeGreaterThan(4);
      expect(m.line.length).toBeGreaterThan(6);
      expect(m.why.length).toBeGreaterThan(10);
      expect(m.kairo.length).toBeGreaterThan(4);
      expect(marketById(m.id)).toBe(m);
      expect(MARKET_BY_ID.get(m.id)).toBe(m);
      expect(marketByIdSim(m.id)).toBe(m);
    }
  });

  it("每条都至少有一个出口是负的（没有「全是好处」的一条）", () => {
    for (const m of MARKETS) {
      const vals = Object.values(m.effect).filter((v): v is number => typeof v === "number");
      expect(vals.length).toBeGreaterThan(0);
      expect(vals.some((v) => v < 0)).toBe(true);
    }
  });

  it("每条乘数都在硬上限之内", () => {
    for (const m of MARKETS) {
      for (const v of Object.values(m.effect)) {
        if (typeof v !== "number") continue;
        expect(Math.abs(v)).toBeLessThanOrEqual(MARKET_CAP);
      }
    }
  });
});

describe("sim/market 什么时候来", () => {
  it("只在它该来的月份出现（回南天不在一月，台风不在三月）", () => {
    const seen = scan();
    expect(seen.length).toBeGreaterThan(0);
    const monthOf = (id: string): number[] =>
      seen.filter((x) => x.id === id).map((x) => x.month);
    expect(monthOf("huiNanTian").every((m) => m === 2 || m === 3)).toBe(true);
    expect(monthOf("storm").every((m) => m === 7 || m === 8 || m === 9)).toBe(true);
    expect(monthOf("coldSnap").every((m) => m === 1 || m === 2 || m === 12)).toBe(true);
    expect(monthOf("schoolOpen").every((m) => m === 3 || m === 9)).toBe(true);
  });

  it("同一天问几次都同一条（不靠 Math.random）", () => {
    const s = at(7, 12, "same-day");
    const a = marketOf(s);
    const b = marketOf(s);
    expect(a).toBe(b);
  });

  it("不消耗 state.rng", () => {
    const s = at(8, 5, "no-rng");
    const before = JSON.stringify(s.rng);
    const day = s.day;
    for (let i = 0; i < 20; i++) marketOf(s);
    marketTotals(s);
    marketSummary(s);
    expect(JSON.stringify(s.rng)).toBe(before);
    expect(s.day).toBe(day);
  });

  it("有行情的日子占一成到六成（太平凡就不叫行情）", () => {
    const seen = scan();
    const ratio = seen.length / (12 * 30);
    expect(ratio).toBeGreaterThan(0.1);
    expect(ratio).toBeLessThan(0.6);
  });

  it("不是天天同一张脸：一年里至少出现四种行情", () => {
    const ids = new Set(scan().map((x) => x.id));
    expect(ids.size).toBeGreaterThanOrEqual(4);
  });
});

describe("sim/market 四个乘数", () => {
  it("没有行情的日子，四个乘数全是 1", () => {
    let plain: GameState | null = null;
    for (let day = 1; day <= 30 && !plain; day++) {
      const s = at(4, day, `plain-${day}`);
      if (!marketOf(s)) plain = s;
    }
    expect(plain).not.toBeNull();
    const s = plain!;
    expect(marketTotals(s)).toEqual({ attract: 0, patience: 0, wallet: 0, cost: 0 });
    expect(marketAttractMult(s)).toBe(1);
    expect(marketPatienceMult(s)).toBe(1);
    expect(marketWalletMult(s)).toBe(1);
    expect(marketCostFactor(s)).toBe(1);
  });

  it("有行情的日子：本条全额 + 配对那条按六成，且不越 ±35%（批 B″）", () => {
    const seen = scan();
    expect(seen.length).toBeGreaterThan(0);
    for (const x of seen.slice(0, 24)) {
      const s = at(x.month, x.day, `scan-${x.month}-${x.day}`);
      const m = marketOf(s)!;
      const pair = pairedMarketOf(s);
      const t = marketTotals(s);
      const e = m.effect;
      const p = pair?.effect;
      const mix = (a?: number, b?: number): number => (a ?? 0) + (b ?? 0) * 0.6;
      // 停水那天借了水会单独收回进店惩罚，这里只核没借水的情形
      if (!(m.id === "waterCut" && goodFixesApplied(s, "waterCut"))) {
        expect(t.attract).toBeCloseTo(mix(e.attractPct, p?.attractPct), 6);
      }
      expect(t.patience).toBeCloseTo(mix(e.patiencePct, p?.patiencePct), 6);
      expect(t.wallet).toBeCloseTo(mix(e.walletPct, p?.walletPct), 6);
      expect(t.cost).toBeCloseTo(mix(e.costPct, p?.costPct), 6);
      for (const v of Object.values(t)) expect(Math.abs(v)).toBeLessThanOrEqual(MARKET_CAP + 1e-9);
    }
  });

  it("一行话写清是哪几口子变了，涨的写「+」降的写「−」", () => {
    const rain = marketById("huiNanTian")!;
    const words = marketWords(rain);
    expect(words).toContain("进店 −12%");
    expect(words).toContain("耐心 +10%");
    expect(words).toContain("料钱 +6%");
    expect(words).not.toContain("-12");
    expect(marketWords(marketById("porkUp")!)).toContain("料钱 +14%");
  });

  it("摘要：有行情就点名，没行情就说街上没事", () => {
    const s = at(2, 3, "sum-has");
    const m = marketOf(s);
    const text = marketSummary(s);
    if (m) {
      expect(text).toContain(m.name);
      expect(text).toContain(marketWords(m));
    } else {
      expect(text).toBe("今天街上没什么特别的");
    }
  });
});
