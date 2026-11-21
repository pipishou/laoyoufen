import { RAMEN_CALC, type CalcGroup } from "../data/ramen-calc";
import { BASE_COST, findTopping, type Ingredient } from "../data/ingredients";
import type { NoodleId } from "../data/noodles";
import { DEFAULT_PORTION, START_MAIN, mainCostYuan, portionCostYuan } from "../data/mains";
import { DEFAULT_BONE, DEFAULT_RICE, boneById, riceById } from "../data/grades";
import { noodleFit } from "./noodles";
import { flavorBonus } from "./flavor";
import { pairingBonus } from "./pairing";
import { evalRpn } from "./rpn";
import type { Recipe } from "./state";

/**
 * 默认客单价（元/碗）。
 *
 * 9 元不是拍的：`data/nanning.ts` 的 `priceVerdict` 实测矩阵显示 ——
 * 9 元时 12 个区有 70%–94% 的人买得起，10 元骤降到 32%–72%，12 元只剩
 * 青秀 52% / 良庆 50%（详见 `docs/南宁区县客流与钱包-2026-11-12.md`）。
 * 钱包是离散十档，跨一档就掉一批人，所以街坊价定 9 元；10 元及以上做成
 * 「加料档」，留给均钱包 ≥ 11 的区（P19）。
 */
export const DEFAULT_PRICE = 9;
/** 价格评分的最优价位：9 元是街坊价，再往上走就靠加料撑 */
const PRICE_SWEET_SPOT = 9;

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
 * 主料与份量带来的额外料钱（P46）。
 * 主料是菜单 SKU（牛肉比碎肉贵），份量是「二两/三两」（三两多一钱料）。
 * 两者都**只动成本**，不动 `total` 的口味分 —— 口味是配方的事，主料是卖什么的事。
 */
export interface ScoreExtra {
  main?: string;
  portion?: number;
  /** 进货档（A5）：米三档、骨三档。默认档零偏移，见 `data/grades.ts` */
  rice?: string;
  bone?: string;
  /**
   * 火候定死（A6）：这一款定过方子，味道就按定的时候那个分算。
   *
   * 传 null/undefined 表示没定过 —— 绝大多数款都是这个情况，
   * 所以历史回归锁一个数都不会动。
   */
  lockedTotal?: number | null;
}

/**
 * 纯函数：同一份配方永远得到同一个分数，服务端可原样复算（不用客户端结果）。
 * `total` 只算口味（汤 0.55 + 粉 0.45），保持回归锁不变；
 * 魅力/价格/成本是并列维度，最后合成 `storeScore` 供顾客循环使用。
 */
export function scoreRecipe(
  recipe: Recipe,
  price: number = DEFAULT_PRICE,
  kind: NoodleId = "flat",
  extra: ScoreExtra = {},
): RecipeScore {
  const mainId = extra.main ?? START_MAIN;
  const portion = extra.portion ?? DEFAULT_PORTION;
  const rice = riceById(extra.rice ?? DEFAULT_RICE);
  const bone = boneById(extra.bone ?? DEFAULT_BONE);
  const key = `${kind}|${mainId}|${portion}|${rice?.id ?? ""}|${bone?.id ?? ""}|${recipe.soup.join(",")}|${recipe.noodle.join(",")}|${recipe.toppings.join(",")}|${price}`;
  if (memoScore && key === memoKey) return memoScore;

  const vars = recipeVars(recipe);
  const subs: SubScore[] = RAMEN_CALC.map((p) => ({
    id: p.id,
    label: p.label,
    group: p.group,
    weight: p.weight,
    value: clamp100(evalRpn(p.expr, vars)),
  }));

  /**
   * 味道层（B1）：六条成型吃法只在**成立**时加一点味道分，封顶 +5。
   * 加成放在 soup 而不是 total —— total 是回归锁，动它等于把历史分数全作废。
   */
  const flavor = flavorBonus(recipe.toppings, kind);
  /**
   * 配料组合（A2）：24 条两件套的顺手加成，封顶 +3。
   * 与味道层分开算、分开封顶，再一起并入 soup / charm ——
   * 这样两层都能单独调，也不会因为叠乘把某一维顶到 100。
   */
  const pairing = pairingBonus(recipe.toppings);
  /**
   * 进货档（A5）：米只动米粉分与料钱，骨只动汤分与料钱。
   * 默认档（晚籼米 / 脊骨）增减都是 0，所以所有历史回归锁不动。
   */
  const riceNoodle = rice?.noodleDelta ?? 0;
  const boneSoup = bone?.soupDelta ?? 0;
  const gradeCost = (rice?.costDelta ?? 0) + (bone?.costDelta ?? 0);
  const soup = Math.min(100, groupScore(subs, "soup") + flavor.soup + pairing.soup + boneSoup);
  // 粉型 × 汤 的契合度（REA soupaffinity）：切粉恒 100，所以默认粉型下分数不变。
  // 选错粉最多把「粉」这半分砍掉四成，选对最多加四成 —— 不碰 total 的权重公式。
  const fit = noodleFit(kind, recipe.soup);
  const noodle = Math.min(100, groupScore(subs, "noodle") * (0.6 + 0.4 * (fit / 100)) + riceNoodle);
  const total = soup * 0.55 + noodle * 0.45;
  /**
   * 火候定死（A6）：定过方子的款，味道就是定的时候那个数。
   * 滑条再怎么动，这一碗出锅都是同一个味道 —— 这是「方子」的意思，
   * 不是又一层加成，所以它换掉 total 而不是加 total。
   */
  const totalOut = typeof extra.lockedTotal === "number" ? extra.lockedTotal : total;

  const safePrice = Math.max(0, price);
  const charm = Math.min(100, charmOf(recipe.toppings) + flavor.charm + pairing.charm);
  const valueScore = valueScoreOf(safePrice);
  const cost =
    Math.round(
      (bowlCost(recipe.toppings) + mainCostYuan(mainId) + portionCostYuan(portion) + gradeCost) * 100,
    ) / 100;
  const margin = safePrice - cost;
  const marginRate = safePrice > 0 ? margin / safePrice : 0;
  // 毛利率 55% 视为优秀；低于 0 直接 0 分
  const costScore = clamp100(marginRate * 160);

  const storeScore = totalOut * 0.45 + charm * 0.25 + valueScore * 0.2 + costScore * 0.1;

  const result: RecipeScore = {
    soup: Math.round(soup),
    noodle: Math.round(noodle),
    total: Math.round(totalOut),
    grade: gradeOf(totalOut),
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

/**
 * 味道能撑起的价格倍率（开罗 Rarity 的位置）。
 * 味道 55 及以下 = 1.0（街坊价），味道 100 = 1.25（敢卖贵 25%）。
 * 顾客进店前按这个乘自己的钱包判「吃不吃得起」，吃不起就掉头走 ——
 * 所以涨价不是白捡的，得先把粉做好。 [INFERRED, MED]
 *
 * 放在 score.ts 而不是 customer.ts：菜单（P47）在顾客进门前就要按款判
 * 「这款我的钱够不够」，两边共用一个公式，别各写一套。
 */
export function priceTolerance(total: number): number {
  return 1 + Math.max(0, total - 55) / 180;
}
