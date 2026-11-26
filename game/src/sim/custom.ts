import { CUSTOMS, MAX_CUSTOM_LEVEL, costFactorAt, customById, tasteFloorAt, type CustomDef, type CustomId } from "../data/custom";
import type { GameState } from "./state";

/**
 * 店底子（批 BA′）：可以买断的两类上限
 *
 * 三条纪律（与 `data/custom.ts` 的注释同一条，这里重写在出口边上）：
 *   1. 这一层只提供**两个数字**：`customCharmFloor`（卖相加成，加法）与
 *      `customCostFactor`（料钱乘数，乘法）。别的地方不许再算一遍。
 *   2. 两个数字都**只跟买到第几级有关**，不读段位、不读月份、不读忙闲。
 *   3. 0 级时恒等（`+0` / `×1`），所以老档与历史回归锁一分不动。
 *
 * 为什么不叫 `upgrades`：仓库里已经有一层 `buyUpgrade`（店面往上加一段，见 `sim/upgrade.ts`），
 * 名字撞上会让「买断上限」和「店大一级」混成一件事。开罗那张表叫 `custom`，
 * 本作沿用同一个词 —— 它是「店里的讲究」，不是「装了多少东西」。
 */

export interface CustomBuyResult {
  ok: boolean;
  line?: string;
  reason?: string;
}

export interface CustomView {
  def: CustomDef;
  level: number;
  max: number;
  /** 下一级要多少钱；满级是 Infinity */
  nextCost: number;
  /** 下一级买到的是什么 */
  nextName: string;
  /** 下一级为什么值这个钱 */
  nextWhy: string;
  maxed: boolean;
  affordable: boolean;
  /** 现在这个乘数是多少（`taste` 是加成，`cost` 是乘数） */
  now: number;
  /** 买满之后是多少（含买满之后就到这） */
  full: number;
  /** 有没有更便宜的同类没买（面板用它排一句话，不用算第二遍） */
  cheapest: boolean;
}

function customLevelOf(state: GameState, id: CustomId): number {
  const raw = state.custom?.[id] ?? 0;
  return Math.max(0, Math.min(MAX_CUSTOM_LEVEL, Math.floor(raw)));
}

export function customLevel(state: GameState, id: CustomId): number {
  return customLevelOf(state, id);
}

/** 下一级要多少钱；买满返回 Infinity */
export function customNextCost(state: GameState, id: CustomId): number {
  const def = customById(id);
  if (!def) return Infinity;
  const lv = customLevelOf(state, id);
  if (lv >= MAX_CUSTOM_LEVEL) return Infinity;
  return def.tiers[lv]?.costYuan ?? Infinity;
}

/**
 * 卖相加成（加法）：买到的级数决定它。
 *
 * 出口只有一个 —— `sim/score.ts` 的 `scoreRecipe` 里 `charm` 那一行：
 *   `charm = min(100, 30 + (charmBase - 30) * (1 + charmBoost + customCharmFloor))`
 * 为什么不直接改品质档的 `charmBoost`：那是「今天进哪档货」，是每天能换的选择；
 * 买断是永久的那一半。两者在同一个乘号里相加，但出处不同 —— 面板上也要分开说。
 */
export function customCharmFloor(state: GameState): number {
  return tasteFloorAt(customLevelOf(state, "taste"));
}

/**
 * 料钱乘数（乘法）：只乘配料那一段。
 *
 * 出口同样只有一个 —— `scoreRecipe` 里 `topCost * qq.costMult * customCostFactor`。
 * `settle()` 用的是 `scoreRecipe` 算出来的 `cost`，所以账上与面板上不会有两个数。
 */
export function customCostFactor(state: GameState): number {
  return costFactorAt(customLevelOf(state, "cost"));
}

function money(n: number): string {
  return `¥${n.toLocaleString("zh-CN")}`;
}

/**
 * 买下一级。
 *
 * 拒绝的三种情况都**不扣钱**：没有这一类、已经买满、钱不够。
 * 不做「今天只动一件」的裁定 —— 那是 `sim/align.ts` 对「今天该干什么」的排序，
 * 买断属于「钱多了往哪儿放」，玩家想买就该买得成（与家当同一条规矩）。
 */
export function buyCustom(state: GameState, id: string): CustomBuyResult {
  const def = customById(id);
  if (!def) return { ok: false, reason: "没有这一项" };
  const lv = customLevelOf(state, def.id);
  if (lv >= MAX_CUSTOM_LEVEL) return { ok: false, reason: "这一项已经买满了" };
  const cost = def.tiers[lv]?.costYuan ?? Infinity;
  if (!Number.isFinite(cost)) return { ok: false, reason: "这一项已经买满了" };
  if (state.cash < cost) return { ok: false, reason: `还差 ${money(Math.ceil(cost - state.cash))}` };

  state.cash -= cost;
  state.custom = { ...(state.custom ?? {}), [def.id]: lv + 1 };
  const tier = def.tiers[lv];
  return { ok: true, line: `${def.name}第 ${lv + 1} 级：${tier?.name ?? ""} —— 已置办` };
}

/**
 * 一句话说清「现在这一项值多少」。
 *
 * 卖相那一项要报**加了几个点**（玩家能对上公式里的括号）；
 * 料钱那一项要报**乘数**（玩家能对上每碗料钱）。两句话的句式不一样，不是笔误。
 */
export function customWords(state: GameState, id: CustomId): string {
  const lv = customLevelOf(state, id);
  if (id === "taste") {
    const pct = Math.round(tasteFloorAt(lv) * 100);
    if (lv === 0) return "卖相还是原来那一档";
    return `卖相加成 +${pct}%（五级合计 +50%）`;
  }
  const pct = Math.round((1 - costFactorAt(lv)) * 100);
  if (lv === 0) return "料钱照原价";
  return `配料料钱 −${pct}%（五级合计 −15%）`;
}

/**
 * 面板要的整张表。
 *
 * `cheapest` 只在一处用到：两类都没买满时，面板要能给「先买哪个」一个不啰嗦的提示。
 * 判据是「下一级更便宜」，不是「回本更快」—— 回本要按当前销量算，
 * 那是 `sim/today.ts` 的活，这里不重复算（P### 记着）。
 */
export function customViews(state: GameState): CustomView[] {
  const raw = CUSTOMS.map((def) => {
    const lv = customLevelOf(state, def.id);
    const nextCost = customNextCost(state, def.id);
    const maxed = !Number.isFinite(nextCost);
    const tier = maxed ? null : def.tiers[lv];
    return {
      def,
      level: lv,
      max: MAX_CUSTOM_LEVEL,
      nextCost,
      nextName: tier?.name ?? "",
      nextWhy: tier?.why ?? "",
      maxed,
      affordable: !maxed && state.cash >= nextCost,
      now: def.id === "taste" ? tasteFloorAt(lv) : costFactorAt(lv),
      full: def.id === "taste" ? tasteFloorAt(MAX_CUSTOM_LEVEL) : costFactorAt(MAX_CUSTOM_LEVEL),
      cheapest: false,
    };
  });
  const open = raw.filter((v) => !v.maxed);
  if (open.length > 1) {
    const min = Math.min(...open.map((v) => v.nextCost));
    for (const v of raw) if (!v.maxed && v.nextCost === min) v.cheapest = true;
  }
  return raw;
}

/** 两类加起来还差多少钱买满（打烊单与文档用，别再手抄价格） */
export function customLeftYuan(state: GameState): number {
  let sum = 0;
  for (const def of CUSTOMS) {
    for (let lv = customLevelOf(state, def.id); lv < MAX_CUSTOM_LEVEL; lv += 1) {
      sum += def.tiers[lv]?.costYuan ?? 0;
    }
  }
  return sum;
}
