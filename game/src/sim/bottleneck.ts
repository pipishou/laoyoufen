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
 * 公式：
 *   灶   = 一天分钟数 / 一次出碗的间隔（模拟里那一锅的冷却，含并行槽）
 *   座位 = 座位数 × 一天分钟数 / 吃一碗的分钟
 *   来客 = 一天大概会进店多少人（区池子封顶）
 *   上限 = `state.capacity`（案台与扩建设的总闸）
 * 取最小 = 今天最多卖几碗。
 *
 * **批 AN′（P443/P444）：前三项原来是这么算错的**
 * - 座位写成 `座位 × 120 / (每碗分钟 + 6)`：出碗 2 分时 4 座算成 60 碗（`4×120/(2+6)`），
 *   正好与灶的 60 打平，`pack()` 平局又判给灶 —— 钩子于是在 54% 流失时说「加灶」。
 *   实测（6 天、后 3 天均值、3 种子、默认配平）：2 座 36.3 / 3 座 50.7 / 4 座 **64.0** /
 *   5 座 70.3 / 6 座 71.7 碗 —— 座位与「每碗几分钟」无关，卡的是**吃一碗占多久**。
 * - 灶沿用 `SERVE_MINUTES = 6` 当基准，可模拟里出碗冷却的基准是 `FLOW.serveMinutes = 1`
 *   （一次出一批 `serveParallel` 碗）。于是灶算成 60 碗，而实测 40 座时能卖 120.6 碗。
 * - 少了一项：**来的人就这么些**。座位加到 12 / 40 座，实测都停在 120–122 碗 ——
 *   卡的是来客天花板（`demandPerDay`）。
 */
import { DAY_MINUTES, SERVE_MINUTES, demandPerDay } from "./customer";
import { bowlMinutes, staffWithExtraCooks } from "./staff";
import { BOWL_EPSILON, FLOW } from "../data/balance";
import { stationCount, stationCountAfter, stationServeFactor, stageMinutes } from "./equipment";
import { BENCH_CAPACITY_STEP, STAGE_MINUTES, STATION_EQUIP, type EquipId, type StationId } from "../data/equipment";
import type { GameState } from "./state";
import { retailBowlLoad } from "./retail";
import { investCapacityBonus } from "./invest";
import { goodsCapacityBonus } from "./goods";

/**
 * 坐下来吃一碗要几分钟。
 * 一游戏分钟 ≈ 六现实分钟（见 `data/balance.ts` 的注释），所以 1 分钟 ≈ 6 分钟，
 * 正好是「坐下嗦一碗粉」的时间；再长就变成慢餐，座位周转会假性变紧。
 */
export // 吃一碗要几分钟：`data/customers.ts` 二十四种客人的 eatSpeed 均值 6.17
// （最慢 9、最快 3）。旧值写 1，模型于是算「2 座一天能接 80 碗」，
// 而实测只有 36 碗 —— 模型一直在说「灶最紧」，真正的瓶颈是座位（试玩 11-22）。
// 批 AN′：按默认配平下的实测座位曲线回代（6 天、后 3 天均值、3 种子）——
// 2 座 36.3 / 3 座 50.7 / 4 座 64.0 / 5 座 70.3 / 6 座 71.7，天花板约 72 碗（= 来客量）。
// 6.6 分最贴：2 座算 36.4、3 座 54.5、4 座起被来客天花板压住。旧值 6 会把 4 座算成 76 碗。
const EAT_MINUTES = 6.6;

/**
 * 座位的空转系数（批 AN′）。
 *
 * 座位不是流水线：人是一拨一拨来的，四个座位总有空着的时候。
 * 实测（默认配平、6 天后 3 天均值、3 种子）：2 座 36.3（理想 36.4，没有空转）、
 * 3 座 50.7（理想 54.5）、4 座 **64.0**（理想 72.7）—— 座位一多，空转就压不住了。
 * 取 0.9 折：4 座算 65.5（实测 64.0）、3 座 49.1（实测 50.7）。
 */
const SEAT_IDLE = 0.9;

export type TightOn = "stove" | "seats" | "cap" | "demand";

export interface Capacity {
  /** 一次出碗的间隔能翻多少碗（已含并行槽与员工技法，见 bowlMinutes） */
  stove: number;
  /** 座位翻台能接的碗数 */
  seats: number;
  /** 日上限总闸 */
  cap: number;
  /** 一天大概会进店多少人（来客天花板，批 AN′） */
  demand: number;
  /** 四者取最小：今天最多卖几碗 */
  total: number;
  /** 谁在卡 */
  tight: TightOn;
  /** 当前每碗几分钟（HUD 上那个「2.0 分/碗」） */
  serveNow: number;
}

function pack(
  stove: number,
  seats: number,
  cap: number,
  demand: number,
  serveNow: number,
  /**
   * 增益要用「三道闸」而不是四道：`demand` 是**天花板**，不是「这一件能抬高多少」。
   *
   * 4 座实测：今天卖 64 碗、添一张凳卖 70.3 碗 —— 增益是真的（+6.3），
   * 但来客天花板就 70.6；把天花板也算进增益，凳子会被算成 +0 碗，
   * 钩子于是又回到「添凳没用」的老路上（P70 白做）。
   * 所以：`total` / `tight` 用四道（诚实说「今天最多卖几碗」），
   * `capacityGain` 用三道（回答「买它能不能把那道闸抬高」）。
   */
  ceiling = true,
): Capacity {
  const gate = Math.min(stove, seats, cap);
  const total = ceiling ? Math.min(gate, demand) : gate;
  /**
   * 平局谁算「卡住」：**座位优先**。
   *
   * 平局原来是判给灶（`total === stove ? "stove"`），4 座上灶与座位都是 60，
   * 于是面板说「灶台出得慢」，钩子去劝人升级灶 —— 实测买灶一碗都不多（P444）。
   * 座位是**硬上限**（人得坐下才能吃），灶可以靠并行槽超卖一点，所以平局让座位说话。
   */
  const tight: TightOn =
    total === seats ? "seats" : total === demand ? "demand" : total === stove ? "stove" : "cap";
  return { stove, seats, cap, demand, total, tight, serveNow };
}

/** 当前产能画像 */
export function capacityOf(state: GameState): Capacity {
  // 面板上那句「2.0 分/碗」：一碗要等多久（含并行槽摊薄），给人看的口径
  const serveNow = bowlMinutes(state, SERVE_MINUTES, stationServeFactor(state));
  /**
   * 出碗能力：模拟里 `flow.serveBank` 每分钟加 1，攒够 `serveCooldown` 就出一批
   * `serveParallel` 碗 —— 基准是 `FLOW.serveMinutes`（=1），不是面板那个 6。
   * `bowlMinutes` 对基准是线性的，所以换成 1 就等于「一次出碗的间隔能翻几批」。
   */
  const batchMinutes = Math.max(0.2, bowlMinutes(state, FLOW.serveMinutes, stationServeFactor(state)));
  const stove = DAY_MINUTES / batchMinutes;
  // 座位只看「吃一碗占多久」：出碗再快，一个座位一天也只能翻 120/EAT 轮
  const seats = (state.venue.seats * DAY_MINUTES * SEAT_IDLE) / EAT_MINUTES;
  /**
   * 零售货架（批次七）：做货与卖碗抢同一份产能。
   *
   * 把「今天要做的件数」按 `RETAIL_LOAD_BOWL` 折成碗，直接从总闸里扣 ——
   * 于是「多开一条线」不是白拿钱，玩家每多定一档量，碗就少几碗。
   */
  const cap = Math.max(
    1,
    state.capacity +
      // 街上的门路（批 B′）：料商留货；杂货铺：多备一筐粉
      investCapacityBonus(state) +
      goodsCapacityBonus(state) -
      retailBowlLoad(state),
  );
  // 来客天花板（批 AN′）：座位加到 40 座也卖不过这个数
  const demand = Math.max(1, demandPerDay(state));
  return pack(stove, seats, cap, demand, serveNow);
}

/**
 * 再添 `extra` 个技能为 `cookSkill` 的掌勺的人，当天上限变成多少（批 AV′ 解 P469；批 AW′ 解 P472）。
 *
 * **为什么需要它**：界面那句「雇了也换不来更多的碗」原来是拿
 * `capacityOf().tight === "stove"` 反推的 ——「灶不是最紧那道」并不等于
 * 「补人不多卖」，中间那一档既可能差 0.3 碗也可能差 20 碗。而这句话是一句
 * **量化断言**，只有让模型自己算一遍才守得住（AGENTS.md 三、数值纪律：
 * 文案不许发明数字，也不许替模型下结论）。
 *
 * **批 AW′ 之前这里是虚的**：只按 `min(灶位, 人数)` 之比折一下，`cookSkill` 根本没进来 ——
 * 可补进来的这个人同时改两件事（并行槽 +1、煮技总和 +skill），界面却说「多一个人」，
 * 于是「技能 1 的人」与「技能 5 的人」算出同一个数，玩家凭什么多付一倍工钱？
 * 现在并行槽与出碗倍率都由 `staffWithExtraCooks` 按人头累加算出来，
 * `extra = 0` 时与 `capacityOf` 的灶项逐位相同（`crew.test.ts` 钉住这条等式）。
 *
 * 天花板仍是四道闸取最小：这一项回答的是「今天最多能卖几碗」，
 * 不是「这一件能不能把那道闸抬高」（后者看 `capacityGain`）。
 */
export function capacityWithCooks(state: GameState, extra: number, cookSkill = 0): Capacity {
  const now = capacityOf(state);
  const { parallel, multiplier } = staffWithExtraCooks(state, extra, cookSkill);
  const batchMinutes = Math.max(
    0.2,
    (FLOW.serveMinutes * multiplier * stationServeFactor(state)) / parallel,
  );
  const stove = DAY_MINUTES / batchMinutes;
  return pack(stove, now.seats, now.cap, now.demand, now.serveNow);
}

/**
 * 假设把某一件买下来，当天上限能抬高多少碗。
 * 只要其中一个环节没动，另外两个的增益就会被最小项吃掉 —— 这正是要算差值的原因。
 *
 * 批次二之后设备是**三段并行**（炒锅/汤锅/粉篓），所以先算「这一段升一档能把总分钟数降多少」，
 * 再折回日上限。哪一段最慢，升它的增益就最大 —— 与 `sim/equipment.ts` 的
 * `slowestStation()` 是同一条口径。
 */
export function capacityGain(state: GameState): {
  /** 炒锅升一档的增益（旧名保留：钩子与测试都读它） */
  stove: number;
  pot: number;
  basket: number;
  bench: number;
  seat: (n: number) => number;
  /**
   * 今天是不是「抬哪一件都卖不动」（批 AO′，解 P446）。
   *
   * 来客天花板压下来的时候，出碗与案台的增益全是 0（三道闸还富余，四道闸里
   * `demand` 最小）。面板若还写「哪一段最慢就添哪一段」，玩家会照买，买完一碗不多。
   * 这里只报一个事实，不产生数值；界面拿它换说法。
   */
  demandBlocked: boolean;
} {
  const now = capacityOf(state);
  /**
   * 两个基准（批 AN′）：
   * - `gateBase`：三道闸（灶 / 座位 / 总闸）—— 出碗与案台的增益看这个，回答「厨房这段还卡不卡」。
   * - `base`：四道闸（含来客天花板）—— 座位与扩建的增益看这个，回答「多卖得出几碗」。
   * 座位要含天花板：座位一到位、来的人就这么些，再添凳就是白花钱（8 座实测 72.3 碗，已到顶）。
   */
  const gateBase = pack(now.stove, now.seats, now.cap, now.demand, now.serveNow, false).total;
  const base = now.total;
  const m = stageMinutes(state);

  const totalAfter = (station: StationId): number => {
    const before = STAGE_MINUTES[station] / Math.max(1, stationCount(state, station));
    const after = STAGE_MINUTES[station] / Math.max(1, stationCountAfter(state, station));
    return m.total - before + after;
  };
  const gainOfStation = (station: StationId): number => {
    /**
     * 出碗间隔缩短 `ratio` 倍 → 灶的日上限同比例涨（`now.stove` 已是新口径的 120/batch）。
     * 别再把 `serveNow` 当分子：那是面板上「一碗要等几分钟」的口径，基准是 6（P443）。
     */
    const ratio = totalAfter(station) / Math.max(0.1, m.total);
    const stoveAfter = now.stove / Math.max(0.1, ratio);
    return pack(stoveAfter, now.seats, now.cap, now.demand, now.serveNow, false).total - gateBase;
  };

  const byEquip = (id: EquipId): number => {
    const station = (Object.keys(STATION_EQUIP) as StationId[]).find((s) => STATION_EQUIP[s] === id);
    return station ? gainOfStation(station) : 0;
  };

  // 炒锅升一档：出碗时间跟着降，座位翻台也快一点（客人不用干等）
  const stove = byEquip("stove");
  const pot = byEquip("pot");
  const basket = byEquip("strainer");

  // 案台升一档：抬总闸，但抬不过灶与座位 —— 总闸不紧时增益就是 0
  const others = Math.min(now.stove, now.seats);
  const bench = Math.max(0, Math.min(now.cap + BENCH_CAPACITY_STEP, others) - Math.min(now.cap, others));

  // 扩座 +n：座位产随 n 线性涨（打 0.9 的空转折），但被灶、总闸挡住，
  // 而且**含来客天花板** —— 8 座已到 72 碗，再添凳就是白花钱（批 AN′）
  const seat = (n: number): number =>
    pack(
      now.stove,
      ((state.venue.seats + n) * DAY_MINUTES * SEAT_IDLE) / EAT_MINUTES,
      now.cap,
      now.demand,
      now.serveNow,
      true,
    ).total - base;

  /**
   * 抬哪一件都卖不动：四道闸里 `demand` 最小，而三道闸（灶/座位/总闸）还富余。
   * 这不是「厨房不卡」，是「卡不在店里」—— 街上一天就进来这么多人。
   * 严格的 `gateBase > demand` 才置真：如果三道闸恰好等于来客量，抬闸还是能多卖。
   */
  // 半碗容差走的是全项目同一把拍子（`BOWL_EPSILON`，批 AW′ 解 P474）
  const demandBlocked = now.tight === "demand" && gateBase > now.demand + BOWL_EPSILON;

  return { stove, pot, basket, bench, seat, demandBlocked };}

/** 一句话说清谁在卡（打烊单与面板用） */
export function tightWords(state: GameState): string {
  const c = capacityOf(state);
  if (c.tight === "stove") return "灶台出得慢";
  if (c.tight === "seats") return "座位坐不下";
  // 批 AN′：座位、灶都够，卡的是街上就这么多人 —— 这时候劝人升级灶是骗钱
  if (c.tight === "demand") return "街上就这么多人";
  return "备料不够卖";
}

/**
 * 走掉的人各是为什么走的（试玩 11-21）。
 *
 * 三家照打烊单连买三档猛火灶（¥1,500 / ¥3,800 / ¥9,000），第 4 天流失还在 54–61%，
 * 卖出的碗数停在 31–38 —— 因为那家店当天根本没被「出碗慢」卡住：
 * 日上限 120 碗，实际只卖 37 碗。真正走人的理由写在 `flow.lost*` 里：
 * 队满（门口挤到 12 个就进不来了）、看价牌（钱包不够）、等不及（耐心耗尽）。
 *
 * 钩子必须看得见这三档，否则「产能已经过剩」的时候还在催你升级灶。
 */
export interface LossSplit {
  queue: number;
  price: number;
  wait: number;
  total: number;
  /** 哪一档最多；一个都没走时是 none */
  dominant: "queue" | "price" | "wait" | "none";
  /** 看价牌走的人占比（0–1） */
  priceShare: number;
  /** 这份数字是今天的还是昨天的 */
  live: boolean;
}

function splitOf(queue: number, price: number, wait: number, live: boolean): LossSplit {
  const total = queue + price + wait;
  const dominant =
    total === 0 ? "none" : price >= queue && price >= wait ? "price" : queue >= wait ? "queue" : "wait";
  return { queue, price, wait, total, dominant, priceShare: total > 0 ? price / total : 0, live };
}

/** 最近一份能用的「为什么走」的计数 */
export function lossSplitOf(state: GameState): LossSplit {
  const rep = state.dayReport;
  if (rep && typeof rep.lostQueue === "number") {
    return splitOf(rep.lostQueue, rep.lostPrice ?? 0, rep.lostWait ?? 0, true);
  }
  const f = state.flow;
  const live = splitOf(f.lostQueue ?? 0, f.lostPrice ?? 0, f.lostWait ?? 0, true);
  if (live.total >= 5) return live;
  const days = state.days ?? [];
  const last = days[days.length - 1];
  if (last && typeof last.lostQueue === "number") {
    return splitOf(last.lostQueue, last.lostPrice ?? 0, last.lostWait ?? 0, false);
  }
  return live;
}
