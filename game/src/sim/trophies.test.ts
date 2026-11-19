import { describe, expect, it } from "vitest";
import { TROPHIES, TROPHY_BY_ID, TROPHY_GROUP_ORDER } from "../data/trophies";
import { createInitialState, SAVE_VERSION, type GameState } from "./state";
import { openForBusiness } from "./setup";
import { addDish, sellRecipe } from "./menu";
import { deserialize, serialize } from "./save";
import {
  checkTrophies,
  earnedTrophies,
  hasTrophy,
  nextTrophy,
  nextTrophies,
  trophyCount,
  trophySummary,
  trophyViews,
  trophyVoiceContext,
} from "./trophies";

function fresh(): GameState {
  const s = createInitialState("trophy-player", 7);
  expect(openForBusiness(s, "alley", "测试老友粉").ok).toBe(true);
  s.cash = 200_000;
  return s;
}

/** 要摸菜单的用例才需要段位（菜单位 1 + floor(段位/2)），新局本身不带段位 */
function menuReady(s: GameState): GameState {
  s.gradeLevel = 6;
  return s;
}

describe("成就表（B 批）", () => {
  it("一共三十条，id 不重复，六组各有货", () => {
    expect(TROPHIES.length).toBe(30);
    expect(new Set(TROPHIES.map((t) => t.id)).size).toBe(30);
    expect(TROPHY_GROUP_ORDER.length).toBe(6);
    for (const g of TROPHY_GROUP_ORDER) {
      expect(TROPHIES.filter((t) => t.group === g).length).toBeGreaterThanOrEqual(4);
    }
  });

  it("每条都有名字、条件、本地评语与至少一项奖励", () => {
    for (const t of TROPHIES) {
      expect(t.name.length).toBeGreaterThan(0);
      expect(t.note.length).toBeGreaterThan(0);
      expect(t.hint.length).toBeGreaterThan(0);
      expect((t.reward.favor ?? 0) + (t.reward.cash ?? 0)).toBeGreaterThan(0);
      expect(typeof t.goal).toBe("function");
      expect(typeof t.progress).toBe("function");
    }
  });

  it("hint 都不含阿拉伯数字（这句话会被模型改写，同一条红线）", () => {
    for (const t of TROPHIES) {
      expect(/\d/.test(t.hint)).toBe(false);
    }
  });

  it("名字里可以带数字：「口碑 4.0」这种要让人一眼看懂门槛", () => {
    expect(TROPHIES.some((t) => /\d/.test(t.name))).toBe(true);
  });

  it("奖励以人情为主：给钱的只占少数", () => {
    const cashOnly = TROPHIES.filter((t) => (t.reward.cash ?? 0) > 0).length;
    expect(cashOnly).toBeLessThan(TROPHIES.length / 2);
  });
});

describe("成就判定与发奖", () => {
  it("新局一枚都没有，判一次也不会凭空给", () => {
    const s = fresh();
    expect(trophyCount(s)).toBe(0);
    expect(checkTrophies(s)).toEqual([]);
    expect(trophyCount(s)).toBe(0);
  });

  it("端出第一碗：记进存档、发三点人情、进播报队列", () => {
    const s = fresh();
    s.tally.bowls = 1;
    const hits = checkTrophies(s);
    expect(hits.map((h) => h.def.id)).toContain("first_bowl");
    expect(hasTrophy(s, "first_bowl")).toBe(true);
    expect(earnedTrophies(s).has("first_bowl")).toBe(true);
    expect(s.favor).toBe(3);
    expect(s.favorTotal).toBe(3);
    expect(s.pendingTrophies).toContain("first_bowl");
  });

  it("同一枚不会重复发奖", () => {
    const s = fresh();
    s.tally.bowls = 1;
    checkTrophies(s);
    const favBefore = s.favor;
    const again = checkTrophies(s);
    expect(again).toEqual([]);
    expect(s.favor).toBe(favBefore);
  });

  it("一次达标多条会一起发，队列里按表顺序排", () => {
    const s = fresh();
    s.tally.bowls = 1000;
    s.totalCustomers = 100;
    const ids = checkTrophies(s).map((h) => h.def.id);
    expect(ids).toContain("first_bowl");
    expect(ids).toContain("hundred_guests");
    expect(ids).toContain("bowls_thousand");
    expect(s.pendingTrophies.length).toBe(ids.length);
  });

  it("成就的现金只进现金，不进营收（不污染账本）", () => {
    const s = fresh();
    const cashBefore = s.cash;
    const revBefore = s.monthRevenue;
    s.tally.bowls = 1000;
    checkTrophies(s);
    expect(s.cash).toBe(cashBefore + 5000);
    expect(s.monthRevenue).toBe(revBefore);
  });

  it("菜单型成就：挂上三两与干捞各算一条", () => {
    const s = menuReady(fresh());
    expect(checkTrophies(s).map((h) => h.def.id)).not.toContain("big_bowl");
    addDish(s);
    const second = s.menu[s.menu.length - 1]!;
    second.portion = 3;
    second.noodle = "dry";
    const ids = checkTrophies(s).map((h) => h.def.id);
    expect(ids).toContain("big_bowl");
    expect(ids).toContain("dry_summer");
  });

  it("加料台五样才算摆开，四样不算", () => {
    const s = fresh();
    s.sides.active = ["suansun", "douchi", "lazhi", "ludan"];
    expect(checkTrophies(s).map((h) => h.def.id)).not.toContain("side_menu");
    s.sides.active = ["suansun", "douchi", "lazhi", "ludan", "youtiao"];
    expect(checkTrophies(s).map((h) => h.def.id)).toContain("side_menu");
  });

  it("同行服气与落场胜利各自成一条", () => {
    const s = fresh();
    s.rivals[0]!.pacified = true;
    s.tally.arenaWins = 1;
    const ids = checkTrophies(s).map((h) => h.def.id);
    expect(ids).toContain("pacify_one");
    expect(ids).toContain("arena_first");
  });

  it("转手一份配方会记进 tally.recipesSold 并解锁那条成就", () => {
    const s = menuReady(fresh());
    addDish(s);
    const sold = sellRecipe(s, s.menu.length - 1);
    expect(sold.ok).toBe(true);
    expect(s.tally.recipesSold).toBe(1);
    expect(checkTrophies(s).map((h) => h.def.id)).toContain("sell_recipe");
  });
});

describe("成就面板数据", () => {
  it("视图与表一一对应，未达成给进度文本，达成后清空", () => {
    const s = fresh();
    s.tally.bowls = 1;
    checkTrophies(s);
    const views = trophyViews(s);
    expect(views.length).toBe(30);
    const first = views.find((v) => v.def.id === "first_bowl")!;
    expect(first.earned).toBe(true);
    expect(first.progressText).toBe("");
    const later = views.find((v) => v.def.id === "bowls_thousand")!;
    expect(later.earned).toBe(false);
    expect(later.progressText).toContain("/");
  });

  it("progress 与 goal 同源：达标时 cur 一定等于 target", () => {
    const s = fresh();
    s.tally.bowls = 1;
    const v = trophyViews(s).find((x) => x.def.id === "first_bowl")!;
    expect(v.cur).toBe(v.target);
  });

  it("summary 与 nextTrophy 会随进度变", () => {
    const s = fresh();
    expect(trophySummary(s)).toContain("0 /");
    expect(nextTrophy(s)).not.toBeNull();
    s.tally.bowls = 1;
    checkTrophies(s);
    expect(trophySummary(s)).toContain("1 /");
    // 刚拿到的不会再被推荐
    expect(nextTrophy(s)?.def.id).not.toBe("first_bowl");
  });

  it("HUD 左栏取最近的两枚，全收齐时退回最近拿到的两枚", () => {
    const s = fresh();
    const two = nextTrophies(s, 2);
    expect(two).toHaveLength(2);
    expect(two.every((v) => !v.earned)).toBe(true);
    // 与 nextTrophy（单条）同源：第一条就是它
    expect(two[0]!.def.id).toBe(nextTrophy(s)!.def.id);
    // 差得最少的那枚必须排在前面（左栏两行是给「马上能拿到」的）
    expect(two[0]!.pct).toBeGreaterThanOrEqual(two[1]!.pct);

    // 全都拿到：不让左栏空掉
    for (const def of TROPHIES) s.trophies.push(def.id);
    const done = nextTrophies(s, 2);
    expect(done).toHaveLength(2);
    expect(done.every((v) => v.earned)).toBe(true);
  });

  it("AI 上下文只递名词，不带数字", () => {
    const def = TROPHY_BY_ID.get("first_bowl")!;
    const ctx = trophyVoiceContext(def);
    expect(Object.keys(ctx).length).toBeGreaterThan(0);
    for (const v of Object.values(ctx)) expect(/\d/.test(v)).toBe(false);
  });
});

describe("成就存档", () => {
  it("存档往返：拿到的记得住，播报队列不落盘", () => {
    const s = fresh();
    s.tally.bowls = 1;
    checkTrophies(s);
    expect(s.pendingTrophies.length).toBeGreaterThan(0);
    const text = serialize(s);
    const back = deserialize(text)!;
    expect(back.trophies).toContain("first_bowl");
    expect(back.pendingTrophies).toEqual([]);
    expect(back.saveVersion).toBe(SAVE_VERSION);
  });

  it("老档（没有 trophies 字段）读进来是空数组，坏 id 被丢掉", () => {
    const s = fresh();
    const raw = JSON.parse(serialize(s)) as Record<string, unknown>;
    delete raw.trophies;
    raw.saveVersion = 23;
    delete raw.pendingTrophies;
    (raw.tally as Record<string, unknown>).recipesSold = undefined;
    const back = deserialize(JSON.stringify(raw))!;
    expect(back.trophies).toEqual([]);
    expect(back.tally.recipesSold).toBe(0);

    const raw2 = JSON.parse(serialize(s)) as Record<string, unknown>;
    raw2.saveVersion = 23;
    raw2.trophies = ["first_bowl", "made_up_trophy", 42];
    const back2 = deserialize(JSON.stringify(raw2))!;
    expect(back2.trophies).toEqual(["first_bowl"]);
  });
});
