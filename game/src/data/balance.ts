/**
 * 数值单一来源（balance）
 *
 * 为什么要这个文件：上一批实测（`租金公式实测-2026-11-09.md`）发现，代码里的经济常数散落在
 * `sim/state.ts`、`sim/ledger.ts`、`sim/score.ts` 三处，改一个不知道会影响谁。这里把
 * 「来源 → 换算 → 落地值」的链条写成代码，任何数值都能一眼追到出处。
 *
 * 来源分两层，不许混：
 *   1) KAIRO_REF —— 开罗拉面店逆向产物里的原始数值（证据见
 *      `REA/逆向/_逆向上游/TheRamenSensei/报告-REA逆向取证-v1.0.md`，等级 [COMPUTED]）
 *   2) GUANGXI   —— 广西南宁的现实锚点（行业常识量级，等级 [ANCHOR]，需真人复核）
 *
 * 换算只用一条比例尺：KCU→元。理由见 `docs/数值来源与换算-2026-11-12.md`。
 */

/** 开罗拉面店原始数值（单位：开罗币 KCU）。只抄能对上的，不猜列语义。 */
export const KAIRO_REF = {
  /** 面粉价格阶梯：Normal → Ultimate，约 28 倍跨度 [COMPUTED] */
  flourKcu: [500, 1200, 2100, 3900, 6500, 12000, 14000] as const,
  /** 碱水价格阶梯：约 16 倍跨度 [COMPUTED] */
  lyeKcu: [800, 2600, 5200, 8600, 13000] as const,
  /** 顾客预算（defParam 首项）：学生 / 上班族 / 小孩 ... [COMPUTED] */
  customerBudgetKcu: { student: 910, salaryman: 1050, kid: 840 } as const,
  /** 浇头单价：玉米 / 葱花 / 笋干 / 海苔 [COMPUTED] */
  toppingKcu: { corn: 1120, scallion: 1260, menma: 700, nori: 840 } as const,
  /** 汤料单价：软水 / 硬水 / 韭菜 / 姜 [COMPUTED] */
  soupKcu: { softWater: 10, hardWater: 10, leek: 230, ginger: 120 } as const,
  /** 区域解锁费（第 7 位 65535 是 ushort 哨兵＝不开放，不是报价） [COMPUTED] */
  regionFeeKcu: [0, 1000, 5000, 5000, 15000, 30000] as const,
  /** 成就阶梯：顾客数 4 档 / 累计赚钱 3 档 [COMPUTED] */
  trophyCustomers: [100, 1000, 3000, 6000] as const,
  trophyMoneyKcu: [100000, 500000, 3000000] as const,
  /** 敌店强度（popularBase）：首店 40 → 顶级 800 [COMPUTED] */
  enemyPopularKcu: [40, 800] as const,
  /** 硬收口：10 年 [COMPUTED] */
  gameEndYear: 10,
} as const;

/**
 * 广西现实锚点（南宁，2025 年公开报道；出处见 `data/anchors.ts` 的 `SOURCES`）。
 *
 * 这一层只放**原始观测值**，任何换算（一碗几元、一月几碗）都在 `anchors.ts` 里做，
 * 避免两个文件互相引用。
 */
export const GUANGXI = {
  /** 一碗老友粉售价（二两，猪杂）。现实：猪杂/碎肉 ¥10、牛肉 ¥12 [SOURCE 2025-08] */
  bowlPriceYuan: 10,
  /**
   * 单碗成本（不含房租人工）：
   * 鲜粉 0.6（¥3/斤、二两一碗）+ 猪杂 1.2（¥12/斤、二两）+ 酸笋豆豉蒜椒 0.9
   * + 骨汤料油 0.7 + 水电燃料 0.8 + 湿粉损耗 0.6 = 4.8
   */
  bowlCostYuan: 4.8,
  /** 日均出碗：起步 / 稳定 / 旺店（4 座小店现实 70 碗/日） */
  dailyBowls: [45, 70, 95] as const,
  /** 社区店 / 巷内小店 30 ㎡ 月租（临街 ¥7,600 × 0.6）[SOURCE 2025-10] */
  rentYuan: 4600,
  /** 帮工月薪（现实粉店 3,500–4,500） */
  wageYuan: 3800,
  /** 南宁城区最低工资，一类区，2025-07-01 起 [GOV 2025-07] */
  minWageMonthly: 2200,
  /** 对应非全日制小时最低工资 */
  minWageHourly: 22.4,
  /** 猪肉批发/零售参考：五花 ¥12/斤、瘦肉 ¥8.8–11/斤、排骨 ¥20/斤 [SOURCE 2025-10] */
  porkJinYuan: 12,
  /** 鲜湿米粉参考价（元/斤） */
  riceNoodleJinYuan: 3,
  /** 开店起步资金（押金＋简单装修＋首批原料，取现实下限） */
  startCashYuan: 30000,
} as const;

/**
 * KCU → 元。
 * 锚点：开罗上班族的吃面预算 1050 KCU，对应南宁一碗老友粉 10 元 → 1050 KCU = 10 元。
 * 取整到 0.01 便于心算，误差 5% 以内（10/1050 = 0.009524）。
 */
export const KCU_TO_YUAN = 0.01;

/** 把开罗价换算成元（保留 1 位小数，方便直接写文案） */
export function kcuToYuan(kcu: number): number {
  return Math.round(kcu * KCU_TO_YUAN * 10) / 10;
}

/**
 * 租金占「月营收目标」的比例（历史值，保留给对照，不再用于收租）。
 *
 * 2026-11-15 停用：替身 36 个月实测，租金按「目标营收 × 22%」收，
 * 而目标每月 +2% 涨到 ¥42,000，实际营收被客流封顶在 ¥27,200 ——
 * 于是第 36 个月租金 ¥9,240 = 营收的 34%，账上必亏（种子 1 期末 −¥27,186）。
 * 现实粉店租金占营收 15–25%，且**租金是房东定的固定月租，不会跟着你的流水涨**。
 * 现在改用 `rentMonthlyOf(site, month)`：按铺位固定月租 + 每年 3% 续约涨幅。
 */
export const RENT_RATIO = 0.22;

/** 月营收目标：首个 21000（=70 碗/日 × 10 元 × 30 天），每月 +2%（沿用现有 TARGET_GROWTH）。 */
export const TARGET_BASE_YUAN = GUANGXI.dailyBowls[1] * GUANGXI.bowlPriceYuan * 30;
export const TARGET_GROWTH = 1.02;

/** 第 n 月（1 起）的月营收目标 */
export function monthTargetFor(month: number): number {
  return Math.round(TARGET_BASE_YUAN * Math.pow(TARGET_GROWTH, Math.max(0, month - 1)));
}

/** 每年续约涨多少（现实里房东一年一涨，3% 是温和值） */
export const RENT_YEAR_GROWTH = 1.03;

/**
 * 第 n 个月的房租（元）—— 固定月租，按铺位定锚，不跟着流水涨。
 *
 * `baseMonthly` 取 `RENT` 里的现实观测值（stall 1,500 / community 4,600 / street 7,600）。
 * 每满 12 个月按 3% 续约涨一次（`RENT_YEAR_GROWTH`）。
 */
export function rentMonthlyOf(baseMonthly: number, month: number): number {
  const years = Math.floor(Math.max(0, month - 1) / 12);
  return Math.round(baseMonthly * Math.pow(RENT_YEAR_GROWTH, years));
}

/**
 * 旧的「目标 × 22%」收租法：只留给对照与回归测试，不再进月结。
 * @deprecated 用 `rentMonthlyOf` 与 `siteById(...).rentFactor` 组合的固定月租
 */
export function rentFor(target: number): number {
  return Math.round(target * RENT_RATIO);
}

/** 出碗上限：座位 × 翻台（现实 4 座小店 40 碗/日已在畸形值上，这里只做换算校验用） */
export function bowlsCap(seats: number, turnsPerDay = 10): number {
  return seats * turnsPerDay;
}

/** 一碗粉的毛利 */
export function bowlMargin(): number {
  return GUANGXI.bowlPriceYuan - GUANGXI.bowlCostYuan;
}

/** 覆盖月租 + 一个帮工，需要卖多少碗 */
export function breakEvenBowls(): number {
  return Math.ceil((GUANGXI.rentYuan + GUANGXI.wageYuan) / bowlMargin());
}

/**
 * 客流与出餐的可调旋钮。
 *
 * 为什么做成可变对象而不是 const：调客流量级只能靠实测扫描（`flow-probe`），
 * 扫描时需要在不重启进程的情况下换参数。默认值就是「上线值」，
 * 任何一次改动都必须重跑 `npm run probe:flow` 并留下数字。
 *
 * 2026-11-12 实测定值（5 seeds × 36 月，目标 21,000；目标 4 座放开产能后）：
 *   eat×1.0 → 4 座 71.2 碗/日、流失 29%、达标 29% ｜ 8 座 110.5 碗/日、流失 0%、达标 91%
 *   eat×0.8 → 4 座 87.1 碗/日（比现实 70 碗更乐观，达标 58% 太松）→ 不采用
 * 取 eat×1.0：4 座正好落在现实「70 碗/日」上，且不操作局只有 29% 达标 ——
 * 想通关必须扩座、加灶或改配方，这正是开罗式的「扩建驱动」。
 * 开罗原版「每日 120 分钟」的现实换算是 1 游戏分钟 = 6 现实分钟，
 * 所以 serve=1 分钟 ≈ 现实 6 分钟一碗 —— 这正是现实单灶的节奏。
 */
export const FLOW_DEFAULTS = {
  /** 进店概率的整体倍率（乘在 spawnChance 上） */
  spawnScale: 6,
  /** 出一碗要几分钟（一口灶、无厨师时） */
  serveMinutes: 1,
  /** 等位耐心倍率 */
  patienceScale: 1.5,
  /** 吃一碗的时间倍率（座位周转的隐藏杠杆） */
  eatScale: 1,
  /** 候餐区上限（现实 4 座小店门口站 8 个人就堵路，12 已是极限） */
  queueMax: 12,
} as const;

export const FLOW: {
  spawnScale: number;
  serveMinutes: number;
  patienceScale: number;
  eatScale: number;
  queueMax: number;
} = { ...FLOW_DEFAULTS };

export function resetFlowTuning(): void {
  FLOW.spawnScale = FLOW_DEFAULTS.spawnScale;
  FLOW.serveMinutes = FLOW_DEFAULTS.serveMinutes;
  FLOW.patienceScale = FLOW_DEFAULTS.patienceScale;
  FLOW.eatScale = FLOW_DEFAULTS.eatScale;
  FLOW.queueMax = FLOW_DEFAULTS.queueMax;
}

/**
 * 半碗以内的差是浮点噪声，不算「多了几碗」—— **全项目只有这一个出处**（批 AW′ 解 P474）。
 *
 * 原来两处各写一个 0.5：`sim/bottleneck.ts` 的 `demandBlocked`（三道闸高出来客半碗以上才算
 * 「抬了也卖不动」）和 `data/crew.ts` 的 `COOK_GAIN_NOISE`（多一个人多卖半碗以上才算数）。
 * 同一把拍子写两遍，改一处不改另一处就会出现「卖不动但值得雇」这种自相矛盾的两句话。
 *
 * 为什么是半碗：`total` 是 `min(stove, seats, cap, demand)` 的浮点结果，一次除法链下来在
 * 1e-13 量级抖动；0.5 只挡噪声，不承担任何「够不够划算」的判断。
 */
export const BOWL_EPSILON = 0.5;

/**
 * 一天的长度换算（把现实时长压进 120 游戏分钟）。
 *
 * 现实：早餐 6:30–9:00、午市 11:30–14:00、晚市 17:30–21:00，有效营业约 12 小时 = 720 分钟。
 * 游戏：一天 120 分钟 → **1 游戏分钟 = 6 现实分钟**。
 * 于是「一位顾客从落座到走人 41 现实分钟」≈ 6.8 游戏分钟，
 * 4 张桌子 × 120 / 6.8 ≈ 70 碗/日——这正是广西 4 座小店的现实日销。
 */
export const REAL_MINUTES_PER_GAME_MINUTE = 6;

/** 把现实分钟折成游戏分钟 */
export function realMinutesToGame(realMinutes: number): number {
  return realMinutes / REAL_MINUTES_PER_GAME_MINUTE;
}

/**
 * 燃气与水：粉店是真烧气的（开罗没有这条，它把耗材折进料钱）。
 *
 * 为什么按碗算而不是按天算：灶一直点着，煮一碗与煮七十碗不是一个量级的火。
 * 数取自南宁街边粉店的实际感受 —— 一罐气约一百四五十元，忙店三四天见底，
 * 一天七八十碗摊下来每碗两毛到三毛；洗菜洗碗的水再加几分。
 * 写 0.3 是把气与水合在一条上，宁可高一点，也别让「多卖」变成零成本。
 */
export const GAS_PER_BOWL_YUAN = 0.3;

/**
 * 设备维护：每台每档每月 ¥90 × (1 + 0.12 × 段位)。
 *
 * 现实依据是灶、冰柜、和面机的保养与折旧；段位越高，店里设备越贵、用得越狠。
 * 满配（四台各四档＝16 档）在段 11 约 ¥3,340/月 —— 够贵，但不至于让人不敢升级。
 */
export const UPKEEP_PER_TIER_YUAN = 90;
export const UPKEEP_GRADE_STEP = 0.12;
