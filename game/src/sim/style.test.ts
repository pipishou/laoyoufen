import { describe, expect, it } from "vitest";
import { STYLES, STYLE_TOTAL_YUAN } from "../data/style";
import { SAVE_VERSION, createInitialState, type GameState } from "./state";
import { openForBusiness } from "./setup";
import { deserialize, serialize } from "./save";
import {
  buyStyle,
  currentStyle,
  nextStyle,
  setStyle,
  styleAttractMult,
  styleOwned,
  stylePatienceMult,
  styleSatBonus,
  styleSummary,
  styleViews,
} from "./style";

function fresh(): GameState {
  const s = createInitialState("style-player", 7);
  expect(openForBusiness(s, "alley", "测试老友粉").ok).toBe(true);
  s.cash = 200_000;
  return s;
}

describe("店的样子（A1）", () => {
  it("六套门面，id 与名字都不重样，五件部件齐全", () => {
    expect(STYLES).toHaveLength(6);
    expect(new Set(STYLES.map((d) => d.id)).size).toBe(6);
    expect(new Set(STYLES.map((d) => d.name)).size).toBe(6);
    for (const d of STYLES) {
      expect(Object.keys(d.parts).sort()).toEqual(["chair", "entrance", "floor", "table", "wall"]);
      for (const part of Object.values(d.parts)) expect(part.length).toBeGreaterThan(0);
      expect(d.look.length).toBeGreaterThan(0);
      expect(d.where.length).toBeGreaterThan(0);
      expect(d.effectText.length).toBeGreaterThan(0);
    }
    // 六套总价：面板与成就用得上，改价要一起改
    expect(STYLES.reduce((n, d) => n + d.costYuan, 0)).toBe(STYLE_TOTAL_YUAN);
  });

  it("效果只落三个既有乘数，越贵越强", () => {
    for (const d of STYLES) {
      const keys = Object.keys(d.effect).sort();
      for (const k of keys) expect(["attractPct", "patiencePct", "satBonus"]).toContain(k);
      expect(keys.length).toBeGreaterThan(0);
    }
    const byCost = [...STYLES].sort((a, b) => a.costYuan - b.costYuan);
    const last = byCost[byCost.length - 1]!;
    const first = byCost[0]!;
    expect(last.effect.attractPct ?? 0).toBeGreaterThan(first.effect.attractPct ?? 0);
  });

  it("新铺子：没装过、三乘数中性", () => {
    const s = fresh();
    expect(s.styles).toEqual([]);
    expect(s.style).toBeNull();
    expect(currentStyle(s)).toBeNull();
    expect(styleAttractMult(s)).toBe(1);
    expect(stylePatienceMult(s)).toBe(1);
    expect(styleSatBonus(s)).toBe(0);
    expect(styleSummary(s)).toContain("空铺");
  });

  it("买下一套：扣钱、自动换上、乘数立刻生效", () => {
    const s = fresh();
    const before = s.cash;
    const r = buyStyle(s, "qilou");
    expect(r.ok).toBe(true);
    expect(r.id).toBe("qilou");
    expect(s.cash).toBe(before - 400);
    expect(styleOwned(s, "qilou")).toBe(true);
    expect(s.style).toBe("qilou");
    expect(styleAttractMult(s)).toBeCloseTo(1.02, 5);
    expect(stylePatienceMult(s)).toBeCloseTo(1.02, 5);
    expect(styleSummary(s)).toContain("骑楼老铺");
  });

  it("钱不够拒绝，且一分不扣、不进门面", () => {
    const s = fresh();
    s.cash = 100;
    const r = buyStyle(s, "shijia");
    expect(r.ok).toBe(false);
    expect(r.reason).toContain("还差");
    expect(s.cash).toBe(100);
    expect(s.styles).toEqual([]);
    expect(s.style).toBeNull();
  });

  it("同一套不能买两次", () => {
    const s = fresh();
    expect(buyStyle(s, "yeshi").ok).toBe(true);
    const again = buyStyle(s, "yeshi");
    expect(again.ok).toBe(false);
    expect(again.reason).toContain("已经装修过");
    expect(s.styles).toEqual(["yeshi"]);
  });

  it("换上只能换已经买过的，且免费", () => {
    const s = fresh();
    buyStyle(s, "qilou");
    const cashAfterFirst = s.cash;
    expect(setStyle(s, "yeshi").ok).toBe(false);
    expect(buyStyle(s, "yeshi").ok).toBe(true);
    const cashAfterSecond = s.cash;
    expect(setStyle(s, "qilou").ok).toBe(true);
    expect(s.style).toBe("qilou");
    expect(s.cash).toBe(cashAfterSecond);
    expect(styleSatBonus(s)).toBe(0);
    // 换回来数值也跟着换回第二套（夜市摊 +5% 进店 +5% 耐心）
    setStyle(s, "yeshi");
    expect(styleAttractMult(s)).toBeCloseTo(1.05, 5);
    expect(cashAfterFirst).toBeGreaterThan(cashAfterSecond);
  });

  it("已经在用的那套再点一次会被拦下", () => {
    const s = fresh();
    buyStyle(s, "dapaidang");
    const r = setStyle(s, "dapaidang");
    expect(r.ok).toBe(false);
    expect(r.reason).toContain("现在用的就是");
  });

  it("views：六行、已拥有的永远买得起、正在用的只有一行", () => {
    const s = fresh();
    buyStyle(s, "tangshui");
    const views = styleViews(s);
    expect(views).toHaveLength(6);
    expect(views.filter((v) => v.active)).toHaveLength(1);
    expect(views.find((v) => v.active)!.def.id).toBe("tangshui");
    for (const v of views) if (v.owned) expect(v.affordable).toBe(true);
    // 钱不够时最贵那套买不起
    s.cash = 0;
    const poor = styleViews(s).find((v) => v.def.id === "xincheng")!;
    expect(poor.affordable).toBe(false);
  });

  it("nextStyle 是没装过里最便宜的，全装齐是 null", () => {
    const s = fresh();
    expect(nextStyle(s)!.def.id).toBe("qilou");
    buyStyle(s, "qilou");
    expect(nextStyle(s)!.def.id).toBe("dapaidang");
    for (const d of STYLES) if (!styleOwned(s, d.id)) buyStyle(s, d.id);
    expect(s.styles).toHaveLength(6);
    expect(nextStyle(s)).toBeNull();
  });

  it("summary 随装修进度变", () => {
    const s = fresh();
    expect(styleSummary(s)).toBe("已装 0/6 · 店里还是空铺");
    buyStyle(s, "qilou");
    expect(styleSummary(s)).toBe("已装 1/6 · 现在「骑楼老铺」");
    buyStyle(s, "xincheng");
    expect(styleSummary(s)).toBe("已装 2/6 · 现在「新城小店」");
  });

  it("存档带上装修：styles 与 style 都存得住", () => {
    const s = fresh();
    buyStyle(s, "qilou");
    buyStyle(s, "yeshi");
    setStyle(s, "qilou");
    const back = deserialize(serialize(s))!;
    expect(back.saveVersion).toBe(SAVE_VERSION);
    expect(back.styles).toEqual(["qilou", "yeshi"]);
    expect(back.style).toBe("qilou");
    expect(styleAttractMult(back)).toBeCloseTo(1.02, 5);
  });

  it("v26 老档：没有这两格就补空，坏 id 丢掉，style 不在 styles 里就回空铺", () => {
    const s = fresh();
    const raw = JSON.parse(serialize(s)) as Record<string, unknown>;
    raw.saveVersion = 26;
    delete raw.styles;
    delete raw.style;
    const back = deserialize(JSON.stringify(raw))!;
    expect(back.styles).toEqual([]);
    expect(back.style).toBeNull();

    const raw2 = JSON.parse(serialize(s)) as Record<string, unknown>;
    raw2.saveVersion = 26;
    raw2.styles = ["qilou", "qilou", "nope", 42];
    raw2.style = "yeshi";
    const back2 = deserialize(JSON.stringify(raw2))!;
    expect(back2.styles).toEqual(["qilou"]);
    // 说现在摆着夜市摊，但并没有买过 —— 只能回空铺
    expect(back2.style).toBeNull();

    const raw3 = JSON.parse(serialize(s)) as Record<string, unknown>;
    raw3.saveVersion = 26;
    raw3.styles = ["qilou"];
    raw3.style = "qilou";
    const back3 = deserialize(JSON.stringify(raw3))!;
    expect(back3.style).toBe("qilou");
    expect(currentStyle(back3)?.id).toBe("qilou");
  });
});
