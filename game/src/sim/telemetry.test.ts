import { describe, expect, it } from "vitest";
import { summarize, type Sample } from "./telemetry";

function s(day: number, bowls: number, lost: number, extra: Partial<Sample> = {}): Sample {
  return {
    t: day * 120,
    month: 1,
    day,
    minute: 0,
    bowls,
    lost,
    revenue: bowls * 9,
    price: 9,
    taste: 60,
    cash: 30000,
    waiting: 0,
    seats: 4,
    lostReason: null,
    ...extra,
  };
}

describe("游玩埋点汇总", () => {
  it("空样本不炸，全零", () => {
    const r = summarize([]);
    expect(r.minutes).toBe(0);
    expect(r.lostRate).toBe(0);
  });

  it("按天累加碗数与流失，算出流失率", () => {
    const r = summarize([s(1, 5, 2), s(2, 8, 1), s(3, 10, 0)]);
    expect(r.days).toBe(3);
    expect(r.bowls).toBe(23);
    expect(r.lost).toBe(3);
    expect(r.lostRate).toBeCloseTo(3 / 26, 5);
  });

  it("峰值为待客最大数", () => {
    const r = summarize([s(1, 1, 0, { waiting: 3 }), s(2, 2, 0, { waiting: 7 })]);
    expect(r.peakWaiting).toBe(7);
  });

  it("流失原因按次数降序，最多 5 条", () => {
    const list = [s(1, 1, 1, { lostReason: "嫌贵" }), s(2, 1, 1, { lostReason: "嫌贵" }), s(3, 1, 1, { lostReason: "等太久" })];
    const r = summarize(list);
    expect(r.lostReasons[0]).toEqual({ reason: "嫌贵", count: 2 });
    expect(r.lostReasons[1]).toEqual({ reason: "等太久", count: 1 });
  });

  it("均价比与味道均分按样本数平均", () => {
    const r = summarize([s(1, 0, 0, { price: 9, taste: 40 }), s(2, 0, 0, { price: 11, taste: 80 })]);
    expect(r.avgPrice).toBe(10);
    expect(r.avgTaste).toBe(60);
  });
});
