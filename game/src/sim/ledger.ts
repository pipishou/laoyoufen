import type { GameState, MonthRecord, YearRecord } from "./state";
import { rentFor } from "../data/balance";
const YEAR_BONUS: Record<YearRecord["rating"], number> = { S: 8000, A: 4000, B: 2000, C: 500, D: 0 };
const GRADES: YearRecord["rating"][] = ["D", "C", "B", "A", "S"];

function gradeByRatio(ratio: number): YearRecord["rating"] {
  if (ratio >= 1.2) return "S";
  if (ratio >= 1.0) return "A";
  if (ratio >= 0.85) return "B";
  if (ratio >= 0.65) return "C";
  return "D";
}

function shiftGrade(g: YearRecord["rating"], up: boolean): YearRecord["rating"] {
  const i = GRADES.indexOf(g);
  const next = up ? Math.min(GRADES.length - 1, i + 1) : Math.max(0, i - 1);
  return GRADES[next] ?? g;
}

/**
 * 月结：扣房租、算月报、评目标、进年度。
 * 由 state.endDay 在 day 越过 30 时调用，此时 state.month 还是「刚过完的那个月」。
 */
export function closeMonth(state: GameState): void {
  const revenue = state.monthRevenue;
  const target = state.monthTarget;
  const avgSat = state.monthSatCount > 0 ? state.monthSatSum / state.monthSatCount : 0;
  const wages = state.monthWages;
  // 房租 = 当月营收目标 × 22%（账本行 13 拍板 B）。数值口径见 data/balance.ts。
  const rent = rentFor(target);

  // K1：日营收峰值在 endDay 里逐日更新（见 sim/state.ts），此处不再动 tally

  state.cash -= rent;
  const profit = Math.round(revenue - wages - rent);

  const record: MonthRecord = {
    month: state.month,
    revenue: Math.round(revenue),
    customers: state.monthServed,
    lost: state.monthLost,
    avgSat: Math.round(avgSat),
    wages,
    rent,
    profit,
    target: Math.round(target),
    grade: gradeByRatio(revenue / Math.max(1, target)),
  };
  state.months.push(record);

  // K1 目标换骨（账本行 19）：月营收不再判定成败。
  // 原实现「达标 +0.08 口碑 / 未达标 -0.05 口碑」是我们自己发明的月度 KPI：
  // 开罗拉面店没有这个机制，它靠 39 条累计 trophy 与 11 级段位推人往前走。
  // monthTarget 现在只是 HUD 上的一把量尺，口碑只由「顾客吃到嘴里的感受」决定
  // （见 sim/customer.ts 的 settle：按满意度漂移）。

  state.monthRevenue = 0;
  state.monthServed = 0;
  state.monthLost = 0;
  state.monthWages = 0;
  state.monthSatSum = 0;
  state.monthSatCount = 0;

  if ((state.month + 1) % 12 === 0) closeYear(state);
}

/** 年结：12 个月汇总 → 评级 + 奖金 + 结算单（HUD 强制弹出） */
export function closeYear(state: GameState): void {
  const months = state.months.slice(-12);
  const revenue = months.reduce((s, m) => s + m.revenue, 0);
  const customers = months.reduce((s, m) => s + m.customers, 0);
  const target = months.reduce((s, m) => s + m.target, 0);
  const satWeighted = months.reduce((s, m) => s + m.avgSat * m.customers, 0);
  const avgSat = customers > 0 ? satWeighted / customers : 0;

  let rating = gradeByRatio(revenue / Math.max(1, target));
  if (avgSat >= 75) rating = shiftGrade(rating, true);
  if (avgSat < 50) rating = shiftGrade(rating, false);

  const bonus = YEAR_BONUS[rating];
  state.cash += bonus;
  const repGain = rating === "S" ? 0.6 : rating === "A" ? 0.4 : rating === "B" ? 0.2 : 0;
  state.reputation = Math.min(5, state.reputation + repGain);

  const year: YearRecord = {
    year: Math.floor(state.month / 12) + 1,
    revenue: Math.round(revenue),
    customers,
    avgSat: Math.round(avgSat),
    target: Math.round(target),
    rating,
    bonus,
    final: state.month + 1 >= 36,
  };
  state.years.push(year);
  state.pendingReport = year;
}
