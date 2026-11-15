/**
 * 主料 —— 一碗粉里「主角是什么肉」。这是老友粉菜单的第一根轴。
 *
 * ## 为什么单独一张表
 * P43 那版把主料从「在架加料」反推出来（挂了猪杂就叫老友猪杂粉）。真店的菜单不是这样：
 * 「老友牛肉粉」「老友牛杂粉」是**固定的 SKU**，价目表上就写着，跟今天挂不挂那件加料无关。
 * 所以主料要独立成表、玩家自己选，而且**改成本**（牛肉比碎肉贵）。
 *
 * ## 开罗怎么给的
 * `English.lproj__topping.txt` 44 行浇头，价格区间 700–7,700 KCU、成本 20–120 KCU，
 * 逐行带「解锁顺序 / 味型位 / 价格两档 / 一串加成数字」。它的浇头既是配料也是加价项。
 * 我们拆成两层：
 *   - **主料**（这张表）：决定这碗是谁的粉，改成本、给建议加价、解锁靠客流
 *   - **加料**（`data/sides.ts`）：酸笋/豆豉/腐竹/卤蛋…… 客人自己加，按份收钱
 *
 * ## 定价口径
 * 成本写的是**相对碎肉的增量**（碎肉的料钱已经在 `BASE_COST` 的 4.8 里，见
 * `data/anchors.ts` 的 `BOWL_BREAKDOWN.porkOffal = 1.2`）。
 * 现实对照（2025 年南宁）：老友猪杂粉 10 元、老友牛肉粉 12 元、牛腩粉 13–15 元，
 * 一碗的肉成本差 1.5–2.5 元 —— 所以增量都在 ¥0.8–2.4 这个区间里。
 */

import { BOWL } from "./anchors";

export type MainId =
  | "pork"
  | "offal"
  | "beef"
  | "beefOffal"
  | "trotter"
  | "duck"
  | "brisket"
  | "threeFresh"
  | "fish"
  | "veg";

export interface MainDef {
  id: MainId;
  /** 写进品名的词；空字符串＝默认（碎肉），名字里省掉 */
  word: string;
  name: string;
  /** 相对碎肉的料钱增量（元/碗） */
  costYuan: number;
  /** 建议在二两价上加多少钱（只用来提示玩家，不自动改价） */
  suggestAddYuan: number;
  /** 满意加成 */
  satBonus: number;
  /** 累计接待多少位才解锁 */
  needCustomers: number;
  kairo: string;
  line: string;
}

export const MAINS: readonly MainDef[] = [
  {
    id: "pork",
    word: "",
    name: "碎肉",
    costYuan: 0,
    suggestAddYuan: 0,
    satBonus: 0,
    needCustomers: 0,
    kairo: "Thin Roast Pork（薄切叉烧）",
    line: "老友粉的本分：碎肉、酸笋、豆豉一起下锅爆。",
  },
  {
    id: "offal",
    word: "猪杂",
    name: "猪杂",
    costYuan: 1.2,
    suggestAddYuan: 2,
    satBonus: 2,
    needCustomers: 120,
    kairo: "Boiled Eggs（第二档浇头）",
    line: "粉肠、猪肝、生肠，南宁人点得最多的一碗。",
  },
  {
    id: "beef",
    word: "牛肉",
    name: "牛肉",
    costYuan: 2.0,
    suggestAddYuan: 3,
    satBonus: 3,
    needCustomers: 300,
    kairo: "Stewed Pork（角煮，最贵那档之一）",
    line: "牛肉要逆纹切薄，烫七秒就起，老了就柴。",
  },
  {
    id: "beefOffal",
    word: "牛杂",
    name: "牛杂",
    costYuan: 1.8,
    suggestAddYuan: 3,
    satBonus: 3,
    needCustomers: 500,
    kairo: "—（本地新增）",
    line: "牛肚、牛肠、牛百叶，锅要一直滚着。",
  },
  {
    id: "trotter",
    word: "猪脚",
    name: "猪脚",
    costYuan: 1.6,
    suggestAddYuan: 3,
    satBonus: 3,
    needCustomers: 700,
    kairo: "—（本地新增）",
    line: "猪脚先炖到起胶，一碗汤都是黏的。",
  },
  {
    id: "duck",
    word: "烧鸭",
    name: "烧鸭",
    costYuan: 1.7,
    suggestAddYuan: 3,
    satBonus: 3,
    needCustomers: 900,
    kairo: "—（本地新增）",
    line: "隔壁烧腊档斩的，皮要脆，不能泡太久。",
  },
  {
    id: "brisket",
    word: "牛腩",
    name: "牛腩",
    costYuan: 2.4,
    suggestAddYuan: 4,
    satBonus: 4,
    needCustomers: 1200,
    kairo: "Stewed Pork（角煮）",
    line: "牛腩要炖两小时，越晚来越软。",
  },
  {
    id: "threeFresh",
    word: "三鲜",
    name: "三鲜",
    costYuan: 0.9,
    suggestAddYuan: 2,
    satBonus: 2,
    needCustomers: 250,
    kairo: "Mixed（混合浇头）",
    line: "肉片、猪肝、粉肠各一点，什么都能尝到。",
  },
  {
    id: "fish",
    word: "鱼片",
    name: "鱼片",
    costYuan: 1.4,
    suggestAddYuan: 3,
    satBonus: 2,
    needCustomers: 1500,
    kairo: "Fish Powder（鱼粉）",
    line: "鱼片要现片，烫到刚白就起，腥一点就毁一锅。",
  },
  {
    id: "veg",
    word: "素粉",
    name: "素粉",
    costYuan: -0.8,
    suggestAddYuan: -1,
    satBonus: 0,
    needCustomers: 0,
    kairo: "Corn / Wakame（素浇头）",
    line: "只有酸笋、豆豉、青菜，斋得干净。",
  },
];

export const MAIN_BY_ID: ReadonlyMap<MainId, MainDef> = new Map(MAINS.map((m) => [m.id, m]));
export const START_MAIN: MainId = "pork";

export function mainById(id: string): MainDef | undefined {
  return MAIN_BY_ID.get(id as MainId);
}

/** 主料给这碗加多少料钱 */
export function mainCostYuan(id: string): number {
  return mainById(id)?.costYuan ?? 0;
}

/** 一份粉的料钱（含主料增量），用来给玩家看「这碗卖多少才不亏」 */
export function bowlCostWithMain(baseCost: number, id: string): number {
  const c = baseCost + mainCostYuan(id);
  return Math.max(0.5, Math.round(c * 100) / 100);
}

/**
 * 份量：南宁点单必说「二两 / 三两」。
 *
 * 二两是默认（不写进名字），三两多一两粉、多三成料：
 * 成本 +¥1.2、售价 +¥2（份量加价是固定的，菜单上就写「三两 +2 元」，不是玩家随便定）、
 * 满意 +1，但出碗慢 10%（锅更满，一锅少下几碗）。
 */
export type Portion = 2 | 3;

export interface PortionDef {
  size: Portion;
  name: string;
  word: string;
  costYuan: number;
  priceDelta: number;
  satBonus: number;
  serveFactor: number;
}

export const PORTIONS: readonly PortionDef[] = [
  { size: 2, name: "二两", word: "", costYuan: 0, priceDelta: 0, satBonus: 0, serveFactor: 1 },
  { size: 3, name: "三两", word: "三两", costYuan: 1.2, priceDelta: 2, satBonus: 1, serveFactor: 1.1 },
];

export const DEFAULT_PORTION: Portion = 2;

export function portionOf(size: number): PortionDef {
  return PORTIONS.find((p) => p.size === size) ?? PORTIONS[0]!;
}

/** 这份量的成本与售价加成 */
export function portionCostYuan(size: number): number {
  return portionOf(size).costYuan;
}

export function portionPriceDelta(size: number): number {
  return portionOf(size).priceDelta;
}

/** 一碗粉的建议售价（成本 + 目标毛利，用来在 UI 上提示，不强制） */
export function suggestPriceWithMain(id: string, portion: number): number {
  const main = mainById(id);
  const p = portionOf(portion);
  const cost = BOWL.costYuan + (main?.costYuan ?? 0) + p.costYuan;
  return Math.max(3, Math.round(cost + BOWL.marginYuan));
}
