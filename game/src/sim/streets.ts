/**
 * 街面（M2）的逻辑层：买、乘数、一次性台词、俯视小地图。
 *
 * 四个乘数分别接回既有入口，不新开引擎：
 *   streetAttractMult  → sim/customer.ts 的 spawnChance（spawn 乘数）
 *   streetPoolMult     → sim/district.ts 的 demandCapOf（客流池）
 *   streetQueuePlus    → sim/unlocks.ts 的 queueMaxOf（排队位）
 *   streetPatienceMult → sim/customer.ts 的 patienceMultiplier 处
 *   streetDrinkMult    → sim/sides.ts 的 pickSides（饮料加购概率）
 *   streetGiftMult     → sim/customer.ts 的 collectGift（熟客回礼）
 */
import { DAYPART_WORD, STREETS, streetById, type DayPart, type StreetDef, type StreetId } from "../data/streets";
import { RIVAL_BY_ID } from "../data/rivals";
import type { GameState } from "./state";

export interface StreetResult {
  ok: boolean;
  reason?: string;
  line?: string;
}

export function hasStreet(state: GameState, id: string): boolean {
  return (state.streets ?? []).includes(id);
}

/** 当前时段（与 customer.ts 的 spawnChance 同一个切法：一天四段） */
export function dayPartOf(state: GameState): DayPart {
  const part = Math.min(3, Math.floor(state.flow.minuteOfDay / (120 / 4)));
  return part as DayPart;
}

/** 买下街面上的一件东西：钱够、没买过 */
export function buyStreet(state: GameState, id: string): StreetResult {
  const def = streetById(id);
  if (!def) return { ok: false, reason: "街上没有这件东西" };
  if (hasStreet(state, id)) return { ok: false, reason: `${def.name}已经修好了` };
  if (state.cash < def.costYuan) {
    return {
      ok: false,
      reason: `${def.name}要 ¥${def.costYuan.toLocaleString("zh-CN")}，还差一点`,
    };
  }
  state.cash -= def.costYuan;
  state.streets = [...(state.streets ?? []), id];
  state.streetSeen = [...(state.streetSeen ?? []), id];
  return { ok: true, line: `${def.name}修好了：${def.line}` };
}

/** 进店率乘数（时段限定的只在该时段生效） */
export function streetAttractMult(state: GameState): number {
  const part = dayPartOf(state);
  let pct = 0;
  for (const id of state.streets ?? []) {
    const def = streetById(id);
    if (!def?.attractPct) continue;
    if (def.daypart !== undefined && def.daypart !== part) continue;
    pct += def.attractPct;
  }
  return 1 + pct;
}

/** 客流池乘数 */
export function streetPoolMult(state: GameState): number {
  let pct = 0;
  for (const id of state.streets ?? []) {
    const def = streetById(id);
    if (def?.poolPct) pct += def.poolPct;
  }
  return 1 + pct;
}

/** 排队位加成（整数） */
export function streetQueuePlus(state: GameState): number {
  let add = 0;
  for (const id of state.streets ?? []) {
    const def = streetById(id);
    if (def?.queuePlus) add += def.queuePlus;
  }
  return add;
}

/** 候餐耐心乘数 */
export function streetPatienceMult(state: GameState): number {
  let pct = 0;
  for (const id of state.streets ?? []) {
    const def = streetById(id);
    if (def?.patiencePct) pct += def.patiencePct;
  }
  return 1 + pct;
}

/** 饮料加购乘数 */
export function streetDrinkMult(state: GameState): number {
  let pct = 0;
  for (const id of state.streets ?? []) {
    const def = streetById(id);
    if (def?.drinkPct) pct += def.drinkPct;
  }
  return 1 + pct;
}

/** 熟客回礼乘数 */
export function streetGiftMult(state: GameState): number {
  let pct = 0;
  for (const id of state.streets ?? []) {
    const def = streetById(id);
    if (def?.giftPct) pct += def.giftPct;
  }
  return 1 + pct;
}

export interface StreetView {
  def: StreetDef;
  built: boolean;
  affordable: boolean;
  /** 时段限定的，标一句「只在早市」 */
  scope: string;
}

export function streetViews(state: GameState): StreetView[] {
  return STREETS.map((def) => ({
    def,
    built: hasStreet(state, def.id),
    affordable: state.cash >= def.costYuan,
    scope: def.daypart !== undefined ? `只在${DAYPART_WORD[def.daypart]}` : "全天",
  }));
}

export function streetSummary(state: GameState): string {
  const built = (state.streets ?? []).length;
  const spent = (state.streets ?? []).reduce((sum, id) => sum + (streetById(id)?.costYuan ?? 0), 0);
  return built === 0
    ? "这条街还什么都没修"
    : `修了 ${built}/${STREETS.length} 件 · 花了 ¥${spent.toLocaleString("zh-CN")}`;
}

/** 还有多少件没修（面板提示用） */
export function streetLeft(state: GameState): number {
  return STREETS.length - (state.streets ?? []).length;
}

/** 第一个没修的、且买得起的（居民下次会来提这件事） */
export function nextRequest(state: GameState): StreetDef | null {
  const left = STREETS.filter((s) => !hasStreet(state, s.id));
  if (left.length === 0) return null;
  return left.find((s) => state.cash >= s.costYuan) ?? left[0]!;
}

/* ────────────────────────────── 俯视小地图 ────────────────────────────── */

/**
 * 16×16 的街区俯视格子（给面板画像素小地图）。
 * 不追求写实：只让玩家一眼看出「我的店在哪、街上有什么、同行在哪一侧」。
 *
 * 图例：`.` 空 / `r` 路 / `s` 我的店 / `v` 同行 / `k` 已修的街面 / `t` 榕树 / `m` 菜市
 */
export type MapCell = "." | "r" | "s" | "v" | "k" | "t" | "m";

const MAP_SIZE = 16;

/** 每件街面在地图上的固定位置（横, 纵） */
const STREET_SPOTS: Record<StreetId, [number, number]> = {
  lane_lamp: [2, 3],
  market_canopy: [12, 2],
  tea_shop: [10, 4],
  crosswalk: [7, 1],
  court: [13, 9],
  banyan_bench: [4, 6],
  toilet_sign: [11, 11],
  billboard: [7, 3],
  charger: [13, 12],
  notice_board: [3, 11],
  market_back: [2, 13],
  mahjong: [9, 13],
};

const MARKET_CELLS: Array<[number, number]> = [
  [12, 1],
  [13, 1],
  [12, 2],
  [13, 2],
];

const TREE_CELLS: Array<[number, number]> = [
  [3, 6],
  [4, 5],
  [3, 5],
];

export function streetMap(state: GameState): MapCell[][] {
  const grid: MapCell[][] = Array.from({ length: MAP_SIZE }, () =>
    Array.from({ length: MAP_SIZE }, () => "." as MapCell),
  );
  // 两条街：横街（y=7）、竖巷（x=7）
  for (let i = 0; i < MAP_SIZE; i += 1) {
    grid[7]![i] = "r";
    grid[i]![7] = "r";
  }
  for (const [x, y] of MARKET_CELLS) grid[y]![x] = "m";
  for (const [x, y] of TREE_CELLS) grid[y]![x] = "t";
  // 我的店：横竖街口
  grid[7]![7] = "s";
  // 同行：按本区几家放在街两侧
  const rivalsHere = (state.rivals ?? [])
    .filter((r) => !r.closed && RIVAL_BY_ID.get(r.id)?.district === state.district)
    .slice(0, 3);
  const rivalSpots: Array<[number, number]> = [
    [7, 5],
    [5, 7],
    [9, 7],
  ];
  rivalsHere.forEach((_, i) => {
    const spot = rivalSpots[i];
    if (spot) grid[spot[1]]![spot[0]] = "v";
  });
  // 已修的街面
  for (const id of state.streets ?? []) {
    const spot = STREET_SPOTS[id as StreetId];
    if (spot) grid[spot[1]]![spot[0]] = "k";
  }
  return grid;
}
