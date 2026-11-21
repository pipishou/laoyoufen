/**
 * 今天真正卡住的是什么：一口灶能出多少碗、座位能翻多少桌、案台备料够多少碗。
 *
 * **为什么要单独一个文件**（试玩 11-20 的 D1–D2）：
 * 打烊单原来按「座位 ≤4 就先扩座」的硬规则点名 `打通隔墙 ¥12,000`，可那家店
 * 一口灶 2.0 分钟一碗，一天最多出 60 碗 —— 扩到 4 座也还是 60 碗，等于花一万二
 * 买了两张永远坐不满的桌子。玩家照着主句买了，D4 流失反而回到 53.8%。
 *
 * 判断「该买哪件」不能看「哪个最紧」，要看**每一块钱能把当天上限抬高多少**：
 * 灶 ¥1,500 把 2.0 分/碗 提到 1.7，日上限 60 → 70（+10 碗，¥150/碗）；
 * 隔墙 ¥12,000 把座位从 2 提到 4，但灶还是卡在 60（+0 碗）。
 * 所以提示先点灶，扩座排在灶升过一两档之后。
 *
 * 公式与 `flow-probe.probe.ts` 的产能模型一致：
 *   灶   = 一天分钟数 / 每碗分钟
 *   座位 = 座位数 × 一天分钟数 / (每碗分钟 + 吃一碗的分钟)
 *   上限 = `state.capacity`（案台与扩建设的总闸）
 * 三者取最小 = 今天最多卖几碗。
 */
import { DAY_MINUTES, SERVE_MINUTES } from "./customer";
import { bowlMinutes } from "./staff";
import { equipServeMultiplier } from "./equipment";
import { BENCH_CAPACITY_STEP, STOVE_SERVE_FACTOR } from "../data/equipment";
import type { GameState } from "./state";

/**
 * 坐下来吃一碗要几分钟。
 * 一游戏分钟 ≈ 六现实分钟（见 `data/balance.ts` 的注释），所以 1 分钟 ≈ 6 分钟，
 * 正好是「坐下嗦一碗粉」的时间；再长就变成慢餐，座位周转会假性变紧。
 */
export const EAT_MINUTES = 1;

export type TightOn = "stove" | "seats" | "cap";

export interface Capacity {
  /** 一口灶翻一天的碗数（已含灶位、员工技法与并行度，见 bowlMinutes） */
  stove: number;
  /** 座位翻台能接的碗数 */
  seats: number;
  /** 日上限总闸 */
  cap: number;
  /** 三者取最小：今天最多卖几碗 */
  total: number;
  /** 谁在卡 */
  tight: TightOn;
  /** 当前每碗几分钟（HUD 上那个「2.0 分/碗」） */
  serveNow: number;
}

function pack(stove: number, seats: number, cap: number, serveNow: number): Capacity {
  const total = Math.min(stove, seats, cap);
  const tight: TightOn = total === stove ? "stove" : total === seats ? "seats" : "cap";
  return { stove, seats, cap, total, tight, serveNow };
}

/** 当前产能画像 */
export function capacityOf(state: GameState): Capacity {
  const serveNow = bowlMinutes(state, SERVE_MINUTES, equipServeMultiplier(state));
  const stove = DAY_MINUTES / serveNow;
  const seats = (state.venue.seats * DAY_MINUTES) / (serveNow + EAT_MINUTES);
  return pack(stove, seats, state.capacity, serveNow);
}

/**
 * 假设把某一件买下来，当天上限能抬高多少碗。
 * 只要其中一个环节没动，另外两个的增益就会被最小项吃掉 —— 这正是要算差值的原因。
 */
export function capacityGain(state: GameState): {
  stove: number;
  bench: number;
  seat: (n: number) => number;
} {
  const now = capacityOf(state);

  // 灶升一档：出碗时间 ×0.85，座位翻台也跟着快一点（客人不用干等）
  const serveUp = Math.max(0.1, now.serveNow * STOVE_SERVE_FACTOR);
  const stove = pack(
    DAY_MINUTES / serveUp,
    (state.venue.seats * DAY_MINUTES) / (serveUp + EAT_MINUTES),
    now.cap,
    serveUp,
  ).total - now.total;

  // 案台升一档：抬总闸，但抬不过灶与座位 —— 总闸不紧时增益就是 0
  const others = Math.min(now.stove, now.seats);
  const bench = Math.max(0, Math.min(now.cap + BENCH_CAPACITY_STEP, others) - now.cap);

  // 扩座 +n：座位产随 n 线性涨，但被灶与总闸卡住
  const seat = (n: number): number =>
    pack(now.stove, ((state.venue.seats + n) * DAY_MINUTES) / (now.serveNow + EAT_MINUTES), now.cap, now.serveNow).total -
    now.total;

  return { stove, bench, seat };
}

/** 一句话说清谁在卡（打烊单与面板用） */
export function tightWords(state: GameState): string {
  const c = capacityOf(state);
  if (c.tight === "stove") return "灶台出得慢";
  if (c.tight === "seats") return "座位坐不下";
  return "备料不够卖";
}
