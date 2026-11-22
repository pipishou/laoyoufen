import { describe, expect, it } from "vitest";
import { GOODS, GOOD_TOTAL, goodById } from "../data/goods";
import {
  buyGood,
  goodToday,
  goodWords,
  goodsCapacityBonus,
  goodsPatienceMult,
  goodsSideMult,
  goodsSummary,
  goodsViews,
  todayStamp,
} from "./goods";
import { createInitialState } from "./state";

const newState = () => {
  const s = createInitialState("goods-test", 9);
  s.favor = 40;
  return s;
};

describe("杂货铺：花人情买一天的方便", () => {
  it("三件，id 不重复，各有 name / what / line / why / kairo", () => {
    expect(GOOD_TOTAL).toBe(3);
    expect(new Set(GOODS.map((d) => d.id)).size).toBe(3);
    for (const d of GOODS) {
      expect(d.name.length).toBeGreaterThan(2);
      expect(d.what.length).toBeGreaterThan(6);
      expect(d.line.length).toBeGreaterThan(6);
      expect(d.why.length).toBeGreaterThan(10);
      expect(d.kairo.length).toBeGreaterThan(4);
      expect(d.favorCost).toBeGreaterThanOrEqual(6);
      expect(d.favorCost).toBeLessThanOrEqual(12);
    }
    expect(goodById("fan")?.name).toContain("电扇");
  });

  it("每条都带出处：http 链接 + 原文摘句", () => {
    for (const d of GOODS) {
      expect(d.source.length).toBeGreaterThanOrEqual(2);
      for (const src of d.source) {
        expect(src.url).toMatch(/^https?:\/\//);
        expect(src.label.length).toBeGreaterThan(2);
        expect(src.quote.length).toBeGreaterThan(4);
      }
    }
  });

  it("三件各落一个出口：产能 / 耐心 / 加购，且都只当天", () => {
    const s = newState();
    expect(goodsCapacityBonus(s)).toBe(0);
    expect(goodsPatienceMult(s)).toBe(1);
    expect(goodsSideMult(s)).toBe(1);

    expect(buyGood(s, "noodle_pile").ok).toBe(true);
    expect(goodsCapacityBonus(s)).toBe(15);
    expect(goodsPatienceMult(s)).toBe(1);

    expect(buyGood(s, "fan").ok).toBe(true);
    expect(goodsPatienceMult(s)).toBeCloseTo(1.2, 5);

    expect(buyGood(s, "dough").ok).toBe(true);
    expect(goodsSideMult(s)).toBeCloseTo(1.5, 5);
    expect(goodWords(goodById("dough")!)).toContain("×1.5");
  });

  it("扣的是人情不是钱", () => {
    const s = newState();
    const cash = s.cash;
    const favor = s.favor;
    expect(buyGood(s, "fan").ok).toBe(true);
    expect(s.cash).toBe(cash);
    expect(s.favor).toBe(favor - 8);
    expect(goodToday(s, "fan")).toBe(true);
  });

  it("人情不够就拒绝，说还差几点", () => {
    const s = newState();
    s.favor = 2;
    const r = buyGood(s, "dough");
    expect(r.ok).toBe(false);
    expect(r.reason).toContain("还差");
    const view = goodsViews(s).find((v) => v.def.id === "dough")!;
    expect(view.affordable).toBe(false);
    expect(view.reason).toContain("还差");
  });

  it("同一天买两次同一件：第二次拒绝", () => {
    const s = newState();
    expect(buyGood(s, "noodle_pile").ok).toBe(true);
    const again = buyGood(s, "noodle_pile");
    expect(again.ok).toBe(false);
    expect(again.reason).toContain("今天");
  });

  it("换一天就失效：日戳变了，效果归零", () => {
    const s = newState();
    buyGood(s, "noodle_pile");
    buyGood(s, "fan");
    expect(goodsSummary(s)).toContain("多备一筐粉");
    // 走过一天
    s.day = s.day + 1;
    expect(todayStamp(s)).toBe(s.month * 100 + s.day);
    expect(goodToday(s, "noodle_pile")).toBe(false);
    expect(goodsCapacityBonus(s)).toBe(0);
    expect(goodsPatienceMult(s)).toBe(1);
    expect(goodsSummary(s)).toBe("今天没买东西");
  });

  it("老档没有 goods 字段也不炸", () => {
    const s = newState();
    delete s.goods;
    expect(goodToday(s, "fan")).toBe(false);
    expect(goodsSideMult(s)).toBe(1);
    expect(goodsViews(s).every((v) => !v.active)).toBe(true);
    expect(buyGood(s, "fan").ok).toBe(true);
  });
});
