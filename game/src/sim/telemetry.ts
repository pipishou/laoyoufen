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
  /**
   * 三条流失计数（当天累计，批 BG′）。
   *
   * 为什么必须存这三条：`lostReason` 是**粘性字符串**，只在「一款都买不起」那条分支里被写
   * （`sim/customer.ts` 的价牌分支），而队满与等不及只加计数不写 reason。于是过去把「当日
   * 流失增量」整批记到那个字符串上 —— 线上 97 局里 `peakWaiting >= 12` 的 236 天，
   * reasons 里**一条非价牌条目都没有**，日结单就在教玩家「你的问题在定价」。
   * `sim/bottleneck.ts` 的 `lossSplitOf` 一直读的就是这三条，是准的。
   */
  lostQueue: number;
  lostPrice: number;
  lostWait: number;
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
  /**
   * 当天流失的三条准确计数（批 BG′）。
   *
   * 这里原来是 `reasons: Record<string, number>` —— 「上一次写下的那句话 × 当日流失增量」。
   * 那个设计是错的：`lostReason` 只在「一款都买不起」分支被写（`sim/customer.ts` 价牌分支），
   * 队满与等不及只加计数不写 reason，于是它们被整批贴到上一句价牌话上。
   * 线上 97 局里 `peakWaiting >= 12` 的 236 天，reasons 里**一条非价牌条目都没有**。
   *
   * 现在改成三条固定字段，与 `sim/bottleneck.ts` 的 `lossSplitOf` 同一个口径（那是准的）。
   * 老归档里多出来的 `reasons` 键会被忽略；缺这三个字段的老数据按 0 读。
   */
  lostQueue: number;
  lostPrice: number;
  lostWait: number;
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
  /** 三条流失来源（批 BG′）。永远恰好三条，count 可能为 0 */
  lostSplit: { queue: number; price: number; wait: number };
  /**
   * 三条来源的中文说法，供 `server/app.py` 的日报直接吃（它按 `reason` 字符串加总）。
   * 顺序固定：条数多的在前。老归档里的旧字符串不在这里出现 —— 那是另一套统计，
   * 由服务端自己按原始 `days[].reasons` 读。
   */
  lostReasons: { reason: string; count: number }[];
}

/** 三条流失来源在日报/界面上的固定说法（改字要同步 `server/app.py` 的说明） */
export const LOSS_LABELS = {
  queue: "门口站满了没进来",
  price: "看价牌掉头（一款都买不起）",
  wait: "等不及走了",
} as const;

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
    lostQueue: 0,
    lostPrice: 0,
    lostWait: 0,
  };
}

/**
 * 读回来的老数据补齐（批 BG′）。
 *
 * v2 的归档里 `DayRollup` 只有 `reasons: Record<string, number>`，没有三条计数。
 * 不补齐会让 `Math.max(d.lostQueue, …)` 吃到 `undefined` ⇒ `NaN` 一路传到日结与导出。
 * 老的 `reasons` 键**丢掉**（那套数据本身是错的，留着会继续骗人）；三条按 0 起算，
 * 从补齐的那一刻开始记准的。版本号仍是 2 —— 结构向后兼容，老浏览器里的档不用清。
 */
function normalizeDay(d: DayRollup): DayRollup {
  const num = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : 0);
  return {
    month: d.month,
    day: d.day,
    minutes: num(d.minutes),
    bowls: num(d.bowls),
    lost: num(d.lost),
    revenue: num(d.revenue),
    priceSum: num(d.priceSum),
    priceCount: num(d.priceCount),
    tasteSum: num(d.tasteSum),
    tasteCount: num(d.tasteCount),
    seats: num(d.seats),
    peakWaiting: num(d.peakWaiting),
    lostQueue: num(d.lostQueue),
    lostPrice: num(d.lostPrice),
    lostWait: num(d.lostWait),
  };
}

export function loadTelemetry(): void {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as Store;
    if (parsed && parsed.version === 2) {
      days = Array.isArray(parsed.days) ? parsed.days.slice(-MAX_DAYS).map(normalizeDay) : [];
      today = parsed.today ? normalizeDay(parsed.today) : null;
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
    lostQueue: s.flow.lostQueue,
    lostPrice: s.flow.lostPrice,
    lostWait: s.flow.lostWait,
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
  d.bowls = Math.max(d.bowls, sample.bowls);
  d.lost = Math.max(d.lost, sample.lost);
  d.revenue = Math.max(d.revenue, sample.revenue);
  d.seats = sample.seats;
  d.priceSum += sample.price;
  d.priceCount += 1;
  d.tasteSum += sample.taste;
  d.tasteCount += 1;
  if (sample.waiting > d.peakWaiting) d.peakWaiting = sample.waiting;
  /**
   * 三条来源：**取当日累计的最大值**，不按增量累加。
   *
   * 这是批 BG′ 的核心修正。旧写法是
   *   `d.reasons[sample.lostReason] += lostDelta`
   * —— 它假设「这一分钟的流失都由 lastLostReason 解释」，而那个字符串只在价牌分支被写，
   * 队满/等不及根本不写。于是排队堵死的那些天，日结单上写的是「嫌贵」。
   *
   * 现在直接搬 `flow.lostQueue/lostPrice/lostWait` 三条真实计数（`sim/customer.ts` 分别在
   * 队满分支 `:375`、价牌分支 `:413`、等不及分支 `:833` 各加一），`d.lost` 与它们同源，
   * 所以 `lostQueue + lostPrice + lostWait` 必然 ≤ `lost`，对得上账。
   *
   * 用 max 而不是 += 的理由与 `d.lost` 一样：这三个也是当日累计量，遇到读档/事件把 flow
   * 清零时不能让日结算出的数回退。跨天时 `blankDay` 会从 0 重新开始。
   */
  d.lostQueue = Math.max(d.lostQueue, sample.lostQueue);
  d.lostPrice = Math.max(d.lostPrice, sample.lostPrice);
  d.lostWait = Math.max(d.lostWait, sample.lostWait);

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
      lostSplit: { queue: 0, price: 0, wait: 0 },
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
  let lossQueue = 0;
  let lossPrice = 0;
  let lossWait = 0;

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
    // 三条来源逐日相加（每天一条累计值）。老归档缺这三个字段时按 0 读。
    lossQueue += d.lostQueue ?? 0;
    lossPrice += d.lostPrice ?? 0;
    lossWait += d.lostWait ?? 0;
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
    lostSplit: { queue: lossQueue, price: lossPrice, wait: lossWait },
    lostReasons: (
      [
        { reason: LOSS_LABELS.queue, count: lossQueue },
        { reason: LOSS_LABELS.price, count: lossPrice },
        { reason: LOSS_LABELS.wait, count: lossWait },
      ] as { reason: string; count: number }[]
    )
      .filter((it) => it.count > 0)
      .sort((a, b) => b.count - a.count),
  };
}

/**
 * 三条来源的「谁最该修」：与 `ui/hud.ts` 的 `dayNoteOf` 同一口径（条数多的先说话）。
 *
 * 存在的理由：日结单读的是 `DayRecord`（`sim/state.ts` 的 `recordDay` 已经把三条分开存了），
 * 而遥测自己必须能给出同样的判断 —— 否则导出给服务端的那一份和玩家看到的那一份会打架。
 */
export function topLoss(split: { queue: number; price: number; wait: number }): "queue" | "price" | "wait" {
  const { queue, price, wait } = split;
  if (queue + price + wait === 0) return "wait";
  if (price >= queue && price >= wait) return "price";
  return queue >= wait ? "queue" : "wait";
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

/**
 * 导出给「飞轮」吃的一整包。自动上传不带 samples（那是 Shift+E 导出的东西），省 90% 流量。
 *
 * `version` 3 → 4（批 BG′）：`summary` 多了 `lostSplit`，`days[]` 里
 * `reasons: Record<string,number>` 换成 `lostQueue/lostPrice/lostWait` 三个数。
 * 服务端 `_daily_reasons` 读的是 `summary.lostReasons`，**这个键名没变**，
 * 只是内容从「客人原话 + 数字」变成「三条来源 + 条数」——所以老服务端不用改也能跑，
 * 但日报上的说法会变成人话（见 `LOSS_LABELS`）。
 */
export function exportPayload(opts: { samples?: boolean } = {}): string {
  return JSON.stringify(
    {
      version: 4,
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

