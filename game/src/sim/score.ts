import { RAMEN_CALC, type CalcGroup } from "../data/ramen-calc";
import { BASE_COST, findTopping, type Ingredient } from "../data/ingredients";
import { evalRpn } from "./rpn";
import type { Recipe } from "./state";

/** 南宁老友粉常见客单价（元/碗）。B3 会改成玩家可调。 */
export const DEFAULT_PRICE = 12;
/** 价格评分的最优价位：过 12 元，学生与街坊开始流失 */
const PRICE_SWEET_SPOT = 12;

export interface SubScore {
  id: string;
  label: string;
  group: CalcGroup;
  /** 0-100 */
  value: number;
  weight: number;
}

export interface RecipeScore {
  /** 汤底分 0-100 */
  soup: number;
  /** 米粉分 0-100 */
  noodle: number;
  /** 口味综合分（只含汤/粉，回归锁用这个） */
  total: number;
  grade: "S" | "A" | "B" | "C" | "D";
  /** 魅力：看相 + 配料组合，0-100 */
  charm: number;
  /** 售价（元） */
  price: number;
  /** 价格分：性价比，0-100 */
  valueScore: number;
  /** 每碗食材成本（元） */
  cost: number;
  /** 每碗毛利（元） */
  margin: number;
  /** 毛利率 0-1 */
  marginRate: number;
  /** 门店综合吸引力 0-100，顾客循环用这个，联赛仍用 total */
  storeScore: number;
  subs: SubScore[];
}

function clamp100(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return v < 0 ? 0 : v > 100 ? 100 : v;
}

/** 把 8+7 参数摊平成 RPN 变量表：s0..s7 / n0..n6 */
export function recipeVars(recipe: Recipe): Record<string, number> {
  const vars: Record<string, number> = {};
  recipe.soup.forEach((v, i) => {
    vars[`s${i}`] = v;
  });
  recipe.noodle.forEach((v, i) => {
    vars[`n${i}`] = v;
  });
  return vars;
}

function groupScore(subs: readonly SubScore[], group: CalcGroup): number {
  let sum = 0;
  let weight = 0;
  for (const s of subs) {
    if (s.group !== group) continue;
    sum += s.value * s.weight;
    weight += s.weight;
  }
  return weight === 0 ? 0 : sum / weight;
}

function gradeOf(total: number): RecipeScore["grade"] {
  if (total >= 92) return "S";
  if (total >= 80) return "A";
  if (total >= 66) return "B";
  if (total >= 50) return "C";
  return "D";
}

/**
 * 魅力：不是「配料越多越高」，而是**递减 + 组合**。
 * 纯堆料会在第 4 种之后几乎不涨，逼玩家做取舍（这是开罗式菜单的核心手感）。
 */
export function charmOf(toppingIds: readonly string[]): number {
  const items = toppingIds
    .map((id) => findTopping(id))
    .filter((t): t is Ingredient => Boolean(t))
    .sort((a, b) => b.charm - a.charm);

  let sum = 0;
  items.forEach((t, i) => {
    sum += t.charm / (1 + i * 0.35);
  });

  const has = (id: string): boolean => items.some((t) => t.id === id);
  const hasTag = (tag: Ingredient["tags"][number]): boolean => items.some((t) => t.tags.includes(tag));

  let bonus = 0;
  // 老友三件套：酸笋 + 豆豉 + 酸辣椒，地方标准的「主料」组合
  if (has("top.sourbamboo") && has("top.douchi") && has("top.chili")) bonus += 12;
  if (hasTag("青菜")) bonus += 8;
  if (has("top.tomato")) bonus += 5;
  if (has("top.offal") && has("top.sourbamboo")) bonus += 6;

  return clamp100(30 + sum * 0.55 + bonus);
}

/** 价格分：偏离甜点价越远越低，每 1 元扣 12 分 */
export function valueScoreOf(price: number): number {
  return clamp100(100 - Math.abs(price - PRICE_SWEET_SPOT) * 12);
}

/** 每碗食材成本 = 汤底/粉基础 + 选中配料 */
export function bowlCost(toppingIds: readonly string[]): number {
  let cost = BASE_COST;
  for (const id of toppingIds) {
    const t = findTopping(id);
    if (t) cost += t.cost;
  }
  return Math.round(cost * 100) / 100;
}

/**
 * 纯函数：同一份配方永远得到同一个分数，服务端可原样复算（不用客户端结果）。
 * `total` 只算口味（汤 0.55 + 粉 0.45），保持回归锁不变；
 * 魅力/价格/成本是并列维度，最后合成 `storeScore` 供顾客循环使用。
 */
export function scoreRecipe(recipe: Recipe, price: number = DEFAULT_PRICE): RecipeScore {
  const key = `${recipe.soup.join(",")}|${recipe.noodle.join(",")}|${recipe.toppings.join(",")}|${price}`;
  if (memoScore && key === memoKey) return memoScore;

  const vars = recipeVars(recipe);
  const subs: SubScore[] = RAMEN_CALC.map((p) => ({
    id: p.id,
    label: p.label,
    group: p.group,
    weight: p.weight,
    value: clamp100(evalRpn(p.expr, vars)),
  }));

  const soup = groupScore(subs, "soup");
  const noodle = groupScore(subs, "noodle");
  const total = soup * 0.55 + noodle * 0.45;

  const safePrice = Math.max(0, price);
  const charm = charmOf(recipe.toppings);
  const valueScore = valueScoreOf(safePrice);
  const cost = bowlCost(recipe.toppings);
  const margin = safePrice - cost;
  const marginRate = safePrice > 0 ? margin / safePrice : 0;
  // 毛利率 55% 视为优秀；低于 0 直接 0 分
  const costScore = clamp100(marginRate * 160);

  const storeScore = total * 0.45 + charm * 0.25 + valueScore * 0.2 + costScore * 0.1;

  const result: RecipeScore = {
    soup: Math.round(soup),
    noodle: Math.round(noodle),
    total: Math.round(total),
    grade: gradeOf(total),
    charm: Math.round(charm),
    price: safePrice,
    valueScore: Math.round(valueScore),
    cost,
    margin: Math.round(margin * 100) / 100,
    marginRate,
    storeScore: Math.round(storeScore),
    subs,
  };
  memoKey = key;
  memoScore = result;
  return result;
}

/**
 * 单条 memo：配方不变时每分钟都重算是纯浪费——
 * 1000 局 × 600 分钟的确定性测试就是靠这个从 12s 压到毫秒级。
 * 返回值按只读对待，禁止调用方改写。
 */
let memoKey = "";
let memoScore: RecipeScore | null = null;
