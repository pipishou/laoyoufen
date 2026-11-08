import { describe, expect, it } from "vitest";
import { EVENTS, EVENTS_BY_ID } from "../data/events";
import { DAY_MINUTES } from "./customer";
import { dayIndex } from "./calendar";
import { eventEligible, resolveEvent } from "./events";
import { deserialize, serialize } from "./save";
import { advanceMinute, createInitialState, type GameState } from "./state";

/** 跑到第一次挂起事件为止；找不到就返回 null */
function firstPending(seed: number, maxMinutes = 4000): GameState | null {
  const s = createInitialState("player-evt", seed);
  for (let i = 0; i < maxMinutes; i++) {
    advanceMinute(s);
    if (s.events.pending) return s;
  }
  return null;
}

describe("事件脚本", () => {
  it("同种子的第一个事件完全一致（确定性）", () => {
    for (let seed = 0; seed < 30; seed++) {
      const a = firstPending(seed);
      const b = firstPending(seed);
      expect(b?.events.pending).toEqual(a?.events.pending ?? null);
      if (a && b) expect(b.events.log).toEqual(a.events.log);
    }
  });

  it("第 1 天抽第一件：每 7 天一个抽取点，不靠概率", () => {
    for (let seed = 0; seed < 20; seed++) expect(firstPending(seed)).not.toBeNull();
  });

  it("选完选项：pending 清空、计数 +1、写了日志", () => {
    const s = firstPending(3);
    expect(s).not.toBeNull();
    if (!s || !s.events.pending) return;
    const def = EVENTS_BY_ID.get(s.events.pending.id);
    expect(def).toBeDefined();
    if (!def) return;

    const before = s.cash;
    const result = resolveEvent(s, 0);
    expect(result).toBe(def.choices[0]?.result ?? null);
    expect(s.events.pending).toBeNull();
    expect(s.events.count).toBe(1);
    expect(s.events.seen).toContain(def.id);
    expect(s.events.log[0]?.title).toBe(def.title);
    // 选项不一定动现金（可能只加口碑/热潮），按声明的效果算期望
    const cashDelta = (def.choices[0]?.effects ?? []).reduce(
      (n, e) => n + (e.kind === "cash" ? e.amount : 0),
      0,
    );
    expect(s.cash).toBeCloseTo(before + cashDelta, 6);
  });

  it("越界下标不清空 pending，也不改状态", () => {
    const s = firstPending(5);
    if (!s || !s.events.pending) throw new Error("seed 5 没触发事件");
    const before = JSON.stringify(s.events);
    expect(resolveEvent(s, 99)).toBeNull();
    expect(JSON.stringify(s.events)).toBe(before);
  });

  it("冷却期内同一事件不再进池子", () => {
    const s = createInitialState("player-cd", 7);
    const def = EVENTS[0]!;
    s.events.lastFired[def.id] = 100;
    expect(eventEligible(s, def, 100 + def.cooldownDays - 1)).toBe(false);
    expect(eventEligible(s, def, 100 + def.cooldownDays)).toBe(true);
  });

  it("事件进度随存档往返", () => {
    const s = createInitialState("player-save", 11);
    s.events.pending = { id: "bamboo_press", absDay: 3 };
    s.events.lastFired.food_blogger = 2;
    s.events.seen.push("food_blogger");
    s.events.log.push({ day: 2, title: "美食博主探店", result: "视频爆了" });
    const back = deserialize(serialize(s));
    expect(back).not.toBeNull();
    expect(back?.events).toEqual(s.events);
  });

  it("每周最多一件：两次事件间隔不少于 7 天", () => {
    for (let seed = 0; seed < 8; seed++) {
      const s = createInitialState("player-weekly", seed);
      const days: number[] = [];
      for (let i = 0; i < DAY_MINUTES * 60; i++) {
        advanceMinute(s);
        if (!s.events.pending) continue;
        days.push(dayIndex(s.month, s.day));
        resolveEvent(s, 0);
      }
      for (let i = 1; i < days.length; i++) {
        expect(days[i]! - days[i - 1]!, `第 ${i} 次间隔不足 7 天`).toBeGreaterThanOrEqual(7);
      }
      // 60 天里有 9 个抽取点（第 1/8/15/…/57 天），池子够用就该基本全中
      expect(days.length).toBeGreaterThanOrEqual(7);
      expect(days.length).toBeLessThanOrEqual(10);
    }
  });

  it("弹窗停表：pending 未处理时分钟数不推进", () => {
    const s = createInitialState("player-pause", 1);
    s.events.pending = { id: "bamboo_press", absDay: dayIndex(s.month, s.day) };
    const before = s.flow.minuteOfDay;
    for (let i = 0; i < 10; i++) advanceMinute(s);
    expect(s.flow.minuteOfDay).toBe(before);
    expect(s.todayCustomers).toBe(0);
  });

  it("月份窗口是硬过滤：台风只在 7-9 月进池", () => {
    const s = createInitialState("player-season", 1);
    const typhoon = EVENTS_BY_ID.get("typhoon");
    expect(typhoon).toBeDefined();
    if (!typhoon) return;
    s.month = 0;
    expect(eventEligible(s, typhoon, 100)).toBe(false);
    s.month = 6;
    expect(eventEligible(s, typhoon, 100)).toBe(true);
  });
});
