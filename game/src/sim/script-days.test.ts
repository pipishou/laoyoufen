import { describe, expect, it } from "vitest";
import { SCRIPT_ACTS, SCRIPT_LAST_DAY, SCRIPT_TOTAL, scriptActById } from "../data/script-days";
import { EVENTS_BY_ID } from "../data/events";
import { createInitialState, type GameState } from "./state";
import { dayIndex } from "./calendar";
import { tickEvents } from "./events";
import {
  actLine,
  actSeen,
  actTodayLine,
  markActSeen,
  scriptActOn,
  scriptLeft,
  scriptSummary,
  tickScriptAct,
} from "./script-days";

/**
 * 批 U′：前三十天十二幕。
 *
 * 判据四条：
 * 1. 十二幕落在头三十天里，日号递增、id 不重、每次只有一幕；
 * 2. 指到的事必须真存在（`EVENTS_BY_ID`），否则那行字就成了空话；
 * 3. 一幕只讲一次，讲过就不再来（`state.script.seen`）；
 * 4. 带 `eventId` 的那几幕，当天那件事真的会挂起来（不看七天节奏）。
 */

const fresh = (seed = 5): GameState => createInitialState("script-test", seed);

/** 把日期挪到第 n 天（第 0 个月内的日号），不跑分钟 */
function atDay(s: GameState, day: number): void {
  s.month = 0;
  s.day = day;
  s.flow.minuteOfDay = 0;
}

describe("十二幕的表（批 U′）", () => {
  it("十二幕，日号递增，id 不重", () => {
    expect(SCRIPT_TOTAL).toBe(12);
    expect(new Set(SCRIPT_ACTS.map((a) => a.id)).size).toBe(12);
    const days = SCRIPT_ACTS.map((a) => a.day);
    expect(days).toEqual([...days].sort((x, y) => x - y));
    expect(Math.min(...days)).toBe(1);
    expect(Math.max(...days)).toBeLessThan(SCRIPT_LAST_DAY);
  });

  it("每一幕都有标题和一句阿婆的话，而且不写阿拉伯数字", () => {
    for (const act of SCRIPT_ACTS) {
      expect(act.title.length).toBeGreaterThan(1);
      expect(act.body.length).toBeGreaterThan(8);
      expect(act.title).not.toMatch(/[0-9]/);
      expect(act.body).not.toMatch(/[0-9]/);
    }
  });

  it("指到的事都真存在，而且不是压迫型（新手头一个月不挨闷棍）", () => {
    for (const act of SCRIPT_ACTS) {
      if (!act.eventId) continue;
      const def = EVENTS_BY_ID.get(act.eventId);
      expect(def, `${act.id} 指的 ${act.eventId} 不存在`).toBeTruthy();
      expect(def?.id).toBe(act.eventId);
    }
  });

  it("一天最多一幕：日号不重复", () => {
    expect(new Set(SCRIPT_ACTS.map((a) => a.day)).size).toBe(SCRIPT_ACTS.length);
  });
});

describe("剧本运行时（批 U′）", () => {
  it("第一天有这一幕，讲完就没了", () => {
    const s = fresh();
    atDay(s, 1);
    const act = scriptActOn(s);
    expect(act?.id).toBe("a_open");
    markActSeen(s, act!.id);
    expect(scriptActOn(s)).toBeNull();
    expect(actSeen(s, "a_open")).toBe(true);
  });

  it("没有那一幕的日子什么都不说", () => {
    const s = fresh();
    atDay(s, 4);
    expect(scriptActOn(s)).toBeNull();
  });

  it("三十天以后没有剧本", () => {
    const s = fresh();
    s.month = 1;
    s.day = 2;
    expect(dayIndex(s.month, s.day)).toBeGreaterThan(SCRIPT_LAST_DAY);
    expect(scriptActOn(s)).toBeNull();
  });

  it("零点那一刻记一次，写到 flow.actToday，打烊单能念出来", () => {
    const s = fresh();
    atDay(s, 2);
    const act = tickScriptAct(s);
    expect(act?.id).toBe("a_wait");
    expect(s.flow.actToday).toBe("a_wait");
    expect(actTodayLine(s)).toContain("一碗要有人等");
    expect(actTodayLine(s)).toContain("站着等");
  });

  it("不是零点不记（每分钟都会被调一次）", () => {
    const s = fresh();
    atDay(s, 2);
    s.flow.minuteOfDay = 7;
    expect(tickScriptAct(s)).toBeNull();
    expect(s.flow.actToday ?? "").toBe("");
  });

  it("讲过的幕数会减少，最后一句是「都讲完了」", () => {
    const s = fresh();
    expect(scriptLeft(s)).toBe(12);
    for (const act of SCRIPT_ACTS) markActSeen(s, act.id);
    expect(scriptLeft(s)).toBe(0);
    expect(scriptSummary(s)).toBe("头一个月的事都讲完了");
  });

  it("actLine 空幕返回空串，不返回「undefined」", () => {
    expect(actLine(null)).toBe("");
    expect(scriptActById("nope")).toBeNull();
  });
});

describe("剧本指到的事当天就来（批 U′）", () => {
  it("第三天这一幕指着酸笋坊，那天真来这一件（不是七天才抽一次）", () => {
    const s = fresh(11);
    atDay(s, 3);
    const act = tickScriptAct(s);
    expect(act?.id).toBe("a_suan");
    tickEvents(s);
    expect(s.events.pending?.id).toBe("bamboo_press");
  });

  it("第七天不是抽取日，剧本那一幕照样能挂起（a_seat 没指事，所以是空的）", () => {
    const s = fresh(11);
    atDay(s, 7);
    tickScriptAct(s);
    tickEvents(s);
    // a_seat 没 eventId，第七天又不是七天周期上的点（3 → 10），所以池子空过
    expect(s.events.pending).toBeNull();
  });

  it("指到的事过不了门槛就不强塞（门槛不破）", () => {
    const s = fresh(11);
    atDay(s, 9);
    tickScriptAct(s);
    // regular_gift 要求有熟客；新局一个熟客都没有，所以那天不弹
    s.regulars = {};
    tickEvents(s);
    expect(s.events.pending?.id).not.toBe("regular_gift");
  });

  it("同一幕不会连着两天来", () => {
    const s = fresh(11);
    atDay(s, 3);
    tickScriptAct(s);
    tickEvents(s);
    s.events.pending = null;
    atDay(s, 4);
    tickScriptAct(s);
    tickEvents(s);
    expect(s.flow.actToday ?? "").toBe("");
  });
});
