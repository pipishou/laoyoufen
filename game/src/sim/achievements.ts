/**
 * K1 目标换骨（账本行 19）：把「月度营收 KPI」换成开罗式的累计成就。
 *
 * 原文依据：`TheRamenSensei/取证/textassets/xls_out/English.lproj__trophy.txt`
 * 39 条累计目标（顾客 100/1000/3000/6000、常客 10/20/30/56、做面 5/20/60、
 * 排队 10/15/20、胜场 3/30/54、赚钱 100,000/500,000/3,000,000 KCU …）。
 * 我们取其中 12 条南宁化，门槛按本作经济尺度重算（1 KCU = 0.01 元），
 * 单位与文案都换成老友粉的：碗、熟客、巷口排队。
 *
 * 设计约束（别破坏）：
 *   1. 只增不减 —— 计数是「累计」，月结清零的字段一律不许进这里；
 *   2. 只读 —— 本模块不写 state，解锁与发奖由调用方做；
 *   3. 不产数字 —— 门槛是常量表，不允许运行时按营业额生成新目标。
 */

import type { GameState } from "./state";

export interface Achievement {
  id: string;
  /** 显示名 */
  name: string;
  /** 数值单位，给 HUD 用（空串＝无单位） */
  unit: string;
  /** 门槛，升序；长度 = 该成就的阶数 */
  tiers: number[];
  /** 当前进度（累计值） */
  progress: (s: GameState) => number;
  /** 一句话说明，给成就面板用 */
  hint: string;
}

/** 累计营收（已结月 + 当月未结） */
export function totalRevenue(s: GameState): number {
  let sum = 0;
  for (const m of s.months) sum += m.revenue;
  return sum + s.monthRevenue;
}

/** 最高单月满意度（0-100） */
export function bestMonthSat(s: GameState): number {
  let best = 0;
  for (const m of s.months) best = Math.max(best, m.avgSat);
  return best;
}

/** 已解锁图鉴总数（顾客 + 浇头 + 等级 + 省份） */
export function collectionTotal(s: GameState): number {
  const c = s.collection;
  return c.customers.length + c.toppings.length + c.grades.length + c.provinces.length;
}

const ACH_LIST: Achievement[] = [
  {
    id: "customers",
    name: "街坊上门",
    unit: "位",
    tiers: [100, 1_000, 3_000, 6_000],
    progress: (s) => s.totalCustomers,
    hint: "开罗 trophy：顾客 100/1000/3000/6000",
  },
  {
    id: "regulars",
    name: "熟客回头",
    unit: "位",
    tiers: [10, 20, 30, 56],
    progress: (s) => Object.keys(s.regulars).length,
    hint: "开罗 trophy：常客 10/20/30/56；喂对味才会常来",
  },
  {
    id: "queue",
    name: "排到巷口",
    unit: "人",
    tiers: [10, 15, 20],
    progress: (s) => s.tally.maxQueue,
    hint: "开罗 trophy：排队 10/15/20（同时排队峰值）",
  },
  {
    id: "bowls",
    name: "出碗",
    unit: "碗",
    tiers: [1_000, 10_000, 50_000],
    progress: (s) => s.tally.bowls,
    hint: "开罗 trophy：做面 5/20/60，本作按日销 70 碗重算",
  },
  {
    id: "revenue",
    name: "卖出的老友粉",
    unit: "元",
    tiers: [100_000, 500_000, 1_000_000],
    progress: totalRevenue,
    hint: "开罗 trophy：赚钱 100,000/500,000/3,000,000 KCU",
  },
  {
    id: "bestDay",
    name: "单日最高营收",
    unit: "元",
    tiers: [800, 1_500, 2_500],
    progress: (s) => s.tally.bestDayRevenue,
    hint: "本作新增：70 碗/日 × 9 元 ≈ 630，扩座与涨价才上得去",
  },
  {
    id: "districts",
    name: "开到几个区",
    unit: "个",
    tiers: [2, 4, 6, 12],
    progress: (s) => s.tally.districts.length,
    hint: "开罗 trophy：区域解锁（第 7 区是哨兵，本作放开到 12 区）",
  },
  {
    id: "collection",
    name: "老友图鉴",
    unit: "项",
    tiers: [10, 30, 60, 100],
    progress: collectionTotal,
    hint: "顾客 / 浇头 / 出品等级 / 各省风味，集一项记一项",
  },
  {
    id: "contest",
    name: "比赛胜场",
    unit: "场",
    tiers: [1, 3, 6],
    progress: (s) => s.contest.results.filter((r) => r.rank === 1).length,
    hint: "开罗 trophy：胜场 3/30/54，本作大赛报名次数有限故下调",
  },
  {
    id: "bestMonth",
    name: "一个月做出口碑",
    unit: "分",
    tiers: [80, 88, 93],
    progress: bestMonthSat,
    hint: "单月满意度峰值，对齐开罗的「口味/魅力」评价轴",
  },
  {
    id: "grade",
    name: "段位评定",
    unit: "级",
    tiers: [3, 6, 9],
    progress: (s) => s.gradeLevel,
    hint: "11 级段位（见 sim/grade.ts），每级要交判定费",
  },
  {
    id: "finished",
    name: "三年之约",
    unit: "次",
    tiers: [1],
    progress: (s) => (s.finished ? 1 : 0),
    hint: "把 36 个月跑完，账本翻到最后一页",
  },
];

export const ACHIEVEMENTS: readonly Achievement[] = ACH_LIST;

export interface AchievementView {
  id: string;
  name: string;
  unit: string;
  hint: string;
  /** 当前累计值 */
  progress: number;
  /** 已拿到的阶数 */
  level: number;
  /** 总阶数 */
  tiers: number;
  /** 下一档门槛；null = 已满 */
  next: number | null;
  /** 0-1，给进度条 */
  ratio: number;
  /** 已达最高档 */
  maxed: boolean;
}

export function viewOf(a: Achievement, s: GameState): AchievementView {
  const progress = a.progress(s);
  let level = 0;
  for (const t of a.tiers) if (progress >= t) level += 1;
  const next = level < a.tiers.length ? (a.tiers[level] ?? null) : null;
  const floor = level > 0 ? (a.tiers[level - 1] ?? 0) : 0;
  const ratio = next === null ? 1 : Math.max(0, Math.min(1, (progress - floor) / Math.max(1, next - floor)));
  return {
    id: a.id,
    name: a.name,
    unit: a.unit,
    hint: a.hint,
    progress,
    level,
    tiers: a.tiers.length,
    next,
    ratio,
    maxed: next === null,
  };
}

/** 全部成就的视图，按「离下一档最近」排序（HUD 只取前 3 条） */
export function board(s: GameState): AchievementView[] {
  return ACHIEVEMENTS.map((a) => viewOf(a, s)).sort((a, b) => {
    if (a.maxed !== b.maxed) return a.maxed ? 1 : -1;
    return b.ratio - a.ratio;
  });
}

/** HUD 用：最接近完成的三条未满成就 */
export function nextThree(s: GameState): AchievementView[] {
  return board(s)
    .filter((v) => !v.maxed)
    .slice(0, 3);
}

/** 已拿到的档数总和 / 总档数 */
export function progressSummary(s: GameState): { got: number; total: number } {
  let got = 0;
  let total = 0;
  for (const a of ACHIEVEMENTS) {
    total += a.tiers.length;
    got += viewOf(a, s).level;
  }
  return { got, total };
}

/** 三年结束的结算口径（K1：不再看「达标月数」，看累计成就与段位） */
export function finalSummary(s: GameState): {
  achievements: { got: number; total: number };
  gradeLevel: number;
  customers: number;
  revenue: number;
  bestDay: number;
} {
  return {
    achievements: progressSummary(s),
    gradeLevel: s.gradeLevel,
    customers: s.totalCustomers,
    revenue: totalRevenue(s),
    bestDay: s.tally.bestDayRevenue,
  };
}
