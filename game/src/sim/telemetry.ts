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

/**
 * 匿名设备号：只用来把同一台机器的多次上传归到一条时间线上。
 * 不含任何账号、不尝试指纹识别——随机 16 字节，存在 localStorage，玩家清缓存就换一个。
 */
const DEVICE_KEY = "laoyou.device.v1";

export function deviceId(): string {
  try {
    let id = localStorage.getItem(DEVICE_KEY);
    if (!id) {
      const buf = new Uint8Array(12);
      crypto.getRandomValues(buf);
      id = Array.from(buf, (b) => b.toString(16).padStart(2, "0")).join("");
      localStorage.setItem(DEVICE_KEY, id);
    }
    return id;
  } catch {
    return "no-storage";
  }
}

/** 导出给「飞轮」吃的一整包。自动上传不带 samples（那是 Shift+E 导出的东西），省 90% 流量 */
export function exportPayload(opts: { samples?: boolean } = {}): string {
  return JSON.stringify(
    {
      version: 3,
      device: deviceId(),
      client: "laoyoufen-web",
      exportedAt: new Date().toISOString(),
      summary: summarize(),
      days: allDays(),
      samples: opts.samples ? samples : undefined,
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

// ---------------- 上传（飞轮的「采集」接到服务端） ----------------

const API_BASE = ((import.meta as unknown as { env?: Record<string, string | undefined> }).env?.VITE_API_BASE ?? "").replace(/\/$/, "");
/** 玩到 10 分钟就值得记一笔；更短的会话留在本地，不污染统计 */
const UPLOAD_MIN_MINUTES = 10;
/** 两次上传的最小间隔（防抖，不是防玩家） */
const UPLOAD_EVERY_MS = 120_000;
/** 又推进了这么多游戏分钟就再传一次，避免「玩了两小时只传了开头」 */
const UPLOAD_STEP_MINUTES = 15;
let lastUploadAt = 0;
let lastUploadMinutes = 0;
let lastUploadDays = -1;
const PENDING_KEY = "laoyou.upload.pending";

export function uploadEnabled(): boolean {
  return API_BASE.length > 0;
}

export interface UploadResult {
  ok: boolean;
  id?: string;
  skipped?: string;
  error?: string;
}

function markPending(reason: string): void {
  try {
    localStorage.setItem(PENDING_KEY, reason);
  } catch {
    /* 存不了就算了，别影响玩 */
  }
}

function clearPending(): void {
  try {
    localStorage.removeItem(PENDING_KEY);
  } catch {
    /* ignore */
  }
}

/** 上次没传成功过？给 UI / 自检用 */
export function uploadPending(): string | null {
  try {
    return localStorage.getItem(PENDING_KEY);
  } catch {
    return null;
  }
}

/**
 * 把当前这局的埋点包 POST 给服务端 —— 平时由 main.ts 每分钟调一次，节流在这里。
 * 失败一律不抛、不影响游戏，只记一个待补传标记，下次联网/下次推进自动补。
 * `force` 用于玩家按 Shift+U。
 */
export async function uploadPlaytest(force = false): Promise<UploadResult> {
  if (!API_BASE) return { ok: false, skipped: "no_api_base" };
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    markPending("offline");
    return { ok: false, skipped: "offline" };
  }
  const sum = summarize();
  if (sum.minutes < UPLOAD_MIN_MINUTES) return { ok: false, skipped: "too_short" };
  const now = Date.now();
  // 时间闸无条件生效（force 除外）：16 倍速下「又推进了 15 分钟」每秒都成立，
  // 若让 grew 绕过时间闸，一次十分钟的加速游戏能打出上百个包。
  if (!force && lastUploadAt > 0 && now - lastUploadAt < UPLOAD_EVERY_MS) {
    return { ok: false, skipped: "throttled" };
  }
  const grew = sum.minutes - lastUploadMinutes >= UPLOAD_STEP_MINUTES || sum.days !== lastUploadDays;
  if (!force && !grew && lastUploadAt > 0) return { ok: false, skipped: "no_progress" };
  lastUploadAt = now;
  lastUploadMinutes = sum.minutes;
  lastUploadDays = sum.days;
  try {
    const res = await fetch(`${API_BASE}/playtest`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: exportPayload(),
      keepalive: true,
    });
    if (!res.ok) {
      markPending(`http_${res.status}`);
      return { ok: false, error: `http_${res.status}` };
    }
    const data = (await res.json()) as { id?: string };
    clearPending();
    return { ok: true, id: data.id };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "network";
    markPending(msg);
    return { ok: false, error: msg };
  }
}

/** 关页时用 sendBeacon：比 fetch 更可能在卸载阶段送出去 */
export function beaconPlaytest(): boolean {
  if (!API_BASE || typeof navigator === "undefined" || !navigator.sendBeacon) return false;
  if (summarize().minutes < UPLOAD_MIN_MINUTES) return false;
  try {
    const blob = new Blob([exportPayload()], { type: "application/json" });
    return navigator.sendBeacon(`${API_BASE}/playtest`, blob);
  } catch {
    return false;
  }
}

