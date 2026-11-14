import { describe, it } from "vitest";
import { advanceMinute, createInitialState, type GameState, type Recipe } from "./state";
import { resolveEvent } from "./events";
import { scoreRecipe } from "./score";
import { FLOW } from "../data/balance";

/**
 * 「做得好也能活」验证：4 座不扩张，只把配方做好，36 个月能不能活。
 * 三种手艺水平：
 *  - 躺平：默认配方（味道 68）
 *  - 熟练：随机搜索里中位水平的配方
 *  - 讲究：随机搜索里 top 的配方（模拟玩家反复调配方/熬汤/换粉）
 */
function play(seed: number, seats: number, recipe: Recipe, price: number): GameState {
  const s = createInitialState("probe", seed);
  s.venue.seats = seats;
  s.recipe = { soup: [...recipe.soup], noodle: [...recipe.noodle], toppings: [...recipe.toppings] };
  s.price = price;
  let guard = 0;
  while (!s.finished && s.months.length < 36 && guard < 5_000_000) {
    if (s.events.pending) {
      resolveEvent(s, 0);
      continue;
    }
    advanceMinute(s);
    guard++;
  }
  return s;
}

function searchRecipes(n: number): Recipe[] {
  let seed = 20261114;
  const rnd = () => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed / 2147483648;
  };
  const out: Recipe[] = [];
  for (let i = 0; i < n; i += 1) {
    const soup = Array.from({ length: 8 }, () => Math.round(rnd() * 100));
    out.push({
      soup: soup as Recipe["soup"],
      noodle: [
        Math.round(rnd() * 100),
        Math.round(rnd() * 100),
        Math.round(rnd() * 100),
        Math.round(rnd() * 100),
        20 + Math.round(rnd() * 30),
        Math.floor(rnd() * 5),
        Math.floor(rnd() * 3),
      ] as Recipe["noodle"],
      toppings: [],
    });
  }
  return out;
}

describe("做得好也能活", () => {
  it("4 座 · 三种手艺水平 · 36 个月", () => {
    FLOW.spawnScale = 6;
    FLOW.serveMinutes = 1;
    FLOW.eatScale = 1;
    FLOW.patienceScale = 1.5;
    FLOW.queueMax = 12;

    const base = createInitialState("probe", 1).recipe;
    const cands = [base, ...searchRecipes(2000)];
    const scored = cands
      .map((r) => ({ r, total: scoreRecipe(r, 9).total }))
      .sort((a, b) => a.total - b.total);
    const flat = { r: base, total: scoreRecipe(base, 9).total };
    const worst = scored[0]!;
    const master = scored[scored.length - 1]!;

    for (const c of [
      { label: `躺平 味道${flat.total}`, ...flat, price: 9 },
      { label: `躺平 味道${flat.total}`, ...flat, price: 11 },
      { label: `手生 味道${worst.total}`, ...worst, price: 11 },
      { label: `讲究 味道${master.total}`, ...master, price: 11 },
    ]) {
      let cash = 0;
      let rev = 0;
      let bowls = 0;
      let lost = 0;
      let months = 0;
      for (const seed of [1, 2, 3, 5, 8]) {
        const s = play(seed, 4, c.r, c.price);
        cash += s.cash;
        months += s.months.length;
        rev += s.months.reduce((n, m) => n + m.revenue, 0);
        bowls += s.months.reduce((n, m) => n + m.customers, 0);
        lost += s.months.reduce((n, m) => n + m.lost, 0);
      }
      console.log(
        `${c.label.padEnd(14)} ¥${c.price}/碗 日均 ${(bowls / (months * 30)).toFixed(1)} 碗` +
          ` | 流失 ${((lost / (bowls + lost)) * 100).toFixed(0).padStart(2)}%` +
          ` | 月均营收 ¥${Math.round(rev / months)}` +
          ` | 期末现金 ¥${Math.round(cash / 5)}`,
      );
    }
  }, 900_000);
});
