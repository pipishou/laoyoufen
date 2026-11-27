import { describe, expect, it } from "vitest";

import { INVESTS } from "../data/invest";
import { UNLOCKS } from "../data/unlocks";
import {
  INVEST_BASE_SLOTS,
  activeInvests,
  buyInvest,
  cancelInvest,
  investSlots,
  investSlotsLeft,
  investSlotsWords,
  investSummary,
  investViews,
  investWords,
} from "./invest";
import { createInitialState, type GameState } from "./state";

/**
 * 批 BC′（解 GAP 四轮 D 条）：门路位随段位长。
 *
 * 开罗 `rank.txt` 第 16 行 `More Investments`「Invest in more things at once.」——
 * 涨的是**同时能挂几条**。本作用段位给：第 5 段 2 → 3、第 8 段 3 → 4。
 *
 * 判据（`docs/GAP四轮-2026-11-26.md` 第五节 BC′）：
 * ① 投资位数量在面板可读；
 * ② 超位时按钮写「先撤一条」，且**不扣钱**。
 */

const newState = (grade = 0): GameState => {
  const s = createInitialState("invest-slots", 5);
  s.cash = 100_000;
  s.gradeLevel = grade;
  return s;
};

describe("批 BC′：门路位随段位长", () => {
  it("两位起，第 5 段三位，第 8 段四位（中间阶段不再动）", () => {
    expect(INVEST_BASE_SLOTS).toBe(2);
    const want: Array<[number, number]> = [
      [0, 2],
      [4, 2],
      [5, 3],
      [7, 3],
      [8, 4],
      [11, 4],
    ];
    for (const [grade, slots] of want) {
      expect(investSlots(newState(grade))).toBe(slots);
    }
  });

  it("那两个门槛是解锁表里的条目，不是散在代码里的数字", () => {
    const byId = new Map(UNLOCKS.map((u) => [u.id, u]));
    expect(byId.get("invest3")?.grade).toBe(5);
    expect(byId.get("invest4")?.grade).toBe(8);
    // 两条都要「真的接进模拟」：pending 了就等于又写了个假承诺
    expect(byId.get("invest3")?.pending).toBeUndefined();
    expect(byId.get("invest4")?.pending).toBeUndefined();
    expect(byId.get("invest3")?.effect).toContain("2 → 3");
    expect(byId.get("invest4")?.effect).toContain("3 → 4");
  });

  it("位子数写在抬头里（判据①：面板可读）", () => {
    const s = newState(0);
    expect(investSlotsWords(s)).toBe("0 / 2 位");
    expect(investSummary(s)).toBe("今天还没走门路 · 0 / 2 位");
    expect(investSlotsLeft(s)).toBe(2);
    expect(buyInvest(s, "supplier").ok).toBe(true);
    expect(investSlotsWords(s)).toBe("1 / 2 位");
    expect(investSummary(s)).toContain("1 / 2 位");
    expect(investSlotsLeft(s)).toBe(1);
  });

  it("满位时拒绝、写「先撤一条」、**一分钱都不扣**（判据②）", () => {
    const s = newState(0);
    expect(buyInvest(s, "supplier").ok).toBe(true);
    expect(buyInvest(s, "press").ok).toBe(true);
    expect(activeInvests(s)).toHaveLength(2);
    const cashBefore = s.cash;
    const r = buyInvest(s, "master");
    expect(r.ok).toBe(false);
    expect(r.reason).toContain("先撤一条");
    // 扣钱那一步在位子判定之后 —— 钱一分没动
    expect(s.cash).toBe(cashBefore);
    // 面板那一行也是「先撤一条」，而且说的是哪一条占着
    const view = investViews(s).find((v) => v.def.id === "master")!;
    expect(view.affordable).toBe(false);
    expect(view.reason).toContain("先撤一条");
    expect(view.reason).toContain("料商");
  });

  it("位子多了就买得下更多条：第 5 段三条并排", () => {
    const s = newState(5);
    expect(investSlots(s)).toBe(3);
    expect(buyInvest(s, "supplier").ok).toBe(true);
    expect(buyInvest(s, "press").ok).toBe(true);
    expect(buyInvest(s, "inspect_report").ok).toBe(true);
    expect(activeInvests(s)).toHaveLength(3);
    const r = buyInvest(s, "master");
    expect(r.ok).toBe(false);
    expect(r.reason).toContain("先撤一条");
  });

  it("撤一条：位子当天就空出来，钱不退（退钱就是刷钱漏洞）", () => {
    const s = newState(0);
    expect(buyInvest(s, "supplier").ok).toBe(true);
    expect(buyInvest(s, "press").ok).toBe(true);
    const cashAfterBuy = s.cash;

    const r = cancelInvest(s, "supplier");
    expect(r.ok).toBe(true);
    expect(r.line).toContain("撤了");
    expect(r.line).toContain("不退");
    // 撤掉不退款
    expect(s.cash).toBe(cashAfterBuy);
    expect(activeInvests(s).map((d) => d.id)).toEqual(["press"]);
    expect(investSlotsLeft(s)).toBe(1);

    // 同一天就能换一条进来
    expect(buyInvest(s, "master").ok).toBe(true);
    expect(activeInvests(s).map((d) => d.id)).toEqual(["master", "press"]);
  });

  it("撤一条的两条拒绝路径都说人话", () => {
    const s = newState(0);
    expect(cancelInvest(s, "supplier").reason).toContain("本来就没在走");
    expect(cancelInvest(s, "nope").reason).toContain("没有这条门路");
    buyInvest(s, "supplier");
    s.investments = { supplier: 0 };
    expect(cancelInvest(s, "supplier").reason).toContain("本来就没在走");
  });

  it("门路表本身没被位子改动：还是十条，一条都没删", () => {
    expect(INVESTS).toHaveLength(10);
    for (const d of INVESTS) expect(investWords(d).length).toBeGreaterThan(0);
  });
});
