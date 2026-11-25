import { describe, expect, it } from "vitest";
import { createInitialState, type DayRecord, type GameState } from "./state";
import { nextHook } from "./hook";
import { capacityGain, capacityOf } from "./bottleneck";
import { todayLine } from "./today";
import { alignMarks, focusWords, demotedWords } from "./align";

/**
 * 批 AP′（解 P448）：来客天花板是闸的时候，三处说同一句话。
 *
 * 病灶（`docs/厨房口径与天花板提示AO′-2026-11-26.md` 第五、六节）：AO′ 只在店铺页的
 * 设备段加了一句「今天这三段再添也卖不动」，打烊单那一行还在劝人添灶 ——
 * 同一天两个说法，玩家按打烊单去买灶，第二天一碗都没多。
 *
 * 判据：这条通道**不点名任何一件东西、不给价钱、不给 ref**，只把闸指出来。
 */
function withYesterday(s: GameState, served: number, lost: number, queue = 0): void {
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
    lostQueue: queue,
    lostPrice: 0,
    lostWait: 0,
  };
  s.dayReport = null;
  s.days.push(rec);
}

describe("来客封顶那一档（批 AP′，P448）", () => {
  it("八座、昨天走掉一大半时，钩子说的是「卖不动」，不点名任何一件东西", () => {
    const s = createInitialState("ap1", 1);
    s.venue.seats = 8;
    s.cash = 5000;
    withYesterday(s, 20, 40, 40);
    // 前提：八座已经顶到来客天花板
    expect(capacityOf(s).tight).toBe("demand");

    const plan = nextHook(s);
    expect(plan.kind).toBe("capacity");
    expect(plan.key).toBe("capacity:demand");
    expect(plan.ref).toBeUndefined();
    // 不点名、不带价钱 —— 否则又变成「劝人买一件抬不动的设备」
    expect(plan.text).not.toContain("凳");
    expect(plan.text).not.toContain("灶");
    expect(plan.text).not.toContain("备料");
    expect(plan.text).not.toContain("¥");
    // 主句里必须有「卖不动」这三层意思之一：没有就是没把闸说出口
    expect(plan.text).toMatch(/卖不动|就这么多人/);
  });

  it("四座同样流失时，还是先添凳（座位真紧，不该走这一档）", () => {
    const s = createInitialState("ap2", 2);
    s.venue.seats = 4;
    s.cash = 5000;
    withYesterday(s, 20, 40, 40);

    const plan = nextHook(s);
    expect(plan.kind).toBe("capacity");
    expect(plan.key).toBe("capacity:seat");
    expect(plan.ref?.gearId).toBeTruthy();
  });

  it("这一档在四处红标里是独立的一段：座位、设备、扩建、家当都不红", () => {
    const s = createInitialState("ap3", 3);
    s.venue.seats = 8;
    s.cash = 5000;
    withYesterday(s, 20, 40, 40);

    const marks = alignMarks(s);
    expect(marks.focus.kind).toBe("capacity");
    expect(marks.focus.sec).toBe("demand");
    expect(marks.seatHot).toBe(false);
    expect(marks.equipHot).toBe(false);
    expect(marks.expandHot).toBe(false);
    expect(marks.gearHot).toBe(false);
    // 抬头用词不能是「扩店」——旧版会落到扩建那一段
    expect(focusWords(marks.focus)).toBe("街上的人");
  });

  it("副句把人往街上指，一个数字都不给", () => {
    const s = createInitialState("ap4", 4);
    s.venue.seats = 8;
    s.cash = 5000;
    withYesterday(s, 20, 40, 40);

    const line = todayLine(s);
    expect(line).not.toBeNull();
    expect(line!.key).toBe("capacity:demand");
    expect(line!.detail).toContain("街上");
    expect(line!.detail).not.toMatch(/[0-9]/);
    expect(line!.detail).not.toContain("设备");
  });

  it("别的段当主推时，灰字里也要提醒「店里再添也卖不动」", () => {
    const s = createInitialState("ap5", 5);
    s.venue.seats = 8;
    s.cash = 5000;
    // 不报流失 → 产能段不跑，钩子落到段位 / 家当 / 街面
    s.days.length = 0;
    s.dayReport = null;

    const marks = alignMarks(s);
    expect(marks.focus.sec).not.toBe("demand");
    expect(demotedWords(marks)).toContain("再添也卖不动");
  });

  it("四座时不吐这句灰字（座位是真闸，添凳有用）", () => {
    const s = createInitialState("ap6", 6);
    s.venue.seats = 4;
    s.days.length = 0;
    s.dayReport = null;

    expect(capacityGain(s).demandBlocked).toBe(false);
    expect(demotedWords(alignMarks(s))).not.toContain("再添也卖不动");
  });
});
