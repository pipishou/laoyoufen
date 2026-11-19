import { describe, expect, it } from "vitest";
import { COMBOS, COMBO_TOTAL, COMBOS as ALL } from "../data/combo";
import { GEAR_BY_ID } from "../data/gear";
import { SAVE_VERSION, createInitialState, type GameState } from "./state";
import { openForBusiness } from "./setup";
import { buyGear, gearAttractMult, gearCostFactor, gearPatienceMult, gearSatBonus, gearServeFactor } from "./gear";
import { COMBO_CAP, activeCombos, comboActive, comboSummary, comboTotals, comboViews, nextCombo } from "./combo";

function fresh(): GameState {
  const s = createInitialState("combo-player", 7);
  expect(openForBusiness(s, "alley", "测试老友粉").ok).toBe(true);
  s.cash = 200_000;
  return s;
}

function own(s: GameState, ...ids: string[]): void {
  for (const id of ids) expect(buyGear(s, id).ok).toBe(true);
}

describe("家当搭配 · 表结构", () => {
  it("八组、id 与名字都不重复", () => {
    expect(COMBOS.length).toBe(8);
    expect(COMBO_TOTAL).toBe(8);
    expect(new Set(COMBOS.map((c) => c.id)).size).toBe(8);
    expect(new Set(COMBOS.map((c) => c.name)).size).toBe(8);
  });

  it("每一组的两件家当都真的在表里，且不是同一件", () => {
    for (const def of ALL) {
      expect(def.pairs.length).toBeGreaterThan(0);
      for (const [a, b] of def.pairs) {
        expect(GEAR_BY_ID.has(a)).toBe(true);
        expect(GEAR_BY_ID.has(b)).toBe(true);
        expect(a).not.toBe(b);
      }
    }
  });

  it("每组至少一项效果、都有南宁话与出处", () => {
    for (const def of ALL) {
      expect(Object.values(def.effect).some((v) => (v ?? 0) > 0)).toBe(true);
      expect(def.line.length).toBeGreaterThan(4);
      expect(def.kairo.length).toBeGreaterThan(4);
    }
  });
});

describe("家当搭配 · 成立与视图", () => {
  it("新局一组都没有，八个乘数全是中性", () => {
    const s = fresh();
    expect(activeCombos(s).length).toBe(0);
    expect(comboSummary(s)).toBe("0/8 组");
    expect(gearServeFactor(s)).toBeCloseTo(1, 5);
    expect(gearCostFactor(s)).toBeCloseTo(1, 5);
    expect(gearPatienceMult(s)).toBeCloseTo(1, 5);
    expect(gearAttractMult(s)).toBeCloseTo(1, 5);
    expect(gearSatBonus(s)).toBe(0);
  });

  it("买齐一对就成立一组", () => {
    const s = fresh();
    own(s, "plastic_stool");
    expect(activeCombos(s).length).toBe(0);
    own(s, "bamboo_chair");
    const on = activeCombos(s);
    expect(on.length).toBe(1);
    expect(on[0]!.id).toBe("stools");
    expect(comboSummary(s)).toContain("1/8");
  });

  it("只买一件时标成「只差这一件」", () => {
    const s = fresh();
    own(s, "wash_sink");
    const v = comboViews(s).find((x) => x.def.id === "wash")!;
    expect(v.active).toBe(false);
    expect(v.nearly).toBe(true);
    expect(v.missing).toEqual(["big_board"]);
    expect(nextCombo(s)?.def.id).toBe("wash");
  });

  it("件对任意一对成立就算（开罗同一组合名多行件对的写法）", () => {
    const s = fresh();
    const def = COMBOS.find((c) => c.id === "wash")!;
    expect(comboActive(s, def)).toBe(false);
    own(s, "wash_sink", "big_board");
    expect(comboActive(s, def)).toBe(true);
  });
});

describe("家当搭配 · 加成落到既有乘数", () => {
  it("凳子管够只动耐心", () => {
    const s = fresh();
    own(s, "plastic_stool", "bamboo_chair");
    // 两件本身的耐心：0 + 8% ；组合再 +6%
    expect(gearPatienceMult(s)).toBeCloseTo(1.14, 5);
    expect(gearServeFactor(s)).toBeCloseTo(1, 5);
  });

  it("洗得干净同时动出碗与料钱", () => {
    const s = fresh();
    own(s, "wash_sink", "big_board");
    // 洗碗池 6% + 砧板 0% + 组合 4% = 出碗 0.9；料钱 砧板 4% + 组合 2% = 0.94
    expect(gearServeFactor(s)).toBeCloseTo(0.9, 5);
    expect(gearCostFactor(s)).toBeCloseTo(0.94, 5);
  });

  it("八组全凑齐时总加成被上限夹住", () => {
    const s = fresh();
    own(s, ...GEAR_BY_ID.keys());
    expect(activeCombos(s).length).toBe(8);
    const t = comboTotals(s);
    expect(t.attractPct).toBeLessThanOrEqual(COMBO_CAP.attractPct + 1e-9);
    expect(t.servePct).toBeLessThanOrEqual(COMBO_CAP.servePct + 1e-9);
    expect(t.satBonus).toBeLessThanOrEqual(COMBO_CAP.satBonus);
    expect(t.rivalShieldPct).toBeLessThanOrEqual(COMBO_CAP.rivalShieldPct + 1e-9);
    // 家当+组合叠起来也还在下限之上
    expect(gearServeFactor(s)).toBeGreaterThanOrEqual(0.7);
    expect(gearCostFactor(s)).toBeGreaterThanOrEqual(0.7);
  });

  it("凑齐八组后 summary 是 8/8 且没有「再添一件」", () => {
    const s = fresh();
    own(s, ...GEAR_BY_ID.keys());
    expect(comboSummary(s)).toBe("8/8 组");
    expect(nextCombo(s)).toBeNull();
  });
});

describe("家当搭配 · 存档", () => {
  it("搭配完全由已买家当推导，不占新字段（版本仍是 25）", () => {
    const s = fresh();
    own(s, "plastic_stool", "bamboo_chair");
    expect(SAVE_VERSION).toBe(25);
    expect(activeCombos(s).length).toBe(1);
  });
});
