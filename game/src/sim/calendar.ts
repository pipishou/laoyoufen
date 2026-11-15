/** 日历换算。单独抽出来，避免 sim 模块互相 import 造成环。 */
export const DAYS_PER_MONTH = 30;
export const MONTHS_PER_YEAR = 12;

/** 从开档算起的绝对天数（0 起） */
export function dayIndex(month: number, day: number): number {
  return month * DAYS_PER_MONTH + (day - 1);
}

// ─────────────────────────── 竞赛日历 ───────────────────────────

/**
 * 开罗原文 `help.txt`：「Contests are held in **June and December** each year.
 * You can choose the contest you want to participate in from 3 different types.」
 *
 * 换算到我们 36 个月（month 0-35）＝ 每年 6 月与 12 月各一场，共 **6 场**：
 *   month = 5, 11, 17, 23, 29, 35
 *
 * 这是 P24（第 3 个月起没有决策点）的第一根骨头：一年只有两次上场机会，
 * 于是「这个月练员工、下个月攒钱、比赛前调价」才成为要算的事。
 */
export const CONTEST_MONTHS_OF_YEAR: readonly number[] = [6, 12] as const;

/** 该月是不是比赛月（month 0-35） */
export function isContestMonth(month: number): boolean {
  return CONTEST_MONTHS_OF_YEAR.includes((month % MONTHS_PER_YEAR) + 1);
}

/** 距离下一场还有几个月（0 = 就是这个月） */
export function monthsToContest(month: number): number {
  for (let i = 0; i < MONTHS_PER_YEAR; i++) {
    if (isContestMonth(month + i)) return i;
  }
  return MONTHS_PER_YEAR;
}

/** 第几届比赛（0 起），非比赛月返回上一届的序号 + 1 表示「还没到」 */
export function contestRoundOf(month: number): number {
  let round = 0;
  for (let m = 0; m <= month; m++) {
    if (isContestMonth(m)) round += 1;
  }
  return isContestMonth(month) ? round - 1 : round;
}
