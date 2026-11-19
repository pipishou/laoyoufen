/**
 * 十四场具名赛事：街道办 → 城区 → 南宁市 → 广西 → 全国。
 *
 * 为什么要有这张表：开罗 `English.lproj__rally.txt` 有 54 场具名场地
 * （`First Arena` 门槛 3 → `Royal Bowl` 门槛 27，主办从 `Assistant` 一路换到 `Ramen King`），
 * 玩家每赢一场就换一个「更大的场子」。我们原来只有「7 级门票 × 3 种类型」，
 * 同一套玩法没有名字，中期没有「下一场是哪个场子」的目标感。
 *
 * 本土化做法：
 *   ① 层级照现实来 —— 街道办 / 城区 / 南宁市 / 广西 / 全国，五级就够，不做「世界大赛」；
 *   ② 主办方全用现实里真会办这种事的单位（街道办、文化馆、商务局、人社局、烹协、文旅厅、非遗中心）；
 *   ③ 报名费、奖金、对手基准分**不新造**，一律引用已有的 `CONTEST_TIERS`（tier 1-5）；
 *   ④ 每场限定月份（街道办随时、城区六月、市级/广西/全国十二月），与 `sim/calendar.ts` 的一年两届同构。
 *
 * 与开罗的差异（写在这里免得以后有人照抄）：
 *   开罗是「同一套 Arena 玩法换 54 个名字」，我们是「五级 × 三种比法（练人 / 养客 / 立招牌）」，
 *   所以 14 场里每级都同时有 staff / customers / shop 三种，玩家总能找到自己那条路。
 */

import type { ContestTypeId } from "./contest";

export type TourneyWhen = "anytime" | "june" | "december";

export const TOURNEY_WHEN_LABEL: Record<TourneyWhen, string> = {
  anytime: "随时可报",
  june: "每年六月",
  december: "每年十二月",
};

export type TourneyLevel = 1 | 2 | 3 | 4 | 5;

export const TOURNEY_LEVEL_NAME: Record<TourneyLevel, string> = {
  1: "街道办级",
  2: "城区级",
  3: "南宁市级",
  4: "广西级",
  5: "全国级",
};

export interface TourneyDef {
  id: string;
  name: string;
  /** 主办方（现实里真会办这种事的单位） */
  host: string;
  level: TourneyLevel;
  type: ContestTypeId;
  /** 引用 `CONTEST_TIERS` 的档位：报名费 / 奖金 / 对手基准分都从那里来 */
  tier: number;
  when: TourneyWhen;
  /** 前置：上一级里任意一场进过前 N 名（不做「打完上一级全部」——36 个月打不完） */
  needLevel?: TourneyLevel;
  needRank?: number;
  /** 一句南宁话 */
  pitch: string;
}

export const TOURNEYS: readonly TourneyDef[] = [
  // ── 街道办级：随时可报，一年里想打几场打几场（有当日冷却） ──
  {
    id: "chaoyang_street",
    name: "朝阳街道·街坊粉王赛",
    host: "朝阳街道办",
    level: 1,
    type: "shop",
    tier: 1,
    when: "anytime",
    pitch: "街道办牵的头，奖品是一面锦旗和一箱矿泉水。",
  },
  {
    id: "zhongshan_night",
    name: "中山路夜市·夜宵争霸",
    host: "中山路夜市管委会",
    level: 1,
    type: "customers",
    tier: 1,
    when: "anytime",
    pitch: "比谁家门口排得长，十点以后才算数。",
  },
  {
    id: "wangzhouting_taste",
    name: "望州岭社区·邻里口味赛",
    host: "望州岭社区居委会",
    level: 1,
    type: "staff",
    tier: 2,
    when: "anytime",
    pitch: "社区活动室的折叠桌，阿婆们一人一票。",
  },

  // ── 城区级：每年六月 ──
  {
    id: "xingning_skill",
    name: "兴宁区·老友粉技艺赛",
    host: "兴宁区文化馆",
    level: 2,
    type: "shop",
    tier: 2,
    when: "june",
    needLevel: 1,
    needRank: 3,
    pitch: "文化馆二楼，评委里有两位退休的粉店老师傅。",
  },
  {
    id: "qingxiu_foodfest",
    name: "青秀区·南湖美食节",
    host: "青秀区商务局",
    level: 2,
    type: "customers",
    tier: 3,
    when: "june",
    needLevel: 1,
    needRank: 3,
    pitch: "南湖边上搭棚，三天人流，谁家队伍最长谁上台。",
  },
  {
    id: "xixiangtang_campus",
    name: "西乡塘区·大学城粉面赛",
    host: "西乡塘区文广体旅局",
    level: 2,
    type: "staff",
    tier: 3,
    when: "june",
    needLevel: 1,
    needRank: 3,
    pitch: "学生评委最不留情面，好吃就是好吃。",
  },

  // ── 南宁市级：每年十二月 ──
  {
    id: "nanning_skill",
    name: "南宁市·老友粉技能大赛",
    host: "南宁市人社局",
    level: 3,
    type: "staff",
    tier: 3,
    when: "december",
    needLevel: 2,
    needRank: 3,
    pitch: "有证的那种比赛，前三名发职业资格证。",
  },
  {
    id: "nanning_foodlist",
    name: "南宁市·邕江美食榜",
    host: "南宁市商务局",
    level: 3,
    type: "shop",
    tier: 4,
    when: "december",
    needLevel: 2,
    needRank: 3,
    pitch: "上榜的店门口会挂块铜牌，游客照着牌子找。",
  },
  {
    id: "nanning_wordofmouth",
    name: "南宁市·街坊口碑总评",
    host: "南宁日报",
    level: 3,
    type: "customers",
    tier: 4,
    when: "december",
    needLevel: 2,
    needRank: 3,
    pitch: "记者蹲点三天，数的是回头客。",
  },

  // ── 广西级：每年十二月，要市级进过前三 ──
  {
    id: "gx_ricefair",
    name: "广西·米粉产业大会",
    host: "自治区商务厅",
    level: 4,
    type: "shop",
    tier: 4,
    when: "december",
    needLevel: 3,
    needRank: 3,
    pitch: "会展中心一整排展位，桂林米粉和螺蛳粉都在对面。",
  },
  {
    id: "gx_chef",
    name: "广西·八桂名厨赛",
    host: "广西烹饪餐饮行业协会",
    level: 4,
    type: "staff",
    tier: 5,
    when: "december",
    needLevel: 3,
    needRank: 3,
    pitch: "灶台一字排开，评委背着手在身后走。",
  },
  {
    id: "gx_culture",
    name: "广西·桂菜文化节",
    host: "自治区文化和旅游厅",
    level: 4,
    type: "customers",
    tier: 5,
    when: "december",
    needLevel: 3,
    needRank: 3,
    pitch: "三天流水席，谁家桌子翻得快谁赢。",
  },

  // ── 全国级：每年十二月，要广西进过前三 ──
  {
    id: "cn_ricecongress",
    name: "全国·中华米粉大会",
    host: "中国烹饪协会",
    level: 5,
    type: "shop",
    tier: 5,
    when: "december",
    needLevel: 4,
    needRank: 3,
    pitch: "全国三十四个省区的代表，广西这一桌只坐得下一个人。",
  },
  {
    id: "cn_heritage",
    name: "全国·老友粉非遗传承赛",
    host: "非遗保护中心",
    level: 5,
    type: "staff",
    tier: 5,
    when: "december",
    needLevel: 4,
    needRank: 3,
    pitch: "比的不是快，是那口锅气传没传下来。",
  },
];

export const TOURNEY_BY_ID: ReadonlyMap<string, TourneyDef> = new Map(
  TOURNEYS.map((t) => [t.id, t]),
);

export const TOURNEY_TOTAL = TOURNEYS.length;

const LEVEL_ORDER: readonly TourneyLevel[] = [1, 2, 3, 4, 5];

export function tourneysOfLevel(level: TourneyLevel): readonly TourneyDef[] {
  return TOURNEYS.filter((t) => t.level === level);
}

export function tourneyLevels(): readonly TourneyLevel[] {
  return LEVEL_ORDER;
}
