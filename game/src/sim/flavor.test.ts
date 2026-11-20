import { describe, expect, it } from "vitest";
import { FLAVORS, FLAVOR_BY_ID, FLAVOR_TOTAL, type FlavorDef } from "../data/flavor";
import { TOPPINGS } from "../data/ingredients";
import { NOODLES } from "../data/noodles";
import { deserialize, serialize } from "./save";
import { SAVE_VERSION, createInitialState, type GameState } from "./state";
import {
  FLAVOR_CAP,
  flavorActive,
  flavorBonus,
  flavorCostFactor,
  flavorHits,
  flavorPatienceMult,
  flavorSatBonus,
  flavorServeFactor,
  flavorSummary,
  flavorViews,
  nearlyFlavor,
} from "./flavor";

const TOP_IDS = new Set(TOPPINGS.map((t) => t.id));
const NOODLE_IDS = new Set(NOODLES.map((n) => n.id));

function fresh(): GameState {
  return createInitialState("p1", 7);
}

/** 只留这几味，便于断言「刚好凑成一条」 */
function only(ids: readonly string[]): string[] {
  return [...ids];
}

describe("表结构", () => {
  it("7 条，id 与名字都不重复", () => {
    expect(FLAVORS.length).toBe(7);
    expect(FLAVOR_TOTAL).toBe(7);
    expect(new Set(FLAVORS.map((f) => f.id)).size).toBe(7);
    expect(new Set(FLAVORS.map((f) => f.name)).size).toBe(7);
  });

  it("每条都只吃已经存在的浇头与粉型 —— 不许借组合偷偷加可买件", () => {
    for (const def of FLAVORS) {
      expect(def.toppings.length).toBeGreaterThan(0);
      for (const id of def.toppings) expect(TOP_IDS.has(id)).toBe(true);
      if (def.noodle) expect(NOODLE_IDS.has(def.noodle)).toBe(true);
      expect(def.when.length).toBeGreaterThan(0);
      expect(def.why.length).toBeGreaterThan(0);
      expect(def.line.length).toBeGreaterThan(0);
      // 至少一项加成，否则这条等于不存在
      const e = def.effect;
      const sum =
        (e.soup ?? 0) + (e.charm ?? 0) + (e.sat ?? 0) + (e.patiencePct ?? 0) + (e.costPct ?? 0) + (e.servePct ?? 0);
      expect(sum).toBeGreaterThan(0);
    }
  });

  it("每条都有出处，而且出处带链接与原话 —— 这是这批的验收条件", () => {
    for (const def of FLAVORS) {
      expect(def.source.length).toBeGreaterThanOrEqual(2);
      for (const src of def.source) {
        expect(src.url.startsWith("http")).toBe(true);
        expect(src.label.length).toBeGreaterThan(0);
        expect(src.quote.length).toBeGreaterThan(8);
      }
    }
  });

  it("出处里不出现别的作品名 —— 宁可少一条，也不许借别人的设定", () => {
    for (const def of FLAVORS) {
      const text = [def.name, def.when, def.line, def.why, ...def.source.map((s) => `${s.label}${s.quote}`)].join("");
      expect(text).not.toMatch(/开罗|拉面店|Ramen|Kairo/);
    }
  });

  it("季节粉型只给季节组合用（干捞=夏、砂锅=冬）", () => {
    const dry = FLAVOR_BY_ID.get("dry_mince") as FlavorDef;
    const pot = FLAVOR_BY_ID.get("claypot_offal") as FlavorDef;
    expect(dry.noodle).toBe("dry");
    expect(pot.noodle).toBe("claypot");
    expect(NOODLES.find((n) => n.id === "dry")?.season).toBe("summer");
    expect(NOODLES.find((n) => n.id === "claypot")?.season).toBe("winter");
  });
});

describe("判定", () => {
  it("老友三味：三味齐才成立，缺一味不成立", () => {
    expect(flavorActive(FLAVOR_BY_ID.get("classic")!, ["top.sourbamboo", "top.douchi", "top.chili"], "flat")).toBe(true);
    expect(flavorActive(FLAVOR_BY_ID.get("classic")!, ["top.sourbamboo", "top.douchi"], "flat")).toBe(false);
    expect(flavorHits(["top.sourbamboo", "top.douchi", "top.chili"], "flat").map((f) => f.id)).toEqual(["classic",]);
  });

  it("粉型绑定的组合：干捞成立、切粉不成立", () => {
    const topps = only(["top.mince"]);
    expect(flavorHits(topps, "dry").map((f) => f.id)).toEqual(["dry_mince"]);
    expect(flavorHits(topps, "flat")).toEqual([]);
  });

  it("砂锅猪杂只在砂锅里成立", () => {
    const topps = only(["top.offal"]);
    expect(flavorHits(topps, "claypot").map((f) => f.id)).toEqual(["claypot_offal"]);
    expect(flavorHits(topps, "flat").map((f) => f.id)).toEqual([]);
  });

  it("一条都没凑成时，七项加成都是 0、乘数都是 1", () => {
    const b = flavorBonus([], "flat");
    expect(b).toEqual({ soup: 0, charm: 0, sat: 0, patiencePct: 0, costPct: 0, servePct: 0 });
    expect(flavorCostFactor([], "flat")).toBe(1);
    expect(flavorServeFactor([], "flat")).toBe(1);
    expect(flavorPatienceMult([], "flat")).toBe(1);
    expect(flavorSatBonus([], "flat")).toBe(0);
  });

  it("豆芽垫底省料钱、干捞肉末快出碗", () => {
    expect(flavorCostFactor(["top.douya", "top.offal"], "flat")).toBeCloseTo(0.96, 5);
    expect(flavorServeFactor(["top.mince"], "dry")).toBeCloseTo(0.95, 5);
    expect(flavorPatienceMult(["top.tomato", "top.sourbamboo", "top.douchi"], "flat")).toBeCloseTo(1.05, 5);
  });

  it("同时成立的两条相加，但不越过 FLAVOR_CAP", () => {
    // 豆芽垫底（满意 1）+ 猪杂三样（满意 3）= 4，正好到顶
    const topps = ["top.douya", "top.offal", "top.pigliver", "top.pigchitterling"];
    const b = flavorBonus(topps, "flat");
    expect(b.sat).toBe(4);
    expect(b.sat).toBeLessThanOrEqual(FLAVOR_CAP.sat);
    expect(b.costPct).toBeLessThanOrEqual(FLAVOR_CAP.costPct);
  });
});

describe("视图与摘要", () => {
  it("views 七条全列出，未成立的写缺哪几味（中文名）", () => {
    const views = flavorViews({
      toppings: ["top.sourbamboo"],
      noodle: "flat",
      nameOf: (id) => TOPPINGS.find((t) => t.id === id)?.name ?? id,
    });
    expect(views.length).toBe(7);
    const classic = views.find((v) => v.def.id === "classic")!;
    expect(classic.active).toBe(false);
    expect(classic.missing).toEqual(["豆豉", "酸辣椒"]);
  });

  it("summary 凑成几条写几条", () => {
    expect(flavorSummary([], "flat")).toContain("0/7");
    expect(flavorSummary(["top.sourbamboo", "top.douchi", "top.chili"], "flat")).toContain("老友三味");
  });

  it("差一味时 nearlyFlavor 指得出是哪条", () => {
    const near = nearlyFlavor(["top.sourbamboo", "top.douchi"], "flat");
    expect(near?.id).toBe("classic");
    // 三味已经齐了，但「番茄入汤」还差西红柿 —— 差一味就成的照样指出来
    expect(nearlyFlavor(["top.sourbamboo", "top.douchi", "top.chili"], "flat")?.id).toBe("tomato_sour");
    expect(nearlyFlavor(["top.tomato", "top.sourbamboo", "top.douchi", "top.chili"], "flat")).toBeNull();
  });
});

describe("接进评分", () => {
  it("三味齐的那锅味道分更高（soup 那半）", async () => {
    const { scoreRecipe } = await import("./score");
    const base = createInitialState("p1", 7).recipe;
    const plain = scoreRecipe({ ...base, toppings: [] }, 9, "flat");
    const classic = scoreRecipe({ ...base, toppings: ["top.sourbamboo", "top.douchi", "top.chili"] }, 9, "flat");
    expect(classic.soup).toBeGreaterThan(plain.soup);
    expect(classic.soup - plain.soup).toBeGreaterThanOrEqual(FLAVOR_BY_ID.get("classic")!.effect.soup ?? 0);
    expect(classic.soup - plain.soup).toBeLessThanOrEqual(FLAVOR_CAP.soup);
  });

  it("味道加成不会把分数顶出 100", async () => {
    const { scoreRecipe } = await import("./score");
    const s = createInitialState("p1", 7);
    const max: typeof s.recipe = { ...s.recipe, soup: [100, 100, 100, 100, 100, 100, 100, 100] };
    const sc = scoreRecipe({ ...max, toppings: ["top.sourbamboo", "top.douchi", "top.chili"] }, 9, "flat");
    expect(sc.soup).toBeLessThanOrEqual(100);
    expect(sc.charm).toBeLessThanOrEqual(100);
  });
});

describe("存档", () => {
  it("v26：凑成过的味道记进图鉴，读档还在", () => {
    const s = fresh();
    s.collection.flavors.push("classic");
    expect(SAVE_VERSION).toBe(28);
    const back = deserialize(serialize(s))!;
    expect(back.collection.flavors).toEqual(["classic"]);
  });

  it("v25 老档：没有这一格就补空数组，坏 id 丢弃", () => {
    const s = fresh();
    const raw = JSON.parse(serialize(s)) as Record<string, unknown>;
    raw.saveVersion = 25;
    delete (raw.collection as Record<string, unknown>).flavors;
    const back = deserialize(JSON.stringify(raw))!;
    expect(back.collection.flavors).toEqual([]);

    const s2 = fresh();
    s2.collection.flavors = ["classic", "not_a_flavor"];
    const raw2 = JSON.parse(serialize(s2)) as Record<string, unknown>;
    raw2.saveVersion = 25;
    const back2 = deserialize(JSON.stringify(raw2))!;
    expect(back2.collection.flavors).toEqual(["classic"]);
  });
});
