/**
 * 粉型（对应 REA `noodlesmaterial` 的「粉 + 碱水」选料层，与 `boiltime` 的煮制档位）。
 *
 * 原作把「面」拆成 14 种材料（7 面粉 + 7 碱水）自由组合，再用 9 档煮面时间定口感；
 * 老友粉的现实里没有那么多变量，真正会点的就这几种：
 *
 *  - 切粉（宽扁）是老友粉的正统，汤要挂得住粉；
 *  - 圆粉（细圆）吸汤少，汤淡了就没味；
 *  - 伊面先炸再泡，汤不厚就寡；
 *  - 湿面（碱水）爽口但压酸，酸笋放太猛会打架；
 *  - 干捞（夏天）没汤，全靠豆豉和辣椒把味提起来；
 *  - 砂锅（冬天）现煮滚着上桌，汤要浓、蒜要香。
 *
 * 所以粉型不是「皮肤」，它决定**什么汤配它才好喝**（对应 `soupaffinity` 的协同矩阵）。
 */
export type NoodleId = "flat" | "round" | "yifu" | "wetchow" | "dry" | "claypot";

export type SeasonId = "summer" | "winter";

export interface NoodleDef {
  id: NoodleId;
  name: string;
  short: string;
  /** 一碗的基础成本系数（粉本身贵不贵） */
  costFactor: number;
  /** 出碗时间系数（伊面要过油、砂锅要现煮） */
  serveFactor: number;
  /** 解锁需要的累计接待人数 */
  needCustomers: number;
  /** 只在季节里卖（对应南宁「夏天干捞、冬天砂锅」） */
  season?: SeasonId;
  /** 当季加成 / 反季惩罚（乘在契合度上） */
  reaRef: string;
  line: string;
}

export const NOODLES: readonly NoodleDef[] = [
  {
    id: "flat",
    name: "切粉（宽扁）",
    short: "切粉",
    costFactor: 1,
    serveFactor: 1,
    needCustomers: 0,
    reaRef: "Normal Flour",
    line: "宽扁的切粉，汤挂得住，这是老友粉的正统。",
  },
  {
    id: "round",
    name: "圆粉（细圆）",
    short: "圆粉",
    costFactor: 0.95,
    serveFactor: 0.9,
    needCustomers: 60,
    reaRef: "Good Flour",
    line: "细圆的粉，滑是滑，但吸汤少 —— 汤要够味才压得住。",
  },
  {
    id: "yifu",
    name: "伊面",
    short: "伊面",
    costFactor: 1.15,
    serveFactor: 1.15,
    needCustomers: 300,
    reaRef: "Risky Flour",
    line: "先炸后泡，一口汤全吸进去；汤薄了就寡得慌。",
  },
  {
    id: "wetchow",
    name: "湿面（碱水）",
    short: "湿面",
    costFactor: 1.05,
    serveFactor: 1.2,
    needCustomers: 700,
    reaRef: "Mongolian Kansui",
    line: "碱水味爽口，但压酸 —— 酸笋别下太狠。",
  },
  {
    id: "dry",
    name: "干捞老友粉",
    short: "干捞",
    costFactor: 0.9,
    serveFactor: 0.85,
    needCustomers: 1200,
    season: "summer",
    reaRef: "instant_noodles",
    line: "南宁的夏天，粉过冷水捞起来，全靠豆豉辣椒提味。",
  },
  {
    id: "claypot",
    name: "砂锅老友粉",
    short: "砂锅",
    costFactor: 1.25,
    serveFactor: 1.5,
    needCustomers: 1800,
    season: "winter",
    reaRef: "boiltime",
    line: "冬天滚着上桌，汤浓蒜香，吃到最后一口还是烫的。",
  },
];

export const NOODLE_BY_ID = new Map<string, NoodleDef>(NOODLES.map((n) => [n.id, n]));

export const START_NOODLE: NoodleId = "flat";

/** 只卖一季的粉型（干捞=夏、砂锅=冬），其余全年 */
export const SEASON_NOODLES: readonly NoodleId[] = ["dry", "claypot"];

/** 夏 6–9 月（南宁湿热），冬 11–2 月（含跨年）。传进来的 month 是 0 基（与 GameState.month 一致） */
export function seasonOf(month: number): SeasonId | null {
  const m = ((month % 12) + 12) % 12 + 1;
  if (m >= 6 && m <= 9) return "summer";
  if (m >= 11 || m <= 2) return "winter";
  return null;
}

export function noodleById(id: string): NoodleDef | undefined {
  return NOODLE_BY_ID.get(id);
}
