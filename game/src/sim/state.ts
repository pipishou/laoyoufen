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
import { noodleKindOf } from "./noodles";
import { START_NOODLE, type NoodleId } from "../data/noodles";
import { START_SIDES, type DrinkTemp } from "../data/sides";
import { DEFAULT_PORTION, START_MAIN } from "../data/mains";
import { runBranchDay, type BranchState } from "./branches";
import { initRivals, type RivalState } from "./rivals";
import type { NewsItem } from "./news";
import { pushNews } from "./news";
import { checkTrophies } from "./trophies";
import { settlePack } from "./pack";
import { noteTick } from "./notebook";
import { defaultRetail, settleRetail } from "./retail";
import { DEFAULT_QUALITY } from "../data/quality";

import type { ArenaRun } from "./arena";
import type { TourneyRecord } from "./tourneys";

export const SAVE_VERSION = 36;
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

/**
 * 菜单上的一款粉（P47）。
 *
 * 开罗的售卖机上挂一排拉面券，客人自己按钱包和口味选一款 —— 菜单是
 * 「多款商品」，不是一个「当前商品」。我们的老友粉店也一样：老友粉、
 * 老友牛肉粉、干捞老友粉可以同时卖，各定各的价。
 *
 * `state.recipe / price / noodle / main / portion` 是「正在编辑的这一款」的
 * 编辑缓冲（滑块在改它），改完统一 `syncEditing()` 写回 `menu[editing]`。
 */
export interface MenuItem {
  id: number;
  recipe: Recipe;
  /** 粉型，见 `data/noodles.ts` */
  noodle: string;
  /** 主料，见 `data/mains.ts` */
  main: string;
  /** 份量：2＝二两、3＝三两 */
  portion: number;
  /** 菜单价（二两的价；三两自动 +¥2） */
  price: number;
  /** 在架（下架的款不卖，但保留配方） */
  on: boolean;
  /** 这款累计卖出的碗数 */
  sold: number;
  /**
   * 老师傅定的方子（A6），见 `data/master.ts`。undefined = 没定过。
   * 可选字段：老档没有这一格，读进来天然是 undefined，不必升存档版本。
   */
  master?: string | null;
  /** 定了「火候定死」时记下的味道分；没定就是 undefined */
  lockedTaste?: number;
}

/** 一个顾客在店里的状态。字段形状对应 REA `customer` 的 defParam 三元组。 */
export interface QueueCustomer {
  id: number;
  archetypeId: string;
  /** 他点的是菜单上哪一款（P47 菜单） */
  dishId: number;
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
   * 顾客等级（A8）：passer 路过的 / neighbor 街坊 / picky 识食的。
   * 可选字段 —— 老档里的顾客没有这一格，读回来当街坊处理。
   */
  tier?: string;
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
  /**
   * 今天走掉的人各自为什么走（试玩 11-21：三家照钩子连买三档猛火灶，流失一动不动）。
   * 三档分别对应 arriveOne 的三个出口：队满、看价牌、等不及。
   * 钩子按这三档点名，才不会再出现「该压价却叫你去加灶」。
   */
  lostQueue: number;
  lostPrice: number;
  lostWait: number;
  revenueToday: number;
  /** 最近一位顾客的满意度，HUD 用 */
  lastSatisfaction: number;
  /** 最近一次「发现顾客喜好」的提示文案，HUD 读完即消费 */
  lastLikeFound: string | null;
  /** 最近一次「熟客回礼」的提示文案，HUD 读完即消费 */
  lastGift: string | null;
  /** 最近一次「为什么跑了」的提示（目前只有看价牌走人），HUD 读完即消费 */
  lastLostReason: string | null;
  /**
   * 阿婆的笔记本（批次八）：已解锁的条目 id。
   * 可选字段 —— 老档没有这一格，按空处理，玩家继续玩就从当前进度开始记。
   */
  notes?: string[];
  /** 换过哪些粉型（用来数「三种都上过手」） */
  noodleTried?: string[];
  /** 刚翻到的那一页，界面读完即消费 */
  lastNote?: string | null;
  /** 上一次播报「又看得见一圈」时的圈号（批次九） */
  lastRing?: number;

  /** 今日满意度累加 / 计数，日结单用（月底另有 monthSatSum） */
  satSumToday: number;
  satCountToday: number;
  /** 这一分钟里「吃得满意」的碗数，热卖槽按它计分，每读完清零（I-07） */
  goodBowls: number;
  /** 最近一次「热卖开始了」的提示文案，HUD 读完即消费 */
  lastFrenzy: string | null;
  /** 最近一次攒到人情（M3b），main.ts 消费成 toast */
  lastFavor: string | null;
  /** 今天靠「吃到底」攒了多少点（日上限用，见 data/favor.ts） */
  favorToday: number;
  /** 月初街坊传闻（同条街），由 main.ts 的 tickFeedback 消费（M1） */
  lastStreet: string | null;
  /** 加料凑出组合时的喜报（老友味/酸辣开胃/全套），消费一次置空 */
  lastSides: string | null;
  /** 第一次凑成某条味道组合（B1）的 id，main.ts 消费成 toast + AI 一句话 */
  lastFlavor: string | null;
  /** 最近一位「识食的」当场挑刺（A8）：settle 写、main 消费弹一句 */
  lastTier: string | null;
  /**
   * 最近一碗极端档位的评价（批次一 `tier_voice`）：写成 `维度:档位`，settle 写、main 消费。
   * 可选字段：老档没有这一格，读进来是 undefined，不必为它升存档版本。
   */
  lastTierVoice?: string | null;
  /** 上次开口的日子 + 当天已经说了几次，用来限一天只开口一两次 */
  tierVoiceDay?: number;
  tierVoiceCount?: number;
  /** 零售落点（16）已经说过话的货 id（每款只说一次） */
  retailVoiceDone?: string[];
  /** 上次报加料组合的绝对分钟（节流用，免得每碗都弹） */
  sideToastAt: number;
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
  /**
   * 店员专精（A9）：学成的手艺 id，见 `data/specialty.ts`。
   * 可选字段 —— 老档里的员工没有这一格，读回来当没学。
   */
  specialty?: string;
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
  /**
   * 已买下几档扩建（0/1/2），见 `data/expansion.ts`。
   * 座位与灶位的资本开支只走这里，摆件（招牌/空调/装饰）走 upgrades。
   */
  expansion: number;
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
  /** 已经凑成过的味道组合（B1），元素是 data/flavor.ts 的 FlavorId */
  flavors: string[];
}

export interface MonthRecord {
  month: number;
  revenue: number;
  customers: number;
  lost: number;
  avgSat: number;
  wages: number;
  rent: number;
  /** 分店的房租 + 店长工资（S6；没有分店时为 0） */
  branchCost?: number;
  /** M1：服气的邻居这个月送的食材钱（算成本抵扣，所以利润要加回） */
  rivalGift?: number;
  /** 设备维护（批次十二后半）：每台每档 ¥90 × (1 + 0.12 × 段位) */
  upkeep?: number;
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
  /** 第几届（一年两场，0 起） */
  round: number;
  /** 哪个赛事：后厨擂台 / 街坊口碑赛 / 招牌评比 */
  type: string;
  /** 报的档位 1-5 */
  tier: number;
  score: number;
  rank: number;
  champion: string;
  prize: number;
}

/** 热卖槽（开罗 Ramen Frenzy） */
export interface FrenzyState {
  /** 0..100，满了触发一次热卖 */
  gauge: number;
  /** 热卖结束的绝对分钟（见 sim/frenzy.ts 的 absMinuteOf），-1 = 没在热卖 */
  until: number;
  /** 冷却结束的绝对分钟：热卖结束后这段时间槽不涨，免得天天热卖 */
  restUntil: number;
  /** 累计触发次数（成就/统计用） */
  count: number;
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

/**
 * 全流程的四个状态，对齐开罗「时间只在顶层营业窗口推进」：
 * - `setup`：还没开店。选铺位、起店名（六阶的 S0），时间不走，也没有顾客。
 * - `prep`：开店前 / 打烊后。时间不走，玩家可以调配方、定价、雇人、看报表。
 * - `open`：营业中。每「分钟」推进一次，顾客进店、等位、吃粉、结算。
 * - `closing`：今天已经打烊，日结单等玩家确认（`dayReport` 非空）。
 *
 * 这样做的原因：原来一进游戏就在营业，玩家还没有任何决策，第一分钟就开始
 * 流失顾客，等于把「准备」与「建店」这两步从流程里删掉了。
 */
export type Phase = "setup" | "prep" | "open" | "closing";

/** 一天的日结单。打烊时生成，玩家点「明天继续」后清空。 */
export interface DayRecord {
  month: number;
  day: number;
  revenue: number;
  served: number;
  lost: number;
  /** 走掉的人里，队满 / 看价牌 / 等不及各多少（试玩 11-21 起记录） */
  lostQueue?: number;
  lostPrice?: number;
  lostWait?: number;
  /** 今日平均满意度，0 位顾客时为 -1 */
  avgSat: number;
  price: number;
  taste: number;
  cash: number;
  /** 分店今天做的碗数（S6；没有分店时省略） */
  branchBowls?: number;
  /** 分店今天的净进账（已扣料钱与房租店长摊销） */
  branchNet?: number;
  /** 袋装线（A7）今天卖出的袋数 */
  packSold?: number;
  /** 袋装线今天的净收入（已算进 `revenue`） */
  packNet?: number;
  /** 零售货架今天卖出几件、净收入多少（批次七） */
  retailSold?: number;
  retailNet?: number;
}

export interface Tally {
  /** 累计出碗数 */
  bowls: number;
  /** 单日营收最高值（元） */
  bestDayRevenue: number;
  /** 袋装线累计卖出的袋数（A7） */
  packSold: number;
  /** 零售线累计卖出件数（批次七） */
  retailSold?: number;
  /** 同时排队人数峰值 */
  maxQueue: number;
  /** 已开店（或已在营）的区，见 data/nanning.ts */
  districts: string[];
  /** 累计加购收入（加料/饮料，不含一碗的基础价） */
  sideRevenue: number;
  /** 落场（M4）一共打了几场 / 赢了几场 */
  arenaRuns: number;
  arenaWins: number;
  /** 累计凑出组合（老友味/酸辣开胃/全套）的次数 */
  comboHits: number;
  /**
   * 分店累计出碗数（S6）。
   * 单列一份是因为 `bowls` 是「主店端出去的碗」，月报里的 `customers` 也是主店客流；
   * 混在一起账就对不上（测试员 T7 会当场抓到）。
   */
  branchBowls: number;
  /** 转手出去的配方份数（B 批成就用，见 data/trophies.ts） */
  recipesSold: number;
}

/**
 * 加料台与饮料柜（P41 客单价结构）。
 * active 是「上架的单品 id」，sold 是累计卖出份数 —— 只增不减，所以不用每天清零。
 */
export interface SideState {
  active: string[];
  sold: Record<string, number>;
  /** 粉 + 饮料套餐（P42）：开着时饮料便宜 ¥1，客人觉得划算 */
  mealDeal: boolean;
  /** 饮料冰还是热（P43）：夏天上冰、冬天上热，对得上季 +1 满意，反季 −1 */
  drinkTemp: DrinkTemp;
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
  /** 累计成就计数（只增不减，见 sim/trophies.ts） */
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
    /** 上次报名的届次（一年两场，见 sim/calendar.ts），-1 = 没报过 */
    lastRound: number;
    /** 进过前三的次数 —— 段位与成就都要看这个 */
    wins: number;
  };
  events: EventRuntime;
  /**
   * 热卖槽（开罗 Ramen Frenzy，见 sim/frenzy.ts）：
   * 门口有人排队且今天吃得满意 → 槽涨满 → 30 分钟来客翻倍、店员 aura 涨满意度。
   */
  frenzy: FrenzyState;
  /** 加料台与饮料柜（P41 客单价结构），见 `data/sides.ts` */
  sides: SideState;
  /**
   * 现在卖哪种粉（P42 粉型本土化），见 `data/noodles.ts`：
   * 切粉 / 圆粉 / 伊面 / 湿面（碱水）/ 干捞（夏）/ 砂锅（冬）。
   * 粉型决定成本、出碗时间、与当前汤底的契合度，以及当季加成。
   */
  noodle: string;
  /**
   * 主料（P46）：碎肉 / 猪杂 / 牛肉 / 牛杂 / 猪脚 / 烧鸭 / 牛腩 / 三鲜 / 鱼片 / 素粉。
   * 见 `data/mains.ts` —— 主料是菜单的 SKU，改料钱、改满意、靠累计客流解锁。
   */
  main: string;
  /**
   * 份量（P46）：2＝二两（默认）、3＝三两。
   * 三两多一钱料、售价 +¥2、满意 +1，但出碗慢 10%。
   */
  portion: number;
  /**
   * 菜单（P47）：同时在架的多款粉，客人按钱包与口味自己挑一款。
   * 开罗的售卖机上挂一排拉面券，也是这么卖的。
   */
  menu: MenuItem[];
  /** 正在编辑 `menu` 里的第几款（配方页的滑块改的就是它） */
  editing: number;
  /** 年度结算单，非空时 HUD 强制弹出 */
  pendingReport: YearRecord | null;
  /** 36 个月跑完 */
  finished: boolean;
  /** 一天的三态，见 Phase */
  phase: Phase;
  /** 铺位 id，见 `data/sites.ts`（setup 阶段为空串） */
  site: string;
  /** 店名（setup 阶段为空串；开张时定下，之后写进档口招牌与月结单） */
  shopName: string;
  /**
   * 现在的店在哪个区（`data/nanning.ts` 的 DistrictId）。
   * 开罗原文 `help.txt`：「The energy and appetite of your current area will gradually
   * decrease, while they will increase in other areas.」—— 所以「在哪个区」是状态，
   * 不是常数：待久了这块池子会瘦，换区要付转让费。
   */
  district: string;
  /** 搬进当前区的月份（0-35），区能量按住了多久衰减 */
  districtSince: number;
  /**
   * 分店（S6）：在别的区县另开的店，见 `data/branches.ts`。
   * 每家有自己的区、档位、口碑（warmth）与累计碗数；日结在 `recordDay` 里跑，
   * 月租与店长工资在 `closeMonth` 里扣。
   */
  branches: BranchState[];
  /** 同条街：本局 8 家同行的名气与恩怨（M1，见 `data/rivals.ts`） */
  rivals: RivalState[];
  /** 已经接手下来的铺子（同行 id）：租金打折、那个区池子变大 */
  takenOver: string[];
  /** 街面（M2）：这条街上修好的公共设施 id（见 `data/streets.ts`） */
  streets: string[];
  /** 已经播过台词的街面（一次性，避免每帧刷屏） */
  streetSeen: string[];
  /** 家当（M3）：店里那些旧东西的 id（见 `data/gear.ts`） */
  gear: string[];
  /** 袋装老友粉的包装机（A7）：买了才有第二条收入线 */
  pack: boolean;
  /** 配料品质档（批次五）：plain / good / top —— 换来的是每碗料钱与卖相 */
  quality: string;
  /** 浇头熟练度（批 A′）：每份料做过的碗数。等级与出口见 `sim/topping-xp.ts` */
  ingredientXp: Record<string, number>;
  /** 街上的门路（批 B′）：id → 到期那天（打烊天数）；可选，老档缺省当没买过 */
  investments?: Record<string, number>;
  /** 杂货铺（批 B′）：id → 日戳 month*100+day；只当天有效 */
  goods?: Record<string, number>;
  /** 零售线（批次七）：渠道 / 每款定价 / 累计卖出件数 */
  retail: { channel: string; prices: Record<string, number>; sold: Record<string, number> };
  /** 手上的功夫（批次 6）：支 id → 练到第几级，0/1/2/3 */
  skills: Record<string, number>;
  /** 街坊报：最近几天的头版（A11，见 `sim/news.ts`） */
  news: NewsItem[];
  /**
   * 店的样子（A1，见 `data/style.ts`）：装过的门面 id。
   * 与家当的区别是**同一时间只有一套生效** —— `style` 才是现在摆着的那套。
   */
  styles: string[];
  /** 现在店里摆的门面 id；null 表示还是那间空铺 */
  style: string | null;
  /**
   * 碗（A4，见 `data/bowl.ts`）：买过的碗 id。
   * 与门面同一个规矩 —— 同一时间只有一只碗在用，`bowl` 才是现在那只。
   */
  bowls: string[];
  /** 现在用的碗 id；开局就是那只消毒不锈钢碗 */
  bowl: string;

  /**
   * 进货档（A5，见 `data/grades.ts`）：米与骨。
   *
   * 与碗/门面不同，这一层**不买、不攒**：换档随时可换，代价直接落进每碗料钱与分数。
   * 所以这里存的是「今天用哪一档」，不是「买过哪些档」。
   */
  rice: string;
  bone: string;
  /** 人情（M3b）：街坊给的面子点数（见 `data/favor.ts`） */
  favor: number;
  /** 一共攒过多少点人情（只增，面板显示用） */
  favorTotal: number;
  /** 最近一次「摆一桌请街坊」是哪天（month*100+day），-1 表示没摆过 */
  treatDay: number;
  /** 落场（M4）：正在打的那一局；进行中的局不落盘，刷新即作废（见 `sim/arena.ts`） */
  arena: ArenaRun | null;
  /** 最近一次落场是哪天（month*100+day），-1 表示没落过 */
  arenaDay: number;
  /** 那天已经落了几场（含花人情加练的） */
  arenaRuns: number;
  /**
   * 成就（B 批，见 `data/trophies.ts`）：已经拿到的 id。
   * 判定只读现成字段，发奖给人情为主；不给营收，避免污染成长曲线。
   */
  trophies: string[];
  /** 新拿到还没播报的成就 id：main.ts 一帧弹一条，弹完清空 */
  pendingTrophies: string[];
  /**
   * 具名赛事（C 批，见 `data/tourneys.ts`）：每场打过几次、最好名次。
   * key 是赛事 id，`best` 为 0 表示还没进过名次。
   */
  tourneys: Record<string, TourneyRecord>;
  /** 最近一次「随时可报」的街道办赛是哪天（month*100+day），-1 表示没打过 */
  tourneyDay: number;
  /** 最近一次报过「跟届次走」的赛事是哪一届（见 `sim/calendar.ts` 的 contestRoundOf） */
  tourneyRound: number;
  /** 设备等级（六阶 S4）：灶/粉篓/案台各 0–4，见 `data/equipment.ts` */
  equipment: Record<string, number>;
  /** 今日日结单，非空时时间停住、HUD 弹日结（对齐开罗打烊报数） */
  dayReport: DayRecord | null;
  /** 最近若干天的日结单，账本面板用；只留 120 天 */
  days: DayRecord[];
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
      packSold: 0,
  retailSold: 0,
      maxQueue: 0,
      districts: [START_DISTRICT],
      sideRevenue: 0,
      comboHits: 0,
      branchBowls: 0,
      arenaRuns: 0,
      arenaWins: 0,
      recipesSold: 0,
    },
    sides: {
      active: [...START_SIDES],
      sold: {},
      mealDeal: false,
      drinkTemp: "ice",
    },
    gradeLevel: 0,
    price: DEFAULT_PRICE,
    recipe: {
      soup: DEFAULT_RECIPE.soup.slice() as SoupParams,
      noodle: DEFAULT_RECIPE.noodle.slice() as NoodleParams,
      toppings: [],
    },
    // 菜单从一碗「老友粉」开始 —— 对齐开罗 Game Flow 1：
    // 先做出一碗能卖的，才谈得上有第二款。
    menu: [
      {
        id: 1,
        recipe: {
          soup: DEFAULT_RECIPE.soup.slice() as SoupParams,
          noodle: DEFAULT_RECIPE.noodle.slice() as NoodleParams,
          toppings: [],
        },
        noodle: START_NOODLE,
        main: START_MAIN,
        portion: DEFAULT_PORTION,
        price: DEFAULT_PRICE,
        on: true,
        sold: 0,
      },
    ],
    editing: 0,
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
  lostQueue: 0,
  lostPrice: 0,
  lostWait: 0,
      lastFrenzy: null,
      lastStreet: null,
      lastSides: null,
      lastFlavor: null,
      lastTier: null,
      sideToastAt: -9999,
      satSumToday: 0,
      satCountToday: 0,
      goodBowls: 0,
      lastFavor: null,
      favorToday: 0,
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
      expansion: 0,
    },
    regulars: {},
    collection: {
      toppings: [],
      customers: [],
      grades: [],
      provinces: [],
      likes: [],
      flavors: [],
    },
    months: [],
    years: [],
    contest: {
      results: [],
      lastMonth: -1,
      lastRound: -1,
      wins: 0,
    },
    frenzy: { gauge: 0, until: -1, restUntil: -1, count: 0 },
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
    phase: "setup",
    site: "",
    shopName: "",
    noodle: "flat",
    main: START_MAIN,
    portion: DEFAULT_PORTION,
    district: START_DISTRICT,
    districtSince: 0,
    branches: [],
    rivals: initRivals(),
    takenOver: [],
    streets: [],
    streetSeen: [],
    gear: [],
    pack: false,
    quality: DEFAULT_QUALITY,
    ingredientXp: {},
    investments: {},
    goods: {},
    skills: {},
    retail: defaultRetail(),
    news: [],
    styles: [],
    style: null,
    bowls: [],
    bowl: "steel",
    rice: "late",
    bone: "spine",
    favor: 0,
    favorTotal: 0,
    treatDay: -1,
    arena: null,
    arenaDay: -1,
    arenaRuns: 0,
    trophies: [],
    pendingTrophies: [],
    tourneys: {},
    tourneyDay: -1,
    tourneyRound: -1,
    equipment: {},
    dayReport: null,
    days: [],
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
  // 成就（B 批）：日结之后再判。放在换日之前 —— 换日会把今天的峰值与流水清掉；
  // 放在这里之后的唯一要求是别读 `flow.lostToday` 之类已被清零的字段（那些用 tally）。
  checkTrophies(state);

  state.day += 1;
  state.todayCustomers = 0;
  state.flow.minuteOfDay = 0;
  state.flow.customers = [];
  state.flow.serveCooldown = 0;
  state.flow.servedToday = 0;
  state.flow.lostToday = 0;
  state.flow.lostQueue = 0;
  state.flow.lostPrice = 0;
  state.flow.lostWait = 0;
  state.flow.revenueToday = 0;
  state.flow.satSumToday = 0;
  state.flow.satCountToday = 0;
  state.flow.goodBowls = 0;
  // 人情日上限只按「吃到底」算，跨天清零（见 data/favor.ts 的 dailyCapByBowls）
  state.flow.favorToday = 0;

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
 *
 * 打烊时先写 `dayReport`（日结单）再交给 `endDay` 换日，phase 留在 `closing`：
 * 时间不会自己接着走，等玩家点「明天继续」才回 `prep`。玩家侧入口是 `tickMinute()`。
 */
export function advanceMinute(state: GameState): void {
  if (state.finished) return;
  if (state.events.pending) return;
  // 菜单（P47）：一天里每款粉各有自己的价与分，客人进门时再挑；
  // 所以这里不再有「一个全局评分」，评分在顾客循环里按款算。
  tickCustomers(state);
  tickEvents(state);
  state.flow.minuteOfDay += 1;
  if (state.flow.minuteOfDay >= DAY_MINUTES) {
    // recordDay 会把 phase 置为 "closing" 并留下 dayReport；
    // 这里不能再写 prep，否则日结单永远等不到玩家确认（原本的 bug）
    recordDay(state, bestTaste(state));
    endDay(state);
  }
}

/**
 * 菜单里味道最好的那碗（日结单上「味道」那一格用）。
 * 没有在架款时退回当前编辑款 —— 打烊时总得有个数。
 */
function bestTaste(state: GameState): number {
  let best = -1;
  for (const item of state.menu) {
    if (!item.on) continue;
    const sc = scoreRecipe(item.recipe, item.price, item.noodle as NoodleId, {
      main: item.main,
      portion: item.portion,
      rice: state.rice,
      bone: state.bone,
      quality: state.quality,
    xp: state.ingredientXp,
    });
    if (sc.total > best) best = sc.total;
  }
  if (best >= 0) return best;
  return scoreRecipe(state.recipe, state.price, noodleKindOf(state), {
    main: state.main,
    portion: state.portion,
    rice: state.rice,
    bone: state.bone,
    quality: state.quality,
    xp: state.ingredientXp,
  }).total;
}

/** 打烊：把今天的数字钉成一张日结单（必须在 endDay 清账之前调） */
function recordDay(state: GameState, taste: number): void {
  // 分店先跑完自己那一天（进账、涨口碑、扣料钱与摊销），
  // 这样日结单与月报里都能看到分店那一行，而不是账外收入。
  const day = runBranchDay(state);
  const f = state.flow;
  const rec: DayRecord = {
    month: state.month,
    day: state.day,
    revenue: Math.round(f.revenueToday),
    served: f.servedToday,
    lost: f.lostToday,
    lostQueue: f.lostQueue,
    lostPrice: f.lostPrice,
    lostWait: f.lostWait,
    avgSat: f.satCountToday > 0 ? Math.round(f.satSumToday / f.satCountToday) : -1,
    price: state.price,
    taste: Math.round(taste),
    cash: Math.round(state.cash),
  };
  if (day.active) {
    rec.branchBowls = day.bowls;
    rec.branchNet = day.net;
  }
  state.dayReport = rec;
  // 街坊报：写完当天的账再写报，报上写的就是今天真发生过的事
  pushNews(state);
  /**
   * 袋装线（A7）：每天出的货在打烊这一刻卖掉。
   * 必须放在 `dayReport` 赋值之后 —— 还原度读的就是今天这碗粉的味道；
   * 也必须放在 `endDay` 之前 —— 那里的 `revenueToday` 会被清零。
   */
  const pk = settlePack(state);
  if (pk.sold > 0) {
    rec.packSold = pk.sold;
    rec.packNet = pk.net;
    rec.revenue = Math.round(rec.revenue + pk.net);
  }
  // 零售货架（批次七）：与袋装线并列，各算各的净额
  const rt = settleRetail(state);
  if (rt.units > 0) {
    rec.retailSold = rt.units;
    rec.retailNet = rt.net;
    rec.revenue = Math.round(rec.revenue + rt.net);
  }
  state.days.push(rec);
  if (state.days.length > 120) state.days.shift();
  /**
   * 阿婆的笔记本（批次八）：一天里走了多少人，是「座位与灶哪个先加」那一页的钥匙。
   * 只看客流够看的日子（卖出 + 走掉 >= 20），头几天一两个人不作数。
   */
  {
    const seen = rec.served + rec.lost;
    if (seen >= 20) noteTick(state, { lostRate: rec.lost / seen });
  }

  state.phase = "closing";
}

/**
 * 开门营业：只有 `prep` 能开。返回是否真的开了，
 * 这样 UI 可以据此决定要不要播音效/推进引导。
 */
export function openShop(state: GameState): boolean {
  if (state.finished) return false;
  if (state.phase !== "prep") return false;
  if (state.dayReport) return false;
  state.phase = "open";
  return true;
}

/** 玩家在日结单上点「明天继续」：清掉日结单，回到次日的准备阶段 */
export function ackDayReport(state: GameState): boolean {
  if (!state.dayReport) return false;
  state.dayReport = null;
  state.phase = "prep";
  return true;
}

/**
 * 玩家侧的时间入口：只有营业中、没有等处理的事件与日结单时才走一分钟。
 * 返回是否真的推进了，方便上层决定要不要刷 UI。
 */
export function tickMinute(state: GameState): boolean {
  if (state.finished) return false;
  // 落场（M4）进行中：钟停住。擂台上 60 秒是真实时间，店里不该同时跑营业分钟
  if (state.arena) return false;
  if (state.dayReport) return false;
  if (state.events.pending) return false;
  if (state.phase !== "open") return false;
  advanceMinute(state);
  return true;
}
