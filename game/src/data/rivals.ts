/**
 * 同条街：同区的其他粉店（单家叫「同行」）。
 *
 * 为什么要有这一层：P0 的试玩里，客人「看价牌走了」之后就没有下文——
 * 他到底去哪了？在真实的南宁，他去了隔壁巷子的老甘。没有同行，
 * 「流失」只是一个数字；有同行，流失才是**被抢走的生意**，也才有得抢回来的动作。
 *
 * 设计上的三条本土化（不是搬开罗的 Rival Shops）：
 *   ① **服气**：赢同一家三次，他不消失，而是服气——份额砍半、每月送你一次食材。
 *      南宁街坊生意是「各做各的客」，不是把人打垮。
 *   ② **接手铺面**：撑不下去的同行会贴「旺铺转让」，你可以折价接过来，
 *      那个铺子的租金便宜（−25%），客流池也归你（+10%）。
 *   ③ **街坊传闻**：每月一句「老甘家换了新汤底」，让对手有呼吸。
 *
 * 名字、招牌、台词全部原创，只借结构不借表达。
 */

import type { DistrictId } from "./nanning";
import type { NoodleId } from "./noodles";

export type RivalTier = 1 | 2 | 3;

export interface RivalSignature {
  /** 主料（data/mains.ts 的 id） */
  main: string;
  /** 粉型（data/noodles.ts 的 id） */
  noodle: NoodleId;
  /** 口味分，约 55–85，用来算「你 vs 他」 */
  taste: number;
  /** 魅力，约 40–80，影响他抢客的力度 */
  charm: number;
  /** 招牌价，用于街坊话里的对比 */
  price: number;
}

export interface RivalDef {
  id: string;
  district: DistrictId;
  name: string;
  tier: RivalTier;
  signature: RivalSignature;
  /** 初始名气，决定他抢多少客 */
  fame: number;
  /** 撑不下去的门槛：名气跌到 0 就贴转让 */
  /** 转让费（接手时要付） */
  takeoverFeeYuan: number;
  /** 他撑不下去前最多还能亏多少个月 */
  exitGoal: number;
  /** 街坊传闻（本地兜底，AI 失败时用这三句轮换） */
  lines: readonly string[];
}

export const RIVALS: readonly RivalDef[] = [
  {
    id: "laogan",
    district: "xingning",
    name: "老甘饮食店",
    tier: 1,
    signature: { main: "offal", noodle: "flat", taste: 62, charm: 45, price: 9 },
    fame: 12,
    takeoverFeeYuan: 9_000,
    exitGoal: 6,
    lines: [
      "老甘家还是那口老汤，六点就有人蹲门口。",
      "老甘把价牌擦得锃亮，还是 ¥9。",
      "老甘的儿子回来帮忙了，说要多撑两年。",
    ],
  },
  {
    id: "sanjie",
    district: "xingning",
    name: "三姐粉摊",
    tier: 1,
    signature: { main: "pork", noodle: "flat", taste: 58, charm: 52, price: 8 },
    fame: 10,
    takeoverFeeYuan: 6_000,
    exitGoal: 5,
    lines: [
      "三姐的摊子只摆到九点，卖完就收。",
      "三姐说今年米粉又涨了两毛。",
      "三姐家的辣椒油换了配方，学生仔说更香。",
    ],
  },
  {
    id: "nanhu",
    district: "qingxiu",
    name: "南湖粉城",
    tier: 3,
    signature: { main: "brisket", noodle: "round", taste: 78, charm: 72, price: 14 },
    fame: 30,
    takeoverFeeYuan: 42_000,
    exitGoal: 12,
    lines: [
      "南湖粉城上了二楼，包厢都坐满了。",
      "南湖粉城在招人，开到月薪四千五。",
      "南湖粉城换了招牌，听说花了六万。",
    ],
  },
  {
    id: "fengling",
    district: "qingxiu",
    name: "凤岭夜宵档",
    tier: 2,
    signature: { main: "duck", noodle: "wetchow", taste: 70, charm: 66, price: 13 },
    fame: 20,
    takeoverFeeYuan: 24_000,
    exitGoal: 9,
    lines: [
      "凤岭那家夜宵档，两点还有人在排队。",
      "凤岭夜宵档的烧鸭是现斩的。",
      "凤岭夜宵档被投诉油烟，装了个净化器。",
    ],
  },
  {
    id: "tinghong",
    district: "jiangnan",
    name: "亭洪老牌粉店",
    tier: 2,
    signature: { main: "beefOffal", noodle: "flat", taste: 72, charm: 60, price: 12 },
    fame: 20,
    takeoverFeeYuan: 22_000,
    exitGoal: 9,
    lines: [
      "亭洪那家开了二十几年，墙上全是老照片。",
      "亭洪老牌换了个大锅，说一锅能下十碗。",
      "亭洪老牌的老板娘认得每个熟客要几两。",
    ],
  },
  {
    id: "mindahoumen",
    district: "xixiangtang",
    name: "民大后门那家",
    tier: 1,
    signature: { main: "threeFresh", noodle: "flat", taste: 60, charm: 58, price: 8 },
    fame: 12,
    takeoverFeeYuan: 8_000,
    exitGoal: 6,
    lines: [
      "民大后门那家，学生一放假就冷清。",
      "民大后门那家加了个「加粉不加价」。",
      "民大后门那家在门口摆了两张塑料凳。",
    ],
  },
  {
    id: "xiangsi",
    district: "xixiangtang",
    name: "相思湖食堂",
    tier: 2,
    signature: { main: "trotter", noodle: "claypot", taste: 68, charm: 62, price: 11 },
    fame: 18,
    takeoverFeeYuan: 18_000,
    exitGoal: 8,
    lines: [
      "相思湖食堂冬天上砂锅，队伍排到路口。",
      "相思湖食堂刷了白墙，看着亮堂多了。",
      "相思湖食堂的阿姨手不抖，给的肉多。",
    ],
  },
  {
    id: "wuxiang",
    district: "liangqing",
    name: "五象路口粉店",
    tier: 2,
    signature: { main: "beef", noodle: "yifu", taste: 66, charm: 64, price: 12 },
    fame: 16,
    takeoverFeeYuan: 20_000,
    exitGoal: 8,
    lines: [
      "五象路口那家中午全是写字楼的。",
      "五象路口粉店做了个外卖小程序。",
      "五象路口粉店门口修路，生意差了一阵。",
    ],
  },
];

export const RIVAL_BY_ID: ReadonlyMap<string, RivalDef> = new Map(RIVALS.map((r) => [r.id, r]));

export function rivalsOfDistrict(id: string): readonly RivalDef[] {
  return RIVALS.filter((r) => r.district === id);
}

/** 档位话术：面板上给的一句话 */
export const TIER_WORD: Record<RivalTier, string> = {
  1: "小摊小店",
  2: "做了些年头",
  3: "这一带最有名",
};

/** 名气上限（名气不会无限涨） */
export const FAME_MAX: Record<RivalTier, number> = { 1: 24, 2: 40, 3: 60 };

/** 单家最多抢走这个区多少客流 */
export const SHARE_CAP = 0.35;

/** 服气门槛：赢这么多次，他就不跟你抢了 */
export const PACIFY_WINS = 3;

/** 接手铺面的段位门槛（手艺树的「分店」是第 10 段，接铺子要更早一点） */
export const TAKEOVER_MIN_GRADE = 6;

/** 接手之后：租金打折、那个区的池子变大 */
export const TAKEOVER_RENT_FACTOR = 0.75;
export const TAKEOVER_POOL_BOOST = 0.1;
