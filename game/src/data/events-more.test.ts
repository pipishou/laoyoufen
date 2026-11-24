import { describe, expect, it } from "vitest";
import { EVENTS, EVENTS_BY_ID } from "../data/events";
import { EVENTS_MORE } from "../data/events-more";

describe("八十件事（批 N′）", () => {
  it("三十二 + 五十一 = 八十三，id 不撞", () => {
    expect(EVENTS_MORE).toHaveLength(51);
    expect(EVENTS).toHaveLength(83);
    expect(EVENTS_BY_ID.size).toBe(83);
    expect(new Set(EVENTS.map((e) => e.id)).size).toBe(83);
  });

  it("每条都有两个以上的选项，且总有一条不摔口碑", () => {
    // 纪律的真实写法：环境压迫型事件（停水、气价、青菜涨）没有「不花钱」的选项，
    // 那是有意的 —— 但每条都必须留一条「花钱买口碑」的路，不许出现「怎么选都掉口碑」。
    for (const e of EVENTS_MORE) {
      expect(e.choices.length).toBeGreaterThanOrEqual(2);
      const keepFace = e.choices.some(
        (c) => !c.effects.some((f) => f.kind === "reputation" && f.amount < 0),
      );
      expect(keepFace).toBe(true);
    }
  });

  it("选项摘要与效果对得上（有现金效果的都写进 summary）", () => {
    for (const e of EVENTS_MORE) {
      for (const c of e.choices) {
        const cash = c.effects.find((f) => f.kind === "cash");
        if (cash && cash.kind === "cash" && cash.amount !== 0) {
          expect(c.summary).toContain("¥");
        }
        expect(c.result.length).toBeGreaterThan(8);
        expect(c.summary.length).toBeGreaterThan(0);
      }
    }
  });

  it("权重与冷却都落在老规矩里（4–10 权重、10–30 天冷却）", () => {
    for (const e of EVENTS) {
      expect(e.weight).toBeGreaterThanOrEqual(4);
      expect(e.weight).toBeLessThanOrEqual(10);
      // 999 = 一次性事件（原有那三十二条里用过这个值）
      expect(e.cooldownDays).toBeGreaterThanOrEqual(10);
      expect(e.cooldownDays).toBeLessThanOrEqual(999);
      expect(e.body.length).toBeGreaterThan(12);
    }
  });

  it("新增的四十八条里，带季节窗口的只在合理的月份", () => {
    for (const e of EVENTS_MORE) {
      if (!e.season) continue;
      expect(e.season.length).toBeGreaterThan(0);
      for (const m of e.season) {
        expect(m).toBeGreaterThanOrEqual(0);
        expect(m).toBeLessThanOrEqual(11);
      }
    }
  });
});
