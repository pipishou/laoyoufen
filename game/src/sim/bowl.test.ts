import { describe, expect, it } from "vitest";
import { BOWLS, BOWL_TOTAL, DEFAULT_BOWL_ID, bowlById } from "../data/bowl";
import { SAVE_VERSION, createInitialState, type GameState } from "./state";
import { openForBusiness } from "./setup";
import { deserialize, serialize } from "./save";
import {
  bowlCostFactor,
  bowlOwned,
  bowlPatienceMult,
  bowlSatBonus,
  bowlServeFactor,
  bowlSummary,
  bowlViews,
  buyBowl,
  currentBowl,
  nextBowl,
  setBowl,
} from "./bowl";

function fresh(): GameState {
  const s = createInitialState("bowl-player", 11);
  expect(openForBusiness(s, "alley", "测试老友粉").ok).toBe(true);
  s.cash = 200_000;
  return s;
}

describe("碗（A4）", () => {
  it("五只碗：id 与名字不重样，只有钢碗免费，说明都写全了", () => {
    expect(BOWLS).toHaveLength(5);
    expect(BOWL_TOTAL).toBe(5);
    expect(new Set(BOWLS.map((b) => b.id)).size).toBe(5);
    expect(new Set(BOWLS.map((b) => b.name)).size).toBe(5);
    expect(BOWLS.filter((b) => b.free).map((b) => b.id)).toEqual([DEFAULT_BOWL_ID]);
    for (const b of BOWLS) {
      expect(b.look.length).toBeGreaterThan(0);
      expect(b.where.length).toBeGreaterThan(0);
      expect(b.effectText.length).toBeGreaterThan(0);
      expect(b.line.length).toBeGreaterThan(0);
      // 每只碗都要有真实出处 —— 这一层是照着南宁的碗做的，不许凭空编
      expect(b.source.length).toBeGreaterThan(0);
      for (const src of b.source) {
        expect(src.url.startsWith("http")).toBe(true);
        expect(src.quote.length).toBeGreaterThan(0);
      }
    }
  });

  it("出处里不许出现别的作品名", () => {
    const banned = /开罗|Ramen|Kairo|ラーメン/;
    for (const b of BOWLS) {
      for (const src of b.source) {
        expect(banned.test(src.label)).toBe(false);
        expect(banned.test(src.quote)).toBe(false);
      }
    }
  });

  it("新局用钢碗，四个乘数都在中性附近（出碗快一点）", () => {
    const s = fresh();
    expect(currentBowl(s).id).toBe(DEFAULT_BOWL_ID);
    expect(bowlOwned(s, DEFAULT_BOWL_ID)).toBe(true);
    expect(bowlSatBonus(s)).toBe(0);
    expect(bowlPatienceMult(s)).toBe(1);
    expect(bowlCostFactor(s)).toBe(1);
    // 钢碗不用自己洗，出碗略快
    expect(bowlServeFactor(s)).toBeCloseTo(0.97, 6);
  });

  it("买搪瓷碗：扣钱、进存档、自动换上，满意 +1 耐心 +3%", () => {
    const s = fresh();
    const r = buyBowl(s, "enamel");
    expect(r.ok).toBe(true);
    expect(r.line).toContain("搪瓷碗");
    expect(s.cash).toBe(200_000 - 160);
    expect(s.bowl).toBe("enamel");
    expect(s.bowls).toContain("enamel");
    expect(bowlSatBonus(s)).toBe(1);
    expect(bowlPatienceMult(s)).toBeCloseTo(1.03, 6);
  });

  it("钱不够就买不成，理由里写着要多少钱", () => {
    const s = fresh();
    s.cash = 100;
    const r = buyBowl(s, "claypot");
    expect(r.ok).toBe(false);
    expect(r.reason).toContain("钱不够");
    expect(r.reason).toContain("280");
    expect(s.bowl).toBe(DEFAULT_BOWL_ID);
  });

  it("买过的碗不能再买一次", () => {
    const s = fresh();
    expect(buyBowl(s, "bigpan").ok).toBe(true);
    const again = buyBowl(s, "bigpan");
    expect(again.ok).toBe(false);
    expect(again.reason).toContain("已经有了");
  });

  it("换碗只能换已经买过的，而且不要钱", () => {
    const s = fresh();
    expect(setBowl(s, "enamel").ok).toBe(false);
    expect(buyBowl(s, "enamel").ok).toBe(true);
    expect(buyBowl(s, "takeaway").ok).toBe(true);
    const cash = s.cash;
    const r = setBowl(s, "enamel");
    expect(r.ok).toBe(true);
    expect(s.bowl).toBe("enamel");
    expect(s.cash).toBe(cash);
  });

  it("换到正在用的那只会被拦下来", () => {
    const s = fresh();
    expect(setBowl(s, DEFAULT_BOWL_ID).ok).toBe(false);
  });

  it("瓦煲最慢但客人最愿意等，打包碗最快但满意度掉一点", () => {
    const s = fresh();
    buyBowl(s, "claypot");
    expect(bowlServeFactor(s)).toBeCloseTo(1.06, 6);
    expect(bowlPatienceMult(s)).toBeCloseTo(1.12, 6);
    expect(bowlSatBonus(s)).toBe(1);

    const t = fresh();
    buyBowl(t, "takeaway");
    expect(bowlServeFactor(t)).toBeCloseTo(0.95, 6);
    expect(bowlSatBonus(t)).toBe(-1);
    expect(bowlCostFactor(t)).toBeCloseTo(1.02, 6);
  });

  it("大盆装得多：料钱上去了，满意度 +2", () => {
    const s = fresh();
    buyBowl(s, "bigpan");
    expect(bowlCostFactor(s)).toBeCloseTo(1.03, 6);
    expect(bowlSatBonus(s)).toBe(2);
  });

  it("抬头写清现在用哪只、买了几只，nextBowl 指最便宜那只", () => {
    const s = fresh();
    expect(bowlSummary(s)).toContain("消毒不锈钢碗");
    expect(bowlSummary(s)).toContain("1/5");
    expect(nextBowl(s)?.id).toBe("bigpan");
    buyBowl(s, "bigpan");
    expect(bowlSummary(s)).toContain("大盆");
    expect(bowlSummary(s)).toContain("2/5");
    expect(nextBowl(s)?.id).toBe("enamel");
  });

  it("五只都买齐后没有「下一只」", () => {
    const s = fresh();
    for (const b of BOWLS) if (!b.free) expect(buyBowl(s, b.id).ok).toBe(true);
    expect(nextBowl(s)).toBeNull();
    expect(bowlSummary(s)).toContain("5/5");
  });

  it("面板视图与拥有状态同源", () => {
    const s = fresh();
    buyBowl(s, "enamel");
    const views = bowlViews(s);
    expect(views).toHaveLength(5);
    expect(views.filter((v) => v.owned).map((v) => v.def.id).sort()).toEqual(["enamel", "steel"]);
    expect(views.filter((v) => v.active).map((v) => v.def.id)).toEqual(["enamel"]);
  });

  it("存档：碗存得住，读回来这只还在用", () => {
    const s = fresh();
    buyBowl(s, "takeaway");
    const back = deserialize(serialize(s));
    expect(back).not.toBeNull();
    expect(back!.bowls).toContain("takeaway");
    expect(currentBowl(back!).id).toBe("takeaway");
    expect(SAVE_VERSION).toBe(31);
  });

  it("老档（v27）没有碗这格：补默认钢碗，坏 id 丢掉", () => {
    const s = fresh();
    const raw = JSON.parse(serialize(s));
    raw.saveVersion = 27;
    delete raw.bowls;
    delete raw.bowl;
    raw.bowl = "does-not-exist";
    raw.bowls = ["nope", 42];
    const back = deserialize(JSON.stringify(raw));
    expect(back).not.toBeNull();
    expect(back!.bowls).toEqual([]);
    expect(back!.bowl).toBe(DEFAULT_BOWL_ID);
    expect(bowlById(back!.bowl)?.free).toBe(true);
  });
});
