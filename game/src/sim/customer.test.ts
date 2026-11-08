import { describe, expect, it } from "vitest";
import { ARCHETYPE_BY_ID } from "../data/customers";
import { likeFoundRatio, likeStats } from "./collection";
import { DAY_MINUTES, QUEUE_MAX, SEATS, likeHitsOf, likeScoreOf, prefMatch, satisfactionOf, tickCustomers, trendAffinity } from "./customer";
import { scoreRecipe } from "./score";
import { advanceMinute, createInitialState, type GameState, type Recipe } from "./state";

function digest(s: GameState): string {
  return [s.rng.s, s.todayCustomers, s.flow.servedToday, s.flow.lostToday, s.cash, s.reputation.toFixed(4)].join("|");
}

function runDay(seed: number): GameState {
  const s = createInitialState("p", seed);
  for (let i = 0; i < DAY_MINUTES; i++) advanceMinute(s);
  return s;
}

/** 造一个三维可精确对上的配方：汤底只有 soupType 一维占优 */
function makeRecipe(thick: number, shape: number, soupType: number): Recipe {
  const soup = [50, 50, 50, 50, 50, 50, 50, 50];
  soup[soupType] = 90;
  return { soup, noodle: [50, 40, 55, 50, 35, thick, shape], toppings: [] } as unknown as Recipe;
}

describe("顾客循环", () => {
  it("一天内确实有人进店并被接待", () => {
    let served = 0;
    let revenue = 0;
    for (let seed = 1; seed <= 20; seed++) {
      const s = runDay(seed);
      served += s.totalCustomers;
      revenue += s.monthRevenue;
    }
    expect(served).toBeGreaterThan(0);
    expect(revenue).toBeGreaterThan(0);
  });

  it("同种子同结果，不同种子不同结局", () => {
    expect(digest(runDay(7))).toBe(digest(runDay(7)));
    const set = new Set<string>();
    for (let seed = 0; seed < 60; seed++) set.add(digest(runDay(seed)));
    expect(set.size).toBeGreaterThan(30);
  });

  it("在座人数不超过座位数，排队不超过 QUEUE_MAX", () => {
    const s = createInitialState("p", 3);
    for (let i = 0; i < DAY_MINUTES * 3; i++) {
      advanceMinute(s);
      const eating = s.flow.customers.filter((c) => c.status === "eating").length;
      const waiting = s.flow.customers.filter((c) => c.status === "waiting").length;
      expect(eating).toBeLessThanOrEqual(SEATS);
      expect(waiting).toBeLessThanOrEqual(QUEUE_MAX);
    }
  });

  it("吃完要付钱：现金随营收净增（扣除食材成本）", () => {
    const s = createInitialState("p", 11);
    const before = s.cash;
    for (let i = 0; i < DAY_MINUTES; i++) tickCustomers(s, scoreRecipe(s.recipe, s.price));
    const gained = s.cash - before;
    const expected = s.flow.servedToday * (s.price - scoreRecipe(s.recipe, s.price).cost);
    expect(gained).toBeCloseTo(expected, 5);
    expect(gained).toBeGreaterThanOrEqual(0);
  });

  it("越贴合顾客口味，满意度越高", () => {
    const arch = ARCHETYPE_BY_ID.get("grandma");
    if (!arch) throw new Error("缺原型");
    const exact = makeRecipe(arch.prefs.thick, arch.prefs.shape, arch.prefs.soup);
    const wrong = makeRecipe((arch.prefs.thick + 1) % 5, (arch.prefs.shape + 1) % 3, (arch.prefs.soup + 1) % 8);
    const score = scoreRecipe(createInitialState("p", 1).recipe);
    expect(prefMatch(exact, arch.prefs)).toBe(100);
    expect(prefMatch(wrong, arch.prefs)).toBe(0);
    expect(satisfactionOf(score, arch, exact, 9, 0, arch.lineLimit)).toBeGreaterThan(
      satisfactionOf(score, arch, wrong, 9, 0, arch.lineLimit),
    );
  });

  it("等太久扣分，但不会扣成负数", () => {
    const arch = ARCHETYPE_BY_ID.get("rider");
    if (!arch) throw new Error("缺原型");
    const score = scoreRecipe(createInitialState("p", 1).recipe);
    const recipe = makeRecipe(2, 0, 3);
    const quick = satisfactionOf(score, arch, recipe, 9, 0, arch.lineLimit);
    const slow = satisfactionOf(score, arch, recipe, 9, 999, arch.lineLimit);
    expect(slow).toBeLessThan(quick);
    expect(slow).toBeGreaterThanOrEqual(0);
  });

  it("口碑高时排队封顶，看到长队掉头的顾客计入流失", () => {
    const s = createInitialState("p", 1);
    s.reputation = 5;
    s.capacity = 999;
    let lost = 0;
    for (let i = 0; i < DAY_MINUTES * 2; i++) {
      advanceMinute(s);
      lost = Math.max(lost, s.flow.lostToday);
    }
    expect(lost).toBeGreaterThan(0);
  });

  it("日切：过完 240 分钟日期推进，当日计数清零", () => {
    const s = runDay(5);
    expect(s.day).toBe(2);
    expect(s.flow.minuteOfDay).toBe(0);
    expect(s.flow.servedToday).toBe(0);
    expect(s.todayCustomers).toBe(0);
  });

  it("热潮改变客群构成：越偏好该汤种的原型，权重涨得越多", () => {
    const cold = { sourBamboo: 0, douchi: 0, porkOffal: 0, broth: 0 };
    const hot = { sourBamboo: 100, douchi: 0, porkOffal: 0, broth: 0 };
    const regular = ARCHETYPE_BY_ID.get("regular"); // 汤种 0 酸笋，最认这口
    const fitness = ARCHETYPE_BY_ID.get("fitness"); // 汤种 4 鲜甜，对酸笋热潮无感
    if (!regular || !fitness) throw new Error("缺原型");

    // 热潮为 0 时各类原型同乘 0.75，相对权重不变
    expect(trendAffinity(regular, cold)).toBeCloseTo(trendAffinity(fitness, cold), 10);
    // 酸笋炒热后，爱酸笋汤的涨得比爱鲜甜的的多
    expect(trendAffinity(regular, hot) / trendAffinity(regular, cold)).toBeGreaterThan(
      trendAffinity(fitness, hot) / trendAffinity(fitness, cold),
    );
  });

  it("喜好打分与发现：三维逐项相等才记进图鉴", () => {
    const arch = ARCHETYPE_BY_ID.get("grandma");
    if (!arch) throw new Error("缺原型");
    const exact = makeRecipe(arch.prefs.thick, arch.prefs.shape, arch.prefs.soup);
    expect(likeHitsOf(exact, arch.prefs).sort()).toEqual(["shape", "soup", "thick"]);

    // 三维各错一位，一个都不该命中
    const off = makeRecipe((arch.prefs.thick + 1) % 5, (arch.prefs.shape + 1) % 3, (arch.prefs.soup + 1) % 8);
    expect(likeHitsOf(off, arch.prefs)).toEqual([]);

    expect(likeScoreOf(exact, arch.prefs)).toBe(100);
    expect(likeScoreOf(off, arch.prefs)).toBe(0);
  });

  it("跑起来会真的发现喜好，发现比例随之上升", () => {
    const s = createInitialState("p-like", 3);
    for (let i = 0; i < DAY_MINUTES * 5; i++) {
      advanceMinute(s);
      // 事件弹窗会停表；这里等价于「玩家把弹窗答掉」
      if (s.events.pending) s.events.pending = null;
    }
    expect(s.collection.likes.length).toBeGreaterThan(0);
    const r = likeFoundRatio(s);
    expect(r).toBeGreaterThan(0);
    expect(r).toBeLessThanOrEqual(1);

    // 分维统计（开罗 RallyData.GetLikeSoupNum 的对应物）：三个维度齐全，加总等于总发现数
    const stats = likeStats(s);
    expect(stats).toHaveLength(3);
    expect(stats.reduce((n, d) => n + d.found, 0)).toBe(s.collection.likes.length);
    for (const d of stats) expect(d.found).toBeLessThanOrEqual(d.total);

    // 命中喜好要真的记进常客档案（开罗 AddRegularCount），否则回访率永远是底值
    const likesFed = Object.values(s.regulars).reduce((n, rec) => n + rec.likeHits, 0);
    expect(likesFed).toBeGreaterThan(0);
  });

  it("服务技能决定问口味的速度（开罗 Staff 3）", () => {
    const discovered = (skill: number): number => {
      const s = createInitialState("p-survey", 5);
      if (skill > 0) {
        s.staff.roster = [
          { uid: "srv", templateId: "st.test", name: "跑堂", role: "server", skill, wage: 90, fatigue: 0, resting: false },
        ];
      }
      for (let i = 0; i < DAY_MINUTES * 3; i++) {
        advanceMinute(s);
        if (s.events.pending) s.events.pending = null;
      }
      return s.collection.likes.length;
    };
    expect(discovered(5)).toBeGreaterThan(discovered(0));
  });
});
