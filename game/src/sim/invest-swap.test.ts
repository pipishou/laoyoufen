import { describe, expect, it } from "vitest";

import { INVESTS } from "../data/invest";
import {
  activeInvests,
  buyInvest,
  cancelInvest,
  investSlots,
  investSlotsLeft,
  investViews,
  swapInvest,
} from "./invest";
import { createInitialState, type GameState } from "./state";

/**
 * 批 BE′（解 P505）：一步换掉一条门路。
 *
 * 批 BC′ 只给了「撤一条」+「买一条」两个动作，于是换一条门路是「撤 A → 位子空出来
 * → 买 B」：撤掉不退钱、买 B 再付一遍，换一次的代价是「付两趟钱」。
 * 开罗那边 `More Investments` 涨的只是「同时能投几条」，换一条本来就不该是
 * 一个要付两趟钱的操作。
 *
 * 判据（这一批自己定的，写进 `docs/一步换掉BE′-2026-11-27.md`）：
 * ① 一次点击同时撤旧、买新 —— 位子从头到尾不空；
 * ② 只扣**新那条**的价钱，旧的不退（它今天已经干了活）；
 * ③ 不该换的时候（旧的不在走 / 新的已在走 / 同一条 / 还有空位 / 钱不够）
 *    一律拒绝且**一分不扣**。
 */

const newState = (grade = 0): GameState => {
  const s = createInitialState("invest-swap", 5);
  s.cash = 100_000;
  s.gradeLevel = grade;
  return s;
};

const ids = (s: GameState): string[] => activeInvests(s).map((d) => d.id);

describe("批 BE′：一步换掉一条门路（解 P505）", () => {
  it("换一次只扣新那条的钱，位子从头到尾不空", () => {
    const s = newState(0);
    expect(buyInvest(s, "supplier").ok).toBe(true);
    expect(buyInvest(s, "press").ok).toBe(true);
    const cashBefore = s.cash;

    const r = swapInvest(s, "supplier", "master");
    expect(r.ok).toBe(true);
    expect(r.line).toContain("把「跟料商多留一筐」换成了「请老师傅来看一天」");
    expect(r.line).toContain("位子没空过");
    expect(r.line).toContain("不退");

    // 只扣 master 的 ¥120；supplier 的 ¥50 不退
    expect(s.cash).toBe(cashBefore - 120);
    expect(ids(s).sort()).toEqual(["master", "press"]);
    // 位子仍是满的两位 —— 中间没有「两条都不在」的时刻
    expect(investSlotsLeft(s)).toBe(0);
  });

  it("换来的那条从今天起算满它的天数（不是接着旧的剩几天）", () => {
    const s = newState(0);
    buyInvest(s, "supplier"); // 1 天
    buyInvest(s, "press"); // 3 天
    swapInvest(s, "supplier", "night_market"); // 2 天
    // 换来的那条按它自己的天数记到期日
    expect(s.investments?.night_market).toBe(s.days.length + 2);
    expect(s.investments?.supplier).toBeUndefined();
  });

  it("面板挑的是「最快自己就结束」的那条来换（损失的剩余天数最少）", () => {
    const s = newState(0);
    buyInvest(s, "supplier"); // 1 天 → 剩 2 天（含今天）
    buyInvest(s, "press"); // 3 天 → 剩 4 天
    const view = investViews(s).find((v) => v.def.id === "master")!;
    expect(view.affordable).toBe(false);
    expect(view.swapFrom?.id).toBe("supplier");
    // 理由里两条路都说出来，不再假装只有「先撤一条」
    expect(view.reason).toContain("先撤一条");
    expect(view.reason).toContain("直接换");
    expect(view.reason).toContain("跟料商多留一筐");
  });

  it("钱不够时不画「换一条」（只有真的买得起才给这条路）", () => {
    const s = newState(0);
    buyInvest(s, "supplier");
    buyInvest(s, "press");
    s.cash = 50; // 买不起 tourism ¥800
    const view = investViews(s).find((v) => v.def.id === "tourism")!;
    expect(view.swapFrom).toBeUndefined();
    expect(view.reason).toContain("先撤一条");
    expect(view.reason).not.toContain("直接换");

    const r = swapInvest(s, "supplier", "tourism");
    expect(r.ok).toBe(false);
    expect(r.reason).toContain("还差");
    expect(s.cash).toBe(50);
  });

  it("五条拒绝路径都说得清，而且一分不扣", () => {
    const s = newState(0);
    buyInvest(s, "supplier");
    buyInvest(s, "press");
    const cashBefore = s.cash;

    expect(swapInvest(s, "nope", "master").reason).toContain("没有这条门路");
    expect(swapInvest(s, "supplier", "nope").reason).toContain("没有要换的那条门路");
    expect(swapInvest(s, "supplier", "supplier").reason).toContain("同一条");
    expect(swapInvest(s, "master", "night_market").reason).toContain("本来就没在走");
    expect(swapInvest(s, "supplier", "press").reason).toContain("已经在走了");
    // 五条全被拒 ⇒ 钱一分没动、在走的两条一条没少
    expect(s.cash).toBe(cashBefore);
    expect(ids(s).sort()).toEqual(["press", "supplier"]);
  });

  it("位子没满时不给换：直接买更划算（拒绝且不扣钱）", () => {
    const s = newState(5); // 三位
    buyInvest(s, "supplier");
    const cashBefore = s.cash;
    const r = swapInvest(s, "supplier", "master");
    expect(r.ok).toBe(false);
    expect(r.reason).toContain("还有空位");
    expect(s.cash).toBe(cashBefore);
    expect(ids(s)).toEqual(["supplier"]);
  });

  it("撤掉再买的老路还在（换一条不是唯一办法）", () => {
    const s = newState(0);
    buyInvest(s, "supplier");
    buyInvest(s, "press");
    expect(cancelInvest(s, "supplier").ok).toBe(true);
    expect(buyInvest(s, "master").ok).toBe(true);
    expect(ids(s).sort()).toEqual(["master", "press"]);
  });

  it("换完之后位子数照旧报得出来（判据里那句「位子不空」有数字为证）", () => {
    const s = newState(8); // 四位
    for (const id of ["supplier", "press", "master", "night_market"]) {
      expect(buyInvest(s, id).ok).toBe(true);
    }
    expect(investSlots(s)).toBe(4);
    expect(investSlotsLeft(s)).toBe(0);
    expect(swapInvest(s, "master", "tourism").ok).toBe(true);
    expect(investSlotsLeft(s)).toBe(0);
    expect(ids(s).sort()).toEqual(["night_market", "press", "supplier", "tourism"]);
  });

  it("门路表没被这个动作改动：还是十二条", () => {
    expect(INVESTS).toHaveLength(12);
  });
});
