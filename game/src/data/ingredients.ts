/**
 * 配料 / 原料表。
 *
 * 结构溯源：REA 的 `topping`（44 行 × 42 列）与 `soupmaterial`（41 行 × 45 列）、
 * `noodlesmaterial`（14 行 × 31 列）三张表。这里只借**表的形状**：
 * 「一行 = 一个物料，带成本 + 魅力 + 风味标签」，不借行名、不借数值。
 * 原作 42 列里有一半是列语义未核实的参数对（报告 §2 风险 2 自认 46/49 张表没做逐列核对），
 * 照抄等于把猜测写进代码。
 *
 * 数值口径：南宁骑楼夜市粉店，2026 年零售价重推 [GUESS, LOW]。
 * 只对**相对关系**有把握（牛腩/牛杂 ≈ 猪杂 > 瘦肉 > 青菜 > 酸笋/豆豉），绝对值等采购单替换。
 */

import { GUANGXI } from "./balance";

export type FlavorTag = "酸" | "辣" | "鲜" | "咸" | "香" | "青菜" | "肉" | "杂" | "甜";

/** 荤素分档，给 UI 分组与「浇头三件套」计数用 */
export type IngredientKind = "offal" | "meat" | "veg" | "soy" | "egg" | "staple" | "seasoning";

export interface Ingredient {
  id: string;
  name: string;
  /** REA 原表里的对应行名，仅用于结构溯源；数值不取原作 */
  reaRef: string;
  kind: IngredientKind;
  /** 成本档 1-3，只用于 UI 排序，真实成本看 cost */
  tier: 1 | 2 | 3;
  /** 每碗成本（元） */
  cost: number;
  /** 菜单加价（元）。0 = 基础料，不单收费 */
  price: number;
  /** 魅力基础值 0-100，用于「这碗粉看起来值不值」 */
  charm: number;
  tags: readonly FlavorTag[];
}

/**
 * 汤底基础料（每碗摊薄成本）。对应 REA `soupmaterial` 的「一次选多种、成本相加」形状。
 * 老友粉的主料**固定**是酸笋 + 蒜 + 豆豉 + 辣椒酱（地方标准 DB4501/T 0046—2024 §3.1），
 * 所以这四项不做成可选，直接进基础成本。
 */
export const SOUP_MATERIALS: readonly Ingredient[] = [
  { id: "soup.porkbone", name: "猪筒骨", reaRef: "Pig Thighbones", kind: "meat", tier: 2, cost: 1.4, price: 0, charm: 0, tags: ["鲜"] },
  { id: "soup.chickenbone", name: "鸡架", reaRef: "Chicken Bones", kind: "meat", tier: 1, cost: 0.6, price: 0, charm: 0, tags: ["鲜"] },
  { id: "soup.sourbamboo", name: "酸笋", reaRef: "Menma", kind: "veg", tier: 1, cost: 0.8, price: 0, charm: 0, tags: ["酸"] },
  { id: "soup.douchi", name: "豆豉", reaRef: "Red Miso", kind: "seasoning", tier: 1, cost: 0.4, price: 0, charm: 0, tags: ["咸", "鲜"] },
  { id: "soup.garlic", name: "蒜米", reaRef: "Garlic", kind: "seasoning", tier: 1, cost: 0.3, price: 0, charm: 0, tags: ["香"] },
  { id: "soup.chili", name: "辣椒酱", reaRef: "Chili Pepper", kind: "seasoning", tier: 1, cost: 0.4, price: 0, charm: 0, tags: ["辣"] },
  { id: "soup.ginger", name: "姜", reaRef: "Ginger", kind: "seasoning", tier: 1, cost: 0.2, price: 0, charm: 0, tags: ["香"] },
  { id: "soup.scallion", name: "葱花", reaRef: "Leek", kind: "veg", tier: 1, cost: 0.3, price: 0, charm: 0, tags: ["香"] },
];

/**
 * 米粉原料。对应 REA `noodlesmaterial`（6 面粉 + 8 碱水）。
 * 老友粉只有米没有碱，所以碱水那一半不映射；保留「一种主料决定成本档位」的列形状。
 */
export const NOODLE_MATERIALS: readonly Ingredient[] = [
  { id: "noodle.oldrice", name: "陈籼米", reaRef: "Normal Flour", kind: "staple", tier: 1, cost: 0.8, price: 0, charm: 0, tags: [] },
  { id: "noodle.freshcut", name: "本地鲜切粉", reaRef: "Good Flour", kind: "staple", tier: 2, cost: 1.1, price: 0, charm: 0, tags: [] },
];

/**
 * 34 种浇头。用户点名要的三条主线全部拆开：
 * - 猪杂线：猪杂 / 粉肠 / 猪肝 / 猪红 / 猪手
 * - 猪肉线：猪肉片 / 瘦肉片 / 五花肉 / 肉末
 * - 牛线：牛杂 / 牛腩 / 牛百叶 / 牛肉片 / 牛肉丸
 * 外加青菜 6 种、豆制品、蛋、主食。对应 REA `topping` 的「一行 = 一种浇头」形状。
 * 青菜拆成 6 种：用户指出「青菜的种类很多店也不一样」，这不是美术差异，是菜单差异。
 */
export const TOPPINGS: readonly Ingredient[] = [
  // ---- 酸/香 基础（老友三件套） ----
  { id: "top.sourbamboo", name: "酸笋", reaRef: "Menma", kind: "veg", tier: 1, cost: 0.8, price: 2, charm: 20, tags: ["酸"] },
  { id: "top.douchi", name: "豆豉", reaRef: "Fermented Black Bean", kind: "seasoning", tier: 1, cost: 0.3, price: 1, charm: 12, tags: ["咸", "鲜"] },
  { id: "top.chili", name: "酸辣椒", reaRef: "Shredded Chili", kind: "seasoning", tier: 1, cost: 0.4, price: 1, charm: 15, tags: ["酸", "辣"] },
  { id: "top.tomato", name: "西红柿", reaRef: "Tomato", kind: "veg", tier: 1, cost: 0.6, price: 2, charm: 14, tags: ["酸", "甜"] },
  { id: "top.perilla", name: "紫苏", reaRef: "Chives", kind: "veg", tier: 1, cost: 0.4, price: 1, charm: 10, tags: ["香"] },
  { id: "top.suandoujiao", name: "酸豆角", reaRef: "Pickled Beans", kind: "veg", tier: 1, cost: 0.5, price: 1, charm: 12, tags: ["酸", "辣"] },

  // ---- 青菜线 ----
  { id: "top.kongxincai", name: "空心菜", reaRef: "Spinach", kind: "veg", tier: 1, cost: 0.8, price: 2, charm: 11, tags: ["青菜"] },
  { id: "top.youmaicai", name: "油麦菜", reaRef: "Leaf Mustard", kind: "veg", tier: 1, cost: 0.9, price: 2, charm: 10, tags: ["青菜"] },
  { id: "top.shengcai", name: "生菜", reaRef: "Cabbage", kind: "veg", tier: 1, cost: 0.7, price: 2, charm: 9, tags: ["青菜"] },
  { id: "top.caixin", name: "菜心", reaRef: "Nappa Cabbage", kind: "veg", tier: 1, cost: 1.0, price: 2, charm: 11, tags: ["青菜"] },
  { id: "top.douya", name: "豆芽", reaRef: "Bean Sprouts", kind: "veg", tier: 1, cost: 0.3, price: 1, charm: 7, tags: ["青菜"] },
  { id: "top.watercress", name: "西洋菜", reaRef: "Watercress", kind: "veg", tier: 1, cost: 0.8, price: 2, charm: 10, tags: ["青菜"] },
  { id: "top.muer", name: "木耳", reaRef: "Wood Ear", kind: "veg", tier: 1, cost: 0.6, price: 2, charm: 9, tags: ["香"] },
  { id: "top.daylily", name: "黄花菜", reaRef: "Day Lily", kind: "veg", tier: 1, cost: 0.7, price: 2, charm: 9, tags: ["香"] },
  { id: "top.luobogan", name: "萝卜干", reaRef: "Pickled Radish", kind: "veg", tier: 1, cost: 0.4, price: 1, charm: 8, tags: ["咸", "香"] },

  // ---- 猪杂线 ----
  { id: "top.offal", name: "猪杂", reaRef: "Stewed Pork", kind: "offal", tier: 3, cost: 3.5, price: 7, charm: 22, tags: ["肉", "杂", "鲜"] },
  { id: "top.pigchitterling", name: "猪粉肠", reaRef: "Pork Intestine", kind: "offal", tier: 3, cost: 3.8, price: 8, charm: 21, tags: ["肉", "杂"] },
  { id: "top.pigliver", name: "猪肝", reaRef: "Pork Liver", kind: "offal", tier: 2, cost: 3.0, price: 7, charm: 17, tags: ["肉", "杂", "鲜"] },
  { id: "top.pigblood", name: "猪红", reaRef: "Pig Blood", kind: "offal", tier: 1, cost: 1.2, price: 3, charm: 9, tags: ["肉", "杂"] },
  { id: "top.porkknuckle", name: "猪手", reaRef: "Pork Knuckle", kind: "meat", tier: 3, cost: 4.2, price: 9, charm: 23, tags: ["肉"] },

  // ---- 猪肉线 ----
  { id: "top.pork", name: "猪肉片", reaRef: "Sliced Pork", kind: "meat", tier: 2, cost: 3.2, price: 7, charm: 18, tags: ["肉"] },
  { id: "top.lean", name: "瘦肉片", reaRef: "Thin Roast Pork", kind: "meat", tier: 2, cost: 2.8, price: 6, charm: 16, tags: ["肉"] },
  { id: "top.porkbelly", name: "五花肉", reaRef: "Pork Belly", kind: "meat", tier: 3, cost: 3.6, price: 8, charm: 19, tags: ["肉", "香"] },
  { id: "top.mince", name: "肉末", reaRef: "Ground Pork", kind: "meat", tier: 2, cost: 2.4, price: 5, charm: 14, tags: ["肉"] },

  // ---- 牛线 ----
  { id: "top.beef", name: "牛肉片", reaRef: "Roast Pork", kind: "meat", tier: 3, cost: 4.5, price: 9, charm: 24, tags: ["肉"] },
  { id: "top.beefoffal", name: "牛杂", reaRef: "Beef Offal", kind: "offal", tier: 3, cost: 4.2, price: 9, charm: 23, tags: ["肉", "杂", "鲜"] },
  { id: "top.brisket", name: "牛腩", reaRef: "Beef Brisket", kind: "meat", tier: 3, cost: 5.0, price: 10, charm: 25, tags: ["肉", "香"] },
  { id: "top.tripe", name: "牛百叶", reaRef: "Beef Tripe", kind: "offal", tier: 3, cost: 4.6, price: 10, charm: 24, tags: ["肉", "杂"] },
  { id: "top.beefball", name: "牛肉丸", reaRef: "Beef Ball", kind: "meat", tier: 2, cost: 3.0, price: 6, charm: 15, tags: ["肉"] },

  // ---- 蛋 / 豆 / 主食 ----
  { id: "top.quail", name: "鹌鹑蛋", reaRef: "Quail Egg", kind: "egg", tier: 1, cost: 1.2, price: 3, charm: 10, tags: ["鲜"] },
  { id: "top.friedegg", name: "煎蛋", reaRef: "Boiled Eggs", kind: "egg", tier: 1, cost: 1.0, price: 2, charm: 11, tags: ["鲜"] },
  { id: "top.fuzhu", name: "腐竹", reaRef: "Tofu", kind: "soy", tier: 1, cost: 0.8, price: 2, charm: 9, tags: ["鲜"] },
  { id: "top.youtiao", name: "油条", reaRef: "Fried Scallion", kind: "staple", tier: 1, cost: 0.8, price: 2, charm: 13, tags: ["香"] },
  { id: "top.peanut", name: "花生", reaRef: "Sesame", kind: "soy", tier: 1, cost: 0.4, price: 1, charm: 7, tags: ["香"] },
  { id: "top.scallion", name: "葱花", reaRef: "Chopped Scallion", kind: "veg", tier: 1, cost: 0.2, price: 0, charm: 5, tags: ["香"] },
];

export const TOPPING_BY_ID: ReadonlyMap<string, Ingredient> = new Map(TOPPINGS.map((t) => [t.id, t]));

/**
 * 汤底 + 粉的基础成本（元/碗）。
 *
 * 旧实现把「全部汤料 + 全部粉料的单价加总」当一碗的成本（≈¥6.3），
 * 等于每碗都放了所有料 —— 这不是成本，这是清仓。
 * 按南宁现实一碗老友粉的料钱取 `GUANGXI.bowlCostYuan`（¥4.2），
 * 加料另计（`bowlCost()` 里逐项累加）。
 * 依据：docs/数值来源与换算-2026-11-12.md、docs/开罗设计哲学-扩张是否必需-2026-11-14.md
 */
export const BASE_COST = GUANGXI.bowlCostYuan;

/** 按 id 取配料；未知 id 返回 undefined，由调用方决定是否报错（存档可能带旧 id） */
export function findTopping(id: string): Ingredient | undefined {
  return TOPPING_BY_ID.get(id);
}

export function toppingsOfKind(kind: IngredientKind): readonly Ingredient[] {
  return TOPPINGS.filter((t) => t.kind === kind);
}
