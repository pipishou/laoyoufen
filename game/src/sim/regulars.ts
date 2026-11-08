import { ARCHETYPE_BY_ID, CUSTOMER_ARCHETYPES, type CustomerArchetype } from "../data/customers";
import { findTopping } from "../data/ingredients";
import { dayIndex } from "./calendar";
import { nextFloat } from "./rng";
import type { GameState, RegularRecord } from "./state";

/**
 * 常客门槛按开罗口径：「喂对味」累计出来的，不是来几次就自动熟。
 *
 * 实证（English.lproj__news.txt 第 11 期「Regular Customers」）：
 *   "If you feed customers a lot of their favorite type of ramen, they will become a regular."
 * 实证（English.lproj__help.txt「Game Flow 2」）：
 *   "Satisfied customers can become regulars."
 * 字段实证：data.Customer$$AddRegularCount / IsRegular / GetRegularRatio。
 *
 * 开罗的门槛不是固定值：data.Region.regularCountMax_ 是一张按区域递增的表
 * （region.txt 里同列数值 15 → 24 → 40，约 2.67 倍），Customer.GetRegularRatio()
 * 用 regularCount_ 比它。REA 没有区域系统，用「月份进度」代替区域推进：
 * 门槛从 3 次涨到 8 次（同为 2.67 倍）。映射是自定标定，倍率取自开罗表。
 */
const REGULAR_LIKE_HITS_BASE = 3;
const REGULAR_LIKE_HITS_TOP = 8;
/** 与 state.TOTAL_MONTHS 一致；放这里避免 state → customer → regulars 的循环导入 */
const TOTAL_MONTHS = 36;

/** 当前时段成为常客需要的「喂对味」次数（对应 Region.GetRegularCountMax） */
export function regularLikeHitsNeed(state: GameState): number {
  const p = Math.min(1, Math.max(0, state.month / (TOTAL_MONTHS - 1)));
  return Math.round(REGULAR_LIKE_HITS_BASE + (REGULAR_LIKE_HITS_TOP - REGULAR_LIKE_HITS_BASE) * p);
}

/**
 * 熟客回礼。
 *
 * 字段实证：data.Customer.gift_(int[][]) / giftGet_ / getGiftCount_ /
 * GetGiftIndex() / GetGiftRatio()；文本实证（help「Customers 2」）：
 *   "If you feed customers a lot of the kind of ramen they like,
 *    they may give you presents..."
 * 开罗送的是道具（customer.txt 每行末四组 gift 数据），REA 没有道具库存，
 * 折成现金红包；四份、每份间隔 2 次「喂对味」，金额自定标定。
 */
const REGULAR_GIFT_MONEY = [60, 100, 160, 240] as const;
const REGULAR_GIFT_STEP = 2;

/**
 * 结算时尝试领一份回礼。返回金额（0 = 没到点）。
 * 只在已转常客后、且 `likeHits` 跨过下一档时发放，最多四份。
 */
export function collectGift(state: GameState, archetypeId: string): number {
  const rec = state.regulars[archetypeId];
  if (!rec) return 0;
  const need = regularLikeHitsNeed(state);
  if (!isFavorite(rec, need)) return 0;
  const count = rec.giftCount;
  if (count >= REGULAR_GIFT_MONEY.length) return 0;
  if (rec.likeHits < need + (count + 1) * REGULAR_GIFT_STEP) return 0;
  rec.giftCount = count + 1;
  return REGULAR_GIFT_MONEY[count]!;
}

/**
 * 老客回访率。
 *
 * 开罗全表检索不到「常客概率」常数——它的链条是
 *   发现喜好 → 端上对味 → AddRegularCount 累计 → 成为常客 → 回访 / 到访拉面馆
 * 这里不再把回访率挂到「喜好发现率」上（那是自造的全局联动），
 * 只用一个扁平常数：成了常客就按同一概率回访。
 * 0.35 是自定标定值，不是开罗原值 [GUESS, LOW]。
 */
const REGULAR_RETURN_CHANCE = 0.35;
/** 老客最多隔几天回来一次 */
const REGULAR_COOLDOWN_DAYS = 2;

function recordOf(state: GameState, archetypeId: string): RegularRecord {
  const exists = state.regulars[archetypeId];
  if (exists) {
    // 旧档（SAVE_VERSION 5）没有 likeHits / giftCount，读进来归一化成 0，不判废
    if (typeof exists.likeHits !== "number" || !Number.isFinite(exists.likeHits)) exists.likeHits = 0;
    if (typeof exists.giftCount !== "number" || !Number.isFinite(exists.giftCount)) exists.giftCount = 0;
    return exists;
  }
  const fresh: RegularRecord = {
    visits: 0,
    satSum: 0,
    likeHits: 0,
    giftCount: 0,
    lastDay: -999,
    favTopping: "",
  };
  state.regulars[archetypeId] = fresh;
  return fresh;
}

/**
 * 结算时记一笔：来店次数、满意度、命中喜好的次数、最认的那口浇头。
 * `liked` = 这一碗是否命中该原型任一喜好维度（由 likeHitsOf 判定后传入）。
 */
export function recordVisit(
  state: GameState,
  archetypeId: string,
  satisfaction: number,
  toppings: readonly string[],
  liked: boolean,
): void {
  const rec = recordOf(state, archetypeId);
  rec.visits += 1;
  rec.satSum += satisfaction;
  if (liked) rec.likeHits += 1;
  rec.lastDay = dayIndex(state.month, state.day);

  let best = "";
  let bestCharm = -1;
  for (const id of toppings) {
    const t = findTopping(id);
    if (t && t.charm > bestCharm) {
      bestCharm = t.charm;
      best = id;
    }
  }
  if (best) rec.favTopping = best;
}

export function averageSatisfaction(rec: RegularRecord): number {
  return rec.visits === 0 ? 0 : rec.satSum / rec.visits;
}

/**
 * 是否已转常客：只看「喂对味」累计点数（对齐开罗 data.Customer.IsRegular 以 regularCount_ 判定）。
 * visits / satSum 仍保留，但只用于展示与回访权重，不参与判定。
 */
export function isFavorite(rec: RegularRecord, need = REGULAR_LIKE_HITS_BASE): boolean {
  return rec.likeHits >= need;
}

/** 当前老客回访率：成了常客就是同一个扁平常数，不随全局进度变化 */
export function regularReturnChance(): number {
  return REGULAR_RETURN_CHANCE;
}

/** 已经混成熟客的原型 id 列表 */
export function favoriteArchetypes(state: GameState): string[] {
  const need = regularLikeHitsNeed(state);
  return Object.keys(state.regulars).filter((id) => {
    const rec = state.regulars[id];
    return rec ? isFavorite(rec, need) : false;
  });
}

/**
 * 掷一次「老客回访」。只在有熟客时消耗 rng，保证没熟客的存档和老存档行为一致。
 * 返回原型 id 或 null。
 */
export function maybePickRegular(state: GameState): string | null {
  const favs = favoriteArchetypes(state);
  if (favs.length === 0) return null;
  if (nextFloat(state.rng) >= regularReturnChance()) return null;

  const today = dayIndex(state.month, state.day);
  const eligible = favs.filter((id) => {
    const rec = state.regulars[id];
    return rec ? today - rec.lastDay >= REGULAR_COOLDOWN_DAYS : false;
  });
  if (eligible.length === 0) return null;

  const weights = eligible.map((id) => {
    const rec = state.regulars[id];
    const avg = rec ? averageSatisfaction(rec) : 0;
    // 评价越高、原型热度越高，越容易回来
    const arch = ARCHETYPE_BY_ID.get(id);
    return Math.max(1, avg + (arch?.weight ?? 0));
  });
  const total = weights.reduce((a, b) => a + b, 0);
  let roll = nextFloat(state.rng) * total;
  for (let i = 0; i < eligible.length; i++) {
    roll -= weights[i] ?? 0;
    if (roll < 0) return eligible[i] ?? null;
  }
  return eligible[eligible.length - 1] ?? null;
}

/** 老客的耐心倍率 */
export function regularPatienceMultiplier(state: GameState, archetypeId: string): number {
  const rec = state.regulars[archetypeId];
  return rec && isFavorite(rec, regularLikeHitsNeed(state)) ? 1.6 : 1;
}

/** 老客的口味偏好会向「你上次给的浇头」靠，满足度小幅加成 */
export function regularSatisfactionBonus(state: GameState, archetypeId: string): number {
  const rec = state.regulars[archetypeId];
  if (!rec || !isFavorite(rec, regularLikeHitsNeed(state))) return 0;
  return Math.round(Math.min(10, averageSatisfaction(rec) * 0.08));
}

/** 图鉴用：24 个原型全部列出（HUD 按 collection.customers 判断灰/亮） */
export function allArchetypes(): readonly CustomerArchetype[] {
  return CUSTOMER_ARCHETYPES;
}
