import { DAY_MINUTES } from "./customer";

/**
 * 营业时段的钟面换算（只影响显示，不参与模拟）。
 *
 * 一天 120 个游戏分钟，映射到现实店面的 06:00–14:00 —— 南宁老友粉的主战场
 * 是早市与午市，下午收摊。所以一个游戏分钟 = 4 个钟面分钟。
 * 注意：`sim/clock.ts` 里的 `SimClock` 是真实毫秒→游戏分钟的蓄时器，
 * 和这个文件不是一回事，别混。
 */
export const SHOP_START_HOUR = 6;
export const CLOCK_MINUTES_PER_GAME_MINUTE = 4;
export const SHOP_OPEN_LABEL = "06:00";
export const SHOP_CLOSE_LABEL = clockOf(DAY_MINUTES);

/** minuteOfDay → "HH:MM"，越界自动夹到打烊时刻 */
export function clockOf(minuteOfDay: number): string {
  const m = Math.max(0, Math.min(DAY_MINUTES, Math.round(minuteOfDay)));
  const total = SHOP_START_HOUR * 60 + m * CLOCK_MINUTES_PER_GAME_MINUTE;
  const h = Math.floor(total / 60) % 24;
  const mm = total % 60;
  return `${String(h).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

/** 还剩多少游戏分钟打烊，用于顶栏「还剩 N 分」 */
export function minutesLeft(minuteOfDay: number): number {
  return Math.max(0, DAY_MINUTES - Math.max(0, Math.round(minuteOfDay)));
}
