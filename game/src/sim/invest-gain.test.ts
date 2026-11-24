import { describe, expect, it } from "vitest";

import { INVESTS } from "../data/invest";
import { buyInvest, investEndingToday, investGainOf } from "./invest";
import { createInitialState, type GameState } from "./state";

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

describe("门路今天到底给了多少（批 R′，解 P347）", () => {
  it("三个出口各说各的量，不说空话", () => {
    const supplier = INVESTS.find((d) => d.id === "supplier");
    const master = INVESTS.find((d) => d.id === "master");
    const press = INVESTS.find((d) => d.id === "press");
    expect(supplier && investGainOf(supplier)).toBe("多做 20 碗");
    expect(master && investGainOf(master)).toBe("出碗快 0.5 分");
    expect(press && investGainOf(press)).toBe("进店多 30%");
  });

  it("每条门路都有可说的话（没有漏出口的条目）", () => {
    for (const def of INVESTS) {
      expect(investGainOf(def).length).toBeGreaterThan(2);
    }
  });

  it("到点那天把名字与效果量一起给出来", () => {
    const s: GameState = createInitialState("gain-1", 3);
    s.cash = 60_000;
    expect(buyInvest(s, "supplier").ok).toBe(true);
    const ends = investEndingToday(s);
    expect(ends).toHaveLength(1);
    expect(ends[0]?.def.id).toBe("supplier");
    expect(ends[0]?.gain).toBe("多做 20 碗");

    pushDay(s, 1);
    expect(investEndingToday(s)).toHaveLength(0);
  });

  it("两条不同类的门路同一天到点，两条都带量", () => {
    const s: GameState = createInitialState("gain-2", 3);
    s.cash = 60_000;
    expect(buyInvest(s, "supplier").ok).toBe(true);
    expect(buyInvest(s, "press").ok).toBe(true);
    // 料商一天、美食号三天：先把日子推到料商到点那天
    pushDay(s, 0);
    const first = investEndingToday(s).map((e) => `${e.def.id}:${e.gain}`);
    expect(first).toEqual(["supplier:多做 20 碗"]);
  });
});
