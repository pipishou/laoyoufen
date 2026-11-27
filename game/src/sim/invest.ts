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
 * 状态用**当天经过的天数**（`state.days.length`）记到期日，跨月不用算月份长度；
 * 两条字段都是可选的，老档缺省当作「没买过」，所以不升存档版本。
 *
 * ── 批 BC′（解 GAP 四轮 D 条）：从「同类互斥」改成「投资位」 ──
 *
 * 原来卡的是**同一类只能挂一条**（`make` 一条、`voice` 一条），于是能挂几条是
 * 「有几个类」推出来的 —— 批 BB′ 加了第三类 `hedge` 之后这个数悄悄从 2 变成 3，
 * 玩家完全看不出来，而且它从第 1 天到第 900 天都是同一个宽度。
 *
 * 开罗 `rank.txt` 第 16 行 `More Investments`「Invest in more things at once.」涨的
 * 是**同时能投几条**，不是每条多强。所以这里改成：
 *
 *   - 能同时挂几条 = `investSlots(state)`（2 位起，第 5 段 3 位、第 8 段 4 位，
 *     走的是手艺树里 `invest3` / `invest4` 两条解锁，不另开一套 XP）；
 *   - 不再按类互斥 —— 类只剩「这条买的是哪一路量」的说明作用；
 *   - 位子满了，按钮写「先撤一条」，**点下去一分钱都不扣**；
 *   - 撤掉不退款：付过的是这几天已经在走的服务，退钱就是刷钱漏洞。
 */

import {
  INVESTS,
  INVEST_BY_ID,
  investsOfClass,
  type InvestClass,
  type InvestDef,
} from "../data/invest";
import { marketById } from "../data/market";
import type { MarketId } from "../data/market";
import { isUnlocked } from "./unlocks";
import type { GameState } from "./state";

/** 一位都没评到时的门路位（批 BC′：这个数是**底板**，不是全部） */
export const INVEST_BASE_SLOTS = 2;

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

/** 现在挂着的门路（上限由 `investSlots` 决定） */
export function activeInvests(state: GameState): InvestDef[] {
  return INVESTS.filter((def) => investToday(state, def.id));
}

/**
 * 现在能同时挂几条门路（批 BC′）。
 *
 * 底板 2 位；第 5 段的手艺 `invest3` 加一位、第 8 段的 `invest4` 再加一位。
 * 读的是手艺树（`sim/unlocks.ts` 的 `isUnlocked`），不另开一套成长 —— 「升一段
 * 多一件能做的事」这条已经有两批在用了，门路位只是其中一件。
 */
export function investSlots(state: GameState): number {
  let n = INVEST_BASE_SLOTS;
  if (isUnlocked(state, "invest3")) n += 1;
  if (isUnlocked(state, "invest4")) n += 1;
  return n;
}

/** 还剩几位（挂满就是 0） */
export function investSlotsLeft(state: GameState): number {
  return Math.max(0, investSlots(state) - activeInvests(state).length);
}

/** 抬头那句「3 / 4 位」：面板要能一眼读出这个数，别让它藏在说明里 */
export function investSlotsWords(state: GameState): string {
  return `${activeInvests(state).length} / ${investSlots(state)} 位`;
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
 * 每条门路的可用性。
 *
 * 三支理由都要说人话，否则玩家会以为按钮坏了：
 * - 已经在走 → 说还剩几天；
 * - 位子满了 → **「先撤一条」**，并且要报出是哪一条挡着（不然他得上下一行行找）；
 * - 钱不够 → 说还差多少。
 */
export function investViews(state: GameState): InvestView[] {
  const live = activeInvests(state);
  const full = live.length >= investSlots(state);
  return INVESTS.map((def) => {
    const active = investToday(state, def.id);
    const leftDays = Math.max(0, investUntil(state, def.id) - dayIndexOf(state)) + (active ? 1 : 0);
    let reason = "";
    if (active) reason = `已经在走了（还剩 ${leftDays} 天）`;
    else if (full) reason = live[0] ? `先撤一条（现在「${live[0].name}」占着）` : "先撤一条";
    else if (Math.round(state.cash) < def.costYuan) reason = `还差 ¥${def.costYuan - Math.round(state.cash)}`;
    return { def, active, leftDays, affordable: reason === "", reason };
  });
}

export interface BuyResult {
  ok: boolean;
  line: string;
  reason: string;
}

/**
 * 买一条门路：扣钱、记到期日。
 *
 * 批 BC′ 之后判的是**位子**，不再判「同类有没有别的在走」。
 * 位子满了就拒绝，并且**一分钱都不扣**（判在 `state.cash` 之前，所以不会出现
 * 「钱扣了但没买上」这种最招人骂的顺序）。
 */
export function buyInvest(state: GameState, id: string): BuyResult {
  const def = INVEST_BY_ID.get(id);
  if (!def) return { ok: false, line: "", reason: "没有这条门路" };
  if (investToday(state, def.id)) {
    return { ok: false, line: "", reason: "这一条已经在走了" };
  }
  const live = activeInvests(state);
  if (live.length >= investSlots(state)) {
    const first = live[0];
    return {
      ok: false,
      line: "",
      reason: first ? `先撤一条（现在「${first.name}」占着）` : "先撤一条",
    };
  }
  if (Math.round(state.cash) < def.costYuan) {
    return { ok: false, line: "", reason: `还差 ¥${def.costYuan - Math.round(state.cash)}` };
  }
  state.cash = Math.round((state.cash - def.costYuan) * 100) / 100;
  const until = dayIndexOf(state) + def.days;
  state.investments = { ...(state.investments ?? {}), [def.id]: until };
  return { ok: true, line: def.line, reason: "" };
}

/**
 * 撤一条正在走的门路（批 BC′）。
 *
 * **不退款**：买的是「这几天它会做的那件事」，撤掉只是提前收手，钱已经花出去了。
 * 退款会立刻变成刷钱漏洞（买 → 撤 → 白拿几天效果还回血），所以这里连
 * 「按剩几天折算」都不做。
 *
 * 撤完那位子立刻空出来，同一天就能换一条 —— 这才是「先撤一条」这句话的意思。
 */
export function cancelInvest(state: GameState, id: string): BuyResult {
  const def = INVEST_BY_ID.get(id);
  if (!def) return { ok: false, line: "", reason: "没有这条门路" };
  if (!investToday(state, def.id)) {
    return { ok: false, line: "", reason: "这一条本来就没在走" };
  }
  const next = { ...(state.investments ?? {}) };
  delete next[def.id];
  state.investments = next;
  return { ok: true, line: `撤了「${def.name}」，位子空出来了（这钱不退）`, reason: "" };
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
  if (def.hedgeOf) return `「${marketById(def.hedgeOf)?.name ?? def.hedgeOf}」不上门`;
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
  if (def.hedgeOf) bits.push(`「${marketById(def.hedgeOf)?.name ?? def.hedgeOf}」抽不到`);
  return bits.join(" · ");
}

/**
 * 这几天被买断的那几条行情（批 BB′）。
 *
 * 只做「剔出抽签池」这一件事，不改任何倍率 —— `sim/market.ts` 在抽之前读它。
 * 放在这里而不是新建一个模块，是因为它要读 `state.investments`，而 `sim/market.ts`
 * 读它、`sim/invest.ts` 不读 `sim/market.ts`，这样没有环。
 *
 * `extraDays` 是「问的是今天往后第几天」：明天预告要按明天还剩几天算，
 * 否则一条今天到期的报备会把明天的检查也预告掉。
 */
export function hedgedMarketIds(state: GameState, extraDays = 0): Set<MarketId> {
  const base = dayIndexOf(state) + Math.max(0, Math.floor(extraDays));
  const out = new Set<MarketId>();
  for (const def of INVESTS) {
    if (!def.hedgeOf) continue;
    if (investUntil(state, def.id) > base) out.add(def.hedgeOf);
  }
  return out;
}

/** 抬头：「今天没走门路」/「今天：跟料商多留一筐」 */
export function investSummary(state: GameState): string {
  const live = activeInvests(state);
  if (live.length === 0) return `今天还没走门路 · ${investSlotsWords(state)}`;
  return `今天：${live.map((d) => d.name).join("、")} · ${investSlotsWords(state)}`;
}
