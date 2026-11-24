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
  /** 这一款的名字（街坊怎么叫它：猪杂粉 / 老友粉 / 砂锅猪脚粉） */
  name: string;
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

/** 同行菜单上的一碗（开罗 `enemy_store` 每家也有不止一个招牌） */
export interface RivalDish {
  name: string;
  main: string;
  noodle: NoodleId;
  taste: number;
  charm: number;
  price: number;
}

export interface RivalDef {
  id: string;
  district: DistrictId;
  name: string;
  tier: RivalTier;
  /** 主打（街坊提起这家先想到的那一碗） */
  signature: RivalSignature;
  /**
   * 菜单上的第二款。
   *
   * 为什么每家有第二款：只有一款的时候，玩家的价牌只在和「那一个数」比，
   * 比价变成一条直线（比他便宜就赢），于是唯一的策略是往下压价（缺口 P153）。
   * 有第二款，同行就有了「便宜的引流款 + 贵的主力款」这副真实的牌，
   * 玩家压价压到他的引流款以下才有用，而压到成本线以下自己先亏。
   */
  second: RivalDish;
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
    signature: { name: "猪杂粉", main: "offal", noodle: "flat", taste: 62, charm: 45, price: 9 },
    second: { name: "牛腩粉", main: "brisket", noodle: "round", taste: 66, charm: 48, price: 12 },
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
    signature: { name: "瘦肉粉", main: "pork", noodle: "flat", taste: 58, charm: 52, price: 8 },
    second: { name: "素粉", main: "threeFresh", noodle: "flat", taste: 52, charm: 50, price: 6 },
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
    signature: { name: "牛腩粉", main: "brisket", noodle: "round", taste: 78, charm: 72, price: 14 },
    second: { name: "老友粉", main: "pork", noodle: "flat", taste: 74, charm: 70, price: 12 },
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
    signature: { name: "烧鸭粉", main: "duck", noodle: "wetchow", taste: 70, charm: 66, price: 13 },
    second: { name: "砂锅猪脚粉", main: "trotter", noodle: "claypot", taste: 72, charm: 68, price: 15 },
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
    signature: { name: "牛杂粉", main: "beefOffal", noodle: "flat", taste: 72, charm: 60, price: 12 },
    second: { name: "牛腩粉", main: "brisket", noodle: "round", taste: 70, charm: 58, price: 14 },
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
    signature: { name: "三鲜粉", main: "threeFresh", noodle: "flat", taste: 60, charm: 58, price: 8 },
    second: { name: "猪杂粉", main: "offal", noodle: "flat", taste: 62, charm: 56, price: 10 },
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
    signature: { name: "猪脚粉", main: "trotter", noodle: "claypot", taste: 68, charm: 62, price: 11 },
    second: { name: "酸辣粉", main: "threeFresh", noodle: "round", taste: 64, charm: 60, price: 8 },
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
    signature: { name: "牛肉粉", main: "beef", noodle: "yifu", taste: 66, charm: 64, price: 12 },
    second: { name: "牛杂粉", main: "beefOffal", noodle: "flat", taste: 64, charm: 62, price: 11 },
    fame: 16,
    takeoverFeeYuan: 20_000,
    exitGoal: 8,
    lines: [
      "五象路口那家中午全是写字楼的。",
      "五象路口粉店做了个外卖小程序。",
      "五象路口粉店门口修路，生意差了一阵。",
    ],
  },
  // ── 第二批八家：把十二个区补满，让「这条街」不再只有兴宁青秀两家 ──
  {
    id: "shishan",
    district: "xixiangtang",
    name: "石埠路口老友粉",
    tier: 1,
    signature: { name: "老友粉", main: "pork", noodle: "flat", taste: 60, charm: 48, price: 9 },
    second: { name: "猪杂粉", main: "offal", noodle: "flat", taste: 58, charm: 46, price: 10 },
    fame: 11,
    takeoverFeeYuan: 7_500,
    exitGoal: 5,
    lines: [
      "石埠路口那家六点开锅，学生赶早自习顺路。",
      "石埠路口老友粉把桌子摆到树底下。",
      "石埠路口那家换了煮粉的师傅，听说手快。",
    ],
  },
  {
    id: "anji",
    district: "xixiangtang",
    name: "安吉客运站粉店",
    tier: 1,
    signature: { name: "瘦肉粉", main: "pork", noodle: "round", taste: 55, charm: 50, price: 8 },
    second: { name: "素粉", main: "veg", noodle: "flat", taste: 50, charm: 44, price: 6 },
    fame: 9,
    takeoverFeeYuan: 5_500,
    exitGoal: 4,
    lines: [
      "安吉客运站那家，赶车的人端着碗站着吃。",
      "安吉那家把价牌压到八块，说是走量。",
      "安吉客运站粉店凌晨四点就亮灯。",
    ],
  },
  {
    id: "pumiao",
    district: "yongning",
    name: "蒲庙老街粉档",
    tier: 1,
    signature: { name: "生榨米粉", main: "pork", noodle: "dry", taste: 57, charm: 46, price: 8 },
    second: { name: "猪红粉", main: "offal", noodle: "flat", taste: 54, charm: 42, price: 9 },
    fame: 8,
    takeoverFeeYuan: 5_000,
    exitGoal: 4,
    lines: [
      "蒲庙老街那家还自己榨粉，酸味冲。",
      "蒲庙老街的粉档只在上午开。",
      "蒲庙老街那家说游客多了，粉不够卖。",
    ],
  },
  {
    id: "wuming_city",
    district: "wuming",
    name: "武鸣城厢粉店",
    tier: 2,
    signature: { name: "柠檬鸭粉", main: "duck", noodle: "round", taste: 68, charm: 58, price: 13 },
    second: { name: "酸粉", main: "veg", noodle: "dry", taste: 62, charm: 54, price: 9 },
    fame: 15,
    takeoverFeeYuan: 18_000,
    exitGoal: 7,
    lines: [
      "武鸣城厢那家把柠檬鸭剁进粉里，外地人吃不惯。",
      "武鸣城厢粉店门口停满了电动车。",
      "武鸣城厢粉店的老板娘会讲两句壮话。",
    ],
  },
  {
    id: "longan_town",
    district: "longan",
    name: "隆安县城粉铺",
    tier: 1,
    signature: { name: "猪杂粉", main: "offal", noodle: "flat", taste: 56, charm: 45, price: 8 },
    second: { name: "牛腩粉", main: "brisket", noodle: "round", taste: 60, charm: 47, price: 11 },
    fame: 9,
    takeoverFeeYuan: 6_000,
    exitGoal: 4,
    lines: [
      "隆安县城那家中午过后就没什么人。",
      "隆安县城粉铺的桌子是自家打的木桌。",
      "隆安县城粉铺说今年猪价高，肉切得薄了。",
    ],
  },
  {
    id: "henglou",
    district: "hengzhou",
    name: "横州老友粉店",
    tier: 2,
    signature: { name: "老友粉", main: "pork", noodle: "flat", taste: 65, charm: 56, price: 10 },
    second: { name: "茉莉花茶粉", main: "veg", noodle: "round", taste: 58, charm: 60, price: 11 },
    fame: 14,
    takeoverFeeYuan: 16_000,
    exitGoal: 6,
    lines: [
      "横州那家拿茉莉花窨的茶配粉，闻着倒怪好。",
      "横州老友粉店的酸笋是自家坛子腌的。",
      "横州老友粉店说今年茉莉花价跌了，茶倒便宜。",
    ],
  },
  {
    id: "mashan_street",
    district: "mashan",
    name: "马山巷口粉摊",
    tier: 1,
    signature: { name: "八角卤粉", main: "pork", noodle: "dry", taste: 54, charm: 43, price: 7 },
    second: { name: "羊杂粉", main: "offal", noodle: "round", taste: 58, charm: 44, price: 11 },
    fame: 7,
    takeoverFeeYuan: 4_500,
    exitGoal: 4,
    lines: [
      "马山巷口那家卤水下了八角，香得远。",
      "马山巷口粉摊只有三张矮桌。",
      "马山巷口粉摊的老板说山上湿气重，辣椒要多放。",
    ],
  },
  {
    id: "binyang_market",
    district: "binyang",
    name: "宾阳市场粉档",
    tier: 2,
    signature: { name: "酸粉", main: "veg", noodle: "dry", taste: 63, charm: 55, price: 8 },
    second: { name: "猪脚粉", main: "trotter", noodle: "claypot", taste: 68, charm: 57, price: 14 },
    fame: 13,
    takeoverFeeYuan: 15_000,
    exitGoal: 6,
    lines: [
      "宾阳市场那家酸粉是祖上传的坛子。",
      "宾阳市场粉档赶圩那天要排队到街上。",
      "宾阳市场粉档的猪脚炖得烂，一夹就脱骨。",
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
