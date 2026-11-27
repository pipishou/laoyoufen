import { describe, expect, it } from "vitest";

import { INVESTS, investsOfClass } from "../data/invest";
import {
  buyInvest,
  investEndingToday,
  investGainOf,
  investWords,
  leanedMarketIds,
} from "./invest";
import { marketOf } from "./market";
import { createInitialState, type GameState } from "./state";

/**
 * 批 BD′：门路的第四类「行情型·趁势」（买一段好行情）。
 *
 * 判据（`docs/GAP四轮-2026-11-26.md` 第四节 B 条的另一半 + 第五节 BC′ 之后留下的
 * 「只做了挡坏事、没做趁势」）：
 * ① 买后这几天，**本来有行情的日子**抽到的一定是那条好行情；
 * ② 本来没行情的日子不会被凭空造出一天行情（那是加天数，不是换行情）；
 * ③ 天数到点，打烊单报一句；
 * ④ 这一类和 `hedge` 一样，一个乘数都不挂（纪律一 / P154）。
 */

const newState = (seed = "lean-test"): GameState => {
  const s = createInitialState(seed, 5);
  s.cash = 100_000;
  return s;
};

/** 把第 i 天摆到 `state` 上（不推进 days，只看抽签结果） */
function setDay(s: GameState, month: number, day: number): void {
  s.month = month;
  s.day = day;
}

describe("批 BD′：买一段好行情（第四类门路）", () => {
  it("这一类两条，且这一条只买「那条好行情一定来」", () => {
    const lean = investsOfClass("lean");
    expect(lean.map((d) => d.id)).toEqual(["stall_at_market", "wage_day_spread"]);
    for (const d of lean) {
      expect(d.leanOn).toBeDefined();
      // 与对冲同一条纪律：不许挂任何乘数
      expect(d.capacity).toBeUndefined();
      expect(d.slowestMinutes).toBeUndefined();
      expect(d.attractPct).toBeUndefined();
      expect(d.hedgeOf).toBeUndefined();
    }
    expect(lean.find((d) => d.id === "stall_at_market")!.leanOn).toBe("marketRush");
    expect(lean.find((d) => d.id === "wage_day_spread")!.leanOn).toBe("payday");
    // 四条数据互不相干：挡坏的与叫好的不许撞在同一条行情上
    const hedged = INVESTS.filter((d) => d.hedgeOf).map((d) => d.hedgeOf);
    for (const d of lean) expect(hedged).not.toContain(d.leanOn);
  });

  it("买了趁势：本来有行情的日子，抽到的一定是那条（而且是「一定来」）", () => {
    const s = newState("lean-same");
    expect(buyInvest(s, "stall_at_market").ok).toBe(true);
    expect(leanedMarketIds(s).has("marketRush")).toBe(true);

    let withMarket = 0;
    let wrong = 0;
    for (let d = 1; d <= 30; d++) {
      setDay(s, 4, d);
      const m = marketOf(s);
      if (!m) continue;
      withMarket += 1;
      if (m.id !== "marketRush") wrong += 1;
    }
    // 三十天里总得有几天本来就有行情，不然这条断言等于没测
    expect(withMarket).toBeGreaterThan(0);
    expect(wrong).toBe(0);
  });

  it("本来没行情的日子不会被凭空造出一天（趁势是换行情，不是加天数）", () => {
    const base = newState("lean-gate");
    const bought = newState("lean-gate");
    expect(buyInvest(bought, "stall_at_market").ok).toBe(true);
    for (let d = 1; d <= 30; d++) {
      setDay(base, 4, d);
      setDay(bought, 4, d);
      const wasEmpty = marketOf(base) === null;
      if (wasEmpty) expect(marketOf(bought)).toBeNull();
    }
  });

  it("没买趁势时抽签结果一个字都不变（替身四个种子逐位不变的前提）", () => {
    const seen: string[] = [];
    for (let d = 1; d <= 30; d++) {
      const a = createInitialState("lean-plain", 5);
      setDay(a, 4, d);
      seen.push(marketOf(a)?.id ?? "-");
    }
    expect(seen.filter((x) => x !== "-").length).toBeGreaterThan(0);
    for (let d = 1; d <= 30; d++) {
      const b = createInitialState("lean-plain", 5);
      setDay(b, 4, d);
      expect(marketOf(b)?.id ?? "-").toBe(seen[d - 1]);
    }
  });

  it("两条趁势各管各的：买了发薪日不会把圩日也改成发薪日", () => {
    const s = newState("lean-two");
    expect(buyInvest(s, "wage_day_spread").ok).toBe(true);
    expect(leanedMarketIds(s).has("payday")).toBe(true);
    expect(leanedMarketIds(s).has("marketRush")).toBe(false);

    let wrong = 0;
    for (let d = 1; d <= 30; d++) {
      setDay(s, 6, d);
      const m = marketOf(s);
      if (m && m.id !== "payday") wrong += 1;
    }
    expect(wrong).toBe(0);
  });

  it("到点那天打烊单报一句，说的是「那条好行情一定来」", () => {
    const s = newState("lean-end");
    expect(buyInvest(s, "stall_at_market").ok).toBe(true);
    const def = INVESTS.find((d) => d.id === "stall_at_market")!;
    expect(investGainOf(def)).toBe("「赶圩日」一定会来");
    expect(investWords(def)).toContain("「赶圩日」一定来");

    const until = s.investments!.stall_at_market!;
    s.days = new Array(until - 1).fill({}) as GameState["days"];
    const ends = investEndingToday(s);
    expect(ends.map((e) => `${e.def.id}:${e.gain}`)).toEqual([
      "stall_at_market:「赶圩日」一定会来",
    ]);
    // 到期那天仍然算一天（打烊单说的是「今天用完」），所以那天还在摁着
    expect(leanedMarketIds(s).has("marketRush")).toBe(true);
  });

  it("趁势过期之后，那条行情回到原来的抽签结果", () => {
    const plain = newState("lean-expire");
    const bought = newState("lean-expire");
    expect(buyInvest(bought, "stall_at_market").ok).toBe(true);
    // 把到期日拨到「今天之前」
    bought.investments = { stall_at_market: 0 };
    expect(leanedMarketIds(bought).size).toBe(0);
    for (let d = 1; d <= 30; d++) {
      setDay(plain, 4, d);
      setDay(bought, 4, d);
      expect(marketOf(bought)?.id ?? "-").toBe(marketOf(plain)?.id ?? "-");
    }
  });
});
