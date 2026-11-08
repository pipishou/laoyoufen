/** 日历换算。单独抽出来，避免 sim 模块互相 import 造成环。 */
export const DAYS_PER_MONTH = 30;
export const MONTHS_PER_YEAR = 12;

/** 从开档算起的绝对天数（0 起） */
export function dayIndex(month: number, day: number): number {
  return month * DAYS_PER_MONTH + (day - 1);
}
