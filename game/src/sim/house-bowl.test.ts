import { describe, expect, it } from "vitest";

import { SIDES } from "../data/sides";
import { TOPPINGS, findTopping } from "../data/ingredients";
import { PAIRINGS, PAIRING_TOTAL, pairingById } from "../data/pairing";
import { dishName } from "../data/dish-name";
import { pairingHits } from "./pairing";
import { isHouseBowl } from "./dish";
import type { MenuItem } from "./state";

const item = (over: Partial<MenuItem> = {}): MenuItem => ({
  id: 1,
  recipe: { soup: "bone", toppings: [] } as unknown as MenuItem["recipe"],
  noodle: "yifu",
  main: "offal",
  portion: 2,
  price: 12,
  on: true,
  sold: 0,
  ...over,
});

describe("老友猪杂伊面 ＋ 生鸡蛋（批 S′）", () => {
  it("生鸡蛋进了浇头表，带两条出处，并说明自己不是煎的", () => {
    const egg = findTopping("top.egg");
    expect(egg).toBeDefined();
    expect(egg!.name).toBe("生鸡蛋");
    expect(egg!.kind).toBe("egg");
    expect(egg!.price).toBe(2);
    expect(egg!.source?.length ?? 0).toBeGreaterThanOrEqual(2);
    for (const src of egg!.source ?? []) expect(src.url).toMatch(/^https?:\/\//);
    expect(egg!.note ?? "").toContain("不是煎的");
    expect(TOPPINGS.filter((t) => t.id === "top.egg")).toHaveLength(1);
  });

  it("「加生蛋」是加菜，一开始就能点（不需要熟客）", () => {
    const side = SIDES.find((s) => s.id === "shengdan");
    expect(side).toBeDefined();
    expect(side!.name).toBe("加生蛋");
    expect(side!.kind).toBe("topping");
    expect(side!.priceYuan).toBe(2);
    expect(side!.needCustomers).toBe(0);
    expect(side!.source?.length ?? 0).toBeGreaterThanOrEqual(2);
    for (const src of side!.source ?? []) expect(src.url).toMatch(/^https?:\/\//);
  });

  it("猪杂打蛋这一搭在表里，两个出处都指到「猪杂伊面加蛋」的原文", () => {
    const p = pairingById("offal_egg");
    expect(p).toBeDefined();
    expect(p!.name).toBe("猪杂打蛋");
    expect(p!.pair).toEqual(["top.offal", "top.egg"]);
    expect(p!.effect.sat).toBe(2);
    expect(p!.source.length).toBeGreaterThanOrEqual(2);
    for (const src of p!.source) expect(src.url).toMatch(/^https?:\/\//);
    expect(PAIRINGS).toHaveLength(PAIRING_TOTAL);
    expect(pairingHits(["top.offal", "top.egg"])).toHaveLength(1);
  });

  it("品名自己会长出来：老友猪杂伊面 ＋ 生蛋", () => {
    const plain = dishName({
      method: "soup",
      main: "offal",
      noodle: "yifu",
      portion: 2,
      extras: [],
      meal: false,
    });
    expect(plain).toBe("老友猪杂伊面");
    const withEgg = dishName({
      method: "soup",
      main: "offal",
      noodle: "yifu",
      portion: 2,
      extras: ["生蛋"],
      meal: false,
    });
    expect(withEgg).toContain("老友猪杂伊面");
    expect(withEgg).toContain("生蛋");
  });

  it("老板那碗只认「猪杂 ＋ 伊面」，换一样就不是", () => {
    expect(isHouseBowl(item())).toBe(true);
    expect(isHouseBowl(item({ main: "pork" }))).toBe(false);
    expect(isHouseBowl(item({ noodle: "flat" }))).toBe(false);
  });
});
