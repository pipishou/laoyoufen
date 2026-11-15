/**
 * 坐标系（anchors）—— 钱、碗、时间三把尺子的唯一换算点。
 *
 * 起这个文件的原因（用户 m04226 明确要求「本土化的内容特别是钱和老友粉等坐标系内容要做好」）：
 * 之前每个新数值都是「拍一个看起来合理的元数」，于是出现三种病：
 *   1) 灶 ¥2,400 与房租 ¥4,620/月 同量级 → 一次性投入没有份量；
 *   2) 段位费 ¥50–20,000 与月营收 ¥27,000 同量级 → 门槛等于免费；
 *   3) 开罗的 250 KCU 被折成 ¥2.5 → 跨作品坐标系混用（开罗一碗 ≈1,000 KCU，我们一碗 ¥9）。
 *
 * 规则（新数值必须先过这三关，再写成元）：
 *   - **第一关：几碗**。资本性支出写「值多少碗」（`bowls()`）。
 *   - **第二关：几个月营收**。跨月支出写「占几个月流水」（`monthRevenue()`、`monthsOf()`）。
 *   - **第三关：几小时工时**。工资类写「几小时工资」（南宁 2025 最低工资 ¥1,990/月、21.75 天 → 约 ¥11.4/小时）。
 * 三条尺子都在本文件里，任何一处换算改动只能改这里。
 */

import { GUANGXI } from "./balance";

/** 一碗老友粉的成本构成（元）。合计 = GUANGXI.bowlCostYuan = 4.2 */
export const BOWL_BREAKDOWN = {
  /** 二两切粉 */
  riceNoodle: 1.1,
  /** 猪杂（粉肠/瘦肉/猪肝） */
  porkOffal: 2.3,
  /** 酸笋 + 豆豉 + 蒜 + 辣椒 + 油 */
  seasoning: 0.8,
} as const;

/** 一碗的售价 / 成本 / 毛利（元）。售价取现实二两猪杂老友粉的常见价。 */
export const BOWL = {
  priceYuan: GUANGXI.bowlPriceYuan, // 10
  costYuan: GUANGXI.bowlCostYuan, // 4.2
  get marginYuan(): number {
    return this.priceYuan - this.costYuan;
  },
  get marginRate(): number {
    return this.marginYuan / this.priceYuan;
  },
} as const;

/** 时间尺：一局 36 个月 = 3 年；1 月 30 天；1 天 120 游戏分钟 = 12 现实小时 */
export const TIME = {
  monthsTotal: 36,
  daysPerMonth: 30,
  minutesPerDay: 120,
  /** 1 游戏分钟 = 6 现实分钟（见 balance.REAL_MINUTES_PER_GAME_MINUTE） */
  realMinutesPerGameMinute: 6,
} as const;

/** 现实工资锚（南宁 2025 量级，月薪制） */
export const LABOR = {
  /** 最低工资 ¥1,990/月，按 21.75 天 → 91.5 元/天 → 11.4 元/小时（8 小时） */
  minWageMonthly: 1_990,
  workDaysPerMonth: 21.75,
  get dayYuan(): number {
    return this.minWageMonthly / this.workDaysPerMonth;
  },
  get hourYuan(): number {
    return this.dayYuan / 8;
  },
} as const;

/** 把元折成「几碗」（保留 1 位小数） */
export function bowls(yuan: number): number {
  return Math.round((yuan / BOWL.priceYuan) * 10) / 10;
}

/** 一碗的毛利能抵多少碗的售价（即「卖几碗才够这笔钱」按毛利算） */
export function bowlsByMargin(yuan: number): number {
  return Math.round((yuan / BOWL.marginYuan) * 10) / 10;
}

/** 月营收（默认按现实 70 碗/日 × 30 天，即 ¥21,000；与 balance.TARGET_BASE_YUAN 同源） */
export function monthRevenue(bowlsPerDay: number = GUANGXI.dailyBowls[1]): number {
  return Math.round(bowlsPerDay * BOWL.priceYuan * TIME.daysPerMonth);
}

/** 这笔钱相当于几个月的（默认档）营收 */
export function monthsOf(yuan: number, bowlsPerDay: number = GUANGXI.dailyBowls[1]): number {
  return Math.round((yuan / monthRevenue(bowlsPerDay)) * 100) / 100;
}

/** 这笔钱相当于多少小时的最低工资 */
export function laborHours(yuan: number): number {
  return Math.round((yuan / LABOR.hourYuan) * 10) / 10;
}

/**
 * 资本阶梯（S3–S6 的全部价格，一次写清）。
 *
 * 定法：每一档写「值多少碗」，再折成元；档间级差 ≥ 2.5 倍，跨档总量必须
 * 与三年现金（约 ¥25 万量级）同阶，否则「钱没去处」的病会复发。
 */
export const CAPITAL = {
  /** S3 布置：整套风格（5 部件） */
  styleSetYuan: [3_000, 4_500, 6_000, 8_000] as const,
  /** S4 设备：四档（灶 / 粉篓 / 案台同价梯度） */
  equipmentYuan: [1_500, 3_800, 9_000, 30_000] as const,
  /** S5 扩建：加座 / 排队区+二楼 */
  expansionYuan: [12_000, 35_000] as const,
  /** S6 区县转让费：见 data/nanning.ts（¥0–¥120,000） */
  districtMaxYuan: 120_000,
  /** 段位审查费 11 级（第 11 级是终局，不收费） */
  gradeFeeYuan: [
    500, 1_500, 3_000, 6_000, 12_000, 20_000, 35_000, 55_000, 80_000, 120_000, 0,
  ] as const,
} as const;

/** 段位费合计（用于「钱有没有去处」的自检断言） */
export function totalGradeFee(): number {
  return CAPITAL.gradeFeeYuan.reduce<number>((a, b) => a + b, 0);
}

/** 资本品总投入（布置 4 套 + 设备 3 类 × 4 档 + 扩建 2 项） */
export function totalCapital(): number {
  const style = CAPITAL.styleSetYuan.reduce((a, b) => a + b, 0);
  const equip = CAPITAL.equipmentYuan.reduce((a, b) => a + b, 0) * 3;
  const expand = CAPITAL.expansionYuan.reduce((a, b) => a + b, 0);
  return style + equip + expand;
}
