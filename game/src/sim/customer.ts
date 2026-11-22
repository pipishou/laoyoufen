import {
  ARCHETYPE_BY_ID,
  CUSTOMER_ARCHETYPES,
  LIKE_DIMS_ORDER,
  LIKE_LABELS,
  likeValueLabel,
  type CustomerArchetype,
  type CustomerPrefs,
  type LikeDim,
} from "../data/customers";
import { FLOW, GAS_PER_BOWL_YUAN } from "../data/balance";
import { unlock } from "./collection";
import { collectGift, maybePickRegular, recordVisit, regularSatisfactionBonus } from "./regulars";
import { FAVOR_GAIN } from "../data/favor";
import { addFavor, addFavorFree, favorAttractMult } from "./favor";
import { nextFloat } from "./rng";
import { queueMaxOf } from "./unlocks";
import type { RecipeScore } from "./score";
import { costMultiplier, patienceMultiplier, serveMultiplier, serveParallel, surveyRate } from "./staff";
import { equipCostMultiplier, equipServeMultiplier } from "./equipment";
import { costFactorOfKind, seasonBonusOfKind, serveFactorOfKind } from "./noodles";
import { shopAttractMultiplier, shopCharmBonus, shopPatienceMultiplier } from "./shop";
import { demandCapOf, districtEnergy } from "./district";
import { streetAttractMult, streetGiftMult, streetPatienceMult } from "./streets";
import { tierRemark } from "./tier";
import { noteTick, rememberNoodle } from "./notebook";
import { stageMinutes } from "./equipment";
import { gearAttractMult, gearCostFactor, gearPatienceMult, gearSatBonus, gearServeFactor } from "./gear";
import { marketAttractMult, marketCostFactor, marketPatienceMult, marketWalletMult } from "./market";
import { priceWarMult } from "./price-war";
import { localCostFactor, localPatienceMult, localSideCostFactor } from "./local";
import { styleAttractMult, stylePatienceMult, styleSatBonus } from "./style";
import { flavorCostFactor, flavorHits, flavorPatienceMult, flavorSatBonus, flavorServeFactor } from "./flavor";
import { pairCostFactor, pairPatienceMult, pairSatBonus, pairServeFactor } from "./pairing";
import { bowlCostFactor, bowlPatienceMult, bowlSatBonus, bowlServeFactor } from "./bowl";
import { masterServeFactor } from "./master";
import { specialtySatBonus } from "./specialty";
import { rollTier, tierBudgetPct, tierPatiencePct, tierRepWeight, tierSatPenalty } from "./guest-tier";
import { tierById } from "../data/guest-tier";
import { pickSides, recordSides } from "./sides";
import { absMinuteOf } from "./frenzy";
import { mainById, portionOf } from "../data/mains";
import {
  cheapestPrice,
  currentDish,
  dishPrice,
  menuBestTaste,
  menuStoreScore,
  pickDish,
  recordDishSale,
  scoreDish,
} from "./menu";
import { priceTolerance } from "./score";
import {
  FRENZY_MIN_SAT,
  frenzyAura,
  frenzyBudgetBoost,
  frenzyPoolBoost,
  frenzyServeBoost,
  frenzySpawnBoost,
  frenzyTick,
} from "./frenzy";
import type { GameState, QueueCustomer, Recipe } from "./state";

/**
 * 一天 120 个游戏分钟。默认时钟 1 游戏分钟 = 1 秒 → 2 分钟一天；
 * HUD 有 ×4 / ×8 / ×16 倍速，×8 下 15 秒一天、7.5 分钟一月。
 * 这是开罗式经营节奏的手感区间 [COMMON, MED]。
 */
export const DAY_MINUTES = 120;
/** 基础同时能坐几桌；扩建后看 state.venue.seats */
export const SEATS = 4;
/** 基础候餐区上限，对应 HUD 的 0/8 */
export const QUEUE_MAX = 8;
/** 一口灶、没有厨师时出一碗要几分钟。这是排队产生的真正瓶颈。 */
export const SERVE_MINUTES = 6;

/** 早餐 / 午市 / 下午 / 晚市，每段等分，基础进店概率（每分钟） */
const DAYPART_CHANCE = [0.18, 0.42, 0.1, 0.36] as const;

/**
 * 4 个风味热度的只读投影，避免 customer 反向依赖 data/events 的 TrendKey。
 * 结构溯源：开罗不是「食材热度条」，而是每个顾客原型自带 4 类风味的喜好度
 * （customer 表每行末 4 列：Student 25/25/0/0、Businessman 0/30/30/0，topics 说明共 4 种汤）。
 */
export interface TrendView {
  sourBamboo: number;
  douchi: number;
  porkOffal: number;
  broth: number;
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

/** 问出口味一维需要攒满的进度 */
export const SURVEY_TARGET = 100;

/**
 * 汤种 = 汤底 8 参里占优的那一维。
 *
 * 对应开罗 SoupRecipe.GetFeatureIndex / GetFeatureName：配方只存 param_[8]，
 * 「汤种」是派生值，不是独立字段；Customer.IsLikeSoup(int soup) 拿它做整数相等判定。
 * 平局取下标小的那一维（确定性）。
 */
export function soupFeatureIndex(soup: readonly number[]): number {
  let best = 0;
  for (let i = 1; i < soup.length; i++) {
    if ((soup[i] ?? 0) > (soup[best] ?? 0)) best = i;
  }
  return best;
}

/**
 * 开罗 data.Customer.IsLikeNoodles(int thick, int shape) / IsLikeSoup(int soup) 的对应物：
 * 三维逐项相等即命中，返回命中的维度。
 */
export function likeHitsOf(recipe: Recipe, prefs: CustomerPrefs): LikeDim[] {
  const hits: LikeDim[] = [];
  if (Math.round(recipe.noodle[5] ?? -1) === prefs.thick) hits.push("thick");
  if (Math.round(recipe.noodle[6] ?? -1) === prefs.shape) hits.push("shape");
  if (soupFeatureIndex(recipe.soup) === prefs.soup) hits.push("soup");
  return hits;
}

/**
 * 开罗 game.HumanCustomer.GetLikeRamenScore 的对应物：顾客给这碗粉的喜好分（0-100）。
 * 开罗是三维整数相等，所以分数只有 0/33/67/100 四档——不另造连续曲线。
 */
export function likeScoreOf(recipe: Recipe, prefs: CustomerPrefs): number {
  return prefMatch(recipe, prefs);
}

/**
 * 把「近期被炒热的味道」折算成客群构成偏移，对应开罗的 LikeFound 机制：
 * 原型偏好的汤种被炒热，权重涨得越多，其他原型相对被稀释。
 * 热潮全 0 时所有原型乘同一个 0.75，相对权重不变——开局零侵入。
 * 汤种 → 热潮键的映射：0 酸笋 / 1 豆豉 / 2 猪杂 / 4 鲜（老友汤）；其余四维无对应热潮。
 */
const SOUP_TREND: Partial<Record<number, keyof TrendView>> = {
  0: "sourBamboo",
  1: "douchi",
  2: "porkOffal",
  4: "broth",
};

export function trendAffinity(c: CustomerArchetype, t: TrendView): number {
  const key = SOUP_TREND[c.prefs.soup];
  const v = key ? t[key] : 0;
  return 0.75 + (v / 100) * 0.5;
}

/**
 * 试玩二轮 F9：谁来吃，得跟时段对得上。
 * 原来 `part` 只用来定「几分钟来一个人」——早市与宵夜来的是同一批随机原型，
 * 于是天没亮的街边摊也能等到网红主播，晚上十点还会来早班环卫。
 *
 * 这张表只调权重，不改 `weight` 的本义（谁本来就是常客），也不碰任何人物的预算与耐心：
 * 0 早市 / 1 上午 / 2 午后 / 3 晚市。表里没写的人 = 1.0（不分时段）。
 */
/** 开关：见上面那段实测说明，等分时段定价落地再打开 */
const DAYPART_BIAS_ENABLED = false;

const DAYPART_BIAS: Record<number, Record<string, number>> = {
  0: { office: 1.3, worker: 1.3, taxi: 1.2, rider: 1.1, sanitation: 1.1, student: 0.8, nightowl: 0.5, ktv: 0.5 },
  1: { office: 1.25, auntie: 1.25, parent: 1.2, teacher: 1.15, boss: 1.1, nightowl: 0.6, ktv: 0.6 },
  2: { student: 1.4, college: 1.35, grandma: 1.2, fitness: 1.1, office: 0.9, ktv: 0.7 },
  3: { nightowl: 1.5, ktv: 1.4, couple: 1.2, streamer: 1.15, worker: 1.1, vendor: 1.1, sanitation: 0.7, parent: 0.8 },
};

/** 按权重挑一个原型。只用传入的 rng，保证确定性。 */
function pickArchetype(roll: number, trend: TrendView, part: number): CustomerArchetype {
  const bias = DAYPART_BIAS_ENABLED ? (DAYPART_BIAS[part] ?? {}) : {};
  const wOf = (c: CustomerArchetype): number => c.weight * trendAffinity(c, trend) * (bias[c.id] ?? 1);
  let total = 0;
  for (const c of CUSTOMER_ARCHETYPES) total += wOf(c);
  let acc = 0;
  const target = roll * total;
  for (const c of CUSTOMER_ARCHETYPES) {
    acc += wOf(c);
    if (target <= acc) return c;
  }
  return CUSTOMER_ARCHETYPES[CUSTOMER_ARCHETYPES.length - 1] as CustomerArchetype;
}

/**
 * 人气倍率。
 *
 * 开罗用 StoreInfo.popularValue_ / AddStoreParamPopular / effectPopular_ 让「人气」持续成长，
 * 客流随人气走高，不是一个 0-5 的硬顶；REA 原来的 reputation 封顶 5，
 * 导致日客流永远卡在 ~32 人，加灶加人都不增营收。
 * 这里用累计接待量做人气代理（1 → 5 倍），不新增存档字段。
 * 公式是自定标定，不是开罗原值 [INFERRED, MED]。
 */
function popularityMultiplier(state: GameState): number {
  return 1 + Math.min(4, state.totalCustomers / 600);
}

/**
 * 味道能撑起的价格倍率（开罗 Rarity 的位置）。
 * 实现已移到 `sim/score.ts`（菜单要按款判「这人买不买得起」，两边共用一个公式），
 * 这里 re-export 保持 HUD 等旧 import 不改。
 */
export { priceTolerance };

/** 口碑越高、门店综合分越高、摆件越多、人气越旺，进店越密 */
function spawnChance(state: GameState): number {
  const part = Math.min(3, Math.floor(state.flow.minuteOfDay / (DAY_MINUTES / 4)));
  const base = DAYPART_CHANCE[part] ?? 0.1;
  const repFactor = 0.35 + (state.reputation / 5) * 0.65;
  // 开罗 `Shop Stats`：人气是**菜单里所有款聚合**的。我们取最好的那款，再按款数给一点奖励。
  const scoreFactor = 0.4 + (menuStoreScore(state) + shopCharmBonus(state)) / 160;
  /**
   * 味道直通来访率（开罗 Charisma I–IV「顾客来访率 +X%」）。
   * 之前味道只能经 满意度→口碑 这条慢通道影响客流，做得好与做得一般拉不开差距；
   * 系数 0.7/1.0/1.3 对应 味道 0/50/100 倍率 [INFERRED, MED]，靠 winnable.probe 校准。
   */
  const tasteFactor = 0.7 + (menuBestTaste(state) / 100) * 0.6;
  return (
    base *
    repFactor *
    scoreFactor *
    tasteFactor *
    shopAttractMultiplier(state) *
    // 街面（M2）：路灯/广告牌/公告栏，以及只在某一段生效的斑马线、球场、棋牌室
    streetAttractMult(state) *
    // 家当（M3）：排风扇把香味吹到街上
    gearAttractMult(state) *
    // 店的样子（A1）：门头好不好看，路过的人愿不愿意进来
    styleAttractMult(state) *
    // 人情（M3b）：今天摆了桌请街坊
    favorAttractMult(state) *
    popularityMultiplier(state) *
    // 区能量（开罗 Sales Areas 2：本区吃腻、别区长肉）
    districtEnergy(state) *
    // 热卖（开罗 Ramen Frenzy 2：一旦热卖，很多人会来）
    frenzySpawnBoost(state) *
    // 南宁行情（批次三）：下雨、赶圩、开学，都在这一天
    marketAttractMult(state) *
    // 比价（批次 4.5）：同行的便宜粉摆在那里，你的价牌贵一点人就少一点
    priceWarMult(state) *
    FLOW.spawnScale *
    // 开局分流（P67）：前七天别把产能压垮
    spawnScaleByDay(state)
  );
}

/**
 * 开局客流分档（P67 / 账本行 50 的方案 A）。
 *
 * 现实里巷口新开的小店，头几天是「街坊来试一口」，不是「半条街的人都来」。
 * 我们原来的配平是首日到店 146 人、产能约 70 碗 —— **一半客人从门口走掉**，
 * 玩家的第一课变成「我做不好」。试玩报告里两个真人都是这么停的。
 *
 * 只压进店频率，不动产能、耐心、钱包：修的是配平，不是难度。
 *
 * **分档是量出来的，不是拍的**（`src/sim/start.probe.ts` + `probe:standin` 对照）：
 * - 「前 3 天 ×0.55」：首日漂亮，但替身种子 1 的月均从 ¥78,485 掉到 **¥62,385**、
 *   热卖从 138 次掉到 **12 次** —— 开局少的那点现金流掐断了热卖正反馈，36 个月都追不回来。
 * - 「只压首日 ×0.55、第 2–7 天 ×0.85」：首日流失 24%（判据 ≤40%），
 *   替身 ¥69,992 / 热卖 151 次 / 成长 ×3.03 / T3 8 月，**没有退化**。
 *
 * 结论：**只压第 1 天**。玩家第一次开门是「街坊来试」，第 2 天街坊会带人来 ——
 * 那天开始该让他练习「接不住」这件事，正是买矮凳、扩门面的动力。
 */
export function spawnScaleByDay(state: GameState): number {
  if (state.month !== 0) return 1;
  if (state.day <= 1) return 0.55;
  if (state.day <= 7) return 0.85;
  return 1;
}

/**
 * 一分钟里最多来几个人（开罗把「来访率」做成连续量，我们每分钟结算一次，需要上限）。
 * 4 是安全阀：再高就不是嗦粉店，是早高峰地铁站。
 */
const MAX_ARRIVALS_PER_MINUTE = 4;

/**
 * 一位客人到店：掷「来不来」的骰子在调用方已经掷完，这里只负责
 * 「队满就走 / 看价牌就走 / 坐下等」。
 *
 * 抽出来的原因：来客从「每分钟一次伯努利」改成「每分钟一批」时，这段要能被循环调用。
 */
function arriveOne(state: GameState): void {
  const flow = state.flow;
  /**
   * 抽签前置（批次十二 · P171）：**先掷骰子，再判队满**。
   *
   * 原来是「队满 → 直接 return」，于是被挡在门外的那位客人**不消耗随机数**；
   * 任何让客流变动一点点的改动（行情 ±2%、段位、家当）都会改变「谁被挡住」，
   * 从而整条 rng 流错位，热卖点火/熄火、36 个月全变 —— 四种子营收差 30%，
   * 我们以为在调经济，其实在掷骰子。
   *
   * 现在「来一个人」固定消耗 4 个随机数（常客判定 + 原型 + 档位 + 挑款），
   * 无论他最后是坐下、看价牌走，还是被队满挡住 —— 随机流与经营结果解耦。
   */
  const regularId = maybePickRegular(state);
  const archRoll = nextFloat(state.rng);
  const tierRoll = nextFloat(state.rng);
  const dishRoll = nextFloat(state.rng);

  const waiting = flow.customers.reduce((n, c) => n + (c.status === "waiting" ? 1 : 0), 0);
  if (waiting >= queueMaxOf(state)) {
    flow.lostToday += 1;
    flow.lostQueue += 1;
    state.monthLost += 1;
    return;
  }
  const arch = regularId
    ? ARCHETYPE_BY_ID.get(regularId)
    : pickArchetype(
        archRoll,
        state.trend,
        Math.min(3, Math.floor(state.flow.minuteOfDay / (DAY_MINUTES / 4))),
      );
  if (!arch) return;
  /**
   * 顾客等级（A8）：钱包、耐心、口碑权重、挑剔扣分四个出口。
   * 常客直接给「街坊」—— 老客不是抽中的，是他自己回来的。
   */
  const tier = rollTier(state, tierRoll, regularId !== null);
  /**
   * 到售卖机前挑券（开罗 `Staff 3`：After a customer buys a ticket…）。
   *
   * 多款同时上菜单（P47）之后，「吃不吃得起」不再是一句话，而是**按款判**：
   * 每一款各按自己的味道算品质溢价，客人挑一款买得起的、味道好一点的。
   * 一款都买不起 = 掉头走（开罗 `Customers 1`：超出钱包的产品更难卖）。
   *
   * 热卖期间的来客「stats 更高」（开罗 Frenzy 2），钱包也跟着抬一档。
   */
  const wallet = arch.budget * frenzyBudgetBoost(state) * tierBudgetPct(tier) * marketWalletMult(state);
  const dish = pickDish(state, wallet, dishRoll);
  if (!dish) {
    flow.lostToday += 1;
    flow.lostPrice += 1;
    state.monthLost += 1;
    const cheap = cheapestPrice(state);
    flow.lastLostReason = `${arch.name}看价牌走了（最便宜 ¥${cheap} 超预算 ¥${Math.round(wallet)}）`;
    return;
  }
  const regular = regularId !== null;
  const patienceScale =
    patienceMultiplier(state) *
    shopPatienceMultiplier(state) *
    streetPatienceMult(state) *
    gearPatienceMult(state) *
    // 店的样子（A1）：有地方坐、有风扇吹，等一会儿不算事
    stylePatienceMult(state) *
    // 味道层（B1）：砂锅那类「烫着吃」的组合让客人愿意多等一会儿
    flavorPatienceMult(dish.recipe.toppings, dish.noodle) *
    // 配料组合（A2）与碗（A4）：瓦煲端上来还在冒泡，多等一会儿不恼
    pairPatienceMult(dish.recipe.toppings) *
    bowlPatienceMult(state) *
    (regular ? 1.6 : 1) *
    tierPatiencePct(tier) *
    // 南宁行情（批次三）：台风天人心急，寒潮里人愿意等砂锅
    marketPatienceMult(state) *
    // 物产（批次九）：横州的花茶，坐下来的人不催
    localPatienceMult(state) *
    FLOW.patienceScale;
  flow.customers.push({
    id: flow.nextId++,
    archetypeId: arch.id,
    dishId: dish.id,
    status: "waiting",
    elapsed: 0,
    waited: 0,
    patience: Math.round((arch.lineLimit + 1) * 6 * patienceScale),
    satisfaction: -1,
    regular,
    survey: 0,
    tier: tier.id,
  });
}

/** 三维偏好（粉宽/粉型/汤种）与配方的贴合度 0-100：命中一维 1/3 */
export function prefMatch(recipe: Recipe, prefs: CustomerPrefs): number {
  return (likeHitsOf(recipe, prefs).length / LIKE_DIMS_ORDER.length) * 100;
}

/**
 * 满意度 0-100。四项加权，等待超时直接扣。
 * 这个数决定口碑涨跌——**不是**营收，营收只看有没有坐下吃完。
 */
export function satisfactionOf(
  score: RecipeScore,
  arch: CustomerArchetype,
  recipe: Recipe,
  price: number,
  waitedMinutes: number,
  lineLimit: number,
  bonus = 0,
): number {
  const taste = score.total * 0.45;
  const pref = prefMatch(recipe, arch.prefs) * 0.3;
  /**
   * 品质溢价（开罗 Rarity I–IV「拉面售价 +X%」）：
   * 味道 55 以下无溢价，味道 100 时容忍价 +25%。
   * 这样「把粉做好」才换得回涨价空间，而不是只有扩座一条路。
   */
  const affordable = arch.budget * priceTolerance(score.total);
  const priceFit = clamp(100 - Math.max(0, price - affordable) * 25, 0, 100) * 0.25;
  const waitPenalty = Math.max(0, waitedMinutes - lineLimit * 4) * 4;
  return clamp(taste + pref + priceFit + bonus - waitPenalty, 0, 100);
}

/**
 * 问口味：顾客在店里（等位或进食）时，跑堂按服务技能攒问询进度；
 * 攒满一格就揭示该原型下一维未知偏好。
 *
 * 对应开罗 data.Customer.AddLikeFound(int)->bool（只有第一次问出来才弹提示）
 * 与 GetLikeFoundRatio / likeFound_ 字段。速率来源见 staff.ts 的 surveyRate。
 */
function surveyTick(state: GameState, c: QueueCustomer): void {
  const arch = ARCHETYPE_BY_ID.get(c.archetypeId);
  if (!arch) return;
  const nextDim = LIKE_DIMS_ORDER.find((d) => !state.collection.likes.includes(`${arch.id}:${d}`));
  if (!nextDim) return;
  c.survey += surveyRate(state);
  if (c.survey < SURVEY_TARGET) return;
  c.survey = 0;
  if (unlock(state, "likes", `${arch.id}:${nextDim}`)) {
    state.flow.lastLikeFound = `${arch.name}好这口${LIKE_LABELS[nextDim]}：${likeValueLabel(arch.prefs, nextDim)}`;
  }
}

/** 吃完结算：付款 + 口碑漂移 + 常客档案 + 图鉴解锁 */
function settle(state: GameState, c: QueueCustomer): void {
  const arch = ARCHETYPE_BY_ID.get(c.archetypeId);
  const regularBonus = c.regular ? regularSatisfactionBonus(state, c.archetypeId) : 0;
  /**
   * 他点的是哪一款（P47）：客人在售卖机上挑的那张券。
   * 款可能在他等待期间被下架/删掉 —— 那就按当前编辑款结账，别让这人白吃。
   */
  const item = state.menu.find((d) => d.id === c.dishId) ?? currentDish(state);
  const sc = scoreDish(item);
  /**
   * 阿婆的笔记本（批次八）：一碗出锅就是一次观察 —— 这一碗什么粉、配料哪几样、
   * 汤够不够、出锅要几分钟，都是玩家亲手做出来的事，够解锁哪条就记哪条。
   */
  rememberNoodle(state, item.noodle);
  noteTick(state, {
    noodle: item.noodle,
    noodlesTried: state.flow.noodleTried?.length ?? 0,
    soup: sc.soup,
    toppings: item.recipe.toppings,
    serveMinutes: stageMinutes(state).total,
  });

  // 主料与份量（P46）：牛肉比碎肉香，三两比二两管饱 —— 现在按**这一款**算
  const mainDef = mainById(item.main);
  const portionDef = portionOf(item.portion);
  const menuBonus = (mainDef?.satBonus ?? 0) + portionDef.satBonus;
  let sat = arch
    ? satisfactionOf(
        sc,
        arch,
        item.recipe,
        item.price,
        c.waited,
        arch.lineLimit,
        // 热卖时店员起 aura（开罗 Frenzy 2），吃到的人更满意；
        // 当季粉型（夏天干捞、冬天砂锅）+3，反季 −3（P42），按款的粉型算
        regularBonus +
      frenzyAura(state) +
      seasonBonusOfKind(state, item.noodle) +
      menuBonus +
      gearSatBonus(state) +
      // 店的样子（A1）：坐得舒不舒服，直接算进这一碗的满意
      styleSatBonus(state) +
      // 专精（A9）：跑堂学过「记性」，这一碗少一点磕碰
      specialtySatBonus(state) +
      // 味道层（B1）：这一款凑成了哪几条成型吃法，当场加分
      flavorSatBonus(item.recipe.toppings, item.noodle) +
      // 配料组合（A2）：两件套的顺手加成，与上面两层各算各的
      pairSatBonus(item.recipe.toppings) +
      // 碗（A4）：端出来的是钢碗还是瓦煲，客人心里有数
      bowlSatBonus(state),
      )
    : 50;

  /** 这碗的实收价 = 该款菜单价 + 份量加成（三两 +¥2，见 data/mains.ts） */
  const bowlPrice = dishPrice(item);

  /**
   * 客单价结构（P41）：客人吃完这碗，还愿意再加一件吗？
   * 加购受钱包上限约束（开罗 Customers 1「Products that exceed a customer's wallet
   * are harder for them to buy」），所以 room = 钱包 − 这款的菜单价。
   *
   * 这里刻意**不扣份量加价**（P46）：点三两的人本来就饿，还会再加一份腐竹；
   * 把 +¥2 从 room 里扣掉，等于「多要一两粉就买不起加料了」，替身实测加购从 5.6% 掉到 0.7%。
   */
  const wallet = arch ? arch.budget * priceTolerance(sc.total) * marketWalletMult(state) : bowlPrice;
  const sidePick = arch ? pickSides(state, arch, sat, wallet - item.price) : { items: [], paid: 0, cost: 0, combo: null, satBonus: 0 };
  if (sidePick.items.length > 0) {
    sat = clamp(sat + sidePick.satBonus, 0, 100);
    recordSides(state, sidePick);
    // 凑出组合才吭声，而且一个半小时只吭一次 —— 组合现在要三件才凑得出，但仍可能连着来
    if (sidePick.combo) {
      const nowMin = absMinuteOf(state);
      if (nowMin - state.flow.sideToastAt >= 90) {
        state.flow.sideToastAt = nowMin;
        state.flow.lastSides = `${sidePick.combo}！${sidePick.items.map((d) => d.name).join(" + ")}（+¥${sidePick.paid}）`;
      }
    }
  }

  const paid = bowlPrice + sidePick.paid;
  // 粉型影响一碗的成本：伊面贵、干捞省粉（按款的粉型）
  const cost =
    sc.cost *
      costMultiplier(state) *
      equipCostMultiplier(state) *
      costFactorOfKind(item.noodle) *
      gearCostFactor(state) *
      // 配料组合（A2）：标配那几样反而省钱
      pairCostFactor(item.recipe.toppings) *
      // 碗（A4）：大盆装得多也费料，打包碗有盒子钱
      bowlCostFactor(state) *
      // 南宁行情（批次三）：回南天受潮、猪肉起价，都落在料钱上
      marketCostFactor(state) *
      // 物产（批次九）：马山的八角，香料这一项省两个点
      localCostFactor(state) *
      flavorCostFactor(item.recipe.toppings, item.noodle) +
    sidePick.cost * localSideCostFactor(state) +
    // 燃气与水（批次十二后半）：按碗算，不按天算 —— 灶一直点着，煮一碗与煮七十碗不是一个量级的火
    GAS_PER_BOWL_YUAN;
  state.cash += paid - cost;
  state.monthRevenue += paid;
  state.flow.revenueToday += paid;
  state.todayCustomers += 1;
  state.totalCustomers += 1;
  state.monthServed += 1;
  state.flow.servedToday += 1;
  state.tally.bowls += 1; // K1 成就计数：累计出碗（只增不减）
  recordDishSale(state, item.id); // 这一款卖出去一碗
  /**
   * 味道层（B1）：第一次凑成某条成型吃法 —— 记进图鉴，并留一句播报。
   * 数值全在本地算（sim/flavor.ts），AI 只负责补那一句话，拿不到就退回本地句。
   */
  for (const def of flavorHits(item.recipe.toppings, item.noodle)) {
    if (unlock(state, "flavors", def.id)) state.flow.lastFlavor = def.id;
  }
  // 人情（M3b）：一碗吃到底才给。开罗 Customer Fullness 的原话是「吃满给 Spirit Point，
  // 份量越大越容易吃满」，所以三两必给 2 点、其余满意过线才给 1 点。
  const finished = item.portion >= 3 || sat >= FAVOR_GAIN.finishSat;
  if (finished) {
    addFavor(
      state,
      item.portion >= 3 ? FAVOR_GAIN.finishBigBowl : FAVOR_GAIN.finishBowl,
      `${arch?.name ?? "客人"}把碗吃干净了`,
    );
  }
  state.flow.lastSatisfaction = Math.round(sat);
  state.monthSatSum += sat;
  state.monthSatCount += 1;
  state.flow.satSumToday += sat;
  // 热卖槽按「这一分钟满意的碗」计分（I-07）
  if (sat >= FRENZY_MIN_SAT) state.flow.goodBowls = (state.flow.goodBowls ?? 0) + 1;
  state.flow.satCountToday += 1;

  // 评价逐碗微调。原来还额外「sat < 35 就 −0.05」，逐碗结算时那是一台绞肉机：
  // 街边摊开局 2 座、客流 160/日，一上午就掉到 0.0，而且再没有回升的斜率（I-17）。
  // 下限留 0.5：名不见经传，但不是「已经被街坊拉黑」。
  // 顾客等级（A8）：识食的吃到不满意的会当场减分（只减满意度，口碑那一层由权重管）
  const tierDef = tierById(c.tier);
  const tierPenalty = tierSatPenalty(tierDef, sc.total);
  if (tierPenalty > 0) {
    sat = Math.max(0, sat - tierPenalty);
    state.flow.lastTier = tierDef.id;
  }
  // 口碑权重：识食的一句抵一句半，路过的只算七成
  state.reputation = clamp(state.reputation + ((sat - 55) / 800) * tierRepWeight(tierDef), 0.5, 5);
  noteTick(state, { reputation: state.reputation });

  /**
   * 四维评价（批次一）：只有极端档位客人才会特意开口。
   * 限一天两次 —— 一家粉店一天里能记住的「有人夸/有人嫌」就那么几回，
   * 每碗都说会变成弹幕，玩家反而听不见。
   */
  const remark = tierRemark(item, sc);
  if (remark) {
    if (state.flow.tierVoiceDay !== state.day) {
      state.flow.tierVoiceDay = state.day;
      state.flow.tierVoiceCount = 0;
    }
    if ((state.flow.tierVoiceCount ?? 0) < 2) {
      state.flow.tierVoiceCount = (state.flow.tierVoiceCount ?? 0) + 1;
      state.flow.lastTierVoice = `${remark.dim}:${remark.tier}`;
    }
  }

  const likeHits = arch ? likeHitsOf(item.recipe, arch.prefs) : [];
  // 命中喜好 → 记进常客档案（开罗 AddRegularCount）；「问出口味」在顾客还在店里时由 surveyTick 完成
  recordVisit(state, c.archetypeId, sat, item.recipe.toppings, likeHits.length > 0);
  // 熟客回礼（开罗 gift_ / GetGiftRatio）：喂对味累计到档位才给，不进货架、不冲营业额
  // 街面（M2）充电桩：骑手愿意多停一会，回礼更常来（乘数只放大金额，不改触发频率）
  const gift = Math.round(collectGift(state, c.archetypeId) * streetGiftMult(state));
  if (gift > 0) {
    state.cash += gift;
    state.flow.lastGift = `${arch?.name ?? "熟客"}回礼：+${gift} 元`;
    // 熟客回礼顺带攒一点人情（开罗 Customers 2：喂对味会有回礼）
    addFavorFree(state, FAVOR_GAIN.gift);
  }
  unlock(state, "customers", c.archetypeId);
  unlock(state, "grades", sc.grade);
  for (const id of item.recipe.toppings) unlock(state, "toppings", id);
}

/**
 * 推进一个游戏分钟：进店 → 等位 → 坐下吃 → 吃完结算。
 * 满座时排队；排到 QUEUE_MAX 之后不再放人进店（直接算流失）。
 */
export function tickCustomers(state: GameState): void {
  const flow = state.flow;
  if (state.todayCustomers >= state.capacity) return;
  // 区客流池：这个区一天就这么多人，座位再多也喂不出更多碗（开罗 Sales Areas）。
  // 今天到过店的人数 = 已服务 + 还在店里（吃/等）。
  // 热卖期间池子上浮（开罗 Frenzy 2「很多人会来」）—— 否则翻倍的来客全被池子吃掉，等于没发生。
  const poolCap = Math.round(demandCapOf(state) * frenzyPoolBoost(state));
  if (state.todayCustomers + flow.customers.length >= poolCap) return;

  const waiting = flow.customers.reduce((n, c) => n + (c.status === "waiting" ? 1 : 0), 0);
  if (waiting > state.tally.maxQueue) state.tally.maxQueue = waiting; // K1 成就：排队峰值
  // 开罗 Popularity 影响「来访率」：来客是**每分钟一批**，不是一个个来。
  // 旧实现每分钟最多 1 人 → 一天上限 120 人，这个天花板比座位/灶位/人手都硬（P35）：
  // 8 座满编实测也只有 63 碗/日，扩建与雇人全被这道天花板吃掉。
  const expected = spawnChance(state);
  let arrivals = Math.floor(expected);
  if (nextFloat(state.rng) < expected - arrivals) arrivals += 1;
  for (let i = 0; i < Math.min(arrivals, MAX_ARRIVALS_PER_MINUTE); i++) {
    // 区池子到顶就停（开罗 Sales Areas：本区就这么多人；热卖时池子上浮）
    if (state.todayCustomers + flow.customers.length >= poolCap) break;
    arriveOne(state);
  }

  // 1. 推进已入座的人；吃完的结算离场
  const staying: QueueCustomer[] = [];
  let eatingNow = 0;
  for (const c of flow.customers) {
    if (c.status === "eating") {
      c.elapsed += 1;
      surveyTick(state, c);
      const arch = ARCHETYPE_BY_ID.get(c.archetypeId);
      if (arch && c.elapsed >= Math.max(1, Math.round(arch.eatSpeed * FLOW.eatScale))) {
        settle(state, c);
        continue;
      }
      eatingNow += 1;
    }
    staying.push(c);
  }
  flow.customers = staying;

  // 2. 灶台空闲且有空位时，队首入座
  //    先减冷却再判：否则 1 分钟的灶也会变成「每 2 分钟一碗」，
  //    实测差 2 倍（57.7 vs 119 碗/日的上限）。
  if (flow.serveCooldown > 0) flow.serveCooldown = Math.max(0, flow.serveCooldown - 1);
  if (flow.serveCooldown <= 0) {
    // 开罗 Staff 2：一锅同时煮 N 份、一趟同时端 N 碗 —— 冷却到点一次出一批。
    // 旧版这里只出一碗，于是 8 座满编实测也只有 63 碗/日，座位与灶位形同装饰（P35）。
    let slots = Math.max(1, Math.floor(serveParallel(state) * frenzyServeBoost(state)));
    let servedAny = false;
    // 这一批客人点的是不同款的粉（P47）：出碗时间取批内平均 ——
    // 一锅同时下粉，锅里的进度看最慢那碗，但批次里大多数是普通款，用均值最稳。
    let serveFactorSum = 0;
    let serveFactorCount = 0;
    while (slots > 0) {
      const freeSeats = state.venue.seats - eatingNow;
      if (freeSeats <= 0) break;
      const next = flow.customers.find((c) => c.status === "waiting");
      if (!next) break;
      const dish = state.menu.find((d) => d.id === next.dishId);
      serveFactorSum += serveFactorOfKind(dish?.noodle ?? state.noodle);
      serveFactorCount += 1;
      next.status = "eating";
      next.elapsed = 0;
      eatingNow += 1;
      slots -= 1;
      servedAny = true;
    }
    // 空转（没人排队）就不进冷却，否则下一分钟来的客人要多等一轮
    if (servedAny) {
      const noodleFactor = serveFactorCount > 0 ? serveFactorSum / serveFactorCount : 1;
      // 出碗是全店一锅，味道层按「当前在编辑的这一款」算（与 portionOf 同口径）
      const curDish = currentDish(state);
      flow.serveCooldown =
        FLOW.serveMinutes *
        serveMultiplier(state) *
        equipServeMultiplier(state) *
        noodleFactor *
        // 三两的锅更满，一锅少下几碗（P46）
        portionOf(state.portion).serveFactor *
        // 家当（M3）巷口洗碗池：碗当场冲，不用堆到收摊
        gearServeFactor(state) *
        // 配料组合（A2）：好熟的那几样起锅快
        pairServeFactor(curDish.recipe.toppings) *
        // 碗（A4）：钢碗不用洗，瓦煲要现煮
        bowlServeFactor(state) *
        // 出碗定死（A6）：师傅教过「数三十下就起」的那一款最快
        masterServeFactor(curDish) *
        flavorServeFactor(curDish.recipe.toppings, curDish.noodle);
    }
  }

  // 3. 等不及的走人
  flow.customers = flow.customers.filter((c) => {
    if (c.status !== "waiting") return true;
    c.waited += 1;
    surveyTick(state, c);
    if (c.waited > c.patience) {
      flow.lostToday += 1;
      flow.lostWait += 1;
      state.monthLost += 1;
      return false;
    }
    return true;
  });

  // 4. 热卖槽：门口还在排队 + 这一分钟有人吃得满意 → 槽涨，按满意的碗数算。
  //    这一句必须放在最后：此时的 waiting 与今日满意度才是「这一分钟的真实盘面」。
  const waitingNow = flow.customers.reduce((n, c) => n + (c.status === "waiting" ? 1 : 0), 0);
  const goodBowls = flow.goodBowls ?? 0;
  flow.goodBowls = 0;
  const tick = frenzyTick(state, waitingNow, goodBowls);
  if (tick.triggered) {
    state.monthRevenue += 0; // 热卖本身不进账，账由卖出的碗产生
    flow.lastFrenzy = `热卖！门口排起长队，今天后面 30 分钟人多一倍（第 ${state.frenzy.count} 次）`;
  }
}
