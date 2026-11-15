import { describe, expect, it } from "vitest";
import {
  absMinuteOf,
  FRENZY_MAX,
  FRENZY_MINUTES,
  FRENZY_PER_MINUTE,
  frenzyActive,
  frenzyAura,
  frenzyBudgetBoost,
  frenzyLeftMinutes,
  frenzySpawnBoost,
  frenzyTick,
} from "./frenzy";
import { createInitialState } from "./state";

function fresh() {
  const s = createInitialState("frenzy-test", 2026);
  s.phase = "prep";
  return s;
}

describe("热卖槽（开罗 Ramen Frenzy）", () => {
  it("新局没在热卖：倍率都是中性、剩余 0 分钟", () => {
    const s = fresh();
    expect(s.frenzy).toEqual({ gauge: 0, until: -1, restUntil: -1, count: 0 });
    expect(frenzyActive(s)).toBe(false);
    expect(frenzySpawnBoost(s)).toBe(1);
    expect(frenzyBudgetBoost(s)).toBe(1);
    expect(frenzyAura(s)).toBe(0);
    expect(frenzyLeftMinutes(s)).toBe(0);
  });

  it("有人排队且今天吃得满意才涨槽；没人排或不好吃就回落", () => {
    const s = fresh();
    frenzyTick(s, 2, 70);
    expect(s.frenzy.gauge).toBe(FRENZY_PER_MINUTE);

    frenzyTick(s, 0, 70); // 没排队
    expect(s.frenzy.gauge).toBe(FRENZY_PER_MINUTE - 2);

    frenzyTick(s, 2, 40); // 有人在排但不好吃
    expect(s.frenzy.gauge).toBeLessThan(FRENZY_PER_MINUTE);

    frenzyTick(s, 0, 0);
    frenzyTick(s, 0, 0);
    expect(s.frenzy.gauge).toBe(0); // 不会掉成负数
  });

  it("槽涨满就触发热卖：30 分钟内来客翻倍、钱包 +15%、aura +4", () => {
    const s = fresh();
    let triggered = 0;
    for (let i = 0; i < FRENZY_MAX / FRENZY_PER_MINUTE; i++) {
      if (frenzyTick(s, 3, 80).triggered) triggered += 1;
    }
    expect(triggered).toBe(1);
    expect(s.frenzy.count).toBe(1);
    expect(s.frenzy.gauge).toBe(0);
    expect(frenzyActive(s)).toBe(true);
    expect(frenzyLeftMinutes(s)).toBe(FRENZY_MINUTES);
    expect(frenzySpawnBoost(s)).toBe(2);
    expect(frenzyBudgetBoost(s)).toBeCloseTo(1.15, 6);
    expect(frenzyAura(s)).toBe(4);
  });

  it("热卖期间槽不动；结束之后进入冷却，冷却完才继续涨", () => {
    const s = fresh();
    s.frenzy.until = absMinuteOf(s) + 10;
    const before = s.frenzy.gauge;
    frenzyTick(s, 5, 90);
    expect(s.frenzy.gauge).toBe(before);
    expect(frenzyActive(s)).toBe(true);

    s.frenzy.until = absMinuteOf(s); // 热卖结束
    s.frenzy.restUntil = absMinuteOf(s) + 60; // 还在冷却
    expect(frenzyActive(s)).toBe(false);
    frenzyTick(s, 5, 90);
    expect(s.frenzy.gauge).toBe(before); // 冷却期不涨

    s.frenzy.restUntil = absMinuteOf(s); // 冷却结束
    frenzyTick(s, 5, 90);
    expect(s.frenzy.gauge).toBe(before + FRENZY_PER_MINUTE);
  });

  it("绝对分钟跨日跨月连续：第 1 天 0 分 < 第 1 天 120 分 = 第 2 天 0 分", () => {
    const s = fresh();
    s.month = 1;
    s.day = 1;
    s.flow.minuteOfDay = 0;
    const a = absMinuteOf(s);
    s.flow.minuteOfDay = 120;
    const b = absMinuteOf(s);
    s.day = 2;
    s.flow.minuteOfDay = 0;
    const c = absMinuteOf(s);
    expect(b).toBe(c); // 跨日连续
    expect(b - a).toBe(120);
    s.month = 2;
    s.day = 1;
    expect(absMinuteOf(s)).toBeGreaterThan(c); // 跨月继续涨
  });
});
