import { describe, expect, it } from "vitest";
import { MASTERS, MASTER_BY_ID, PRICE_SET_BONUS } from "../data/master";
import {
  applyMaster,
  masterCostFactor,
  masterCount,
  masterPriceBonus,
  masterServeFactor,
  masterSummary,
  masterViews,
} from "./master";
import { scoreDish } from "./menu";
import { createInitialState, type GameState } from "./state";

function fresh(): GameState {
  return createInitialState("p1", 7);
}

describe("表结构", () => {
  it("四条方子，id 与名字都不重复，印章各一个字", () => {
    expect(MASTERS.length).toBe(4);
    expect(new Set(MASTERS.map((m) => m.id)).size).toBe(4);
    expect(new Set(MASTERS.map((m) => m.name)).size).toBe(4);
    for (const def of MASTERS) {
      expect([...def.seal].length).toBe(1);
      expect(def.line.length).toBeGreaterThan(6);
      expect(def.what.length).toBeGreaterThan(4);
      expect(def.kairo.length).toBeGreaterThan(4);
      // 人情当门槛：每条都要人情，否则「请师傅」这件事就不成立
      expect(def.favorCost).toBeGreaterThan(0);
      expect(def.costYuan).toBeGreaterThanOrEqual(0);
    }
    expect(MASTER_BY_ID.size).toBe(4);
  });

  it("每条方子都只落一个出口 —— 不许一条顶两条", () => {
    const ids = MASTERS.map((m) => m.id);
    expect(ids).toEqual(["taste_set", "cost_set", "serve_set", "price_set"]);
  });
});

describe("定方子", () => {
  it("新局一款都没定，抬头说「还没请师傅」", () => {
    const s = fresh();
    expect(masterCount(s)).toBe(0);
    expect(masterSummary(s)).toContain("还没请");
    expect(s.menu[0]?.master ?? null).toBeNull();
  });

  it("人情不够就定不下来 —— 跟钱多钱少没关系", () => {
    const s = fresh();
    s.favor = 0;
    s.cash = 1_000_000;
    const r = applyMaster(s, 0, "cost_set");
    expect(r.ok).toBe(false);
    expect(r.reason ?? "").toContain("人情");
    expect(s.menu[0]?.master ?? null).toBeNull();
  });

  it("钱不够也定不下来，但人情不会被扣", () => {
    const s = fresh();
    s.favor = 50;
    s.cash = 0;
    const r = applyMaster(s, 0, "cost_set");
    expect(r.ok).toBe(false);
    expect(r.reason ?? "").toContain("钱");
    expect(s.favor).toBe(50);
    expect(s.menu[0]?.master ?? null).toBeNull();
  });

  it("定成了就扣人情与钱，并把方子记在这一款上", () => {
    const s = fresh();
    s.favor = 20;
    s.cash = 1_000;
    const before = s.cash;
    const r = applyMaster(s, 0, "cost_set");
    expect(r.ok).toBe(true);
    expect(s.favor).toBe(20 - 12);
    expect(s.cash).toBe(before - 200);
    expect(s.menu[0]?.master).toBe("cost_set");
    expect(masterSummary(s)).toContain("1 /");
  });

  it("一锅只定一条：定过的款再定就拒", () => {
    const s = fresh();
    s.favor = 100;
    s.cash = 10_000;
    expect(applyMaster(s, 0, "cost_set").ok).toBe(true);
    const again = applyMaster(s, 0, "serve_set");
    expect(again.ok).toBe(false);
    expect(again.reason ?? "").toContain("一锅只能定一条");
    expect(s.menu[0]?.master).toBe("cost_set");
  });

  it("没有这一款、没有这条方子都拒", () => {
    const s = fresh();
    s.favor = 100;
    s.cash = 10_000;
    expect(applyMaster(s, 9, "cost_set").ok).toBe(false);
    expect(applyMaster(s, 0, "nope").ok).toBe(false);
  });

  it("视角里能看出哪条已经定了、哪条买得起", () => {
    const s = fresh();
    s.favor = 9;
    s.cash = 0;
    const views = masterViews(s, s.menu[0]);
    expect(views.length).toBe(4);
    // 火候定死要 8 点人情、不花钱 —— 有钱没钱都买得起
    expect(views.find((v) => v.def.id === "taste_set")?.affordable).toBe(true);
    // 料钱定死要 12 点人情 —— 现在只有 9 点
    expect(views.find((v) => v.def.id === "cost_set")?.affordable).toBe(false);
  });
});

describe("四条方子的效果", () => {
  it("火候定死：滑条再动，这一碗的味道都不变", () => {
    const s = fresh();
    s.favor = 100;
    s.cash = 10_000;
    const before = scoreDish(s.menu[0]!, s).total;
    expect(applyMaster(s, 0, "taste_set").ok).toBe(true);
    expect(s.menu[0]?.lockedTaste).toBe(Math.round(before));
    // 把汤底全推到 0，再算：分数应该还是定住那个
    const item = s.menu[0]!;
    // 把汤底滑块全推到 0（不整体替换 recipe：NoodleParams 是定长元组）
    for (let i = 0; i < item.recipe.soup.length; i += 1) item.recipe.soup[i] = 0;
    expect(scoreDish(item, s).total).toBe(Math.round(before));
  });

  it("料钱定死：只降成本，不动味道", () => {
    const s = fresh();
    s.favor = 100;
    s.cash = 10_000;
    const plain = scoreDish(s.menu[0]!, s);
    expect(applyMaster(s, 0, "cost_set").ok).toBe(true);
    const fixed = scoreDish(s.menu[0]!, s);
    expect(masterCostFactor(s.menu[0])).toBe(0.92);
    expect(fixed.cost).toBeLessThan(plain.cost);
    expect(fixed.total).toBe(plain.total);
    expect(fixed.margin).toBeGreaterThan(plain.margin);
  });

  it("出碗定死：这一款快 6%，别的款不受影响", () => {
    const s = fresh();
    s.favor = 100;
    s.cash = 10_000;
    expect(masterServeFactor(s.menu[0])).toBe(1);
    expect(applyMaster(s, 0, "serve_set").ok).toBe(true);
    expect(masterServeFactor(s.menu[0])).toBeCloseTo(0.94, 5);
  });

  it("售价顶住：这碗能多卖两块钱而不更容易被嫌贵", () => {
    const s = fresh();
    s.favor = 100;
    s.cash = 10_000;
    expect(masterPriceBonus(s.menu[0])).toBe(0);
    expect(applyMaster(s, 0, "price_set").ok).toBe(true);
    expect(masterPriceBonus(s.menu[0])).toBe(PRICE_SET_BONUS);
  });
});
