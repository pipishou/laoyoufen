import { describe, expect, it } from "vitest";
import { FAVOR_GAIN, FAVOR_MAX, recipeSaleFavor, TREAT_ATTRACT } from "../data/favor";
import { SAVE_VERSION, createInitialState, type GameState } from "./state";
import { openForBusiness } from "./setup";
import { deserialize, serialize } from "./save";
import { addDish, currentDish, sellRecipe } from "./menu";
import { scoreOf } from "./dish";
import { addFavor, addFavorFree, favorAttractMult, favorOf, favorSummary, favorViews, useFavor } from "./favor";

function fresh(): GameState {
  const s = createInitialState("favor-player", 11);
  expect(openForBusiness(s, "alley", "测试老友粉").ok).toBe(true);
  s.cash = 200_000;
  // 菜单位跟段位走（0 段只挂 1 款），这几例要摸菜单，先给个 6 段
  s.gradeLevel = 6;
  return s;
}

describe("人情：来源与日上限", () => {
  it("新局没人情、也没有摆过桌", () => {
    const s = fresh();
    expect(favorOf(s)).toBe(0);
    expect(s.favorTotal).toBe(0);
    expect(s.treatDay).toBe(-1);
    expect(favorAttractMult(s)).toBe(1);
    expect(favorSummary(s)).toContain("还没人帮你");
  });

  it("吃到底的日上限是 40 点，超了就白吃", () => {
    const s = fresh();
    expect(addFavor(s, 30, "吃到底")).toBe(30);
    expect(addFavor(s, 30, "吃到底")).toBe(FAVOR_GAIN.dailyCapByBowls - 30);
    expect(addFavor(s, 5)).toBe(0);
    expect(favorOf(s)).toBe(FAVOR_GAIN.dailyCapByBowls);
    // 跨天清零（endDay 里做，这里手模拟）
    s.flow.favorToday = 0;
    expect(addFavor(s, 5)).toBe(5);
  });

  it("转手/比赛/回礼不受日上限约束", () => {
    const s = fresh();
    addFavor(s, FAVOR_GAIN.dailyCapByBowls);
    expect(addFavor(s, 1)).toBe(0);
    expect(addFavorFree(s, 12, "比赛第 1 名")).toBe(12);
    expect(favorOf(s)).toBe(FAVOR_GAIN.dailyCapByBowls + 12);
    expect(s.flow.lastFavor).toContain("比赛第 1 名");
  });

  it("点数不会超过上限", () => {
    const s = fresh();
    s.favor = FAVOR_MAX - 2;
    addFavorFree(s, 50);
    expect(favorOf(s)).toBe(FAVOR_MAX);
  });
});

describe("人情：三样花法", () => {
  it("点数不够时三样全是「还差 N 点」且点了不扣", () => {
    const s = fresh();
    const views = favorViews(s);
    expect(views).toHaveLength(3);
    expect(views.every((v) => !v.affordable)).toBe(true);
    expect(views[0]!.reason).toContain("还差 8 点");
    const r = useFavor(s, "hint_recipe");
    expect(r.ok).toBe(false);
    expect(favorOf(s)).toBe(0);
  });

  it("请老师傅尝一口：把最欠的那味汤参提一档，并落笔到菜单", () => {
    const s = fresh();
    addFavorFree(s, 20);
    const before = [...s.recipe.soup];
    const lowest = Math.min(...before);
    expect(useFavor(s, "hint_recipe").ok).toBe(true);
    expect(favorOf(s)).toBe(12);
    const after = s.recipe.soup;
    expect(Math.max(...after)).toBeGreaterThanOrEqual(Math.min(lowest + 6, 100));
    // 落笔：菜单里那一款也变了（syncEditing）
    expect(currentDish(s).recipe.soup).toEqual(after);
    expect(scoreOf(s).total).toBeGreaterThanOrEqual(0);
  });

  it("让师傅带一手：最弱的那位涨一档，没雇人就用不了", () => {
    const s = fresh();
    addFavorFree(s, 20);
    const noStaff = favorViews(s).find((v) => v.def.id === "teach_staff")!;
    expect(noStaff.affordable).toBe(false);
    expect(noStaff.reason).toContain("还没雇人");

    s.staff.roster.push({
      uid: "st.test",
      name: "阿珍",
      role: "prep",
      skill: 2,
      wage: 130,
      note: "",
      fatigue: 0,
      resting: false,
    } as never);
    expect(useFavor(s, "teach_staff").ok).toBe(true);
    expect(s.staff.roster[0]!.skill).toBe(3);
    expect(favorOf(s)).toBe(8);
  });

  it("摆一桌请街坊：当天进店 ×1.25，一天只能摆一次，隔天能再摆", () => {
    const s = fresh();
    addFavorFree(s, 20);
    expect(useFavor(s, "treat_street").ok).toBe(true);
    expect(favorAttractMult(s)).toBe(TREAT_ATTRACT);
    const again = useFavor(s, "treat_street");
    expect(again.ok).toBe(false);
    expect(again.reason).toContain("今天已经摆过");
    s.day += 1;
    expect(favorAttractMult(s)).toBe(1);
    expect(useFavor(s, "treat_street").ok).toBe(true);
  });

  it("未知用法直接拒绝", () => {
    const s = fresh();
    expect(useFavor(s, "free_money").ok).toBe(false);
  });
});

describe("人情：转手配方", () => {
  it("味道越高、卖得越多，换的人情越多（有上限）", () => {
    expect(recipeSaleFavor(0, 0)).toBe(FAVOR_GAIN.recipeSaleBase);
    expect(recipeSaleFavor(80, 200)).toBe(FAVOR_GAIN.recipeSaleBase + 16 + 4);
    // 卖过 1000 碗也只多给 10 点
    expect(recipeSaleFavor(80, 1000)).toBe(FAVOR_GAIN.recipeSaleBase + 16 + FAVOR_GAIN.recipeSaleSoldCap);
  });

  it("转手一款：菜单少一款、返回人情点数；只剩一款时不让转", () => {
    const s = fresh();
    expect(addDish(s).ok).toBe(true);
    expect(s.menu).toHaveLength(2);
    const r = sellRecipe(s, 1);
    expect(r.ok).toBe(true);
    expect(r.favor).toBeGreaterThanOrEqual(FAVOR_GAIN.recipeSaleBase);
    expect(s.menu).toHaveLength(1);

    const last = sellRecipe(s, 0);
    expect(last.ok).toBe(false);
    expect(last.reason).toContain("至少要留一款");
  });
});

describe("人情：存档", () => {
  it("v22 存读往返", () => {
    const s = fresh();
    addFavorFree(s, 33, "转手");
    s.treatDay = s.month * 100 + s.day;
    const back = deserialize(serialize(s))!;
    expect(SAVE_VERSION).toBe(22);
    expect(favorOf(back)).toBe(33);
    expect(back.favorTotal).toBe(33);
    expect(back.treatDay).toBe(s.treatDay);
    expect(favorAttractMult(back)).toBe(TREAT_ATTRACT);
  });

  it("v21 老档没人情：补 0，坏值也归零", () => {
    const s = fresh();
    const raw = JSON.parse(serialize(s)) as Record<string, unknown>;
    raw.saveVersion = 21;
    delete raw.favor;
    delete raw.favorTotal;
    delete raw.treatDay;
    const flow = raw.flow as Record<string, unknown>;
    delete flow.lastFavor;
    delete flow.favorToday;
    const back = deserialize(JSON.stringify(raw))!;
    expect(favorOf(back)).toBe(0);
    expect(back.favorTotal).toBe(0);
    expect(back.treatDay).toBe(-1);
    expect(back.flow.lastFavor).toBeNull();
    expect(back.flow.favorToday).toBe(0);

    const bad = JSON.parse(serialize(s)) as Record<string, unknown>;
    bad.saveVersion = 21;
    bad.favor = -5;
    bad.favorTotal = "many";
    bad.treatDay = 0;
    const back2 = deserialize(JSON.stringify(bad))!;
    expect(favorOf(back2)).toBe(0);
    expect(back2.favorTotal).toBe(0);
    expect(back2.treatDay).toBe(-1);
  });
});
