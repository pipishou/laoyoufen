import { describe, expect, it } from "vitest";
import {
  DEFAULT_PORTION,
  MAINS,
  PORTIONS,
  mainById,
  portionOf,
  portionCostYuan,
  portionPriceDelta,
  suggestPriceWithMain,
} from "../data/mains";
import { BOWL } from "../data/anchors";
import { bowlPriceOf, mainSummary, mainViews, portionSizeOfState, setMain, setPortion } from "./mains";
import { scoreRecipe } from "./score";
import { createInitialState, SAVE_VERSION, type GameState } from "./state";
import { openForBusiness } from "./setup";
import { serialize, deserialize } from "./save";

function fresh(): GameState {
  const s = createInitialState("main-test", 5);
  openForBusiness(s, "alley", "测试老友粉");
  return s;
}

describe("主料与份量（P46）", () => {
  it("十种主料、默认碎肉、门槛递增且不重复", () => {
    expect(MAINS).toHaveLength(10);
    expect(MAINS[0]!.id).toBe("pork");
    expect(MAINS[0]!.costYuan).toBe(0);
    // 门槛不按表序单调（三鲜 250 排在牛腩 1200 后面，菜单按常点顺序排），
    // 但除了两味开店就能卖的，都得有门槛且不超过 2000
    for (const m of MAINS) {
      expect(m.needCustomers).toBeGreaterThanOrEqual(0);
      expect(m.needCustomers).toBeLessThanOrEqual(2000);
    }
    const paid = MAINS.filter((m) => m.needCustomers > 0).map((m) => m.needCustomers);
    expect(new Set(paid).size).toBe(paid.length);
    // 只有碎肉与素粉是 0 门槛（开店就能卖的两味）
    expect(MAINS.filter((m) => m.needCustomers === 0).map((m) => m.id)).toEqual(["pork", "veg"]);
  });

  it("牛肉比碎肉贵：料钱高、客人更满意", () => {
    const beef = mainById("beef")!;
    const pork = mainById("pork")!;
    expect(beef.costYuan).toBeGreaterThan(pork.costYuan);
    expect(beef.satBonus).toBeGreaterThan(pork.satBonus);
    // 现实价：碎肉/猪杂粉 10 元，牛肉粉 12 元 —— 差 2 元，料钱差也在 2 元上下
    expect(beef.suggestAddYuan).toBeGreaterThanOrEqual(2);
  });

  it("素粉比碎肉便宜（负增量）", () => {
    expect(mainById("veg")!.costYuan).toBeLessThan(0);
  });

  it("新局：碎肉 + 二两，客流的门槛挡住牛肉", () => {
    const s = fresh();
    expect(s.main).toBe("pork");
    expect(s.portion).toBe(DEFAULT_PORTION);
    const beef = mainViews(s).find((v) => v.def.id === "beef")!;
    expect(beef.unlocked).toBe(false);
    expect(beef.short).toBe(300);
    const r = setMain(s, "beef");
    expect(r.ok).toBe(false);
    expect(r.reason).toContain("还差 300 位客人");
    expect(s.main).toBe("pork");
  });

  it("客流够了能换主料，视图跟着变", () => {
    const s = fresh();
    s.totalCustomers = 400;
    expect(mainViews(s).find((v) => v.def.id === "beef")!.unlocked).toBe(true);
    expect(setMain(s, "beef").ok).toBe(true);
    expect(s.main).toBe("beef");
    expect(mainViews(s).find((v) => v.def.id === "beef")!.on).toBe(true);
    expect(mainSummary(s)).toContain("牛肉");
    expect(setMain(s, "没这味").ok).toBe(false);
  });

  it("份量：二两不加工、三两 +¥2 卖价 +¥1.2 料钱，且只认 2/3", () => {
    const s = fresh();
    expect(portionOf(2).priceDelta).toBe(0);
    expect(portionOf(3).priceDelta).toBe(2);
    expect(portionOf(3).costYuan).toBeGreaterThan(0);
    expect(portionPriceDelta(3)).toBe(2);
    expect(portionCostYuan(3)).toBeCloseTo(1.2, 5);
    expect(setPortion(s, 3).ok).toBe(true);
    expect(bowlPriceOf(s)).toBe(s.price + 2);
    expect(setPortion(s, 3).ok).toBe(true);
    expect(setPortion(s, 4).ok).toBe(false);
    expect(portionSizeOfState(s)).toBe(3);
    // 未知份量回二两，不会崩
    expect(portionOf(9).size).toBe(2);
  });

  it("主料只改料钱，不改口味分（total 不受 main 影响）", () => {
    const s = fresh();
    const pork = scoreRecipe(s.recipe, s.price, "flat", { main: "pork", portion: 2 });
    const beef = scoreRecipe(s.recipe, s.price, "flat", { main: "beef", portion: 2 });
    expect(beef.total).toBe(pork.total);
    expect(beef.cost).toBeGreaterThan(pork.cost);
    expect(beef.cost - pork.cost).toBeCloseTo(mainById("beef")!.costYuan, 5);
  });

  it("份量也进料钱：三两比二两贵 ¥1.2", () => {
    const s = fresh();
    const two = scoreRecipe(s.recipe, s.price, "flat", { main: "pork", portion: 2 });
    const three = scoreRecipe(s.recipe, s.price, "flat", { main: "pork", portion: 3 });
    expect(three.total).toBe(two.total);
    expect(three.cost - two.cost).toBeCloseTo(1.2, 5);
  });

  it("建议价 = 成本 + 目标毛利，素粉比牛肉便宜", () => {
    const veg = suggestPriceWithMain("veg", 2);
    const beef = suggestPriceWithMain("beef", 2);
    expect(beef).toBeGreaterThan(veg);
    // 二两牛肉粉的建议价落在现实区间（¥11–14）
    expect(beef).toBeGreaterThanOrEqual(11);
    expect(beef).toBeLessThanOrEqual(14);
    // 三两比二两贵
    expect(suggestPriceWithMain("pork", 3)).toBeGreaterThan(suggestPriceWithMain("pork", 2));
    expect(PORTIONS).toHaveLength(2);
    expect(BOWL.costYuan).toBeGreaterThan(0);
  });

  it("存档 v17 存得住主料与份量，老档补碎肉二两", () => {
    const s = fresh();
    s.totalCustomers = 400;
    setMain(s, "beef");
    setPortion(s, 3);
    const back = deserialize(serialize(s))!;
    expect(back.main).toBe("beef");
    expect(back.portion).toBe(3);
    expect(SAVE_VERSION).toBe(31);

    const raw = JSON.parse(serialize(s)) as Record<string, unknown>;
    raw.saveVersion = 16;
    delete raw.main;
    delete raw.portion;
    const old = deserialize(JSON.stringify(raw))!;
    expect(old.main).toBe("pork");
    expect(old.portion).toBe(DEFAULT_PORTION);

    // 非法值也兜住
    const raw2 = JSON.parse(serialize(s)) as Record<string, unknown>;
    raw2.main = "不存在的肉";
    raw2.portion = 9;
    const fixed = deserialize(JSON.stringify(raw2))!;
    expect(fixed.main).toBe("pork");
    expect(fixed.portion).toBe(DEFAULT_PORTION);
  });
});
