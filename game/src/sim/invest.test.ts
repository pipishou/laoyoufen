import { describe, expect, it } from "vitest";
import { INVESTS, INVEST_TOTAL, investById, investsOfClass } from "../data/invest";
import { stageMinutes } from "./equipment";
import {
  activeInvests,
  buyInvest,
  dayIndexOf,
  investAttractMult,
  investCapacityBonus,
  investSummary,
  investToday,
  investUntil,
  investViews,
  investWords,
} from "./invest";
import { createInitialState } from "./state";

const newState = () => {
  const s = createInitialState("invest-test", 5);
  s.cash = 100_000;
  return s;
};

describe("街上的门路：三条表的纪律", () => {
  it("十条（批 J′ 八条 + 批 BB′ 两条对冲），id 不重复，每条都有 name / what / line / why", () => {
    expect(INVEST_TOTAL).toBe(10);
    expect(new Set(INVESTS.map((d) => d.id)).size).toBe(10);
    for (const d of INVESTS) {
      expect(d.name.length).toBeGreaterThan(2);
      expect(d.what.length).toBeGreaterThan(6);
      expect(d.line.length).toBeGreaterThan(6);
      expect(d.why.length).toBeGreaterThan(10);
      expect(d.kairo.length).toBeGreaterThan(4);
    }
    expect(investById("supplier")?.name).toContain("料商");
    expect(investById("nope")).toBeUndefined();
  });

  it("每条都带出处：http 链接 + 原文摘句", () => {
    for (const d of INVESTS) {
      expect(d.source.length).toBeGreaterThanOrEqual(1);
      for (const src of d.source) {
        expect(src.url).toMatch(/^https?:\/\//);
        expect(src.label.length).toBeGreaterThan(2);
        expect(src.quote.length).toBeGreaterThan(4);
      }
    }
  });

  it("钱与天数：¥50 一天 / ¥120 一天 / ¥400 三天，各至少一个效果", () => {
    expect(investById("supplier")!.costYuan).toBe(50);
    expect(investById("supplier")!.days).toBe(1);
    expect(investById("master")!.costYuan).toBe(120);
    expect(investById("master")!.days).toBe(1);
    expect(investById("press")!.costYuan).toBe(400);
    expect(investById("press")!.days).toBe(3);
    for (const d of INVESTS) {
      // 批 BB′：对冲那条没有三个量里的任何一个，它「买的是那条行情不出现」
      const n = (d.capacity ?? 0) + (d.slowestMinutes ?? 0) + (d.attractPct ?? 0);
      expect(n > 0 || d.hedgeOf !== undefined).toBe(true);
    }
    // make 三条、voice 五条、hedge 两条
    expect(investsOfClass("make").map((d) => d.id)).toEqual(["supplier", "master", "central_kitchen"]);
    expect(investsOfClass("voice").map((d) => d.id)).toEqual([
      "press",
      "night_market",
      "tourism",
      "expo",
      "livestream",
    ]);
    expect(investsOfClass("hedge").map((d) => d.id)).toEqual([
      "inspect_report",
      "meat_price_deal",
    ]);
  });

  it("买料商留货：扣钱、当天生效、产能 +20 碗", () => {
    const s = newState();
    const before = s.cash;
    const r = buyInvest(s, "supplier");
    expect(r.ok).toBe(true);
    expect(s.cash).toBe(before - 50);
    expect(investToday(s, "supplier")).toBe(true);
    expect(investUntil(s, "supplier")).toBe(dayIndexOf(s) + 1);
    expect(investCapacityBonus(s)).toBe(20);
    expect(investWords(investById("supplier")!)).toContain("+20 碗");
  });

  it("底板两位：两条 `make` 也能并排走，第三类要等空出位子（批 BC′ 之前这里只能走一条）", () => {
    const s = newState();
    expect(buyInvest(s, "supplier").ok).toBe(true);
    // 批 BC′：不再按类互斥，位子够就行 —— 料商与老师傅都是 make，也都能挂
    expect(buyInvest(s, "master").ok).toBe(true);
    expect(activeInvests(s).map((d) => d.id).sort()).toEqual(["master", "supplier"]);
    // 两位满了，第三条（不管哪一类）一律「先撤一条」，并且一分钱都不扣
    const cashBefore = s.cash;
    const third = buyInvest(s, "press");
    expect(third.ok).toBe(false);
    expect(third.reason).toContain("先撤一条");
    expect(third.reason).toContain("料商");
    expect(s.cash).toBe(cashBefore);
    // 已买的那条也不能重复买
    expect(buyInvest(s, "supplier").ok).toBe(false);
    // 面板上第三条也是「先撤一条」
    const view = investViews(s).find((v) => v.def.id === "press")!;
    expect(view.affordable).toBe(false);
    expect(view.reason).toContain("先撤一条");
  });

  it("不同类可以并存：门路 + 美食号，进店 ×1.3", () => {
    const s = newState();
    expect(buyInvest(s, "supplier").ok).toBe(true);
    expect(buyInvest(s, "press").ok).toBe(true);
    expect(activeInvests(s).map((d) => d.id).sort()).toEqual(["press", "supplier"]);
    expect(investAttractMult(s)).toBeCloseTo(1.3, 5);
    expect(investUntil(s, "press")).toBe(dayIndexOf(s) + 3);
    expect(investSummary(s)).toContain("美食号");
  });

  it("到期就没了：把到期日拨到今天，效果归零", () => {
    const s = newState();
    buyInvest(s, "supplier");
    s.investments = { supplier: dayIndexOf(s) };
    expect(investToday(s, "supplier")).toBe(false);
    expect(investCapacityBonus(s)).toBe(0);
    expect(investSummary(s)).toBe("今天还没走门路 · 0 / 2 位");
  });

  it("老师傅只治最慢那一段：总分钟数减 0.5，其余段不动", () => {
    const s = newState();
    const before = stageMinutes(s);
    expect(buyInvest(s, "master").ok).toBe(true);
    const after = stageMinutes(s);
    expect(after.total).toBeCloseTo(before.total - 0.5, 5);
    // 新局炒锅 2.2 与汤锅 2.2 并列最慢，炒锅先减；粉篓 1.6 一分不动
    expect(after.basket).toBeCloseTo(before.basket, 5);
    expect(after.wok).toBeCloseTo(before.wok - 0.5, 5);
  });

  it("钱不够就说还差多少", () => {
    const s = newState();
    s.cash = 10;
    const r = buyInvest(s, "press");
    expect(r.ok).toBe(false);
    expect(r.reason).toContain("还差");
    const view = investViews(s).find((v) => v.def.id === "press")!;
    expect(view.affordable).toBe(false);
    expect(view.reason).toContain("还差");
  });

  it("老档没有 investments 字段也不炸，当作没买过", () => {
    const s = newState();
    delete s.investments;
    expect(investCapacityBonus(s)).toBe(0);
    expect(investAttractMult(s)).toBe(1);
    expect(activeInvests(s)).toEqual([]);
    expect(buyInvest(s, "supplier").ok).toBe(true);
  });
});
