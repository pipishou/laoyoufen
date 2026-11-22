import type { GameState } from "./state";
import { lossSplitOf } from "./bottleneck";
import { activeDishes } from "./menu";
import { districtAppetite } from "./district";
import { dishNameOfItem } from "./dish";

/**
 * 解读层（批 C′）：打烊单上多出的两行，加上一句「这一片吃腻了」。
 *
 * 与「说话层」的分工写在方案里，这里只重复一句要紧的：
 * **数字归本地，语声归 AI。** 所以下面每个函数都返回两份东西：
 * `text` 是本地句，带数字、带菜名，AI 挂了就一直是它；
 * `ask` 是给模型的名词，模型只补一句口气，不许念数字。
 */

export interface ExplainLine {
  /** 本地句（带数字，写在打烊单上） */
  text: string;
  /** 给模型的名词上下文 */
  ask: { key: string; context: Record<string, string> };
}

/**
 * 「今天这批人为什么走」。
 *
 * 主因三档：队满（门口挤）、看价牌（嫌贵）、等不及（耐心耗完）。
 * 一个都没走时返回 null —— **没有可说之处就不要开口**，同 `tierRemark`。
 */
export function lossWhyOf(state: GameState): ExplainLine | null {
  const split = lossSplitOf(state);
  if (split.dominant === "none" || split.total < 3) return null;
  const n = split[split.dominant];
  if (split.dominant === "queue") {
    return {
      text: `今天有 ${n} 位是门口站满了没进来 —— 灶和座总有一个先撑不住。`,
      ask: { key: "queue", context: { 事: "门口站满了，有人没进来", 缘故: "灶与座先撑不住" } },
    };
  }
  if (split.dominant === "price") {
    return {
      text: `今天有 ${n} 位是看价牌掉头的 —— 不是味道的问题。`,
      ask: { key: "price", context: { 事: "有人看了价牌就走了", 缘故: "价签挡在门口" } },
    };
  }
  return {
    text: `今天有 ${n} 位是等不及走的 —— 出碗慢过人的耐性。`,
    ask: { key: "wait", context: { 事: "有人没等到就走了", 缘故: "出碗慢过耐性" } },
  };
}

/**
 * 「菜单上的一句话」：说今天卖得最好的一款与一碗没动的那款。
 *
 * 数据来自日结差分（`DayRecord.menuSold`，解 R7）—— **不用累计数**，
 * 累计数只会说「老友粉一共卖了三千碗」，玩家从里面读不出今天该改什么。
 */
export function menuLineOf(state: GameState): ExplainLine | null {
  // 打烊那一刻 `dayReport` 才是「今天」，`days[]` 末条可能还是昨天
  const days = state.days ?? [];
  const last = days[days.length - 1];
  const sold = state.dayReport?.menuSold ?? last?.menuSold;
  if (!sold) return null;
  const dishes = activeDishes(state);
  if (dishes.length < 2) return null;
  let best: { label: string; n: number; index: number } | null = null;
  let zero: { label: string; index: number } | null = null;
  for (let i = 0; i < dishes.length; i += 1) {
    const item = dishes[i]!;
    const n = sold[String(item.id)] ?? 0;
    // 同名两款（同主料同粉型只差配方）会念成「老友粉走得最多，老友粉一碗没动」，
    // 那就退回「第 N 款」——名字一样的时候，位置才是唯一的区别。
    const label = dishNameOfItem(state, item);
    if (!best || n > best.n) best = { label, n, index: i };
    if (n === 0 && !zero) zero = { label, index: i };
  }
  if (!best || best.n === 0) return null;
  const bestAt: { label: string; n: number; index: number } = best;
  if (zero) {
    const zeroAt: { label: string; index: number } = zero as { label: string; index: number };
    const same = zeroAt.label === bestAt.label;
    const b = same ? `第 ${bestAt.index + 1} 款` : bestAt.label;
    const z = same ? `第 ${zeroAt.index + 1} 款` : zeroAt.label;
    return {
      text: `今天「${b}」走得最多，「${z}」一碗没动。`,
      ask: {
        key: `${b}>${z}`,
        context: { 走的: b, 冷的: z, 事: "一款卖得动，一款没人点" },
      },
    };
  }
  return {
    text: `今天「${bestAt.label}」走得最多，几款都有人点。`,
    ask: { key: `${bestAt.label}`, context: { 走的: bestAt.label, 事: "几款都有人点，一款最稳" } },
  };
}

/**
 * 「这一片吃腻了」—— appetite 的回声（解 P247：胃口原来一句台词都没有）。
 *
 * 一个季度只说一次：压到 0.9 以下才开口，而且同一个月只吐一次，
 * 免得每碗都在抱怨。说得出口的只有「最近点得少了」，**不报数字**。
 */
export function appetiteLineOf(state: GameState): ExplainLine | null {
  const ap = districtAppetite(state);
  if (ap >= 0.9) return null;
  if (state.flow.lastAppetiteMonth === state.month) return null;
  const heavy = ap < 0.8;
  return {
    text: heavy
      ? "这一片的人吃得有点腻了：还是来，点得少了，三两的换成一两。"
      : "这一片的人开始挑份量了：大碗不如从前好卖。",
    ask: {
      key: heavy ? "heavy" : "light",
      context: {
        事: heavy ? "街坊还来，但点得少了" : "街坊开始只点小碗",
        缘故: "同一条街吃久了",
      },
    },
  };
}

/** 记一次「说过了」，避免同一个月反复念（调用方在真正上屏之后调） */
export function markAppetiteSaid(state: GameState): void {
  state.flow.lastAppetiteMonth = state.month;
}
