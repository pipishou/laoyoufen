import { describe, expect, it } from "vitest";
import { createInitialState, type DayRecord, type GameState } from "./state";
import { nextHook } from "./hook";
import { capacityOf } from "./bottleneck";

/**
 * 批 AM′：门口站满时先添凳。
 *
 * 判据来自四天对照实验（`docs/钩子先添凳AM′-2026-11-25.md`）：
 * 4 座时买凳第 4 天多卖 18.4 碗，买灶一碗都不多 —— 座位那一环没富余时，钩子必须先说凳。
 */
function withYesterday(
  s: GameState,
  served: number,
  lost: number,
  split: { queue?: number; wait?: number; price?: number } = {}
): void {
  const rec: DayRecord = {
    month: 1,
    day: 1,
    revenue: served * 10,
    served,
    lost,
    avgSat: 60,
    price: 10,
    taste: 60,
    cash: 0,
    lostQueue: split.queue ?? 0,
    lostPrice: split.price ?? 0,
    lostWait: split.wait ?? 0,
  };
  s.dayReport = null;
  s.days.push(rec);
}

describe("钩子先添凳（批 AM′，P70 的建议侧）", () => {
  it("4 座、排队走掉一大半时，说的是凳子不是灶", () => {
    const s = createInitialState("p70a", 1);
    s.venue.seats = 4;
    s.cash = 5000;
    withYesterday(s, 20, 40, { queue: 40 });

    const plan = nextHook(s);
    expect(plan.kind).toBe("capacity");
    expect(plan.key).toBe("capacity:seat");
    expect(["plastic_stool", "bamboo_chair"]).toContain(plan.ref?.gearId);
    expect(plan.ref?.equipId).toBeUndefined();
  });

  it("4 座、走的人大多在等（wait 主导）也说凳子", () => {
    const s = createInitialState("p70b", 2);
    s.venue.seats = 4;
    s.cash = 5000;
    withYesterday(s, 20, 40, { wait: 40 });

    const plan = nextHook(s);
    expect(plan.key).toBe("capacity:seat");
  });

  it("6 座时座位已经有富余，就走回「谁最划算」那条路（设备）", () => {
    const s = createInitialState("p70c", 3);
    s.venue.seats = 6;
    s.cash = 5000;
    withYesterday(s, 20, 40, { wait: 40 });
    // 前提：6 座时日碗量确实高过灶
    const cap = capacityOf(s);
    expect(cap.seats).toBeGreaterThan(cap.stove);

    const plan = nextHook(s);
    expect(plan.kind).toBe("capacity");
    expect(plan.key).not.toBe("capacity:seat");
    expect(plan.ref?.equipId).toBeTruthy();
  });

  it("凳子买不起也照样提它，只是话换成「卖了钱先添」", () => {
    const s = createInitialState("p70d", 4);
    s.venue.seats = 4;
    s.cash = 0;
    withYesterday(s, 20, 40, { queue: 40 });

    const plan = nextHook(s);
    expect(plan.key).toBe("capacity:seat");
    expect(plan.text).toContain("卖了钱先添");
    expect(plan.text).toContain("塑料矮凳");
  });

  it("座位这一环不紧时（2 座早就换成 8 座）不会硬推凳子", () => {
    const s = createInitialState("p70e", 5);
    s.venue.seats = 8;
    s.cash = 5000;
    withYesterday(s, 20, 40, { queue: 40 });
    // queue 主导仍然先看座位件，但 8 座时座位件已买到头（两件都买过）
    s.gear = ["plastic_stool", "bamboo_chair"];
    const plan = nextHook(s);
    expect(plan.kind).not.toBe("none");
    expect(plan.ref?.gearId).not.toBe("plastic_stool");
  });
});
