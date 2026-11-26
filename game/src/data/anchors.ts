/**
 * 坐标系（anchors）—— 「钱 / 一碗粉 / 一小时劳动」的唯一换算点。
 *
 * 为什么有这个文件：数值散落时，谁也说不清「灶 ¥30,000」到底贵不贵。
 * 这里只做三件事：① 记下现实锚点的**出处与日期**；② 提供三个换算函数；③ 给出所有资本品的价表。
 * 任何新价格都必须先过三关（几碗 / 几个月营收 / 几小时工资），才有资格写成元。
 *
 * 现实锚点全部来自 2025 年公开报道（见 SOURCES），取值口径写在每条常量后面。
 * 开罗 KCU **不能**直接折成元：开罗一碗约 1,000 KCU，本作一碗 ¥10，直折会把门槛折成零头。
 */

import { GUANGXI } from "./balance";

/** 现实出处（写进文档与账本，避免下次又凭感觉改数）。 */
export const SOURCES = [
  {
    key: "wage",
    what: "广西最低工资：一类（含南宁城区）2200 元/月、22.4 元/小时，2025-07-01 起执行；此前为 1990 / 20.1",
    url: "https://m.weixin.qq.com/s?__biz=Mzg4OTgyNjIxMw==&mid=2247521747&idx=1&sn=4bb3c00698ca3f87e23f26766bbdbb06",
    date: "2025-07-02",
  },
  {
    key: "bowl",
    what: "老友粉定价：老友猪杂粉 / 碎肉粉 10 元、老友牛肉粉 12 元（老南街传统老友粉店，兴宁区秀厢大道）",
    url: "https://m.weibo.cn/search?containerid=231522type%3D1%26t%3D10%26q%3D%23南宁美食c位老友粉%23",
    date: "2025-08-05",
  },
  {
    key: "pork",
    what: "南宁淡村农贸市场猪肉：五花 12、梅头 11、前后腿 10、排骨 20（元/斤）；超市促销瘦肉 8.8",
    url: "https://m.gmw.cn/2025-10/26/content_1304199800.htm",
    date: "2025-10-26",
  },
  {
    key: "rent_street",
    what: "良庆区 58 ㎡ 临街铺面（做粉店）月租 7600 元",
    url: "http://mp.weixin.qq.com/s?__biz=MzIyMjQwMzIzNQ==&mid=2247507660&idx=2&sn=d9e4445e6ae97f1d3da3cbfab8b3b94d",
    date: "2025-10-08",
  },
  {
    key: "rent_real",
    what: "青秀/兴宁临街 30 ㎡ 年租 10.6 万（≈8800/月）；社区店比临街便宜 3–5 成；客单价 12–15，一碗净利 3–4 元",
    url: "http://mp.weixin.qq.com/s?__biz=MzYzNTk2OTc0MA==&mid=2247484002&idx=2&sn=6594e188d9a336d623174398b5bab3be",
    date: "2026-07-07",
  },
] as const;

/** 一碗老友粉的构成（元）。合计 = 食材成本，不含房租人工。 */
export const BOWL_BREAKDOWN = {
  /** 鲜湿米粉：¥3/斤，二两一碗 → 5 碗/斤 */
  riceNoodle: 0.6,
  /** 猪杂/碎肉：12 元/斤，二两一碗 */
  porkOffal: 1.2,
  /** 酸笋、豆豉、蒜、辣椒、酱油 */
  seasoning: 0.9,
  /** 骨汤料与油 */
  broth: 0.7,
  /** 水电燃料（一碗摊到的煤气与电） */
  energy: 0.8,
  /** 损耗（当天卖不完的湿粉报废） */
  spoilage: 0.6,
} as const;

export const BOWL = {
  /** 默认售价：猪杂老友粉（现实 10 元） */
  priceYuan: GUANGXI.bowlPriceYuan,
  /** 牛肉老友粉（现实 12 元），做「加料」用 */
  beefPriceYuan: 12,
  /** 人均客单（含加料/饮料）：现实 12–15 */
  avgTicketYuan: 15,
  costYuan: Math.round(
    (BOWL_BREAKDOWN.riceNoodle +
      BOWL_BREAKDOWN.porkOffal +
      BOWL_BREAKDOWN.seasoning +
      BOWL_BREAKDOWN.broth +
      BOWL_BREAKDOWN.energy +
      BOWL_BREAKDOWN.spoilage) *
      10,
  ) / 10,
  get marginYuan(): number {
    return Math.round((this.priceYuan - this.costYuan) * 10) / 10;
  },
} as const;

export const TIME = {
  monthsTotal: 36,
  daysPerMonth: 30,
  minutesPerDay: 120,
  /** 1 游戏分钟 = 6 现实分钟（见 balance.ts 的注释与实测） */
  realMinutesPerGameMinute: 6,
} as const;

export const LABOR = {
  /** 南宁城区最低工资（一类区） */
  minWageMonthly: 2200,
  minWageHourly: 22.4,
  workDaysPerMonth: 21.75,
  get dayYuan(): number {
    return Math.round((this.minWageMonthly / this.workDaysPerMonth) * 10) / 10;
  },
  /** 帮工（洗碗买菜）月薪：现实粉店 3500–4500，取中位 */
  helperMonthly: 3800,
  /** 炒锅师傅月薪 */
  chefMonthly: 4500,
} as const;

export const RENT = {
  /** 街边摊：摊位费 + 水电分摊 */
  stallMonthly: 1500,
  /** 社区店 / 巷内小店 30 ㎡：临街价 ×0.6 */
  communityMonthly: 4600,
  /** 临街铺面 58 ㎡（实测租金） */
  streetMonthly: 7600,
} as const;

/** 资本品价表：先过三关，再落成元。 */
export const CAPITAL = {
  /** 布置：整套风格（地板/墙/入口/椅/桌） */
  styleSetYuan: [3000, 4500, 6000, 8000] as const,
  /**
   * 设备：灶 / 粉篓 / 案台，各四档 + 一档「黄金灶」。
   *
   * 第五档（批 AZ′，解 GAP 四轮 C 条）来自开罗 `storeequip.txt` 的四档里
   * 最贵那一档叫 Golden —— 开罗的金灶 ¥8,000 对基础档 ¥250 是 32 倍，
   * 我们这里第四档 ¥30,000 对第一档 ¥1,500 是 20 倍，再往上取 2.3 倍
   * ⇒ ¥68,000（6,800 碗；按 120 碗/日 约两个月的营收）。
   *
   * 第五档不是有钱就能买：要评到第 8 段（`unlocks` 的 stove5）。
   */
  equipmentYuan: [1500, 3800, 9000, 30000, 68000] as const,
  /** 扩建：加两张桌 / 整层扩 */
  expansionYuan: [12000, 35000] as const,
  /** 区县转让费上限（12 区县） */
  districtMaxYuan: 120000,
  /**
   * 段位审查费（11 级，末级免费＝终局认定）。
   *
   * 数值校准（2026-11-22）：批次四按旧口径（三年营收 ¥541k）把合计降到 ¥82,600，
   * 后来钱包地板让「谁都吃得起一碗」，替身四种子月均涨到 ¥171k–¥209k、期末现金
   * ¥1.29M–¥2.14M —— 段位费就变成了零头（P173）。开罗的形状是 `grade_review`
   * 合计 8,330,000 KCU，几乎吃掉全程营收：**段位费是主出口，设备才是小钱**
   * （storeequip 最贵 8,000，对段位费 0.1%）。
   *
   * 所以这张表改按碗定：全程约二十四万碗，合计取约三成 ≈ 六万六千碗。
   */
  gradeFeeYuan: [
    4_000, 8_000, 14_400, 22_400, 36_000, 56_000, 80_000, 112_000, 144_000, 184_000, 0,
  ] as const,
} as const;

/** 多少碗 = 这笔钱 */
export function bowls(yuan: number): number {
  return Math.round(yuan / BOWL.priceYuan);
}

/** 多少个月营收 = 这笔钱（按 70 碗/日 的稳定期） */
export function monthsOf(yuan: number): number {
  return Math.round((yuan / monthRevenue()) * 10) / 10;
}

/** 多少小时工资 = 这笔钱（按南宁最低工资的小时价） */
export function laborHours(yuan: number): number {
  return Math.round((yuan / LABOR.minWageHourly) * 10) / 10;
}

/** 一个月营收（默认 70 碗/日） */
export function monthRevenue(bowlsPerDay: number = GUANGXI.dailyBowls[1]): number {
  return Math.round(bowlsPerDay * BOWL.priceYuan * TIME.daysPerMonth);
}

/** 段位费合计 */
export function totalGradeFee(): number {
  return CAPITAL.gradeFeeYuan.reduce((a: number, b: number) => a + b, 0);
}

/** 资本品总量（布置顶档 + 设备顶档 ×3 + 扩建两档 + 区县一档） */
export function totalCapital(): number {
  const equip = CAPITAL.equipmentYuan[CAPITAL.equipmentYuan.length - 1]! * 3;
  return (
    CAPITAL.styleSetYuan[CAPITAL.styleSetYuan.length - 1]! +
    equip +
    CAPITAL.expansionYuan.reduce((a, b) => a + b, 0) +
    CAPITAL.districtMaxYuan
  );
}

/** 把一笔钱说成人话：几碗 / 几个月 / 几小时 */
export function explain(yuan: number): string {
  return `${bowls(yuan)} 碗 · ${monthsOf(yuan)} 个月营收 · ${laborHours(yuan)} 小时工资`;
}
