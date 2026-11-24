import { PACK_SETUP, PACK_SKUS, type PackSku, type PackSource } from "../data/pack";
import type { GameState } from "./state";

/**
 * 袋装老友粉（A7）的业务层。
 *
 * 三条纪律：
 *  1. 一次买断，不占餐位、不占人力 —— 它是「把店里的手艺变成货」，不是第二家店。
 *  2. 出货量跟口碑与段位走，天花板 40 袋/天（小铺子不是工厂）。
 *  3. 两头都要：**风味还原度**决定能卖多少（日报写的就是这个难点），
 *     还原度低就没人回购，所以「先把粉做好」永远是前提。
 */

export interface PackResult {
  ok: boolean;
  reason?: string;
}

export function packOwned(state: GameState): boolean {
  return !!state.pack;
}

export function buyPack(state: GameState): PackResult {
  if (state.pack) return { ok: false, reason: "包装机已经在转了" };
  if (state.cash < PACK_SETUP.costYuan) {
    return { ok: false, reason: `要 ¥${PACK_SETUP.costYuan.toLocaleString("zh-CN")}，钱不够` };
  }
  state.cash -= PACK_SETUP.costYuan;
  state.pack = true;
  return { ok: true };
}

/**
 * 风味还原度 0–1。
 *
 * 取昨天那碗粉的味道分（`dayReport.taste`，0–100）折算 ——
 * 「袋装能不能卖」这件事，最终还是吊在「店里的粉好不好吃」上。
 * 没营业记录时按最低档算，免得开门第一天就有一堆外地订单。
 */
export function packRate(state: GameState): number {
  const taste = state.dayReport ? state.dayReport.taste : 0;
  const t = Number.isFinite(taste) ? Math.max(0, Math.min(100, taste)) : 0;
  return PACK_SETUP.floorRate + (1 - PACK_SETUP.floorRate) * (t / 100);
}

/** 每天出多少袋（0 表示还没买包装机） */
export function packDailyOf(state: GameState): number {
  if (!state.pack) return 0;
  const rep = Math.max(0, state.reputation ?? 0);
  const raw =
    (PACK_SETUP.basePacks + rep * PACK_SETUP.perRep + (state.gradeLevel ?? 0) * PACK_SETUP.perGrade) * packRate(state);
  return Math.max(1, Math.min(PACK_SETUP.capPacks, Math.round(raw)));
}

/** 每天净收入（袋数 × 每袋毛利） */
export function packNetOf(state: GameState): number {
  const per = PACK_SETUP.priceYuan - PACK_SETUP.costPerPack;
  return Math.round(packDailyOf(state) * per * 100) / 100;
}

/**
 * 打烊结算：把今天出的货卖出去。
 *
 * 由 `endDay` 调用，**必须在 `dayReport` 还在的时候跑**（还原度读的就是它）。
 */
export function settlePack(state: GameState): {
  sold: number;
  net: number;
  extra: Record<string, number>;
  extraNet: number;
} {
  const sold = packDailyOf(state);
  if (sold <= 0) return { sold: 0, net: 0, extra: {}, extraNet: 0 };
  /**
   * 批 W′：三档货与基础货同一天结 —— 它们共用包装机与那点量，
   * 分开结会出现「机器每小时多出几袋」的假账。
   */
  const skus = packSkuLines(state);
  const extra: Record<string, number> = {};
  let extraNet = 0;
  for (const line of skus) {
    if (line.count <= 0) continue;
    extra[line.def.id] = line.count;
    extraNet += line.net;
  }
  const net = Math.round((packNetOf(state) + extraNet) * 100) / 100;
  state.cash += net;
  state.tally.packSold = (state.tally.packSold ?? 0) + sold;
  return { sold, net, extra, extraNet: Math.round(extraNet * 100) / 100 };
}

/**
 * 三档货（批 W′）：汤底包 / 酸笋包 / 礼盒。
 *
 * 它们不新增产能 —— 都从「今天基础那点袋数」里按比例分出去。
 * 没置办包装机、或者段位不够（礼盒），这一档就是 0。
 */
export interface PackSkuLine {
  def: PackSku;
  count: number;
  net: number;
}

export function packSkuLines(state: GameState): PackSkuLine[] {
  if (!state.pack) return [];
  const base = packDailyOf(state);
  if (base <= 0) return [];
  return PACK_SKUS.filter((k) => (state.gradeLevel ?? 0) >= k.minGrade).map((def) => {
    const count = Math.max(0, Math.round(base * def.share));
    const net = Math.round(count * (def.priceYuan - def.costPerPack) * 100) / 100;
    return { def, count, net };
  });
}

/** 三档货今天一共赚多少（基础袋装线不算在这里） */
export function packSkuNet(state: GameState): number {
  return Math.round(packSkuLines(state).reduce((sum, l) => sum + l.net, 0) * 100) / 100;
}

/** 袋装线全部三档 + 基础货的净额 */
export function packNetAll(state: GameState): number {
  return Math.round((packNetOf(state) + packSkuNet(state)) * 100) / 100;
}

/** 三档货的那一句：没解锁的写门槛，解锁的写几件几条 */
export function packSkuWords(state: GameState): string {
  if (!state.pack) return "";
  const lines = packSkuLines(state);
  const locked = PACK_SKUS.filter((k) => (state.gradeLevel ?? 0) < k.minGrade).map((k) => k.name);
  const parts = lines.map((l) => `${l.def.name} ${l.count}`);
  if (locked.length > 0) parts.push(`还差段位：${locked.join("、")}`);
  return parts.join(" · ");
}

export function packSummary(state: GameState): string {
  if (!state.pack) return "还没置办包装机";
  return `每天出 ${packDailyOf(state)} 袋 · 约 ¥${packNetOf(state).toLocaleString("zh-CN")}/天`;
}

export function packRateWords(state: GameState): string {
  return `风味还原 ${Math.round(packRate(state) * 100)}%`;
}

export type { PackSource };
