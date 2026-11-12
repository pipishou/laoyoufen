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

/** 广西现实锚点（南宁，2025 年量级）。[ANCHOR] 需本地实采复核。 */
export const GUANGXI = {
  /** 一碗老友粉售价（二两，猪杂） */
  bowlPriceYuan: 10,
  /** 单碗食材成本（米粉 1.1 + 猪杂 2.3 + 酸笋豆豉蒜椒油 0.8） */
  bowlCostYuan: 4.2,
  /** 日均出碗：起步 / 稳定 / 旺店 */
  dailyBowls: [45, 70, 95] as const,
  /** 临街小铺月租（20–40 ㎡） */
  rentYuan: 4500,
  /** 帮工月薪 */
  wageYuan: 3800,
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

/** 租金占「月营收目标」的比例。由现实反推：4500 / (70×10×30) = 21.4%，取 22%。 */
export const RENT_RATIO = 0.22;

/** 月营收目标：首个 21000（=70 碗/日 × 10 元 × 30 天），每月 +2%（沿用现有 TARGET_GROWTH）。 */
export const TARGET_BASE_YUAN = GUANGXI.dailyBowls[1] * GUANGXI.bowlPriceYuan * 30;
export const TARGET_GROWTH = 1.02;

/** 第 n 月（1 起）的月营收目标 */
export function monthTargetFor(month: number): number {
  return Math.round(TARGET_BASE_YUAN * Math.pow(TARGET_GROWTH, Math.max(0, month - 1)));
}

/**
 * 第 n 月的房租：按当月营收目标 × 22%。
 * 取「目标」而不是「上月营收」：目标平滑、玩家可预期；用营收会让亏损月也收高租。
 * 这条公式是账本行 13 拍板 B 的落地。
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


