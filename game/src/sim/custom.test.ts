import { describe, expect, it } from "vitest";
import { COST_FACTOR, CUSTOMS, MAX_CUSTOM_LEVEL, TASTE_FLOOR, costFactorAt, customTotalYuan, tasteFloorAt } from "../data/custom";
import { QUALITY_BY_ID } from "../data/quality";
import { TOPPINGS } from "../data/ingredients";
import {
  buyCustom,
  customCharmFloor,
  customCostFactor,
  customLeftYuan,
  customLevel,
  customNextCost,
  customViews,
  customWords,
} from "./custom";
import { scoreOf } from "./dish";
import { scoreRecipe } from "./score";
import { createInitialState, type GameState } from "./state";
import { openForBusiness } from "./setup";

/**
 * 批 BA′：买断的上限（解 `docs/GAP四轮-2026-11-26.md` 第五节 BA′）
 *
 * 这一批之前，「钱多了没处放」是替身期末现金停在 ¥99 万的结构性原因：
 * 段位费、扩建、四件设备买完之后，剩下的钱只能「买今天」（进货、雇人、买当天的门路）。
 * 开罗那四行 `custom.txt` 就是这一格的答案 —— 花钱把某一项**上限**顶上去一级。
 *
 * 五条判据：
 *   ① 五级价格严格递增、买满的钱能对上表；
 *   ② 0 级时两个出口都是恒等（不传与传 0 / 1 逐位相同）—— 历史回归锁一分不动；
 *   ③ 料钱那一项买一级，`scoreRecipe` 的 `cost` 必降、`total` 与 `charm` 一分不动
 *      （「省了料钱」不许被读成「变好吃了」）；
 *   ④ 卖相那一项买满，平常货的 `charm` 压得过买断前的头手货（判据原文「上限从 top 再往上」）；
 *   ⑤ 三种拒绝都不扣钱。
 */

function shop(seed = 1): GameState {
  const s = createInitialState("p-ba", seed);
  openForBusiness(s, "alley", "测试老友粉");
  s.cash = 1_000_000;
  return s;
}

/**
 * 一份「有料」的配方：开局默认配方只有三件基础味型，卖相基准恰好落在 30 那个中位，
 * 料钱也只有基础那一段 —— 拿它测「省了多少钱」会测不出差别（两位小数一取整就重合）。
 * 这里把配料表里真有的六样摆进去，让 `charmBase` 与配料料钱都离开中点。
 */
function fatRecipe(s: GameState): typeof s.recipe {
  return { ...s.recipe, toppings: TOPPINGS.slice(0, 3).map((x) => x.id) };
}

describe("批 BA′ · 买断的上限", () => {
  it("① 两类各五级，价格严格递增，买满的钱与表一致（P-BA-1）", () => {
    expect(CUSTOMS.map((c) => c.id)).toEqual(["taste", "cost"]);
    for (const def of CUSTOMS) {
      expect(def.tiers).toHaveLength(MAX_CUSTOM_LEVEL);
      const sums = def.tiers.map((t) => t.costYuan);
      for (let i = 1; i < sums.length; i += 1) expect(sums[i]!).toBeGreaterThan(sums[i - 1]!);
      expect(customTotalYuan(def.id)).toBe(sums.reduce((a, b) => a + b, 0));
      // 每一级都要有名字与一句为什么 —— 只有价钱没有东西的那一级，玩家买了不知道买了什么
      for (const t of def.tiers) {
        expect(t.name.length).toBeGreaterThan(1);
        expect(t.why.length).toBeGreaterThan(6);
      }
    }
  });

  it("② 0 级时两个出口都是恒等：不传与传 0 / 1 逐位相同（P-BA-2）", () => {
    const s = shop();
    expect(customLevel(s, "taste")).toBe(0);
    expect(customLevel(s, "cost")).toBe(0);
    expect(customCharmFloor(s)).toBe(TASTE_FLOOR[0]);
    expect(customCostFactor(s)).toBe(COST_FACTOR[0]);

    const bare = scoreOf(s);
    const withZero = scoreRecipe(s.recipe, s.price, "flat", { customCharm: 0, customCost: 1 });
    expect(withZero.total).toBe(bare.total);
    expect(withZero.charm).toBe(bare.charm);
    expect(withZero.cost).toBe(bare.cost);
    // 老档（`custom` 整个字段缺省）也要走恒等
    const old = shop(2);
    delete old.custom;
    expect(customCharmFloor(old)).toBe(0);
    expect(customCostFactor(old)).toBe(1);
    expect(customViews(old).map((v) => v.level)).toEqual([0, 0]);
  });

  it("③ 料钱那一项买一级：cost 必降，total 与 charm 一分不动（P-BA-3）", () => {
    const s = shop();
    s.recipe = fatRecipe(s);
    const before = scoreOf(s);
    const r = buyCustom(s, "cost");
    expect(r.ok).toBe(true);
    expect(customLevel(s, "cost")).toBe(1);
    expect(customCostFactor(s)).toBeCloseTo(0.97, 9);
    const after = scoreOf(s);
    expect(after.cost).toBeLessThan(before.cost);
    // 只乘配料那一段：降幅不会是整碗的 3%
    expect(after.cost).toBeGreaterThan(before.cost * 0.9);
    // 「省了钱」不许被读成「变好吃了」—— 味道与卖相一分不动
    expect(after.total).toBe(before.total);
    expect(after.charm).toBe(before.charm);
    // 买满之后是原价八五折
    for (let i = 1; i < MAX_CUSTOM_LEVEL; i += 1) expect(buyCustom(s, "cost").ok).toBe(true);
    expect(customLevel(s, "cost")).toBe(MAX_CUSTOM_LEVEL);
    expect(customCostFactor(s)).toBeCloseTo(0.85, 9);
    expect(scoreOf(s).cost).toBeLessThan(after.cost);
  });

  it("④ 卖相那一项买满：三档一起往上抬，头手货顶到 100 那个天花板（P-BA-4）", () => {
    /** 同一份配方，只换进货档 —— 看卖相这一列 */
    const charmOf = (s: GameState, quality: string): number =>
      scoreRecipe(fatRecipe(s), s.price, "flat", {
        quality,
        customCharm: customCharmFloor(s),
        customCost: customCostFactor(s),
      }).charm;

    const s = shop();
    const plainBefore = charmOf(s, "plain");
    const topBefore = charmOf(s, "top");
    expect(topBefore).toBeGreaterThan(plainBefore);
    // 买断前：最贵那档也摸不到 100 —— 这才是「上限还有位置往上」的前提
    expect(topBefore).toBeLessThan(100);
    expect(QUALITY_BY_ID.get("top")?.charmBoost).toBeGreaterThan(0);

    for (let i = 0; i < MAX_CUSTOM_LEVEL; i += 1) expect(buyCustom(s, "taste").ok).toBe(true);
    expect(customCharmFloor(s)).toBeCloseTo(0.5, 9);
    // 平常货真抬高（不是只改了一句文案）
    expect(charmOf(s, "plain")).toBeGreaterThan(plainBefore + 10);
    // 头手货顶到天花板 —— 判据原文「上限从 top 再往上」的落地
    expect(charmOf(s, "top")).toBe(100);
    // 卖相有 100 的上限，抬到顶就停住，不许越界
    expect(charmOf(s, "plain")).toBeLessThan(100);
  });

  it("⑤ 三种拒绝都不扣钱：没有这一项 / 已经买满 / 钱不够（P-BA-5）", () => {
    const s = shop();
    const nope = buyCustom(s, "nope");
    expect(nope.ok).toBe(false);
    expect(nope.reason).toContain("没有这一项");

    for (let i = 0; i < MAX_CUSTOM_LEVEL; i += 1) expect(buyCustom(s, "taste").ok).toBe(true);
    const cashFull = s.cash;
    const full = buyCustom(s, "taste");
    expect(full.ok).toBe(false);
    expect(full.reason).toContain("买满");
    expect(s.cash).toBe(cashFull);
    expect(customNextCost(s, "taste")).toBe(Infinity);
    expect(customLeftYuan(s)).toBe(customTotalYuan("cost"));

    const poor = shop(3);
    poor.cash = 100;
    const broke = buyCustom(poor, "cost");
    expect(broke.ok).toBe(false);
    expect(broke.reason).toContain("还差");
    expect(poor.cash).toBe(100);
    expect(customLevel(poor, "cost")).toBe(0);
  });

  it("⑥ 面板那一张表：级数、下一级价钱、买得起、更便宜的那类都算对（P-BA-6）", () => {
    const s = shop();
    const v0 = customViews(s);
    expect(v0).toHaveLength(2);
    expect(v0[0]!.max).toBe(MAX_CUSTOM_LEVEL);
    expect(v0[0]!.nextCost).toBe(CUSTOMS[0]!.tiers[0]!.costYuan);
    expect(v0[0]!.maxed).toBe(false);
    expect(v0[0]!.affordable).toBe(true);
    // 「手艺的底子」第一级比「料钱的底子」第一级便宜 —— 面板据此说「先买哪一个」
    expect(v0[0]!.nextCost).toBeLessThan(v0[1]!.nextCost);
    expect(v0[0]!.cheapest).toBe(true);
    expect(v0[1]!.cheapest).toBe(false);

    s.cash = 0;
    expect(customViews(s).every((v) => !v.affordable)).toBe(true);

    // 说不买的话，两句话都要报数：卖相报「加了几个点」，料钱报「便宜了几个点」
    expect(customWords(s, "taste")).toBe("卖相还是原来那一档");
    expect(customWords(s, "cost")).toBe("料钱照原价");
    buyCustom(shop(), "taste");
    const t = shop();
    buyCustom(t, "taste");
    expect(customWords(t, "taste")).toContain("+10%");
    expect(customWords(t, "taste")).toContain("+50%");
    const c = shop();
    buyCustom(c, "cost");
    expect(customWords(c, "cost")).toContain("−3%");
    expect(customWords(c, "cost")).toContain("−15%");
  });

  it("⑦ 累计表两端夹住：越界不炸，也不许比 0 级还便宜（P-BA-7）", () => {
    expect(tasteFloorAt(-3)).toBe(0);
    expect(tasteFloorAt(99)).toBe(0.5);
    expect(costFactorAt(-3)).toBe(1);
    expect(costFactorAt(99)).toBe(0.85);
    for (let lv = 1; lv <= MAX_CUSTOM_LEVEL; lv += 1) {
      expect(tasteFloorAt(lv)).toBeGreaterThan(tasteFloorAt(lv - 1));
      expect(costFactorAt(lv)).toBeLessThan(costFactorAt(lv - 1));
    }
  });
});
