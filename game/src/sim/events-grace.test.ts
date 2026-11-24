import { describe, expect, it } from "vitest";

import { EVENTS, EVENTS_BY_ID, type GameEventDef } from "../data/events";
import {
  EVENT_START_ABS_DAY,
  PRESSURE_COST,
  PRESSURE_GAP,
  PRESSURE_MIN_DAY,
  eventEligible,
  isPressureEvent,
  resolveEvent,
  tickEvents,
} from "./events";
import { createInitialState, type GameState } from "./state";

/** 把状态挪到某一天零点，然后抽一次事件（直接调 tickEvents，不跑分钟） */
function rollAt(state: GameState, absDay: number): GameEventDef | null {
  state.month = Math.floor(absDay / 30);
  state.day = (absDay % 30) + 1;
  state.flow.minuteOfDay = 0;
  state.events.rolledDay = -1;
  state.events.pending = null;
  tickEvents(state);
  const pending = state.events.pending as { id: string; absDay: number } | null;
  if (!pending) return null;
  return EVENTS_BY_ID.get(pending.id) ?? null;
}

describe("前一个月的体面（批 C″，解 P325）", () => {
  it("压迫型是算出来的：每条选项都要掏钱，最便宜那条也得一百元以上", () => {
    const pressure = EVENTS.filter((e) => isPressureEvent(e));
    expect(pressure.length).toBe(25);
    for (const def of pressure) {
      const cash = def.choices.flatMap((c) =>
        c.effects.filter((x) => x.kind === "cash").map((x) => x.amount ?? 0),
      );
      expect(cash.length).toBeGreaterThan(0);
      expect(cash.some((a) => a >= 0)).toBe(false);
      expect(Math.abs(Math.max(...cash))).toBeGreaterThanOrEqual(PRESSURE_COST);
    }
  });

  it("好事不会被误判成压迫型", () => {
    const free: GameEventDef[] = EVENTS.filter((e: GameEventDef) =>
      e.choices.some((c) => c.effects.some((x) => x.kind === "cash" && (x.amount ?? 0) >= 0)),
    );
    expect(free.length).toBeGreaterThan(10);
    for (const def of free) expect(isPressureEvent(def)).toBe(false);
  });

  it("kind 可以手动摘出来，也可以硬标进去", () => {
    const three = EVENTS_BY_ID.get("rival_shop") as GameEventDef;
    expect(isPressureEvent(three)).toBe(true);
    expect(isPressureEvent({ ...three, kind: "plain" })).toBe(false);

    const good = EVENTS_BY_ID.get("cane_season") as GameEventDef;
    expect(isPressureEvent({ ...good, kind: "pressure" })).toBe(true);
  });

  it("前三十天：压迫型一条都进不了池子", () => {
    const s = createInitialState("player-grace", 5);
    for (let abs = EVENT_START_ABS_DAY; abs < PRESSURE_MIN_DAY; abs++) {
      for (const def of EVENTS) {
        if (!isPressureEvent(def)) continue;
        expect(eventEligible(s, def, abs)).toBe(false);
      }
    }
  });

  it("满一个月以后，压迫型才有机会露面", () => {
    const s = createInitialState("player-grace2", 9);
    let seen = false;
    for (let abs = PRESSURE_MIN_DAY; abs < PRESSURE_MIN_DAY + 420 && !seen; abs++) {
      s.month = Math.floor(abs / 30);
      s.day = (abs % 30) + 1;
      for (const def of EVENTS) {
        if (!isPressureEvent(def)) continue;
        if (eventEligible(s, def, abs)) seen = true;
      }
    }
    expect(seen).toBe(true);
  });

  it("三十天里抽到的每一件都不是压迫型", () => {
    for (const seed of [1, 3, 7, 11]) {
      const s = createInitialState(`player-quiet-${seed}`, seed);
      for (let abs = EVENT_START_ABS_DAY; abs < PRESSURE_MIN_DAY; abs++) {
        const def = rollAt(s, abs);
        if (!def) continue;
        expect(isPressureEvent(def)).toBe(false);
        resolveEvent(s, 0);
      }
    }
  });

  it("两条压迫型之间至少隔三周", () => {
    const s = createInitialState("player-gap", 13);
    const days: number[] = [];
    for (let abs = EVENT_START_ABS_DAY; abs < EVENT_START_ABS_DAY + 120 * 7; abs++) {
      if ((abs - EVENT_START_ABS_DAY) % 7 !== 0) continue;
      const def = rollAt(s, abs);
      if (!def) continue;
      if (isPressureEvent(def)) days.push(abs);
      resolveEvent(s, 0);
    }
    expect(days.length).toBeGreaterThan(0);
    for (let i = 1; i < days.length; i++) {
      expect((days[i] as number) - (days[i - 1] as number)).toBeGreaterThanOrEqual(PRESSURE_GAP);
    }
  });

  it("抽完记下这一件是哪一型、哪一天", () => {
    const s = createInitialState("player-kind", 17);
    const abs = EVENT_START_ABS_DAY;
    const def = rollAt(s, abs);
    expect(def).not.toBeNull();
    expect(s.events.lastKind).toBe(isPressureEvent(def as GameEventDef) ? "pressure" : "plain");
    expect(s.events.lastKindDay).toBe(abs);
  });
});
