/**
 * 街上的门路（批 B′）—— 花一次钱，买一天（或三天）的量。
 *
 * 三条投资各自只落一个**已有出口**：
 *
 * - `supplier`（料商留货）→ 当天产能 +20 碗，进 `capacityOf` 的总闸；
 * - `master`（老师傅）→ 当天**最慢那一段**的分钟数 −0.5，进 `stageMinutes`；
 *   只治瓶颈，是因为三段里只有最慢那段真的卡人（P164 / P242）。
 * - `press`（美食号）→ 三天进店率 +30%，进 `spawnChance`。
 *
 * 同类互斥：`make`（多做出几碗）与 `voice`（多进来几个人）各自只能挂一条。
 * 状态用**当天经过的天数**（`state.days.length`）记到期日，跨月不用算月份长度；
 * 两条字段都是可选的，老档缺省当作「没买过」，所以不升存档版本。
 */

import {
  INVESTS,
  INVEST_BY_ID,
  investsOfClass,
  type InvestClass,
  type InvestDef,
} from "../data/invest";
import type { GameState } from "./state";

/** 今天到第几天（打烊天数；当天还没记进去） */
export function dayIndexOf(state: GameState): number {
  return state.days.length;
}

/** 这条门路买到第几天为止（0 = 从没买过） */
export function investUntil(state: GameState, id: string): number {
  return Math.max(0, Math.round(state.investments?.[id] ?? 0));
}

/** 这一条今天还算不算数 */
export function investToday(state: GameState, id: string): boolean {
  return investUntil(state, id) > dayIndexOf(state);
}

/** 这一类里现在挂着的那一条（没有就 null） */
export function activeInvestOf(state: GameState, cls: InvestClass): InvestDef | null {
  for (const def of investsOfClass(cls)) {
    if (investToday(state, def.id)) return def;
  }
  return null;
}

/** 现在挂着的门路（最多两条：一条 make、一条 voice） */
export function activeInvests(state: GameState): InvestDef[] {
  return INVESTS.filter((def) => investToday(state, def.id));
}

export interface InvestView {
  def: InvestDef;
  active: boolean;
  /** 还剩几天（含今天） */
  leftDays: number;
  affordable: boolean;
  /** 买不了的原因；能买就是空串 */
  reason: string;
}

/**
 * 三条门路的可用性。
 * 「同类还挂着别条」不是买不起，是**要先等它过去** —— 理由写清楚，
 * 否则玩家会以为按钮坏了（面板一直红着）。
 */
export function investViews(state: GameState): InvestView[] {
  return INVESTS.map((def) => {
    const active = investToday(state, def.id);
    const leftDays = Math.max(0, investUntil(state, def.id) - dayIndexOf(state)) + (active ? 1 : 0);
    const other = investsOfClass(def.cls).find(
      (d) => d.id !== def.id && investToday(state, d.id),
    );
    let reason = "";
    if (active) reason = `已经在走了（还剩 ${leftDays} 天）`;
    else if (other) reason = `先等「${other.name}」过去`;
    else if (Math.round(state.cash) < def.costYuan) reason = `还差 ¥${def.costYuan - Math.round(state.cash)}`;
    return { def, active, leftDays, affordable: reason === "", reason };
  });
}

export interface BuyResult {
  ok: boolean;
  line: string;
  reason: string;
}

/** 买一条门路：扣钱、记到期日；同类互斥在 `investViews` 与这里各判一次 */
export function buyInvest(state: GameState, id: string): BuyResult {
  const def = INVEST_BY_ID.get(id);
  if (!def) return { ok: false, line: "", reason: "没有这条门路" };
  if (investToday(state, def.id)) {
    return { ok: false, line: "", reason: "这一条已经在走了" };
  }
  const other = investsOfClass(def.cls).find((d) => investToday(state, d.id));
  if (other) return { ok: false, line: "", reason: `先等「${other.name}」过去` };
  if (Math.round(state.cash) < def.costYuan) {
    return { ok: false, line: "", reason: `还差 ¥${def.costYuan - Math.round(state.cash)}` };
  }
  state.cash = Math.round((state.cash - def.costYuan) * 100) / 100;
  const until = dayIndexOf(state) + def.days;
  state.investments = { ...(state.investments ?? {}), [def.id]: until };
  return { ok: true, line: def.line, reason: "" };
}

/** 当天产能 +N 碗（料商留货） */
/**
 * 今天是用它的最后一天（解 P303：跨零点失效没有任何提示）。
 *
 * `investUntil` 存的是「到期那天」，`investToday` 是 `> dayIndexOf`，
 * 所以它的最后一天是 `dayIndexOf + 1 === until`。打烊时正好说一句「走完了」，
 * 玩家第二天早上看到门路没了，不会以为界面出错。
 */
export function investDoneToday(state: GameState): InvestDef[] {
  return investEndingToday(state).map((e) => e.def);
}

/** 一条门路「今天到底给了多少」（解 P347：只记名字说不出值不值） */
export function investGainOf(def: InvestDef): string {
  if (def.capacity) return `多做 ${def.capacity} 碗`;
  if (def.slowestMinutes) return `出碗快 ${def.slowestMinutes} 分`;
  if (def.attractPct) return `进店多 ${Math.round(def.attractPct * 100)}%`;
  return "";
}

export interface InvestEnd {
  def: InvestDef;
  /** 「多做 20 碗」这种人话，直接进打烊单 */
  gain: string;
}

/** 今天是用它的最后一天的那几条，带各自的效果量 */
export function investEndingToday(state: GameState): InvestEnd[] {
  const last = dayIndexOf(state) + 1;
  return INVESTS.filter((def) => state.investments?.[def.id] === last).map((def) => ({
    def,
    gain: investGainOf(def),
  }));
}

export function investCapacityBonus(state: GameState): number {
  return activeInvests(state).reduce((n, d) => n + (d.capacity ?? 0), 0);
}

/** 当天最慢那一段要减掉的分钟数（老师傅；返回正数） */
export function investSlowestDelta(state: GameState): number {
  return activeInvests(state).reduce((n, d) => n + (d.slowestMinutes ?? 0), 0);
}

/** 这几天的进店乘数（美食号） */
export function investAttractMult(state: GameState): number {
  const pct = activeInvests(state).reduce((n, d) => n + (d.attractPct ?? 0), 0);
  return 1 + pct;
}

/** 面板上的一行：「当天产能 +20 碗」这类 */
export function investWords(def: InvestDef): string {
  const bits: string[] = [];
  if (def.capacity) bits.push(`当天产能 +${def.capacity} 碗`);
  if (def.slowestMinutes) bits.push(`最慢那一段 −${def.slowestMinutes} 分`);
  if (def.attractPct) bits.push(`进店 +${Math.round(def.attractPct * 100)}%`);
  return bits.join(" · ");
}

/** 抬头：「今天没走门路」/「今天：跟料商多留一筐」 */
export function investSummary(state: GameState): string {
  const live = activeInvests(state);
  if (live.length === 0) return "今天还没走门路";
  return `今天：${live.map((d) => d.name).join("、")}`;
}
