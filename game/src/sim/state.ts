import { DAYS_PER_MONTH, dayIndex } from "./calendar";
import { GUANGXI, TARGET_BASE_YUAN, monthTargetFor } from "../data/balance";

/** 起步区：兴宁区（祖传铺面，转让费 0），见 data/nanning.ts 与账本行 18 */
const START_DISTRICT = "xingning";
import { DAY_MINUTES, tickCustomers } from "./customer";
import { tickEvents } from "./events";
import { closeMonth } from "./ledger";
import { nextFloat, seedRng, type RngState } from "./rng";
import { refreshCandidates, settleStaffDay } from "./staff";
import { DEFAULT_PRICE, scoreRecipe } from "./score";

export const SAVE_VERSION = 6;
/** 3 年 × 12 月 */
export const TOTAL_MONTHS = 36;
export { DAYS_PER_MONTH };
export const YEAR_MONTHS = 12;

/** 汤底 8 参（对应需求 §3.1）。顺序不可改，改了就废存档。 */
export type SoupParams = [
  sourBamboo: number, // s0 酸笋发酵度
  douchi: number, // s1 豆豉量
  porkBone: number, // s2 猪骨/猪杂浓度
  salt: number, // s3 咸度
  umami: number, // s4 鲜度
  chili: number, // s5 辣度
  garlic: number, // s6 蒜香
  turbidity: number, // s7 汤浊度
];

/** 米粉 7 参（对应需求 §3.2）。 */
export type NoodleParams = [
  riceAge: number, // n0 米种陈度 0-100
  ferment: number, // n1 发酵酸度 0-100
  aroma: number, // n2 米香 0-100
  chew: number, // n3 韧性 0-100
  waterRatio: number, // n4 汤水比 20-50
  width: number, // n5 粉宽 0-4
  shape: number, // n6 粉型 0 切粉 / 1 圆粉 / 2 细切粉
];

export interface Recipe {
  soup: SoupParams;
  noodle: NoodleParams;
  toppings: string[];
}

/** 四种「热潮」，0-100 */
export interface Trend {
  sourBamboo: number;
  douchi: number;
  porkOffal: number;
  broth: number;
}

/** 一个顾客在店里的状态。字段形状对应 REA `customer` 的 defParam 三元组。 */
export interface QueueCustomer {
  id: number;
  archetypeId: string;
  status: "waiting" | "eating";
  /** 已进食的游戏分钟数 */
  elapsed: number;
  /** 累计等位分钟数，入座后不清零，结算时用于扣分 */
  waited: number;
  /** 等这么久就走了 */
  patience: number;
  /** 结算时写入 0-100；未结算为 -1 */
  satisfaction: number;
  /** 常客标记：老客回访，耐心更高、满意度加成 */
  regular: boolean;
  /**
   * 口味问询进度 0-100，满一格揭示该原型下一维未知偏好。
   * 对应开罗 data.Customer.likeFound_ / AddLikeFound / GetLikeFoundRatio：
   * 偏好是店员问出来的，不是顾客吃完自己告诉你的。
   */
  survey: number;
}

/** 顾客循环状态。进存档，保证「中途存档再续跑」一致。 */
export interface CustomerFlow {
  nextId: number;
  /** 当天已过的分钟，0-(DAY_MINUTES-1) */
  minuteOfDay: number;
  customers: QueueCustomer[];
  /** 灶台冷却：一人一锅，出碗要时间。0 表示可以接下一单 */
  serveCooldown: number;
  servedToday: number;
  lostToday: number;
  revenueToday: number;
  /** 最近一位顾客的满意度，HUD 用 */
  lastSatisfaction: number;
  /** 最近一次「发现顾客喜好」的提示文案，HUD 读完即消费 */
  lastLikeFound: string | null;
  /** 最近一次「熟客回礼」的提示文案，HUD 读完即消费 */
  lastGift: string | null;
  /** 最近一次「为什么跑了」的提示（目前只有看价牌走人），HUD 读完即消费 */
  lastLostReason: string | null;
}

export type StaffRole = "cook" | "prep" | "server";

export interface StaffMember {
  uid: string;
  templateId: string;
  name: string;
  role: StaffRole;
  skill: number;
  wage: number;
  /** 0-100，越高越慢；>=100 次日走人 */
  fatigue: number;
  /** 今天休息：不干活、半薪、恢复体力 */
  resting: boolean;
}

export interface StaffState {
  roster: StaffMember[];
  candidates: StaffMember[];
  /** 候选池生成时的绝对日；换天就重掷 */
  candidateDay: number;
  lastEvent: string;
}

export interface VenueState {
  seats: number;
  stoves: number;
  upgrades: Record<string, number>;
}

/** 常客档案：按顾客原型记，不记到具体人名，避免 24×N 的内存爆炸 */
export interface RegularRecord {
  visits: number;
  /** 累计满意度，用于算均值 */
  satSum: number;
  /**
   * 累计「喂对味」的次数——这一碗确实命中了该原型的喜好维度。
   * 对应开罗 data.Customer$$AddRegularCount：常客是喂出来的，不是掷出来的。
   */
  likeHits: number;
  /**
   * 已收到的回礼份数。
   * 对应开罗 data.Customer.getGiftCount_ / giftGet_ / GetGiftIndex / GetGiftRatio：
   * 熟客按「喂对味」累计进度逐份送礼，不是无限刷。
   */
  giftCount: number;
  /** 最近一次来店是第几天（绝对日） */
  lastDay: number;
  /** 这桌老客最认的那口浇头 */
  favTopping: string;
}

export interface CollectionState {
  toppings: string[];
  customers: string[];
  grades: string[];
  provinces: string[];
  /** 已发现的顾客喜好，元素形如 "grandma:sour"。对应开罗的 LikeFound。 */
  likes: string[];
}

export interface MonthRecord {
  month: number;
  revenue: number;
  customers: number;
  lost: number;
  avgSat: number;
  wages: number;
  rent: number;
  profit: number;
  target: number;
  grade: "S" | "A" | "B" | "C" | "D";
}

export interface YearRecord {
  year: number;
  revenue: number;
  customers: number;
  avgSat: number;
  target: number;
  rating: "S" | "A" | "B" | "C" | "D";
  bonus: number;
  final: boolean;
}

export interface ContestResult {
  month: number;
  score: number;
  rank: number;
  champion: string;
  prize: number;
}

export interface EventLogEntry {
  /** 绝对日 */
  day: number;
  title: string;
  result: string;
}

/** 事件脚本运行时状态。事件定义在 data/events.ts，这里只存进度。 */
export interface EventRuntime {
  /** 已弹出、等玩家选择的事件 */
  pending: { id: string; absDay: number } | null;
  /** 每条事件上次触发的绝对日，冷却用 */
  lastFired: Record<string, number>;
  /** 已触发过的 id，一次性事件用 */
  seen: string[];
  /** 最近 EVENT_LOG_LIMIT 条结果，新的在前 */
  log: EventLogEntry[];
  /** 今天是否已掷过骰（绝对日） */
  rolledDay: number;
  /** 累计触发次数 */
  count: number;
}

export interface Tally {
  /** 累计出碗数 */
  bowls: number;
  /** 单日营收最高值（元） */
  bestDayRevenue: number;
  /** 同时排队人数峰值 */
  maxQueue: number;
  /** 已开店（或已在营）的区，见 data/nanning.ts */
  districts: string[];
}

export interface GameState {
  saveVersion: number;
  /** 匿名 UUID，存档主键 */
  playerId: string;
  /** 6 位接续码，由 playerId 派生 */
  connectCode: string;
  rng: RngState;
  /** 0-35，0 = 第 1 年 1 月 */
  month: number;
  /** 1-30 */
  day: number;
  cash: number;
  /** 0-5，一位小数 */
  reputation: number;
  /** 每日接待上限 */
  capacity: number;
  todayCustomers: number;
  /** 本次存档累计接待 */
  totalCustomers: number;
  /** 本月营收 */
  monthRevenue: number;
  /** 本月已接待 / 本月流失 */
  monthServed: number;
  monthLost: number;
  /** 本月工资 */
  monthWages: number;
  /** 本月满意度累加，结算时算均值 */
  monthSatSum: number;
  monthSatCount: number;
  /**
   * 本月营收目标 —— **只作参考线，不再判定成败**（K1 目标换骨，账本行 19）。
   * 开罗拉面店没有月营收 KPI：它用 39 条累计 trophy + 11 级段位推人往前走，
   * 这里保留这个数只为了让 HUD 有个「本月做了多少」的量尺。
   */
  monthTarget: number;
  /** 累计成就计数（只增不减，见 sim/achievements.ts） */
  tally: Tally;
  /** 已通过的段位 0-11（0 = 还没评过，见 sim/grade.ts） */
  gradeLevel: number;
  /** 每碗售价（元） */
  price: number;
  recipe: Recipe;
  trend: Trend;
  flow: CustomerFlow;
  staff: StaffState;
  venue: VenueState;
  regulars: Record<string, RegularRecord>;
  collection: CollectionState;
  months: MonthRecord[];
  years: YearRecord[];
  contest: {
    results: ContestResult[];
    /** 上次报名月份，-1 = 没报过 */
    lastMonth: number;
  };
  events: EventRuntime;
  /** 年度结算单，非空时 HUD 强制弹出 */
  pendingReport: YearRecord | null;
  /** 36 个月跑完 */
  finished: boolean;
}

/**
 * 起始数值：全部来自 `data/balance.ts` 的广西换算（1 KCU = 0.01 元）。
 * 改动前先看 `docs/数值来源与换算-2026-11-12.md`，那是这套数字的出处。
 */
const START_CASH = GUANGXI.startCashYuan;
/**
 * 每日接待上限（兜底闸，不是产能）。
 *
 * 实测教训：原来这里是 40，客流怎么调都卡在 40 碗/日 —— 产能被一道与
 * 座位、灶台无关的常量锁死。后来改成 80，仍然盖住了「4 座 ≈ 82 碗/日」的
 * 真实产能，导致扩座完全无效（4 座与 8 座同样 80.3 碗/日）。
 * 现在设成 200，只当日销量异常的保护阀：真正的天花板由座位的翻台与
 * 灶台的出餐速度决定，扩座、加灶、雇人也才有意义。
 */
const START_CAPACITY = 200; /* 现实 4 座小店 70 碗/日属于「产出」，不该由常量扮演 */
const START_MONTH_TARGET = TARGET_BASE_YUAN;
const START_SEATS = 4;
const START_STOVES = 1;

const DEFAULT_RECIPE: Recipe = {
  soup: [40, 45, 55, 50, 50, 45, 40, 55],
  noodle: [50, 40, 55, 50, 35, 1, 0],
  toppings: [],
};

const CODE_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ"; // 32 字符，剔掉 0/1/I/O

/** 由 playerId 派生 6 位接续码（FNV-1a + 雪崩），纯函数 */
export function makeConnectCode(playerId: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < playerId.length; i++) {
    h ^= playerId.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  let out = "";
  for (let i = 0; i < 6; i++) {
    out += CODE_ALPHABET[h & 31];
    h = Math.imul(h ^ (h >>> 13), 0x5bd1e995) >>> 0;
  }
  return out;
}

/** 从开档算起的绝对天数（0 起），常客间隔用 */
export function absDay(state: GameState): number {
  return dayIndex(state.month, state.day);
}

/** 同一 (playerId, seed) 必然得到同一初始局面 */
export function createInitialState(playerId: string, seed: number): GameState {
  const rng = seedRng(seed);
  const roll = () => 20 + Math.floor(nextFloat(rng) * 41); // 20-60
  const state: GameState = {
    saveVersion: SAVE_VERSION,
    playerId,
    connectCode: makeConnectCode(playerId),
    rng,
    month: 0,
    day: 1,
    cash: START_CASH,
    reputation: 3,
    capacity: START_CAPACITY,
    todayCustomers: 0,
    totalCustomers: 0,
    monthRevenue: 0,
    monthServed: 0,
    monthLost: 0,
    monthWages: 0,
    monthSatSum: 0,
    monthSatCount: 0,
    monthTarget: START_MONTH_TARGET,
    tally: {
      bowls: 0,
      bestDayRevenue: 0,
      maxQueue: 0,
      districts: [START_DISTRICT],
    },
    gradeLevel: 0,
    price: DEFAULT_PRICE,
    recipe: {
      soup: DEFAULT_RECIPE.soup.slice() as SoupParams,
      noodle: DEFAULT_RECIPE.noodle.slice() as NoodleParams,
      toppings: [],
    },
    trend: {
      sourBamboo: roll(),
      douchi: roll(),
      porkOffal: roll(),
      broth: roll(),
    },
    flow: {
      nextId: 1,
      minuteOfDay: 0,
      customers: [],
      serveCooldown: 0,
      servedToday: 0,
      lostToday: 0,
      revenueToday: 0,
      lastSatisfaction: -1,
      lastLikeFound: null,
      lastGift: null,
      lastLostReason: null,
    },
    staff: {
      roster: [],
      candidates: [],
      candidateDay: -1,
      lastEvent: "",
    },
    venue: {
      seats: START_SEATS,
      stoves: START_STOVES,
      upgrades: {},
    },
    regulars: {},
    collection: {
      toppings: [],
      customers: [],
      grades: [],
      provinces: [],
      likes: [],
    },
    months: [],
    years: [],
    contest: {
      results: [],
      lastMonth: -1,
    },
    events: {
      pending: null,
      lastFired: {},
      seen: [],
      log: [],
      rolledDay: -1,
      count: 0,
    },
    pendingReport: null,
    finished: false,
  };
  refreshCandidates(state);
  return state;
}

/** 日结：发工资、员工疲劳、换日；月底交给 ledger。 */
function endDay(state: GameState): void {
  state.monthWages += settleStaffDay(state);
  // K1 成就：单日营收峰值（必须在 flow.revenueToday 被清零之前取）
  if (state.flow.revenueToday > state.tally.bestDayRevenue) {
    state.tally.bestDayRevenue = state.flow.revenueToday;
  }

  state.day += 1;
  state.todayCustomers = 0;
  state.flow.minuteOfDay = 0;
  state.flow.customers = [];
  state.flow.serveCooldown = 0;
  state.flow.servedToday = 0;
  state.flow.lostToday = 0;
  state.flow.revenueToday = 0;

  if (state.day > DAYS_PER_MONTH) {
    closeMonth(state);
    state.day = 1;
    if (state.month < TOTAL_MONTHS - 1) {
      state.month += 1;
      state.monthTarget = monthTargetFor(state.month + 1);
    } else {
      state.finished = true;
    }
  }
  refreshCandidates(state);
}

/**
 * 一「分钟」推进一次：顾客进店/等位/吃粉/付款，然后走时钟。
 *
 * 事件弹窗未处理时整条时间线停住——对齐开罗：GameForm.Update 只在
 * AppData.IsTopForm(this) 为真时调 _update→ProgressTime，子窗体压栈即刻停表。
 */
export function advanceMinute(state: GameState): void {
  if (state.finished) return;
  if (state.events.pending) return;
  const score = scoreRecipe(state.recipe, state.price);
  tickCustomers(state, score);
  tickEvents(state);
  state.flow.minuteOfDay += 1;
  if (state.flow.minuteOfDay >= DAY_MINUTES) endDay(state);
}
