/**
 * 分店（S6）—— 照开罗拉面店 `store_data.txt` 的四种店面，用南宁的价重定。
 *
 * 开罗的原文（`English.lproj__store_data.txt`，第 4–7 行）：
 *   Small Shop   «The smallest shop.»   购店 30,000 / 月租 5,000
 *   Normal Shop  «A normal shop.»       购店 50,000 / 月租 10,000
 *   Big Shop     «A standard size shop.» 购店 100,000 / 月租 10,000
 *   Amazing Shop «A very large shop.»   购店 150,000 / 月租 25,000
 * 而且它们在 `rank.txt` 里是 rank 奖励（Buy Small → Buy Amazing），不是有钱就能买。
 *
 * 我们不能直接抄数字：开罗的 KCU 与人民币不可换算（见 `data/anchors.ts` 的文件头）。
 * 这里一律按「这家店自己一个月能做出多少碗 × 一碗毛利」反推，
 * 让四种店都落在 **4.5–10 个月回本** 的区间 —— 玩家看得懂，替身也算得清。
 *
 * 分店不是「主店的复制品」：它有自己的口碑（warmth，从 0.45 起每天 +0.03 养熟），
 * 吃自己所在区县的客流池，还要付店长工资。所以在同区连开四家是亏的（池子要均分）。
 */
import { BOWL, LABOR } from "./anchors";

export type BranchSizeId = "small" | "normal" | "big" | "amazing";

export interface BranchSizeDef {
  id: BranchSizeId;
  /** 店招上的名字 */
  name: string;
  /** 一句话卖点 */
  pitch: string;
  /** 一次性转让费 / 装修（¥） */
  openFeeYuan: number;
  /** 月租（¥）：分店在别处，房租单独算，不摊主店的租金 */
  rentMonthly: number;
  /** 名义座位数（只用于文案与产能换算） */
  seats: number;
  /** 名义灶位数 */
  stoves: number;
  /** 这家店一天最多做多少碗（不含口碑系数） */
  dayBowls: number;
  /** 需要主店评到第几段才准开（对齐开罗 rank 解锁） */
  minGrade: number;
  /** 开罗对应哪一行 */
  kairo: string;
  /** 南宁话 */
  line: string;
}

/**
 * 店长月薪：比掌勺贵一点（管一整家店）。
 * 现实里南宁餐饮店长 4,500–6,000，取 ¥4,800。
 */
export const MANAGER_MONTHLY = 4_800;

/** 一家店最多开几家分店（开罗可以买多家，这里先给 4 个位置） */
export const MAX_BRANCHES = 4;

/** 分店能吃到的本区客流比例：老板不在，接不满 */
export const BRANCH_TRAFFIC_SHARE = 0.6;

export const BRANCH_SIZES: BranchSizeDef[] = [
  {
    id: "small",
    name: "小档口",
    pitch: "一张案台两口锅，只做打包和过路客",
    openFeeYuan: 30_000,
    rentMonthly: 1_500,
    seats: 2,
    stoves: 1,
    dayBowls: 60,
    minGrade: 8,
    kairo: "Small Shop — The smallest shop.",
    line: "一个人一口锅，忙得过来就开",
  },
  {
    id: "normal",
    name: "标准店",
    pitch: "四张台，堂食打包各一半",
    openFeeYuan: 55_000,
    rentMonthly: 2_750,
    seats: 4,
    stoves: 1,
    dayBowls: 110,
    minGrade: 9,
    kairo: "Normal Shop — A normal shop.",
    line: "这条街上的粉店，大都长这样",
  },
  {
    id: "big",
    name: "大店",
    pitch: "六张台两口灶，中午能翻两轮",
    openFeeYuan: 85_000,
    rentMonthly: 4_300,
    seats: 6,
    stoves: 2,
    dayBowls: 170,
    minGrade: 10,
    kairo: "Big Shop — A standard size shop.",
    line: "能做团餐，学校门口最好",
  },
  {
    id: "amazing",
    name: "旗舰店",
    pitch: "八张台三口灶，门口还能排队",
    openFeeYuan: 120_000,
    rentMonthly: 6_000,
    seats: 8,
    stoves: 3,
    dayBowls: 240,
    minGrade: 11,
    kairo: "Amazing Shop — A very large shop.",
    line: "整条街就你一家，门口天天有人等",
  },
];

export const BRANCH_BY_ID = new Map<string, BranchSizeDef>(BRANCH_SIZES.map((b) => [b.id, b]));

export function branchSizeById(id: string): BranchSizeDef | null {
  return BRANCH_BY_ID.get(id) ?? null;
}

/** 这家店一个月能做出多少碗（按 30 天） */
export function monthBowlsOf(def: BranchSizeDef): number {
  return def.dayBowls * 30;
}

/** 满负荷时一个月的毛利（未扣房租与店长工资） */
export function monthGrossOf(def: BranchSizeDef): number {
  return Math.round(monthBowlsOf(def) * BOWL.marginYuan);
}

/** 满负荷时的月净利 */
export function monthNetOf(def: BranchSizeDef): number {
  return monthGrossOf(def) - def.rentMonthly - MANAGER_MONTHLY;
}

/** 大概几个月回本（满负荷） */
export function paybackMonthsOf(def: BranchSizeDef): number {
  const net = monthNetOf(def);
  return net > 0 ? Math.round((def.openFeeYuan / net) * 10) / 10 : Infinity;
}

/**
 * 店长的现实参照：`LABOR.chefMonthly` 是掌勺 ¥4,500，
 * 这个常量在上面写死是因为店长不跟技能挂钩（分店不模拟单个店员）。
 */
export const BRANCH_MANAGER_REF = LABOR.chefMonthly;
