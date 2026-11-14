import { beforeEach, describe, expect, it } from "vitest";
import type { GameState } from "./state";
import { clearTelemetry, getDays, getSamples, loadTelemetry, recordSample, summarize } from "./telemetry";

/** 伪 localStorage：埋点落盘要能测，node 环境没有真货 */
class MemStore {
  m = new Map<string, string>();
  getItem(k: string) {
    return this.m.has(k) ? (this.m.get(k) as string) : null;
  }
  setItem(k: string, v: string) {
    this.m.set(k, v);
  }
  removeItem(k: string) {
    this.m.delete(k);
  }
  clear() {
    this.m.clear();
  }
  key(i: number) {
    return [...this.m.keys()][i] ?? null;
  }
  get length() {
    return this.m.size;
  }
}

/** 只满足埋点读取的最小状态 */
function fake(month: number, day: number, minute: number, served: number, lost: number, price = 9): GameState {
  return {
    month,
    day,
    price,
    cash: 30000,
    venue: { seats: 4 },
    flow: {
      minuteOfDay: minute,
      servedToday: served,
      lostToday: lost,
      revenueToday: served * price,
      customers: [],
      lastLostReason: null,
    },
  } as unknown as GameState;
}

describe("游玩埋点 v2：日聚合 + 随时落盘", () => {
  beforeEach(() => {
    (globalThis as unknown as { localStorage: MemStore }).localStorage = new MemStore();
    clearTelemetry();
    loadTelemetry();
  });

  it("空局不炸，全零", () => {
    const r = summarize();
    expect(r.minutes).toBe(0);
    expect(r.days).toBe(0);
    expect(r.lostRate).toBe(0);
  });

  it("同一天跑 3 分钟：碗数取当天最后累计值，不翻 3 倍", () => {
    recordSample(fake(1, 1, 0, 0, 0), 60);
    recordSample(fake(1, 1, 1, 1, 0), 60);
    recordSample(fake(1, 1, 2, 2, 1), 60);
    const r = summarize();
    expect(r.minutes).toBe(3);
    expect(r.days).toBe(1);
    expect(r.bowls).toBe(2);
    expect(r.lost).toBe(1);
    expect(r.lostRate).toBeCloseTo(1 / 3, 5);
  });

  it("跨天：两天各算一次，累计值相加而不是按分钟相加", () => {
    recordSample(fake(1, 1, 119, 40, 10), 60);
    recordSample(fake(1, 2, 0, 0, 0), 60);
    recordSample(fake(1, 2, 119, 35, 5), 60);
    const r = summarize();
    expect(r.days).toBe(2);
    expect(r.bowls).toBe(75);
    expect(r.lost).toBe(15);
    expect(getDays()).toHaveLength(2);
  });

  it("自动落盘：刷新后最多丢最近 4 分钟，其余仍在", () => {
    for (let i = 0; i < 25; i += 1) recordSample(fake(1, 1, i, i, 0), 60);
    const before = summarize();
    // 模拟刷新：loadTelemetry 会用 localStorage 里的内容覆盖内存
    loadTelemetry();
    const after = summarize();
    expect(before.minutes).toBe(25);
    // 每 5 个采样落一次盘，所以最多丢 4 分钟；不丢是不可能的，丢 20 分钟才是 bug
    expect(after.minutes).toBeGreaterThanOrEqual(21);
    expect(after.minutes).toBeLessThanOrEqual(25);
    expect(after.bowls).toBeGreaterThanOrEqual(before.bowls - 4);
  });

  it("细节环最多留 600 分钟，但日聚合全程保留", () => {
    for (let i = 0; i < 900; i += 1) {
      const day = 1 + Math.floor(i / 120);
      const minute = i % 120;
      recordSample(fake(1, day, minute, i % 120, 0), 60);
    }
    expect(getSamples().length).toBe(600);
    expect(summarize().minutes).toBe(900);
  });

  it("均价与味道按样本权重平均", () => {
    recordSample(fake(1, 1, 0, 1, 0, 9), 40);
    recordSample(fake(1, 1, 1, 2, 0, 11), 80);
    const r = summarize();
    expect(r.avgPrice).toBe(10);
    expect(r.avgTaste).toBe(60);
  });

  it("流失原因是粘的：一句话不会按分钟被数几百次，只按流失人数计", () => {
    const g = (minute: number, lost: number, reason: string | null) => {
      const s = fake(1, 1, minute, 10, lost);
      (s.flow as unknown as { lastLostReason: string | null }).lastLostReason = reason;
      return s;
    };
    recordSample(g(0, 1, "嫌贵"), 60);
    recordSample(g(1, 1, "嫌贵"), 60);
    recordSample(g(2, 3, "嫌贵"), 60);
    recordSample(g(3, 4, "等太久"), 60);
    const r = summarize();
    expect(r.lost).toBe(4);
    expect(r.lostReasons[0]).toEqual({ reason: "嫌贵", count: 3 });
    expect(r.lostReasons[1]).toEqual({ reason: "等太久", count: 1 });
  });
});


