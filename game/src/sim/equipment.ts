import {
  BENCH_CAPACITY_STEP,
  BENCH_CAPACITY_UNLOCKED_STEP,
  EQUIP_BY_ID,
  MAX_EQUIP_LEVEL,
  MAX_EQUIP_LEVEL_UNLOCKED,
  PARALLEL_BY_TIER,
  STAGE_MINUTES,
  STATION_EQUIP,
  STATION_NAMES,
  STATION_ORDER,
  STRAINER_COST_FACTOR,
  type EquipDef,
  type EquipId,
  type StationId,
} from "../data/equipment";
import { UNLOCK_BY_ID } from "../data/unlocks";
import type { GameState } from "./state";
import { investSlowestDelta } from "./invest";
import { perkServeDelta } from "./perk";
import { isUnlocked } from "./unlocks";

export interface BuyResult {
  ok: boolean;
  reason?: string;
  /** 买成之后这一档到底换来了什么（试玩二轮 F8：原来统一说「明天出碗更快」，买案台也这么说） */
  line?: string;
}

/** 某一段现在开到几口（设备 0 档 = 1 口） */
export function stationCount(state: GameState, station: StationId): number {
  const table = PARALLEL_BY_TIER[station];
  const lv = Math.min(equipLevel(state, STATION_EQUIP[station]), table.length - 1);
  return table[Math.max(0, lv)] ?? 1;
}

/** 升一档后这一段开到几口（满档返回当前值） */
export function stationCountAfter(state: GameState, station: StationId): number {
  const table = PARALLEL_BY_TIER[station];
  const lv = Math.min(equipLevel(state, STATION_EQUIP[station]) + 1, table.length - 1);
  return table[Math.max(0, lv)] ?? 1;
}

/** 三段各要几分钟（已按口数摊开）+ 合计 */
export function stageMinutes(state: GameState): Record<StationId, number> & { total: number } {
  const wok = STAGE_MINUTES.wok / Math.max(1, stationCount(state, "wok"));
  const pot = STAGE_MINUTES.pot / Math.max(1, stationCount(state, "pot"));
  const basket = STAGE_MINUTES.basket / Math.max(1, stationCount(state, "basket"));
  /**
   * 请老师傅来看一天（批 B′）：只把**最慢那一段**的分钟数减掉。
   * 为什么不三段一起减 —— 三段里只有最慢那段真的卡人（P164 / P242）；
   * 一起减等于买了一个全局乘数，而这一批的纪律是「只买量，不买乘数」。
   * 减到 0.6 分就不动了（再快也得等另一段）。
   */
  const delta = investSlowestDelta(state);
  const parts: Record<StationId, number> = { wok, pot, basket };
  if (delta > 0) {
    let slow: StationId = "wok";
    if (pot > parts[slow]) slow = "pot";
    if (basket > parts[slow]) slow = "basket";
    parts[slow] = Math.max(0.6, parts[slow] - delta);
  }
  /**
   * 手艺点（批 K′）：三段**各**减一点（与老师傅那条不同 —— 老师傅只治最慢一段，
   * 手艺是自己的手，三段都受益），同样守 0.6 分的下限，总量已由 `PERK_CAP.serve` 封顶。
   */
  {
    const perk = perkServeDelta(state);
    if (perk > 0) {
      parts.wok = Math.max(0.6, parts.wok - perk);
      parts.pot = Math.max(0.6, parts.pot - perk);
      parts.basket = Math.max(0.6, parts.basket - perk);
    }
  }
  return { wok: parts.wok, pot: parts.pot, basket: parts.basket, total: parts.wok + parts.pot + parts.basket };
}

/**
 * 三段合起来的出碗系数（相对基准 6.0 分钟）。
 * **单出口**：HUD 的「分/碗」、打烊单的产能、钩子挑件都读这一个函数（合并 P117 / P152）。
 */
export function stationServeFactor(state: GameState): number {
  const base = STAGE_MINUTES.wok + STAGE_MINUTES.pot + STAGE_MINUTES.basket;
  return stageMinutes(state).total / base;
}

/** 哪一段最慢（面板与钩子用） */
export function slowestStation(state: GameState): { station: StationId; minutes: number } {
  const m = stageMinutes(state);
  let best: StationId = "wok";
  for (const s of STATION_ORDER) if (m[s] > m[best]) best = s;
  return { station: best, minutes: m[best] };
}

/** 每件设备买下一档时，向玩家交代的那一句话 —— 必须是这一档真的改了的东西 */
function upgradeLine(id: EquipId, level: number): string {
  const station = (Object.keys(STATION_EQUIP) as StationId[]).find((s) => STATION_EQUIP[s] === id);
  if (station) {
    const after = PARALLEL_BY_TIER[station][Math.min(level, PARALLEL_BY_TIER[station].length - 1)] ?? 1;
    const unit = station === "basket" ? "筒" : "口";
    return `${STATION_NAMES[station]}第 ${level} 档：开到 ${after} ${unit}`;
  }
  if (level >= MAX_EQUIP_LEVEL_UNLOCKED) return `案台第 ${level} 档：每天多备 ${BENCH_CAPACITY_UNLOCKED_STEP} 碗的料`;
  return `案台第 ${level} 档：每天多备 ${BENCH_CAPACITY_STEP} 碗的料`;
}

export function equipLevel(state: GameState, id: string): number {
  return state.equipment[id] ?? 0;
}

/**
 * 这件设备**现在**最多能买到第几档（批 AZ′，解 GAP 四轮 A 条）。
 *
 * 前四档谁都能买；第 5 档写着 `unlockLevel: 5`，要评到第 8 段（`unlocks` 的 `stove5`）。
 * 单出口：`equipNextCost` / `buyEquipment` / 钩子 / 面板都读这一个函数 ——
 * 原来 `MAX_EQUIP_LEVEL = 4` 被抄在四个地方（`sim/equipment.ts` 两处、`sim/hook.ts` 一处、
 * 面板一处），加一档就要改四处，漏一处就出现「面板能点、模拟拒绝」。
 */
export function equipMaxLevel(state: GameState, id: string): number {
  const def = EQUIP_BY_ID.get(id);
  if (!def) return MAX_EQUIP_LEVEL;
  if (!def.unlockLevel || def.unlockLevel <= MAX_EQUIP_LEVEL) return MAX_EQUIP_LEVEL;
  return isUnlocked(state, "stove5") ? MAX_EQUIP_LEVEL_UNLOCKED : MAX_EQUIP_LEVEL;
}

/** 还差什么才买得到下一档（买得到时返回 null）—— 给面板与钩子一句话 */
export function equipLockReason(state: GameState, id: string): string | null {
  const def = EQUIP_BY_ID.get(id);
  if (!def || !def.unlockLevel) return null;
  const lv = equipLevel(state, id);
  if (lv < MAX_EQUIP_LEVEL) return null;
  if (isUnlocked(state, "stove5")) return null;
  const gate = UNLOCK_BY_ID.get("stove5");
  return `第 ${MAX_EQUIP_LEVEL + 1} 档要评到第 ${gate?.grade ?? 8} 段（「${gate?.name ?? "第五档·黄金灶"}」）才换得到`;
}

/** 下一档要多少钱；满级返回 Infinity */
export function equipNextCost(state: GameState, id: string): number {
  const def = EQUIP_BY_ID.get(id);
  if (!def) return Infinity;
  const lv = equipLevel(state, id);
  if (lv >= equipMaxLevel(state, id)) return Infinity;
  return def.tiers[lv] ?? Infinity;
}

/** 买下一档：钱不够/满级/段位没到都拒绝且不扣钱，案台当场提升日上限 */
export function buyEquipment(state: GameState, id: string): BuyResult {
  const def: EquipDef | undefined = EQUIP_BY_ID.get(id);
  if (!def) return { ok: false, reason: "没有这台设备" };
  const lv = equipLevel(state, id);
  const maxLv = equipMaxLevel(state, id);
  if (lv >= maxLv) {
    const lock = equipLockReason(state, id);
    return { ok: false, reason: lock ?? "已经换到顶档" };
  }
  const cost = equipNextCost(state, id);
  if (state.cash < cost) return { ok: false, reason: `还差 ¥${Math.ceil(cost - state.cash)}` };

  state.cash -= cost;
  state.equipment[id] = lv + 1;
  /**
   * 案台：前四档各 +40（`BENCH_CAPACITY_STEP`），第五档（黄金备料线）+200
   * （`BENCH_CAPACITY_UNLOCKED_STEP`，批 AZ′）。数据表里第五档写的就是「日上限 +200 碗」，
   * 这一行必须跟那句文案对得上，否则界面说 +200、账上只加 40。
   */
  if (id === ("bench" satisfies EquipId)) {
    const after = lv + 1;
    state.capacity += after >= MAX_EQUIP_LEVEL_UNLOCKED ? BENCH_CAPACITY_UNLOCKED_STEP : BENCH_CAPACITY_STEP;
  }
  return { ok: true, line: upgradeLine(def.id, lv + 1) };
}

/** 出碗时间系数（三段并行后的合计，旧名保留，调用处不必全改） */
export function equipServeMultiplier(state: GameState): number {
  return stationServeFactor(state);
}

/** 食材成本系数（粉篓与汤勺的第二效果） */
export function equipCostMultiplier(state: GameState): number {
  return Math.pow(STRAINER_COST_FACTOR, equipLevel(state, "strainer"));
}

/** 当前实际出碗分钟数（给 HUD 与面板用，口径与 customer.ts 一致） */
export function effectiveServeMinutes(state: GameState, baseMinutes: number, staffFactor: number): number {
  return Math.max(0.5, baseMinutes * staffFactor * equipServeMultiplier(state));
}
