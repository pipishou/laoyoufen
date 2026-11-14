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
import { FLOW } from "../data/balance";
import { unlock } from "./collection";
import { collectGift, maybePickRegular, recordVisit, regularSatisfactionBonus } from "./regulars";
import { nextFloat } from "./rng";
import type { RecipeScore } from "./score";
import { costMultiplier, patienceMultiplier, serveMultiplier, surveyRate } from "./staff";
import { shopAttractMultiplier, shopCharmBonus, shopPatienceMultiplier } from "./shop";
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

/** 按权重挑一个原型。只用传入的 rng，保证确定性。 */
function pickArchetype(roll: number, trend: TrendView): CustomerArchetype {
  let total = 0;
  for (const c of CUSTOMER_ARCHETYPES) total += c.weight * trendAffinity(c, trend);
  let acc = 0;
  const target = roll * total;
  for (const c of CUSTOMER_ARCHETYPES) {
    acc += c.weight * trendAffinity(c, trend);
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
 * 味道 55 及以下 = 1.0（街坊价），味道 100 = 1.25（敢卖贵 25%）。
 * 顾客进店前按这个乘自己的钱包判「吃不吃得起」，吃不起就掉头走 —— 
 * 所以涨价不是白捡的，得先把粉做好。 [INFERRED, MED]
 */
export function priceTolerance(total: number): number {
  return 1 + Math.max(0, total - 55) / 180;
}

/** 口碑越高、门店综合分越高、摆件越多、人气越旺，进店越密 */
function spawnChance(state: GameState, score: RecipeScore): number {
  const part = Math.min(3, Math.floor(state.flow.minuteOfDay / (DAY_MINUTES / 4)));
  const base = DAYPART_CHANCE[part] ?? 0.1;
  const repFactor = 0.35 + (state.reputation / 5) * 0.65;
  const scoreFactor = 0.4 + (score.storeScore + shopCharmBonus(state)) / 160;
  /**
   * 味道直通来访率（开罗 Charisma I–IV「顾客来访率 +X%」）。
   * 之前味道只能经 满意度→口碑 这条慢通道影响客流，做得好与做得一般拉不开差距；
   * 系数 0.7/1.0/1.3 对应 味道 0/50/100 倍率 [INFERRED, MED]，靠 winnable.probe 校准。
   */
  const tasteFactor = 0.7 + (score.total / 100) * 0.6;
  return (
    base *
    repFactor *
    scoreFactor *
    tasteFactor *
    shopAttractMultiplier(state) *
    popularityMultiplier(state) *
    FLOW.spawnScale
  );
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
function settle(state: GameState, score: RecipeScore, c: QueueCustomer): void {
  const arch = ARCHETYPE_BY_ID.get(c.archetypeId);
  const regularBonus = c.regular ? regularSatisfactionBonus(state, c.archetypeId) : 0;
  const sat = arch
    ? satisfactionOf(score, arch, state.recipe, state.price, c.waited, arch.lineLimit, regularBonus)
    : 50;

  const paid = state.price;
  const cost = score.cost * costMultiplier(state);
  state.cash += paid - cost;
  state.monthRevenue += paid;
  state.flow.revenueToday += paid;
  state.todayCustomers += 1;
  state.totalCustomers += 1;
  state.monthServed += 1;
  state.flow.servedToday += 1;
  state.tally.bowls += 1; // K1 成就计数：累计出碗（只增不减）
  state.flow.lastSatisfaction = Math.round(sat);
  state.monthSatSum += sat;
  state.monthSatCount += 1;
  state.flow.satSumToday += sat;
  state.flow.satCountToday += 1;

  state.reputation = clamp(state.reputation + (sat - 55) / 800, 0, 5);
  if (sat < 35) state.reputation = clamp(state.reputation - 0.05, 0, 5);

  const likeHits = arch ? likeHitsOf(state.recipe, arch.prefs) : [];
  // 命中喜好 → 记进常客档案（开罗 AddRegularCount）；「问出口味」在顾客还在店里时由 surveyTick 完成
  recordVisit(state, c.archetypeId, sat, state.recipe.toppings, likeHits.length > 0);
  // 熟客回礼（开罗 gift_ / GetGiftRatio）：喂对味累计到档位才给，不进货架、不冲营业额
  const gift = collectGift(state, c.archetypeId);
  if (gift > 0) {
    state.cash += gift;
    state.flow.lastGift = `${arch?.name ?? "熟客"}回礼：+${gift} 元`;
  }
  unlock(state, "customers", c.archetypeId);
  unlock(state, "grades", score.grade);
  for (const id of state.recipe.toppings) unlock(state, "toppings", id);
}

/**
 * 推进一个游戏分钟：进店 → 等位 → 坐下吃 → 吃完结算。
 * 满座时排队；排到 QUEUE_MAX 之后不再放人进店（直接算流失）。
 */
export function tickCustomers(state: GameState, score: RecipeScore): void {
  const flow = state.flow;
  if (state.todayCustomers >= state.capacity) return;

  const waiting = flow.customers.reduce((n, c) => n + (c.status === "waiting" ? 1 : 0), 0);
  if (waiting > state.tally.maxQueue) state.tally.maxQueue = waiting; // K1 成就：排队峰值
  // 先掷骰再判断队满：看到长队掉头走的人也算流失，不能静默吞掉
  if (nextFloat(state.rng) < spawnChance(state, score)) {
    if (waiting >= FLOW.queueMax) {
      flow.lostToday += 1;
      state.monthLost += 1;
    } else {
      const regularId = maybePickRegular(state);
      const arch = regularId
        ? ARCHETYPE_BY_ID.get(regularId)
        : pickArchetype(nextFloat(state.rng), state.trend);
      if (arch) {
        // 看价牌：吃不起就走（开罗「售价超过顾客预算 → 不来」）。
        // 溢价来自味道，所以涨价前必须先把粉做好，否则人全被价牌挡回去。
        const canPay = state.price <= arch.budget * priceTolerance(score.total);
        if (!canPay) {
          flow.lostToday += 1;
          state.monthLost += 1;
          flow.lastLostReason = `${arch.name}看价牌走了（¥${state.price} 超预算 ¥${arch.budget}）`;
        } else {
          const regular = regularId !== null;
          const patienceScale =
            patienceMultiplier(state) * shopPatienceMultiplier(state) * (regular ? 1.6 : 1) * FLOW.patienceScale;
          flow.customers.push({
            id: flow.nextId++,
            archetypeId: arch.id,
            status: "waiting",
            elapsed: 0,
            waited: 0,
            patience: Math.round((arch.lineLimit + 1) * 6 * patienceScale),
            satisfaction: -1,
            regular,
            survey: 0,
          });
        }
      }
    }
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
        settle(state, score, c);
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
    const freeSeats = state.venue.seats - eatingNow;
    const next = flow.customers.find((c) => c.status === "waiting");
    if (freeSeats > 0 && next) {
      next.status = "eating";
      next.elapsed = 0;
      flow.serveCooldown = FLOW.serveMinutes * serveMultiplier(state);
    }
  }

  // 3. 等不及的走人
  flow.customers = flow.customers.filter((c) => {
    if (c.status !== "waiting") return true;
    c.waited += 1;
    surveyTick(state, c);
    if (c.waited > c.patience) {
      flow.lostToday += 1;
      state.monthLost += 1;
      return false;
    }
    return true;
  });
}
