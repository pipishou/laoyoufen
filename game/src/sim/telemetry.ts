import type { GameState } from "../sim/state";

/**
 * 游玩埋点：每分钟采样一次，落到 localStorage（环形缓冲）。
 *
 * 为什么要有它：在此之前全仓库没有一条「人类怎么玩」的记录，所有结论都来自
 * 不操作 probe。埋点只读状态、不写模拟层，成本几条数组 push，可整块删掉。
 */

export interface Sample {
  /** 绝对分钟序号，用于去重 */
  t: number;
  month: number;
  day: number;
  minute: number;
  /** 今日已卖碗数 */
  bowls: number;
  /** 今日流失人数 */
  lost: number;
  /** 今日营收 */
  revenue: number;
  price: number;
  /** 四维总分（0–100） */
  taste: number;
  cash: number;
  waiting: number;
  seats: number;
  /** 最近一次流失原因（没人为 null） */
  lostReason: string | null;
}

const KEY = "laoyou.telemetry.v1";
const MAX_SAMPLES = 4000;

let samples: Sample[] = [];
let lastT = -1;
let dirty = false;

function absMinute(s: GameState): number {
  return (s.month - 1) * 30 * 120 + (s.day - 1) * 120 + s.flow.minuteOfDay;
}

function waitingCount(s: GameState): number {
  let n = 0;
  for (const c of s.flow.customers) if (c.status === "waiting") n += 1;
  return n;
}

export function loadTelemetry(): void {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as Sample[];
    if (Array.isArray(parsed)) samples = parsed.slice(-MAX_SAMPLES);
  } catch {
    samples = [];
  }
}

/** 每分钟调用一次；同一天同一分钟重复调用会被去重 */
export function recordSample(s: GameState, taste: number): void {
  const t = absMinute(s);
  if (t === lastT) return;
  lastT = t;
  samples.push({
    t,
    month: s.month,
    day: s.day,
    minute: s.flow.minuteOfDay,
    bowls: s.flow.servedToday,
    lost: s.flow.lostToday,
    revenue: s.flow.revenueToday,
    price: s.price,
    taste,
    cash: Math.round(s.cash),
    waiting: waitingCount(s),
    seats: s.venue.seats,
    lostReason: s.flow.lastLostReason,
  });
  if (samples.length > MAX_SAMPLES) samples.splice(0, samples.length - MAX_SAMPLES);
  dirty = true;
}

/** 落盘（节流由调用方控制，比如每 30 秒或每次月结） */
export function flushTelemetry(): void {
  if (!dirty) return;
  dirty = false;
  try {
    localStorage.setItem(KEY, JSON.stringify(samples));
  } catch {
    /* 配额满时静默丢弃：埋点不该影响游戏 */
  }
}

export function getSamples(): readonly Sample[] {
  return samples;
}

export function clearTelemetry(): void {
  samples = [];
  lastT = -1;
  dirty = true;
  flushTelemetry();
}

/** 一局的汇总：给验收/复盘用 */
export interface TelemetrySummary {
  minutes: number;
  days: number;
  bowls: number;
  lost: number;
  lostRate: number;
  avgPrice: number;
  avgTaste: number;
  peakWaiting: number;
  lostReasons: { reason: string; count: number }[];
}

export function summarize(list: readonly Sample[]): TelemetrySummary {
  if (list.length === 0) {
    return { minutes: 0, days: 0, bowls: 0, lost: 0, lostRate: 0, avgPrice: 0, avgTaste: 0, peakWaiting: 0, lostReasons: [] };
  }
  let bowls = 0;
  let lost = 0;
  let priceSum = 0;
  let tasteSum = 0;
  let peak = 0;
  const reasons = new Map<string, number>();
  let dayKey = -1;
  let days = 0;

  for (const s of list) {
    // 每天第一条样本的 bowls/lost 是当天累计值，故按天累加最后一条
    if (s.day !== dayKey) {
      dayKey = s.day;
      days += 1;
    }
    bowls += s.bowls;
    lost += s.lost;
    priceSum += s.price;
    tasteSum += s.taste;
    if (s.waiting > peak) peak = s.waiting;
    if (s.lostReason) reasons.set(s.lostReason, (reasons.get(s.lostReason) ?? 0) + 1);
  }

  return {
    minutes: list.length,
    days,
    bowls,
    lost,
    lostRate: lost / Math.max(1, bowls + lost),
    avgPrice: priceSum / list.length,
    avgTaste: tasteSum / list.length,
    peakWaiting: peak,
    lostReasons: [...reasons.entries()]
      .map(([reason, count]) => ({ reason, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5),
  };
}
