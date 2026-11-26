/**
 * 店底子（批 BA′）：可以**买断**的两类上限
 *
 * 出处：开罗 `custom.txt`（4 类 × 5 级，每级一个递增的价格 + 一个永久数值）。
 * 原文四类：`品質UP` / `難しさDOWN` / `価格UP` / `材料費DOWN`。
 *
 * 只做两类（`GAP四轮-2026-11-26` 第五节的判断，这里执行）：
 *   - `難しさDOWN` 不照搬 —— 本作的难度不由玩家调，这是设计前提，不是缺失；
 *   - `価格UP` 不照搬 —— 本作的价格本来就是「当下选择」，而且每一款能卖多少有
 *     `valueScore` 在算，再开一条「把价格上限买上去」会变成第二套定价。
 *
 * 剩下的两类恰好是本作**已经有两个乘数、但只能靠当天的选择**的地方：
 *   - `品質UP` → `charmBoost`（卖相与分量感抬多少）。本作它挂在「今天进哪档货」上，
 *     平常货就是 0。买断之后，**同一档进货你做得更细**，所以加成往上走。
 *   - `材料費DOWN` → `costMult`（配料料钱乘数）。本来只有「进便宜货」一条路，
 *     而便宜货会把卖相打下来。买断之后料钱永久往下走，卖相一分不掉。
 *
 * 三条纪律：
 *   1. **买断的是上限，不是今天的选择。** 品质档仍然三档、仍然每天可以换；
 *      买断只是把三档各自的加成抬高，把料钱各自的乘数压低。
 *   2. **两级之间不跳档。** 价格与效果都只跟「买到第几级」有关，
 *      不跟别的系统相乘，也不进 `FLOW` —— 这四个数是资本品，不是配平。
 *   3. **默认 0 级时两个出口都是恒等**（`+0` 与 `×1`），所以历史回归锁一分不动。
 */

export type CustomId = "taste" | "cost";

export interface CustomTier {
  /** 这一级要多少钱（¥） */
  costYuan: number;
  /** 买到手的是什么东西 */
  name: string;
  /** 一句话：为什么这一级值这个钱 */
  why: string;
}

export interface CustomSource {
  label: string;
  url: string;
  quote: string;
}

export interface CustomDef {
  id: CustomId;
  /** 买菜牌上那一列的字 */
  name: string;
  /** 它动的是模型里哪一个乘数（写给玩家看的，不写变量名） */
  effect: string;
  /** 买满之后能到什么程度（一句话，含数字） */
  ceiling: string;
  tiers: readonly CustomTier[];
  kairo: string;
  source: CustomSource;
}

/** 买满要几级 */
export const MAX_CUSTOM_LEVEL = 5;

/**
 * 卖相加成：买到第 N 级时的**累计**加成（不是这一级的增量）。
 *
 * 为什么写成累计表而不是「每级 +0.10 再乘」：玩家在面板上看到的是
 * 「现在 +30%」，而这一格必须能一眼对上公式 —— `charmBoost + 这张表[级]`。
 *
 * 0.50 这个顶是算过的：最高档「头手货」原本 `charmBoost = 0.55`，
 * 买满之后是 1.05 —— **头手货的卖相顶到 100 那个天花板**，而这一档在买断前到不了。
 * 这就是判据原文「品质上限从 top 再往上」的落地方式：
 * 不是把平常货压过头手货（0.50 < 0.55，压不过也不该压），而是把三档各自往上抬，
 * 抬到「原来只有最贵那档能摸到的位置，现在平常货也摸得到」。
 */
export const TASTE_FLOOR: readonly number[] = [0, 0.1, 0.2, 0.3, 0.4, 0.5];

/**
 * 料钱折让：买到第 N 级时的**乘数**（不是这一级的增量）。
 *
 * 每级 −3%（判据原文「料钱永久 −3%/级，5 级」），五级合计 −15%。
 * 只乘配料那一段（`topCost * qq.costMult`），主料、分量、进货档的米与骨都不打折 ——
 * 与品质档同一条边界，不然「省了料钱」会被读成「整碗变便宜了」。
 */
export const COST_FACTOR: readonly number[] = [1, 0.97, 0.94, 0.91, 0.88, 0.85];

export const CUSTOMS: readonly CustomDef[] = [
  {
    id: "taste",
    name: "手艺的底子",
    effect: "卖相加成往上走",
    ceiling: "买满之后，头手货的卖相顶到 100 那个天花板（买断前到不了）",
    tiers: [
      {
        costYuan: 12_000,
        name: "一口厚陶缸",
        why: "酸笋自己腌，不用档口那个调味过头的坛子 —— 发到什么程度自己看着。",
      },
      {
        costYuan: 28_000,
        name: "开市前留一小时备料",
        why: "不在客人上门时现切现抓。切得匀不匀，第一口就吃得出。",
      },
      {
        costYuan: 55_000,
        name: "一把好刀",
        why: "粉肠要脆，靠的是刀口齐 —— 钝刀压出来的断面，煮两下就老。",
      },
      {
        costYuan: 95_000,
        name: "料按份分好",
        why: "一碗一碗地配，不再临场抓一把。多了压味，少了寡淡。",
      },
      {
        costYuan: 150_000,
        name: "方子写下来贴在墙上",
        why: "谁掌勺都照这个来。人换了，那碗粉不换。",
      },
    ],
    kairo: "品質UP（5 级，+6/+5/+5/+7/+8）",
    source: {
      label: "新华网《南宁老友粉：人因此味「粉」邕州》",
      url: "http://gx.xinhuanet.com/20260423/e911110a855f4dc9ba14f29617d490ca/c.html",
      quote: "如果酸笋发酵过久，酸度超标，会盖过豆豉的醇厚",
    },
  },
  {
    id: "cost",
    name: "料钱的底子",
    effect: "料钱永久往下走",
    ceiling: "买满之后，配料料钱是原价八五折，卖相一分不掉",
    tiers: [
      {
        costYuan: 18_000,
        name: "跟档口签个长期价",
        why: "不用每天开市前去问价，也不用怕今天涨两毛。",
      },
      {
        costYuan: 42_000,
        name: "一次进够三天的量",
        why: "批量的价，比自己一篮一篮拎回来便宜。冰柜放得住就行。",
      },
      {
        costYuan: 85_000,
        name: "认得批发市场的人",
        why: "知道哪家什么时候有新货，也知道谁家的价是喊给生客听的。",
      },
      {
        costYuan: 150_000,
        name: "自己发豆豉",
        why: "不用买坛装的。豆豉这一味，本来就是一坛一坛发出来的。",
      },
      {
        costYuan: 240_000,
        name: "自己跑一趟产地",
        why: "酸笋从坛子边直接拉回来，中间那两道手都不用了。",
      },
    ],
    kairo: "材料費DOWN（5 级，−1,500/−6,000/−8,000/−9,000/−9,000）",
    source: {
      label: "百度百科《南宁老友粉》",
      url: "https://baike.baidu.com/item/%E5%8D%97%E5%AE%81%E8%80%81%E5%8F%8B%E7%B2%89/1455207",
      quote: "所用酸笋、酸辣椒、豆豉等原料都必须用传统的腌制方法腌制",
    },
  },
];

export const CUSTOM_BY_ID: ReadonlyMap<string, CustomDef> = new Map(CUSTOMS.map((c) => [c.id, c]));

export const CUSTOM_IDS: readonly CustomId[] = CUSTOMS.map((c) => c.id);

export function customById(id?: string | null): CustomDef | undefined {
  return id ? CUSTOM_BY_ID.get(id) : undefined;
}

/** 买到第 N 级时的累计卖相加成（越界夹住） */
export function tasteFloorAt(level: number): number {
  const lv = Math.max(0, Math.min(MAX_CUSTOM_LEVEL, Math.floor(level)));
  return TASTE_FLOOR[lv] ?? 0;
}

/** 买到第 N 级时的料钱乘数（越界夹住） */
export function costFactorAt(level: number): number {
  const lv = Math.max(0, Math.min(MAX_CUSTOM_LEVEL, Math.floor(level)));
  return COST_FACTOR[lv] ?? 1;
}

/** 两类买满要多少钱（文档与面板都用这一处算，别再手抄） */
export function customTotalYuan(id: CustomId): number {
  return (customById(id)?.tiers ?? []).reduce((sum, t) => sum + t.costYuan, 0);
}
