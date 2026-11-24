/**
 * 加料台与饮料柜 —— 「客单价结构」（P41）
 *
 * 为什么要有这一层：中期的营收被两个天花板压死 —— 出餐产能（座位×灶位×并行槽 ≈120 碗/日）
 * 与单价（¥12 已是南宁牛肉粉的现实上限）。开罗的另一条腿不在碗数上，在**客单价**上：
 *
 *   help.txt ▼Toppings：「When ramen sells, the toppings used on it will earn XP …
 *                        **Toppings also get XP when they are sold individually.**」
 *   help.txt ▼Customers 1：「**Wallet**: Products that exceed a customer's wallet are harder for them to buy」
 *   help.txt ▼Construction (Facilities)：「Depending on their type, they can have a variety of effects.
 *                        **In some cases you will also get money when they are used.**」
 *
 * 所以我们做的不是「第二份主食」，是「一碗粉之外再加一件」：加料（2 元级）与饮料（3 元级）。
 * 价格全部按 2025 南宁街边粉店的实际标价定，成本按淡村市场的批发价估。
 *
 * 组合（照开罗 topping_combo.txt 的「两种浇头凑一起触发一个 combo」）：
 * 酸笋 + 豆豉 = 老友味；酸笋 + 辣椒 = 酸辣开胃。凑齐了客人更满意。
 */

import type { NoodleId, SeasonId } from "./noodles";

export type SideKind = "topping" | "drink";
export type SideId =
  | "suansun"
  | "douchi"
  | "lazhi"
  | "ludan"
  | "shengdan"
  | "zhuzai"
  | "youtiao"
  | "fuzhu"
  | "qingcai"
  | "doujiang"
  | "huaifen"
  | "lvdou"
  | "ningmeng";

export interface SideDef {
  id: SideId;
  name: string;
  kind: SideKind;
  /** 进货成本（元/份） */
  costYuan: number;
  /** 加购价（元/份） */
  priceYuan: number;
  /** 吃到/喝到加多少满意度 */
  satBonus: number;
  /** 累计接待多少人才有人点（开罗 Toppings 要卖过才涨级，我们用「熟客够多才有人要」代替） */
  needCustomers: number;
  /** 开罗对应 */
  kairo: string;
  /** 一句南宁话 */
  line: string;
  /** 出处（没有出处的不进这张表） */
  source?: readonly SideSource[];
}

export interface SideSource {
  label: string;
  url: string;
  quote: string;
}

export const SIDES: SideDef[] = [
  {
    id: "suansun",
    name: "加酸笋",
    kind: "topping",
    costYuan: 0.5,
    priceYuan: 2,
    satBonus: 2,
    needCustomers: 0,
    kairo: "Toppings（可单独卖）",
    line: "老友粉的魂，多一勺酸笋多一层爽。",
  },
  {
    id: "douchi",
    name: "加豆豉",
    kind: "topping",
    costYuan: 0.3,
    priceYuan: 2,
    satBonus: 2,
    needCustomers: 0,
    kairo: "Toppings（可单独卖）",
    line: "豆豉下锅爆香，那股镬气才出得来。",
  },
  {
    id: "lazhi",
    name: "加辣椒",
    kind: "topping",
    costYuan: 0.3,
    priceYuan: 1,
    satBonus: 1,
    needCustomers: 0,
    kairo: "Shredded Chili",
    line: "指天椒剁碎，敢加的都是老南宁。",
  },
  {
    id: "ludan",
    name: "加卤蛋",
    kind: "topping",
    costYuan: 1.2,
    priceYuan: 3,
    satBonus: 3,
    needCustomers: 60,
    kairo: "Boiled Eggs",
    line: "卤了一夜的蛋，切开还是溏心。",
  },
  {
    id: "shengdan",
    name: "加生蛋",
    kind: "topping",
    costYuan: 1,
    priceYuan: 2,
    satBonus: 2,
    needCustomers: 0,
    kairo: "Boiled Eggs",
    line: "生蛋打散下锅，汤一滚就起花——老友粉最省事的一件加菜。",
    source: [
      {
        label: "下厨房《老友猪杂伊面》",
        url: "https://mip.xiachufang.com/recipe/104389389/",
        quote: "豆芽熟了就加入伊面煮……加蛋完全是我个人口味啦，打散后搅匀就可以出锅了",
      },
      {
        label: "16fan 食客点评《南宁老友粉》",
        url: "http://live.16fan.com/info/482981.html",
        quote: "新鲜的牛肉和猪杂直接生汆，所以会把鲜味溶到汤里，加上鸡蛋的厚度，伊面是细的炸过的",
      },
    ],
  },
  {
    id: "zhuzai",
    name: "加猪杂",
    kind: "topping",
    costYuan: 2.2,
    priceYuan: 5,
    satBonus: 4,
    needCustomers: 150,
    kairo: "Thin Roast Pork",
    line: "猪肝粉肠瘦肉各来一点，一碗变两碗。",
  },
  {
    id: "youtiao",
    name: "加根油条",
    kind: "topping",
    costYuan: 0.8,
    priceYuan: 2,
    satBonus: 2,
    needCustomers: 300,
    kairo: "—（本土）",
    line: "油条掰断泡进汤里，吸饱了才好吃。",
  },
  {
    id: "fuzhu",
    name: "加腐竹",
    kind: "topping",
    costYuan: 0.9,
    priceYuan: 3,
    satBonus: 2,
    needCustomers: 600,
    kairo: "—（本土）",
    line: "腐竹要提前泡，泡不透就是嚼皮带。",
  },
  {
    id: "qingcai",
    name: "加青菜",
    kind: "topping",
    costYuan: 0.7,
    priceYuan: 2,
    satBonus: 1,
    needCustomers: 1000,
    kairo: "Wakame",
    line: "一筷子青菜，心里就没那么罪恶。",
  },
  {
    id: "doujiang",
    name: "现磨豆浆",
    kind: "drink",
    costYuan: 0.6,
    priceYuan: 2,
    satBonus: 1,
    needCustomers: 60,
    kairo: "Vending（售货机）",
    line: "早上现磨的，甜的咸的自己说。",
  },
  {
    id: "huaifen",
    name: "槐花粉",
    kind: "drink",
    costYuan: 1.2,
    priceYuan: 4,
    satBonus: 3,
    needCustomers: 150,
    kairo: "Facilities（用一次收一次钱）",
    line: "槐花做的凉粉，浇红糖水，热天卖得最快。",
  },
  {
    id: "lvdou",
    name: "生地绿豆沙",
    kind: "drink",
    costYuan: 1.0,
    priceYuan: 3,
    satBonus: 2,
    needCustomers: 300,
    kairo: "Facilities（用一次收一次钱）",
    line: "生地压一压火气，熬夜的人专门来喝。",
  },
  {
    id: "ningmeng",
    name: "手打柠檬茶",
    kind: "drink",
    costYuan: 1.4,
    priceYuan: 5,
    satBonus: 3,
    needCustomers: 600,
    kairo: "Facilities（用一次收一次钱）",
    line: "柠檬要现捶，捶轻了不出味，捶重了发苦。",
  },
];

export const SIDE_BY_ID = new Map<string, SideDef>(SIDES.map((s) => [s.id, s]));

/** 一开始就摆得出来的三样（重庆小面摊也有这三样） */
export const START_SIDES: string[] = ["suansun", "douchi", "lazhi"];

/**
 * 组合（照 `topping_combo.txt`：两种浇头凑一起触发一个 combo）。
 *
 * 注意：**酸笋+豆豉不算组合** —— 那是老友粉的本分，每碗都有，凑出来的东西就不稀奇了。
 * 组合要「多花一件的钱才凑得出」，否则它会变成噪音（第一次实现就是这样：
 * 36 个月凑了 16,125 次，等于每碗都在报喜）。
 */
export interface SideCombo {
  id: string;
  name: string;
  needs: SideId[];
  satBonus: number;
  line: string;
  /** 季节限定（P42）：只在夏天/冬天成立，配的是干捞/砂锅 */
  noodle?: NoodleId;
  season?: SeasonId;
}

export const SIDE_COMBOS: SideCombo[] = [
  {
    id: "suanla",
    name: "酸辣开胃",
    needs: ["suansun", "lazhi"],
    satBonus: 2,
    line: "又酸又辣，一碗下去额头冒汗。",
  },
  {
    id: "laoyou",
    name: "老友味",
    needs: ["suansun", "douchi", "lazhi"],
    satBonus: 4,
    line: "酸笋、豆豉、辣椒凑齐，这才是老友粉的底子。",
  },
  {
    id: "quandan",
    name: "全套加蛋",
    needs: ["suansun", "douchi", "ludan"],
    satBonus: 3,
    line: "卤蛋切开泡汤，懂吃的人才这么点。",
  },
  // ---- 冬夏限定（P42）----
  // 南宁的夏天吃干捞配豆浆，冬天吃砂锅要配口热的 —— 这是节令，不是配置。
  {
    id: "summer_dry",
    name: "干捞配豆浆",
    needs: ["doujiang"],
    satBonus: 3,
    noodle: "dry",
    season: "summer",
    line: "天热，粉过冷水捞起，一口豆浆压下去才顺。",
  },
  {
    id: "winter_claypot",
    name: "砂锅配热浆",
    needs: ["doujiang"],
    satBonus: 3,
    noodle: "claypot",
    season: "winter",
    line: "砂锅滚着上桌，边吃边喝口热豆浆，冬天就该这样。",
  },
];

/** 套餐：粉 + 饮料打包，饮料便宜一块，客人觉得划算（开罗 avgTicket 的思路） */
export const MEAL_DEAL_OFF = 1;
export const MEAL_DEAL_SAT = 1;


/** 一顿最多加几件（照开罗：浇头受 max toppings 限制，我们给 2 件加料 + 1 份饮料） */
export const MAX_TOPPING_ADDS = 2;
export const MAX_DRINK_ADDS = 1;

/**
 * 饮料冰热（P43）。
 *
 * 现实里南宁的饮料是分季节的：夏天槐花粉要冰的、生地绿豆沙要冰的，
 * 冬天豆浆要热的。开罗的售货机没这一层，我们补上——同一个 `seasonOf` 月份表，
 * 对得上 +1 满意，反季节 −1（冬天喝冰绿豆沙没人说好）。
 */
export type DrinkTemp = "ice" | "hot";

export const DRINK_TEMP_WORD: Record<DrinkTemp, string> = { ice: "冰", hot: "热" };
export const DRINK_TEMP_BONUS = 1;

/** 这个季节该喝什么：夏→冰、冬→热、春秋→随便（0） */
export function tempFitOf(temp: DrinkTemp, season: "summer" | "winter" | null): number {
  if (season === "summer") return temp === "ice" ? DRINK_TEMP_BONUS : -DRINK_TEMP_BONUS;
  if (season === "winter") return temp === "hot" ? DRINK_TEMP_BONUS : -DRINK_TEMP_BONUS;
  return 0;
}

/** 客人愿意加购的基础概率；吃得满意的人更爱加（0.22 → 0.47） */
export function sideChanceOf(sat: number): number {
  return Math.min(0.5, 0.22 + Math.max(0, sat) / 400);
}
