import { describe, expect, it } from "vitest";
import { NOODLES, SEASON_NOODLES, seasonOf } from "../data/noodles";
import { MAX_TOPPING_ADDS, SIDE_COMBOS } from "../data/sides";
import { comboOf, maxToppingAdds, toggleMealDeal } from "./sides";
import { SIDES } from "../data/sides";
import { createInitialState, SAVE_VERSION, type SoupParams } from "./state";
import { openForBusiness } from "./setup";
import { deserialize, serialize } from "./save";
import {
  currentSeason,
  noodleCostFactor,
  noodleFit,
  noodleKindOf,
  noodleSeasonBonus,
  noodleServeFactor,
  noodleViews,
  setNoodleKind,
} from "./noodles";
import { scoreRecipe } from "./score";

/** 开张（巷内小店），回到 prep 态，粉型默认切粉 */
function fresh(seed = 1) {
  const s = createInitialState("p42", seed);
  openForBusiness(s, "alley", "测试老友粉");
  return s;
}

const SOUP = (over: Partial<Record<number, number>> = {}): SoupParams => {
  const base: SoupParams = [45, 50, 55, 45, 55, 45, 40, 55];
  for (const [k, v] of Object.entries(over)) base[Number(k)] = v as number;
  return base;
};

describe("粉型数据（P42）", () => {
  it("六种粉，解锁门槛递增，干捞是夏、砂锅是冬", () => {
    expect(NOODLES).toHaveLength(6);
    const needs = NOODLES.map((n) => n.needCustomers);
    expect(needs[0]).toBe(0);
    for (let i = 1; i < needs.length; i++) expect(needs[i]!).toBeGreaterThan(needs[i - 1]!);
    expect(SEASON_NOODLES).toEqual(["dry", "claypot"]);
    expect(NOODLES.find((n) => n.id === "dry")?.season).toBe("summer");
    expect(NOODLES.find((n) => n.id === "claypot")?.season).toBe("winter");
  });

  it("季节边界：6–9 夏、11/12/1/2 冬（month 是 0 基），其余没有季节", () => {
    expect([5, 6, 7, 8].map((m) => seasonOf(m))).toEqual(["summer", "summer", "summer", "summer"]);
    expect([10, 11, 0, 1].map((m) => seasonOf(m))).toEqual(["winter", "winter", "winter", "winter"]);
    expect([2, 3, 4, 9].map((m) => seasonOf(m))).toEqual([null, null, null, null]);
  });
});

describe("粉型接线", () => {
  it("新局卖切粉，契合 100%", () => {
    const s = fresh();
    expect(noodleKindOf(s)).toBe("flat");
    expect(noodleFit("flat", s.recipe.soup)).toBe(100);
    expect(noodleServeFactor(s)).toBe(1);
    expect(noodleCostFactor(s)).toBe(1);
    expect(noodleSeasonBonus(s)).toBe(0);
  });

  it("没解锁换不了，reason 说还差几位客人", () => {
    const s = fresh();
    const r = setNoodleKind(s, "claypot");
    expect(r.ok).toBe(false);
    expect(r.reason).toContain("位客人");
    expect(noodleKindOf(s)).toBe("flat");
  });

  it("够了就能换，成本与出碗时间跟着变", () => {
    const s = fresh();
    s.totalCustomers = 2000;
    expect(setNoodleKind(s, "claypot").ok).toBe(true);
    expect(noodleKindOf(s)).toBe("claypot");
    expect(noodleCostFactor(s)).toBeCloseTo(1.25, 5);
    expect(noodleServeFactor(s)).toBeCloseTo(1.5, 5);
  });

  it("非法 id 不换，也不抛", () => {
    const s = fresh();
    expect(setNoodleKind(s, "nope").ok).toBe(false);
    expect(noodleKindOf(s)).toBe("flat");
    // 存档被人改坏也要回切粉
    s.noodle = "garbage";
    expect(noodleKindOf(s)).toBe("flat");
  });
});

describe("粉型 × 汤的契合度（对应开罗 soupaffinity）", () => {
  it("圆粉靠咸鲜撑，汤淡就掉分", () => {
    const rich = noodleFit("round", SOUP({ 3: 70, 4: 80 }));
    const thin = noodleFit("round", SOUP({ 3: 25, 4: 30 }));
    expect(rich).toBeGreaterThan(thin);
  });

  it("伊面要厚汤，砂锅要浓汤加蒜", () => {
    expect(noodleFit("yifu", SOUP({ 2: 90 }))).toBeGreaterThan(noodleFit("yifu", SOUP({ 2: 30 })));
    expect(noodleFit("claypot", SOUP({ 2: 85, 6: 85 }))).toBeGreaterThan(
      noodleFit("claypot", SOUP({ 2: 30, 6: 10 })),
    );
  });

  it("湿面怕酸，干捞靠豆豉和辣", () => {
    expect(noodleFit("wetchow", SOUP({ 0: 95 }))).toBeLessThan(noodleFit("wetchow", SOUP({ 0: 40 })));
    expect(noodleFit("dry", SOUP({ 1: 90, 5: 80 }))).toBeGreaterThan(
      noodleFit("dry", SOUP({ 1: 20, 5: 15 })),
    );
  });

  it("换粉型会改分数：切粉基准不变，砂锅遇上浓汤重蒜会更高", () => {
    const s = fresh();
    s.recipe.soup = SOUP({ 2: 90, 6: 90 });
    const flat = scoreRecipe(s.recipe, s.price, "flat").total;
    const pot = scoreRecipe(s.recipe, s.price, "claypot").total;
    expect(noodleFit("claypot", s.recipe.soup)).toBeGreaterThan(100);
    expect(pot).toBeGreaterThan(flat);
  });

  it("当季 +3、反季 −3", () => {
    const s = fresh();
    s.totalCustomers = 2000;
    setNoodleKind(s, "claypot"); // 冬天卖砂锅
    s.month = 11; // 12 月
    expect(currentSeason(s)).toBe("winter");
    expect(noodleSeasonBonus(s)).toBe(3);
    s.month = 6; // 7 月
    expect(noodleSeasonBonus(s)).toBe(-3);
  });
});

describe("面板视图与存档", () => {
  it("六行视图，锁着的带还差人数", () => {
    const s = fresh();
    const v = noodleViews(s);
    expect(v).toHaveLength(6);
    expect(v.find((x) => x.def.id === "flat")?.on).toBe(true);
    expect(v.find((x) => x.def.id === "claypot")?.unlocked).toBe(false);
    expect(v.find((x) => x.def.id === "claypot")?.short).toBe(1800);
  });

  it("存档存得下粉型；老档（没有 noodle）补成切粉", () => {
    const s = fresh();
    s.totalCustomers = 2000;
    setNoodleKind(s, "yifu");
    const back = deserialize(serialize(s))!;
    expect(back.noodle).toBe("yifu");

    const old = JSON.parse(serialize(s)) as Record<string, unknown>;
    old.saveVersion = 13;
    delete old.noodle;
    const migrated = deserialize(JSON.stringify(old))!;
    expect(migrated.noodle).toBe("flat");
    expect(migrated.saveVersion).toBe(SAVE_VERSION);
  });
});

describe("套餐与冬夏限定组合（P42）", () => {
  const byId = (id: string) => SIDES.find((x) => x.id === id)!;

  it("干捞配豆浆只在夏天成立，砂锅配热浆只在冬天成立", () => {
    const soy = [byId("doujiang")];
    expect(comboOf(soy, "dry", "summer")?.name).toBe("干捞配豆浆");
    expect(comboOf(soy, "dry", "winter")).toBeNull();
    expect(comboOf(soy, "claypot", "winter")?.name).toBe("砂锅配热浆");
    expect(comboOf(soy, "claypot", "summer")).toBeNull();
    // 切粉全年都不凑季节组合
    expect(comboOf(soy, "flat", "summer")).toBeNull();
    expect(SIDE_COMBOS.filter((c) => c.season).map((c) => c.id)).toEqual(["summer_dry", "winter_claypot"]);
  });

  it("套餐开关会翻，开着时饮料少收一块", () => {
    const s = fresh();
    expect(s.sides.mealDeal).toBe(false);
    toggleMealDeal(s);
    expect(s.sides.mealDeal).toBe(true);
    toggleMealDeal(s);
    expect(s.sides.mealDeal).toBe(false);
  });

  it("手艺树 topping4 解锁后每顿可多加一件", () => {
    const s = fresh();
    expect(maxToppingAdds(s)).toBe(MAX_TOPPING_ADDS);
    s.gradeLevel = 4;
    expect(maxToppingAdds(s)).toBe(MAX_TOPPING_ADDS + 1);
  });
});
