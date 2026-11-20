import { describe, expect, it } from "vitest";
import { GEARS, GEAR_BY_ID, GEAR_TOTAL_YUAN } from "../data/gear";
import { SAVE_VERSION, createInitialState, type GameState } from "./state";
import { openForBusiness } from "./setup";
import { deserialize, serialize } from "./save";
import {
  GEAR_EFFICIENCY_IDS,
  buyGear,
  gearAttractMult,
  gearEfficiencyLeft,
  gearCostFactor,
  gearDrinkMult,
  gearFatigueMult,
  gearPatienceMult,
  gearRivalShield,
  gearSatBonus,
  gearServeFactor,
  gearSummary,
  gearViews,
  hasGear,
  nextGear,
} from "./gear";

function fresh(): GameState {
  const s = createInitialState("gear-player", 7);
  expect(openForBusiness(s, "alley", "测试老友粉").ok).toBe(true);
  s.cash = 200_000;
  return s;
}

describe("家当（M3）", () => {
  it("十二件结构齐全、id 唯一、每件都有至少一项效果", () => {
    expect(GEARS).toHaveLength(12);
    expect(new Set(GEARS.map((g) => g.id)).size).toBe(12);
    expect(GEARS.map((g) => g.costYuan)).toEqual([...GEARS.map((g) => g.costYuan)].sort((a, b) => a - b));
    expect(GEARS[0]!.costYuan).toBe(100);
    expect(GEARS[GEARS.length - 1]!.costYuan).toBe(10_000);
    expect(GEAR_TOTAL_YUAN).toBe(28_800);
    for (const g of GEARS) {
      const has = Boolean(
        g.seats || g.servePct || g.costPct || g.satBonus || g.patiencePct || g.attractPct || g.drinkPct || g.fatiguePct || g.rivalShieldPct,
      );
      expect(has, g.id).toBe(true);
      expect(g.effect.length).toBeGreaterThan(3);
      expect(g.line.length).toBeGreaterThan(6);
    }
  });

  it("开罗对应关系写全了（水龙头/砧板/排气扇/风扇/冰箱/工匠像都点了名）", () => {
    const all = GEARS.map((g) => g.kairo).join("|");
    for (const word of ["Faucet", "Cutting Board", "Exhaust Fan", "Fan「", "Refrigerator", "Artisan Statue", "Folding Chair", "Bench"]) {
      expect(all, word).toContain(word);
    }
  });

  it("新局一件都没有，九个乘数全是中性", () => {
    const s = fresh();
    expect(s.gear).toEqual([]);
    expect(gearServeFactor(s)).toBe(1);
    expect(gearCostFactor(s)).toBe(1);
    expect(gearSatBonus(s)).toBe(0);
    expect(gearPatienceMult(s)).toBe(1);
    expect(gearAttractMult(s)).toBe(1);
    expect(gearDrinkMult(s)).toBe(1);
    expect(gearFatigueMult(s)).toBe(1);
    expect(gearRivalShield(s)).toBe(1);
  });

  it("买塑料矮凳扣 ¥100 并当场多一个座位", () => {
    const s = fresh();
    const seats = s.venue.seats;
    const r = buyGear(s, "plastic_stool");
    expect(r.ok).toBe(true);
    expect(s.cash).toBe(199_900);
    expect(s.venue.seats).toBe(seats + 1);
    expect(hasGear(s, "plastic_stool")).toBe(true);
  });

  it("买过的不能再买、钱不够不扣钱、没有这件也拒绝", () => {
    const s = fresh();
    expect(buyGear(s, "plastic_stool").ok).toBe(true);
    expect(buyGear(s, "plastic_stool").ok).toBe(false);
    s.cash = 50;
    const before = s.cash;
    const r = buyGear(s, "freezer");
    expect(r.ok).toBe(false);
    expect(r.reason).toContain("还差");
    expect(s.cash).toBe(before);
    expect(buyGear(s, "no_such_gear").ok).toBe(false);
  });

  it("巷口洗碗池让出碗快 6%", () => {
    const s = fresh();
    buyGear(s, "wash_sink");
    expect(gearServeFactor(s)).toBeCloseTo(0.94, 5);
  });

  it("大砧板 + 冰柜 料钱省 10%", () => {
    const s = fresh();
    buyGear(s, "big_board");
    buyGear(s, "freezer");
    expect(gearCostFactor(s)).toBeCloseTo(0.9, 5);
  });

  it("满意加成按件累加（笔记 1 + 冰柜 1 + 祖师像 2 + 祖师像与笔记凑出「开门见山」1）", () => {
    const s = fresh();
    for (const id of ["serve_manual", "freezer", "lucky_statue"]) buyGear(s, id);
    expect(gearSatBonus(s)).toBe(5);
  });

  it("耐心/进店/饮料各自累加", () => {
    const s = fresh();
    for (const id of ["bamboo_chair", "hood", "sour_plum"]) buyGear(s, id);
    expect(gearPatienceMult(s)).toBeCloseTo(1.23, 5);
    buyGear(s, "aroma_fan");
    expect(gearAttractMult(s)).toBeCloseTo(1.05, 5);
    expect(gearDrinkMult(s)).toBeCloseTo(1.15, 5);
  });

  it("壁扇把疲劳降到 0.8，且不会低于下限 0.4", () => {
    const s = fresh();
    buyGear(s, "wall_fan");
    expect(gearFatigueMult(s)).toBeCloseTo(0.8, 5);
    const fake = { ...s, gear: ["wall_fan", "wall_fan", "wall_fan", "wall_fan"] } as GameState;
    expect(gearFatigueMult(fake)).toBeCloseTo(0.4, 5);
  });

  it("街坊锦旗让同行抢客只剩 75%", () => {
    const s = fresh();
    buyGear(s, "banner");
    expect(gearRivalShield(s)).toBeCloseTo(0.75, 5);
  });

  it("全买齐：花 ¥28,800、座位 +2、summary 报 12/12", () => {
    const s = fresh();
    const seats = s.venue.seats;
    for (const g of GEARS) {
      expect(buyGear(s, g.id).ok, g.id).toBe(true);
    }
    expect(s.cash).toBe(200_000 - GEAR_TOTAL_YUAN);
    expect(s.venue.seats).toBe(seats + 2);
    expect(gearSummary(s)).toContain("12/12");
    expect(nextGear(s)).toBeNull();
    expect(gearViews(s).every((v) => v.owned)).toBe(true);
  });

  it("views 反映买没买、买不买得起；nextGear 给最便宜的那件", () => {
    const s = fresh();
    s.cash = 600;
    const views = gearViews(s);
    expect(views).toHaveLength(12);
    expect(views.find((v) => v.def.id === "wall_fan")!.affordable).toBe(true);
    expect(views.find((v) => v.def.id === "freezer")!.affordable).toBe(false);
    expect(nextGear(s)!.id).toBe("plastic_stool");
  });

  it("存档 v21 存得住家当；v20 老档补成空；坏 id 丢掉", () => {
    const s = fresh();
    buyGear(s, "wash_sink");
    buyGear(s, "banner");
    const raw = JSON.parse(serialize(s)) as { gear?: string[] };
    expect(raw.gear).toEqual(["wash_sink", "banner"]);

    const back = deserialize(serialize(s));
    expect(back).not.toBeNull();
    expect(back!.gear).toEqual(["wash_sink", "banner"]);
    expect(SAVE_VERSION).toBe(26);

    const old = JSON.parse(serialize(s)) as Record<string, unknown>;
    delete old.gear;
    old.saveVersion = 20;
    const restored = deserialize(JSON.stringify(old));
    expect(restored).not.toBeNull();
    expect(restored!.gear).toEqual([]);

    const dirty = JSON.parse(serialize(s)) as Record<string, unknown>;
    dirty.gear = ["wash_sink", "not_a_gear", 42];
    const cleaned = deserialize(JSON.stringify(dirty));
    expect(cleaned!.gear).toEqual(["wash_sink"]);
  });

  it("表里每一件都在 GEAR_BY_ID 里查得到", () => {
    for (const g of GEARS) {
      expect(GEAR_BY_ID.get(g.id)!.name).toBe(g.name);
    }
  });

  it("效率件清单按价格升序、买齐就空（试玩二轮 F7）", () => {
    const s = createInitialState("p1", 1);
    openForBusiness(s, "alley", "测试店");
    const left = gearEfficiencyLeft(s);
    expect(left.length).toBe(6);
    const costs = left.map((g) => g.costYuan);
    expect(costs).toEqual([...costs].sort((a, b) => a - b));
    expect(left.every((g) => GEAR_EFFICIENCY_IDS.has(g.id))).toBe(true);
    // 摆件与做人那几件不算产能件
    expect(GEAR_EFFICIENCY_IDS.has("banner")).toBe(false);
    expect(GEAR_EFFICIENCY_IDS.has("lucky_statue")).toBe(false);

    s.cash = 200_000;
    for (const g of left) buyGear(s, g.id);
    expect(gearEfficiencyLeft(s)).toEqual([]);
  });
})
