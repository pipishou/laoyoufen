import { beforeEach, describe, expect, it } from "vitest";
import type { GameState } from "./state";
import {
  clearTelemetry,
  getDays,
  getSamples,
  loadTelemetry,
  LOSS_LABELS,
  recordSample,
  summarize,
  topLoss,
} from "./telemetry";

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
function fake(
  month: number,
  day: number,
  minute: number,
  served: number,
  lost: number,
  price = 9,
  split: { queue?: number; price?: number; wait?: number } = {},
): GameState {
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
      lostQueue: split.queue ?? 0,
      lostPrice: split.price ?? 0,
      lostWait: split.wait ?? 0,
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

  it("流失按三条来源分开记：队伍堵死的那天不会再被贴成「嫌贵」（P546）", () => {
    // 复刻线上那 236 天的形状：人走光了，但走的原因全是队满
    recordSample(fake(1, 1, 0, 10, 0, 9, { queue: 0, price: 0, wait: 0 }), 60);
    recordSample(fake(1, 1, 1, 12, 20, 9, { queue: 20, price: 0, wait: 0 }), 60);
    recordSample(fake(1, 1, 2, 14, 32, 9, { queue: 32, price: 0, wait: 0 }), 60);
    const r = summarize();
    expect(r.lost).toBe(32);
    expect(r.lostSplit).toEqual({ queue: 32, price: 0, wait: 0 });
    // 关键：不再有一条假的「看价牌走了」占榜首
    expect(r.lostReasons).toHaveLength(1);
    expect(r.lostReasons[0]).toEqual({ reason: LOSS_LABELS.queue, count: 32 });
    expect(topLoss(r.lostSplit)).toBe("queue");
  });

  it("三条来源各自独立：队满/嫌贵/等不及同一天都有时，账对得上、谁多谁说话", () => {
    recordSample(fake(1, 1, 0, 5, 0, 9, { queue: 0, price: 0, wait: 0 }), 60);
    recordSample(fake(1, 1, 1, 8, 6, 9, { queue: 2, price: 1, wait: 3 }), 60);
    recordSample(fake(1, 1, 2, 10, 10, 9, { queue: 3, price: 1, wait: 6 }), 60);
    const r = summarize();
    expect(r.lost).toBe(10);
    expect(r.lostSplit).toEqual({ queue: 3, price: 1, wait: 6 });
    // 三条加起来不超过总流失（同源，不许出现「原因比流失还多」）
    const sum = r.lostSplit.queue + r.lostSplit.price + r.lostSplit.wait;
    expect(sum).toBeLessThanOrEqual(r.lost);
    expect(topLoss(r.lostSplit)).toBe("wait");
    expect(r.lostReasons.map((x) => x.reason)).toEqual([
      LOSS_LABELS.wait,
      LOSS_LABELS.queue,
      LOSS_LABELS.price,
    ]);
  });

  it("流失计数是当日累计量：读档把 flow 清零时，日结不回退", () => {
    recordSample(fake(1, 1, 0, 0, 0, 9, { queue: 0, price: 0, wait: 0 }), 60);
    recordSample(fake(1, 1, 1, 5, 12, 9, { queue: 9, price: 2, wait: 1 }), 60);
    // 事件弹窗/读档把 flow 的当日计数清零，但日聚合必须留住已发生的数
    recordSample(fake(1, 1, 2, 5, 0, 9, { queue: 0, price: 0, wait: 0 }), 60);
    const d = getDays()[0];
    expect(d.lost).toBe(12);
    expect(d.lostQueue).toBe(9);
    expect(d.lostPrice).toBe(2);
    expect(d.lostWait).toBe(1);
  });

  it("老归档（没有三条计数、只有 reasons 字符串）读进来不炸，且从 0 起算", () => {
    (globalThis as unknown as { localStorage: MemStore }).localStorage.setItem(
      "laoyou.telemetry.v2",
      JSON.stringify({
        version: 2,
        today: null,
        samples: [],
        days: [
          {
            month: 1,
            day: 1,
            minutes: 120,
            bowls: 40,
            lost: 30,
            revenue: 400,
            priceSum: 120 * 9,
            priceCount: 120,
            tasteSum: 120 * 60,
            tasteCount: 120,
            seats: 2,
            peakWaiting: 12,
            // 旧结构：一句话 × 30
            reasons: { "学生仔看价牌走了（最便宜 ¥10 超预算 ¥8）": 30 },
          },
        ],
      }),
    );
    loadTelemetry();
    const r = summarize();
    expect(r.days).toBe(1);
    expect(r.lost).toBe(30);
    // 旧的那句假原因不再出现；三条从 0 起算，不产生 NaN
    expect(r.lostReasons).toEqual([]);
    expect(r.lostSplit).toEqual({ queue: 0, price: 0, wait: 0 });
  });

  it("三条全零时 topLoss 不抛、也不把责任推给价牌", () => {
    expect(topLoss({ queue: 0, price: 0, wait: 0 })).toBe("wait");
  });
});


