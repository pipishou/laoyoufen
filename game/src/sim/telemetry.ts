import type { GameState } from "./state";

/**
 * 游玩埋点 v2：**日聚合 ＋ 分钟细节环**，随时落盘，可导出。
 *
 * v1 的三个错（2026-11-14 实测暴露）：
 *   1. 只在月结落盘 → 玩家刷新/关页就全丢，localStorage 里根本没有这个键；
 *   2. `summarize` 把「今日累计」当「每分钟增量」求和 → 122 分钟算出 3,708 碗；
 *   3. 4000 条环形 ≈ 33 游戏天，而一局 36 月 = 129,600 分钟 → 全程只留最后一个月。
 *
 * v2 的做法：每分钟更新当天的 `DayRollup`（只存 1 条/天，36 月共 1,080 条），
 * 细节样本只留最近 600 分钟；每 20 次采样、每次跨天、以及页面卸载时落盘。
 * 埋点只读状态、不写模拟层，整块可删。
 */

export interface Sample {
  /** 绝对分钟序号，用于去重 */
  t: number;
  month: number;
  day: number;
  minute: number;
  /** 今日已卖碗数（当天累计，不是增量） */
  bowls: number;
  /** 今日流失人数（当天累计） */
  lost: number;
  /** 今日营收（当天累计） */
  revenue: number;
  price: number;
  /** 四维总分（0–100） */
  taste: number;
  cash: number;
  waiting: number;
  seats: number;
  /** 最近一次流失原因（没有为 null） */
  lostReason: string | null;
}

/** 一天的汇总：一局 36 月只有 1,080 条，够存全程 */
export interface DayRollup {
  month: number;
  day: number;
  /** 当天样本条数（≈ 实际跑了多少分钟） */
  minutes: number;
  bowls: number;
  lost: number;
  revenue: number;
  priceSum: number;
  priceCount: number;
  tasteSum: number;
  tasteCount: number;
  seats: number;
  peakWaiting: number;
  /** 当天流失原因计数 */
  reasons: Record<string, number>;
}

export interface TelemetrySummary {
  minutes: number;
  days: number;
  bowls: number;
  lost: number;
  lostRate: number;
  avgPrice: number;
  avgTaste: number;
  peakWaiting: number;
  revenueTotal: number;
  bowlsPerDay: number;
  lostReasons: { reason: string; count: number }[];
}

interface Store {
  version: 2;
  days: DayRollup[];
  today: DayRollup | null;
  samples: Sample[];
}

const KEY = "laoyou.telemetry.v2";
const MAX_SAMPLES = 600;
const MAX_DAYS = 1080;
const FLUSH_EVERY = 5;

let samples: Sample[] = [];
let days: DayRollup[] = [];
let today: DayRollup | null = null;
let lastT = -1;
let sinceFlush = 0;

function absMinute(s: GameState): number {
  return (s.month - 1) * 30 * 120 + (s.day - 1) * 120 + s.flow.minuteOfDay;
}

function waitingCount(s: GameState): number {
  let n = 0;
  for (const c of s.flow.customers) if (c.status === "waiting") n += 1;
  return n;
}

function blankDay(s: GameState): DayRollup {
  return {
    month: s.month,
    day: s.day,
    minutes: 0,
    bowls: 0,
    lost: 0,
    revenue: 0,
    priceSum: 0,
    priceCount: 0,
    tasteSum: 0,
    tasteCount: 0,
    seats: s.venue.seats,
    peakWaiting: 0,
    reasons: {},
  };
}

export function loadTelemetry(): void {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as Store;
    if (parsed && parsed.version === 2) {
      days = Array.isArray(parsed.days) ? parsed.days.slice(-MAX_DAYS) : [];
      today = parsed.today ?? null;
      samples = Array.isArray(parsed.samples) ? parsed.samples.slice(-MAX_SAMPLES) : [];
    }
  } catch {
    days = [];
    today = null;
    samples = [];
  }
}

/** 每分钟调用一次；同一分钟重复调用会被去重 */
export function recordSample(s: GameState, taste: number): void {
  const t = absMinute(s);
  if (t === lastT) return;
  lastT = t;

  const sample: Sample = {
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
  };
  samples.push(sample);
  if (samples.length > MAX_SAMPLES) samples.splice(0, samples.length - MAX_SAMPLES);

  // 跨天：把昨天的 rollup 收进 days，换新的一天
  const crossed = sample.minute === 0 && (today === null || today.month !== sample.month || today.day !== sample.day);
  if (today === null || crossed) {
    if (today) {
      days.push(today);
      if (days.length > MAX_DAYS) days.splice(0, days.length - MAX_DAYS);
    }
    today = blankDay(s);
  }

  const d = today;
  d.minutes += 1;
  // 当日累计量必须单调：万一某处把 flow 清零（读档/事件），不能让 d.lost 回退，
  // 否则「按增量记流失原因」会和「直接读 d.lost」对不上账。
  const lostDelta = Math.max(0, sample.lost - d.lost);
  d.bowls = Math.max(d.bowls, sample.bowls);
  d.lost = Math.max(d.lost, sample.lost);
  d.revenue = Math.max(d.revenue, sample.revenue);
  d.seats = sample.seats;
  d.priceSum += sample.price;
  d.priceCount += 1;
  d.tasteSum += sample.taste;
  d.tasteCount += 1;
  if (sample.waiting > d.peakWaiting) d.peakWaiting = sample.waiting;
  if (sample.lostReason && lostDelta > 0) {
    d.reasons[sample.lostReason] = (d.reasons[sample.lostReason] ?? 0) + lostDelta;
  }

  sinceFlush += 1;
  if (crossed || sinceFlush >= FLUSH_EVERY) flushTelemetry();
}

/** 落盘：只写聚合＋细节环，约几十 KB */
export function flushTelemetry(): void {
  sinceFlush = 0;
  try {
    const store: Store = { version: 2, days, today, samples };
    localStorage.setItem(KEY, JSON.stringify(store));
  } catch {
    /* 配额满时静默丢弃：埋点不该影响游戏 */
  }
}

export function getSamples(): readonly Sample[] {
  return samples;
}

export function getDays(): readonly DayRollup[] {
  const all = today ? [...days, today] : [...days];
  return all;
}

export function clearTelemetry(): void {
  samples = [];
  days = [];
  today = null;
  lastT = -1;
  flushTelemetry();
}

function allDays(): DayRollup[] {
  return today ? [...days, today] : [...days];
}

/** 一局的汇总：给验收/复盘/导出用 */
export function summarize(): TelemetrySummary {
  const list = allDays();
  if (list.length === 0) {
    return {
      minutes: 0,
      days: 0,
      bowls: 0,
      lost: 0,
      lostRate: 0,
      avgPrice: 0,
      avgTaste: 0,
      peakWaiting: 0,
      revenueTotal: 0,
      bowlsPerDay: 0,
      lostReasons: [],
    };
  }
  let minutes = 0;
  let bowls = 0;
  let lost = 0;
  let revenueTotal = 0;
  let priceSum = 0;
  let priceCount = 0;
  let tasteSum = 0;
  let tasteCount = 0;
  let peak = 0;
  const reasons = new Map<string, number>();

  for (const d of list) {
    minutes += d.minutes;
    // 每天只取最后一条累计值，不再逐分钟相加（v1 的 30 倍虚高就是这里）
    bowls += d.bowls;
    lost += d.lost;
    revenueTotal += d.revenue;
    priceSum += d.priceSum;
    priceCount += d.priceCount;
    tasteSum += d.tasteSum;
    tasteCount += d.tasteCount;
    if (d.peakWaiting > peak) peak = d.peakWaiting;
    for (const [reason, count] of Object.entries(d.reasons)) {
      reasons.set(reason, (reasons.get(reason) ?? 0) + count);
    }
  }
  // 漏出门槛：minute 0 的样本可能没采到（例如从月中存档继续），天数按有效样本数算
  const days = list.filter((d) => d.minutes > 0).length;

  return {
    minutes,
    days,
    bowls,
    lost,
    lostRate: lost / Math.max(1, bowls + lost),
    avgPrice: priceCount ? priceSum / priceCount : 0,
    avgTaste: tasteCount ? tasteSum / tasteCount : 0,
    peakWaiting: peak,
    revenueTotal,
    bowlsPerDay: days ? bowls / days : 0,
    lostReasons: [...reasons.entries()]
      .map(([reason, count]) => ({ reason, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8),
  };
}

/** 导出给「飞轮」吃的一整包 */
export function exportPayload(): string {
  return JSON.stringify(
    {
      version: 2,
      exportedAt: new Date().toISOString(),
      summary: summarize(),
      days: allDays(),
      samples,
    },
    null,
    1,
  );
}

/** 浏览器里按 Shift+E 或控制台调用：直接下载一份试玩记录 */
export function downloadPlaytest(): string {
  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const name = `playtest-${stamp}.json`;
  const blob = new Blob([exportPayload()], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return name;
}

