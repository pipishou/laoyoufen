/**
 * 货币（第 9 批）——本作的「元」是南宁街上的元，不是开罗 KCU 换了皮。
 *
 * 起因：A4 的碗是照开罗 `bowl.txt` 的量级定的价（搪瓷碗 ¥600、瓦煲 ¥2,600、大盆 ¥1,200），
 * 而这家店一碗老友粉卖 ¥10 —— 一个碗顶六十碗粉，玩家一眼就出戏。
 *
 * 根子在换算。`data/balance.ts` 的 `KCU_TO_YUAN = 0.01`（开罗上班族 1050 KCU
 * ↔ 南宁一碗粉 ¥10）是给**一次消费**用的，不是给道具用的：开罗的道具价是玩法价
 * （要你在几十件里取舍），不是零售价，直接乘 0.01 就把「一撂餐具」变成「一只碗六百块」。
 *
 * 所以本作分两个口径，不许混：
 *
 *   消费侧（一碗粉、一份料、工资、房租）
 *     —— 真实单价，见 `data/balance.ts` 的 `GUANGXI`（一碗 ¥10、料钱 ¥4.8）。
 *
 *   道具侧（碗、家当、设备、店面、街面、铺位、扩建）
 *     —— 真实单价 × 采购量。一件商品代表「一次实际要买多少」：
 *        一撂搪瓷碗 20 只、一箱打包碗 500 只、一台烟罩、一次装修。
 *        这样价格既对得上现实，又保住取舍（买一台冰柜约等于四天毛利）。
 *
 * `PRICE_BANDS` 是回归锁：任何新加的价都要落进区间，`data/money.test.ts` 会遍历所有表。
 * 写价之前先写清单位（`unit`）——写不清单位的多半是量级想错了。
 */

export interface PriceBand {
  /** 下限（含） */
  min: number;
  /** 上限（含） */
  max: number;
  /** 这件东西按什么单位买（写不清单位的价多半是量级错了） */
  unit: string;
  /** 现实锚点一句话 */
  note: string;
}

export const PRICE_BANDS = {
  /** 碗：按一撂 / 一箱买，不是按「一只」 */
  bowlSet: {
    min: 40,
    max: 400,
    unit: "一撂 / 一箱",
    note: "搪瓷碗 ¥8 一只、大盆 ¥12 一只、瓦煲 ¥35 一个、打包碗 ¥0.35 一只",
  },
  /** 一碗粉卖多少钱 */
  noodlePrice: {
    min: 6,
    max: 20,
    unit: "一碗",
    note: "南宁二两老友粉 ¥8–15，本作取 ¥10",
  },
  /** 一份料钱 */
  ingredientCost: {
    min: 0.2,
    max: 12,
    unit: "一份",
    note: "酸笋几毛、猪杂一块二、牛肉五块",
  },
  /** 家当 / 摆件：一台 / 一张 / 一套 */
  gearPiece: {
    min: 50,
    max: 4_000,
    unit: "一台 / 一张 / 一套",
    note: "塑料凳 ¥15 一只（十只一撂）、冰柜 ¥3,200 一台、神龛 ¥2,200",
  },
  /** 设备（灶 / 粉篓 / 案台）四档 */
  equipment: {
    min: 800,
    max: 35_000,
    unit: "一台",
    note: "商用猛火灶 ¥1,500 起，顶档是整套不锈钢后厨",
  },
  /** 店面（整店一套） */
  style: {
    min: 300,
    max: 8_000,
    unit: "一套（整店）",
    note: "刷墙换桌椅 ¥4,000，精装 ¥2 万；本作六档取渐进价",
  },
  /** 街面（一处） */
  street: {
    min: 3_000,
    max: 35_000,
    unit: "一处",
    note: "修一段路灯 ¥6,000、菜市后门改造 ¥3 万",
  },
  /** 铺位转让费（一间） */
  site: {
    min: 10_000,
    max: 30_000,
    unit: "一间（转让费）",
    note: "南宁临街铺面转让费 ¥1.5–2.8 万",
  },
  /** 扩建（一次工程） */
  expansion: {
    min: 8_000,
    max: 120_000,
    unit: "一次",
    note: "打通隔墙 ¥1.2 万、整层扩建 ¥3.5 万起",
  },
  /** 比赛报名费 */
  contestFee: {
    min: 0,
    max: 8_000,
    unit: "一次报名",
    note: "街道办免费、市级几百、全国几千",
  },
  /** 比赛奖金 */
  contestPrize: {
    min: 500,
    max: 60_000,
    unit: "一次奖金",
    note: "街道办 ¥1,200、全国 ¥5 万",
  },
  /** 落场奖金 */
  arenaPrize: {
    min: 300,
    max: 6_000,
    unit: "一场",
    note: "夜市小局 ¥800",
  },
  /** 段位评定费 */
  gradeFee: {
    min: 0,
    max: 130_000,
    unit: "一次评定",
    note: "评定费是象征性收费，顶档含非遗认定材料",
  },
} as const satisfies Record<string, PriceBand>;

export type PriceBandId = keyof typeof PRICE_BANDS;

export function inBand(id: PriceBandId, value: number): boolean {
  const b = PRICE_BANDS[id];
  return value >= b.min && value <= b.max;
}

/** 参考量：小店一天 70 碗、一碗毛利 ¥5.2 → 日毛利 ¥364 */
export const DAY_MARGIN_YUAN = 364;

/**
 * 这笔钱相当于几天毛利（面板与文档都用它判断量级对不对）。
 * 一台冰柜 ¥3,200 ≈ 8.8 天毛利 —— 现实粉店买冰柜要攒一周多，对得上。
 */
export function daysOfMargin(yuan: number): number {
  return Math.round((yuan / DAY_MARGIN_YUAN) * 10) / 10;
}

/** 一句话说清这笔钱的分量：「≈ 4.4 天毛利」 */
export function marginWords(yuan: number): string {
  const d = daysOfMargin(yuan);
  return d < 1 ? `约${Math.round(d * 24)}小时毛利` : `约${d}天毛利`;
}
