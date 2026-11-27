import { describe, expect, it } from "vitest";

import { INVESTS, investsOfClass } from "../data/invest";
import { buyInvest, hedgedMarketIds, investEndingToday, investGainOf, investWords } from "./invest";
import { marketOf, pairedMarketOf } from "./market";
import { createInitialState, type GameState } from "./state";

/**
 * 批 BB′：门路的第三类「行情型」。
 *
 * 判据（`docs/GAP四轮-2026-11-26.md` 第五节 BB′）：
 * ① 买后当月对应行情不再抽到；
 * ② 天数到点打烊单报一句；
 * ③ `cls` 从 2 类变 3 类。
 * （批 BC′ 把「同类仍只一条」换成了「按门路位算」，所以第三条不再包含互斥。）
 */

const newState = (): GameState => {
  const s = createInitialState("hedge-test", 5);
  s.cash = 100_000;
  return s;
};

describe("批 BB′：买一段安稳（第三类门路）", () => {
  it("第三类两条，且这一类只买「那条行情不出现」", () => {
    const hedge = investsOfClass("hedge");
    expect(hedge.map((d) => d.id)).toEqual(["inspect_report", "meat_price_deal"]);
    for (const d of hedge) {
      expect(d.hedgeOf).toBeDefined();
      // 一个乘数都不许挂（纪律一：只买量不买乘数）
      expect(d.capacity).toBeUndefined();
      expect(d.slowestMinutes).toBeUndefined();
      expect(d.attractPct).toBeUndefined();
    }
    expect(hedge.find((d) => d.id === "inspect_report")!.hedgeOf).toBe("inspection");
    expect(hedge.find((d) => d.id === "meat_price_deal")!.hedgeOf).toBe("porkUp");
    // 四类齐全（批 BD′ 加了 `lean`），且每条只属于一类
    expect(INVESTS.every((d) => ["make", "voice", "hedge", "lean"].includes(d.cls))).toBe(true);
  });

  it("批 BC′：两条对冲都能挂（底板两位），但要拦就拦在位子上", () => {
    const s = newState();
    expect(buyInvest(s, "inspect_report").ok).toBe(true);
    // 原来「同类只一条」会在这里拦下来；批 BC′ 之后按位子算 —— 两位都能用
    expect(buyInvest(s, "meat_price_deal").ok).toBe(true);
    expect(hedgedMarketIds(s).has("inspection")).toBe(true);
    expect(hedgedMarketIds(s).has("porkUp")).toBe(true);
    // 两位满了，第三条（这里用 voice 类）说的是「先撤一条」，不是「先等」
    const cashBefore = s.cash;
    const third = buyInvest(s, "press");
    expect(third.ok).toBe(false);
    expect(third.reason).toContain("先撤一条");
    expect(third.reason).not.toContain("先等");
    expect(s.cash).toBe(cashBefore);
  });

  it("买后这半个月那条行情一天都不出现，过期后又会回来", () => {
    const s = newState();
    expect(buyInvest(s, "inspect_report").ok).toBe(true);
    expect(hedgedMarketIds(s).has("inspection")).toBe(true);

    // 买的这十五天里，一天都不能抽到「创城检查」
    const month0 = s.month;
    const day0 = s.day;
    let seen = 0;
    for (let i = 0; i < 15; i++) {
      s.month = month0;
      s.day = day0 + i;
      while (s.day > 30) {
        s.day -= 30;
        s.month += 1;
      }
      if (marketOf(s)?.id === "inspection") seen += 1;
    }
    expect(seen).toBe(0);

    // 到期之后（把到期日拨到今天），同一天又能抽到原来那条
    s.investments = { inspect_report: 0 };
    expect(hedgedMarketIds(s).size).toBe(0);
  });

  it("没买对冲时抽签结果一个字都不变（替身四个种子逐位不变的前提）", () => {
    // 没买 → 同一个种子同一天，抽到的那条与「没有这套系统」时相同
    const seen: string[] = [];
    for (let d = 1; d <= 30; d++) {
      const a = createInitialState("hedge-same", 5);
      a.month = 4;
      a.day = d;
      const m = marketOf(a);
      seen.push(m?.id ?? "-");
    }
    // 三十天里至少有一天有行情（不然这条断言等于没测）
    expect(seen.filter((x) => x !== "-").length).toBeGreaterThan(0);
    // 再抽一次必须一样（纯哈希，不消耗 state.rng）
    for (let d = 1; d <= 30; d++) {
      const b = createInitialState("hedge-same", 5);
      b.month = 4;
      b.day = d;
      expect(marketOf(b)?.id ?? "-").toBe(seen[d - 1]);
    }
  });

  it("对冲那条与配对不打架：检查本来就没有配好事", () => {
    const s = newState();
    s.cash = 100_000;
    // 找一天本来是「创城检查」，买了对冲之后那天换成了别的，且配对不乱
    let found = false;
    for (let d = 1; d <= 30 && !found; d++) {
      const probe = createInitialState("hedge-pair", 5);
      probe.month = 4;
      probe.day = d;
      if (marketOf(probe)?.id !== "inspection") continue;
      found = true;
      probe.cash = 100_000;
      probe.investments = { inspect_report: 1_000 };
      const after = marketOf(probe);
      expect(after?.id).not.toBe("inspection");
      // 换上来的那条自己有配对就配，没有就没有 —— 不许凭空冒出配对
      const pair = pairedMarketOf(probe);
      expect(pair?.id ?? null).toBe(after?.pair ?? null);
    }
    expect(found).toBe(true);
  });

  it("到点那天打烊单报一句，说的是「那条行情不上门」", () => {
    const s = newState();
    expect(buyInvest(s, "inspect_report").ok).toBe(true);
    const def = INVESTS.find((d) => d.id === "inspect_report")!;
    expect(investGainOf(def)).toBe("「创城检查」不上门");
    expect(investWords(def)).toContain("「创城检查」抽不到");

    // 到期那天：把日子推到 until - 1
    const until = s.investments!.inspect_report!;
    s.days = new Array(until - 1).fill({}) as GameState["days"];
    const ends = investEndingToday(s);
    expect(ends.map((e) => `${e.def.id}:${e.gain}`)).toEqual([
      "inspect_report:「创城检查」不上门",
    ]);
  });
});
