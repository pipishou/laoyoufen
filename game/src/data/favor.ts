/**
 * 人情（M3b）：街坊愿意帮你一把的那点交情。
 *
 * 开罗叫 Spirit Points，四条来源原句都抄在下面，用的是同一套结构，名字全换：
 *
 * - `▼Customer Fullness`：`When customers eat, their fullness will increase. If it reaches
 *   the max, you will get Spirit Points. The higher a ramen's volume, the more fullness will
 *   increase and the longer it will take to eat.` → **一碗吃到底才给**，份量越大越容易吃满。
 *   对应到我们：三两吃到底 +2，其余吃到底 +1（份量已经在 `data/mains.ts` 的 PORTIONS 里）。
 * - `▼Ramen Lab 1`：`You can sell unneeded ramen recipes here. … Get Spirit Points`
 *   → **转手**卖掉的配方按「味道 + 卖过多少碗」折人情。
 * - `▼Customers 2`：`If you feed customers a lot of the kind of ramen they like, they may
 *   give you presents` → 熟客回礼时顺带 +1。
 * - `▼Ramen Arena 1/2`：比赛有名次就有奖 → 前三名 +10 / +6 / +4。
 *
 * 花法照 `▼Item Shop`：`Spirit Points are used to purchase items.`
 * 我们的「道具」只有三样，都落在已经存在的系统上，不新开一套引擎：
 *
 * 1. 请老师傅尝一口（升当前这碗最弱的一味汤参）← 开罗 Ramen Lab 的改良
 * 2. 让师傅带一手（升在职员工最弱的一项技能）← `Item · Cookbook A "Boosts one staff's cooking."`
 * 3. 摆一桌请街坊（当天进店率 +25%）← `Ramen Arena 3 · Pop Up: Raise popularity`
 *
 * 单位就叫「点」，不叫积分也不叫货币 —— 街坊给的是面子，不是钱。
 */

export type FavorUseId = "hint_recipe" | "teach_staff" | "treat_street";

export interface FavorUseDef {
  id: FavorUseId;
  name: string;
  costPoints: number;
  /** 面板上给玩家看的一句效果 */
  effect: string;
  /** 用了之后的南宁话 */
  line: string;
  /** 开罗出处（只在 ?dev=1 时显示） */
  kairo: string;
}

export const FAVOR_USES: readonly FavorUseDef[] = [
  {
    id: "hint_recipe",
    name: "请老师傅尝一口",
    costPoints: 8,
    effect: "把这碗里最欠的那味汤参往上提一档",
    line: "阿婆舀一口，说豆豉下少了，抬手就给你添一勺。",
    kairo: "Ramen Lab 1 · 改良配方（花资源换成长）",
  },
  {
    id: "teach_staff",
    name: "让师傅带一手",
    costPoints: 12,
    effect: "在职员工里手艺最低的那位涨一档（最高 5 档）",
    line: "师傅蹲在灶边，教了两手翻锅，围裙都还是湿的。",
    kairo: 'Item · Cookbook A「Boosts one staff\'s cooking.」',
  },
  {
    id: "treat_street",
    name: "摆一桌请街坊",
    costPoints: 6,
    effect: "今天进店的人多两成半（一天一次）",
    line: "傍晚在巷口摆两张桌，路过的人都来尝一口。",
    kairo: "Ramen Arena 3 · Pop Up「Raise popularity」",
  },
];

export const FAVOR_BY_ID = new Map<string, FavorUseDef>(FAVOR_USES.map((u) => [u.id, u]));

/** 人情来源的数值，集中在一处，改数只改这里 */
export const FAVOR_GAIN = {
  /** 普通碗吃到底 */
  finishBowl: 1,
  /** 三两吃到底（份量越大越容易吃满，开罗的原话） */
  finishBigBowl: 2,
  /** 「吃到底」的判定线：满意到这个数就算吃干净了 */
  finishSat: 70,
  /** 转手一份配方的基础人情 */
  recipeSaleBase: 8,
  /** 每 5 点味道分再 +1 */
  recipeSalePerScore: 5,
  /** 每卖 50 碗再 +1，最多 +10 */
  recipeSalePerSold: 50,
  recipeSaleSoldCap: 10,
  /** 熟客回礼顺带的人情 */
  gift: 1,
  /** 比赛前三名（第 1 / 2 / 3） */
  contestTop3: [10, 6, 4] as const,
  /** 一天最多靠「吃到底」攒多少（防止挂机刷） */
  dailyCapByBowls: 40,
} as const;

/** 「摆一桌」当天进店率倍率 */
export const TREAT_ATTRACT = 1.25;

/** 请老师傅那一勺加多少 */
export const HINT_STEP = 6;

/** 让师傅带一手：手艺涨几档（技能是 1–5 档） */
export const TEACH_STEP = 1;

/** 人情上限（只是防溢出，正常玩不到） */
export const FAVOR_MAX = 999;

/** 转手一份配方能换多少人情 */
export function recipeSaleFavor(total: number, sold: number): number {
  const byScore = Math.floor(Math.max(0, total) / FAVOR_GAIN.recipeSalePerScore);
  const bySold = Math.min(
    FAVOR_GAIN.recipeSaleSoldCap,
    Math.floor(Math.max(0, sold) / FAVOR_GAIN.recipeSalePerSold),
  );
  return FAVOR_GAIN.recipeSaleBase + byScore + bySold;
}
