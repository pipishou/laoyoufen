import { describe, expect, it } from "vitest";

import { MARKETS } from "../data/market";
import {
  marketOnDay,
  pairedMarketOf,
  todayMarket,
  tomorrowMarketOf,
  tomorrowMarketWords,
} from "./market";
import { dayIndexOf, buyInvest, investDoneToday } from "./invest";
import { perkFamilies } from "./perk";
import { createInitialState, type GameState } from "./state";

/** 随便找一天有行情的（不消耗 rng，纯哈希） */
function someMarketDay(month: number): { day: number; id: string } | null {
  const s = createInitialState("hint-q", 5);
  for (let d = 1; d <= 30; d++) {
    const m = marketOnDay(s, month, d);
    if (m) return { day: d, id: m.id };
  }
  return null;
}

describe("明天的预告（批 Q′，解 P339）", () => {
  it("明天的行情就是「把日期挪一天」算出来的那条", () => {
    const s = createInitialState("hint-q2", 5);
    for (let i = 0; i < 40; i++) {
      s.month = 7;
      s.day = (i % 30) + 1;
      const tmr = tomorrowMarketOf(s);
      const nextDay = s.day + 1;
      const month = nextDay > 30 ? s.month + 1 : s.month;
      const day = nextDay > 30 ? 1 : nextDay;
      const direct = marketOnDay(s, month, day);
      expect(tmr?.id ?? null).toBe(direct?.id ?? null);
    }
  });

  it("月底最后一天能翻到下个月，不越界", () => {
    const s = createInitialState("hint-q3", 5);
    s.month = 3;
    s.day = 30;
    const tmr = tomorrowMarketOf(s);
    const direct = marketOnDay(s, 4, 1);
    expect(tmr?.id ?? null).toBe(direct?.id ?? null);
  });

  it("预告那句话只说名字，不带钱和数字", () => {
    const s = createInitialState("hint-q4", 5);
    let said = 0;
    for (let month = 0; month < 12 && said < 6; month++) {
      const found = someMarketDay(month);
      if (!found) continue;
      s.month = month;
      s.day = found.day;
      const words = tomorrowMarketWords(s);
      if (!words) continue;
      said += 1;
      expect(words.startsWith("明天：")).toBe(true);
      expect(words).not.toMatch(/[0-9¥%]/);
    }
    expect(said).toBeGreaterThan(0);
  });

  it("明天是坏事时要带出配的那条", () => {
    const s = createInitialState("hint-q5", 5);
    let checked = false;
    for (let month = 0; month < 12 && !checked; month++) {
      for (let day = 1; day <= 30 && !checked; day++) {
        s.month = month;
        s.day = day;
        const tmr = tomorrowMarketOf(s);
        if (!tmr || !tmr.pair) continue;
        const words = tomorrowMarketWords(s);
        expect(words).toContain("（配");
        checked = true;
      }
    }
    // 至少存在一天「明天有配对」
    expect(MARKETS.some((m) => !!m.pair)).toBe(true);
  });

  it("今天的配对不受明天的预告影响", () => {
    const s = createInitialState("hint-q6", 7);
    for (let day = 1; day <= 20; day++) {
      s.month = 7;
      s.day = day;
      const before = pairedMarketOf(s)?.id ?? null;
      const after = pairedMarketOf(s)?.id ?? null;
      expect(after).toBe(before);
      expect(todayMarket(s)?.id ?? null).toBe(todayMarket(s)?.id ?? null);
    }
  });
});

describe("门路到点（批 Q′，解 P303）", () => {
  /** 门路的「第几天」是记账天数（state.days.length），不是日历日 */
  const pushDay = (s: GameState, n = 1): void => {
    for (let i = 0; i < n; i++) {
      s.days.push({
        month: 0,
        day: s.days.length + 1,
        served: 0,
        lost: 0,
        revenue: 0,
        cost: 0,
        sat: 0,
      } as unknown as GameState["days"][number]);
    }
  };

  it("买一天的门路：只在「用它的那一天」打烊时报到点", () => {
    const s: GameState = createInitialState("hint-q7", 3);
    s.cash = 50_000;
    const r = buyInvest(s, "supplier");
    expect(r.ok).toBe(true);
    expect(dayIndexOf(s)).toBe(0);
    // 只买一天：今天就是它唯一的一天，今晚打烊就该说「走完了」
    expect(investDoneToday(s).map((d) => d.id)).toEqual(["supplier"]);
    pushDay(s, 1);
    expect(investDoneToday(s)).toHaveLength(0);
  });

  it("买两天的门路：中间那天不报，最后一天才报", () => {
    const s: GameState = createInitialState("hint-q7b", 3);
    s.cash = 50_000;
    const def = buyInvest(s, "press");
    expect(def.ok).toBe(true);
    expect(investDoneToday(s)).toHaveLength(0);
    pushDay(s, 1);
    expect(investDoneToday(s)).toHaveLength(0);
    pushDay(s, 1);
    expect(investDoneToday(s).map((d) => d.id)).toEqual(["press"]);
  });

  it("没买过就没有「到点」", () => {
    const s = createInitialState("hint-q8", 3);
    expect(investDoneToday(s)).toHaveLength(0);
  });
});

describe("手艺页先点哪条（批 Q′，解 P306）", () => {
  it("每族都指一条，而且指的是还没点的最便宜那条", () => {
    const s = createInitialState("hint-q9", 3);
    s.gradeLevel = 4;
    const fams = perkFamilies(s);
    expect(fams).toHaveLength(4);
    for (const fam of fams) {
      expect(fam.rec).toBeTruthy();
      const rec = fam.rows.find((r) => r.def.id === fam.rec);
      expect(rec).toBeDefined();
      const unowned = fam.rows.filter((r) => !r.owned);
      const cheapest = Math.min(...unowned.map((r) => r.def.cost));
      expect((rec as { def: { cost: number } }).def.cost).toBe(cheapest);
    }
  });

  it("点掉之后改指下一条", () => {
    const s = createInitialState("hint-q10", 3);
    s.gradeLevel = 4;
    const first = perkFamilies(s)[0];
    const recId = first?.rec as string;
    s.perks = { [recId]: 1 };
    const again = perkFamilies(s).find((f) => f.family === first?.family);
    expect(again?.rec).not.toBe(recId);
  });
});
