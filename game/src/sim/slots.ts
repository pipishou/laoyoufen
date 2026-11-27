/**
 * 九十六格的取数（批次十）。
 *
 * 只读三个已有数：`stationCount(state,"wok")`（灶口）、`venue.seats`（座位）、
 * `stationCount(state,"bench")`（案台档），加上门面件的件数。
 * **不改任何数值** —— 这一层是画，不是玩。
 */

import {
  SLOTS,
  SLOT_COUNT,
  SLOT_SETS,
  STAGE_CELLS,
  STAGE_H,
  STAGE_W,
  floorCellsOf,
  isFloorCleared,
  storeAreaOf,
  type SlotKind,
  type SlotSetDef,
} from "../data/slots";
import { stationCount } from "./equipment";
import type { GameState } from "./state";

export interface LayoutCell {
  x: number;
  y: number;
  kind: SlotKind | null;
  /** 这一格上真的摆了东西（没摆就是空的槽位） */
  filled: boolean;
  /** 摆了什么（「灶 2」这类短标签） */
  label: string;
  /** 这一格是不是这家店真正铺开的铺面（批 T′，只影响画法） */
  floor: boolean;
}

export interface Layout {
  w: number;
  h: number;
  cells: LayoutCell[];
  /** 各类已用 / 可用 */
  used: Record<SlotKind, number>;
  cap: Record<SlotKind, number>;
  /** 扩建档位与这一档的样子（批 T′） */
  level: number;
  storeName: string;
  /** 画面里属于这家店的格数 / 这一档总共能用的格数（含楼上） */
  floor: number;
  floorTotal: number;
  /** 楼上另有几格（画不进 12×8） */
  upstairs: number;
}

/** 门面件的件数：锦旗、招牌、灯箱这类，按已买的家当里挑 */
const FRONT_GEAR = new Set(["banner", "lucky_statue", "aroma_fan", "wall_fan"]);

export function layoutOf(state: GameState): Layout {
  const level = Math.max(0, Math.floor(state.venue?.expansion ?? 0));
  const stoves = Math.max(0, stationCount(state, "wok"));
  const tables = Math.max(1, Math.min(12, state.venue?.seats ?? 2));
  const preps = Math.max(0, state.equipment?.bench ?? 0);
  const owned = new Set(state.gear ?? []);
  const fronts = [...FRONT_GEAR].filter((g) => owned.has(g)).length;

  const want: Record<SlotKind, number> = {
    stove: stoves,
    table: tables,
    prep: preps,
    front: fronts,
  };
  const usedIndex: Record<SlotKind, number> = { stove: 0, table: 0, prep: 0, front: 0 };
  const at = new Map<string, { kind: SlotKind; label: string }>();
  for (const slot of SLOTS) {
    const n = usedIndex[slot.kind];
    const cap = want[slot.kind];
    if (n < cap) {
      usedIndex[slot.kind] = n + 1;
      at.set(`${slot.x},${slot.y}`, { kind: slot.kind, label: labelOf(slot.kind, n + 1) });
    }
  }

  const cells: LayoutCell[] = [];
  for (let y = 0; y < STAGE_H; y += 1) {
    for (let x = 0; x < STAGE_W; x += 1) {
      const slot = SLOTS.find((s2) => s2.x === x && s2.y === y) ?? null;
      const hit = at.get(`${x},${y}`) ?? null;
      cells.push({
        x,
        y,
        kind: slot ? slot.kind : null,
        filled: !!hit,
        label: hit ? hit.label : "",
        floor: isFloorCleared(x, y, level),
      });
    }
  }
  // 批 BB1′（解体检 P-B）：cap 原来写死 `{ stove: 4, … }`，而批 AZ′ 的黄金灶能把
  // 炒锅开到第六口 —— 于是「灶 6/4」这种自相矛盾的抬头会出现。cap 现在直接读
  // `SLOT_COUNT`（槽位表自己数出来的），表改长了这里不用再改第二处。
  const cap: Record<SlotKind, number> = { ...SLOT_COUNT };
  const area = storeAreaOf(level);
  const floor = cells.filter((c) => c.floor).length;
  return {
    w: STAGE_W,
    h: STAGE_H,
    cells,
    used: usedIndex,
    cap,
    level,
    storeName: area.name,
    floor,
    floorTotal: floorCellsOf(level),
    upstairs: area.upstairs,
  };
}

function labelOf(kind: SlotKind, n: number): string {
  if (kind === "stove") return `灶${n}`;
  if (kind === "table") return `桌${n}`;
  if (kind === "prep") return `案${n}`;
  return `招${n}`;
}

/**
 * 面板抬头那串「炒锅 N/6 · 桌 4/12 · 备料 0/6 · 门面 0/4」。
 *
 * 批 BB1′（解体检 P-B）：第一格原来写「灶 N/4」，与店面页抬头「灶 2」（扩建买来的
 * 灶位，1–3）撞名，玩家看到两个不同的数都叫「灶」。这一格数的是**设备炒锅的口数**
 * （`stationCount(state,"wok")`，1–6），所以改叫「炒锅」；扩建买的那一格在店面页
 * 抬头里改叫「灶位」。
 */
export function layoutSummary(state: GameState): string {
  const l = layoutOf(state);
  return `炒锅 ${l.used.stove}/${l.cap.stove} · 桌 ${l.used.table}/${l.cap.table} · 备料 ${l.used.prep}/${l.cap.prep} · 门面 ${l.used.front}/${l.cap.front}`;
}

/** 九十六格里摆了几格（给面板抬头用） */
export function filledCount(state: GameState): number {
  return layoutOf(state).cells.filter((c) => c.filled).length;
}

export function stageCells(): number {
  return STAGE_CELLS;
}

// ── 成套度（批 J′）─────────────────────────────────────────────

export interface SlotSetView {
  def: SlotSetDef;
  done: boolean;
  /** 「桌 4 / 6」这种进度短语 */
  progress: string;
}

function setProgress(l: Layout, def: SlotSetDef): { done: boolean; progress: string } {
  const parts: string[] = [];
  let done = true;
  for (const kind of Object.keys(def.need) as SlotKind[]) {
    const need = Math.max(0, def.need[kind] ?? 0);
    const have = Math.min(l.used[kind] ?? 0, need);
    if (have < need) done = false;
    parts.push(`${SLOT_SHORT[kind]} ${have} / ${need}`);
  }
  return { done, progress: parts.join(" · ") };
}

const SLOT_SHORT: Readonly<Record<SlotKind, string>> = {
  stove: "灶",
  table: "桌",
  prep: "备料",
  front: "门面",
};

export function slotSetViews(state: GameState): SlotSetView[] {
  const l = layoutOf(state);
  return SLOT_SETS.map((def) => {
    const { done, progress } = setProgress(l, def);
    return { def, done, progress };
  });
}

/**
 * 成套给的耐心加成（`room_done` 那一条）。
 *
 * 与 `slotAttractMult` 分开放：一个是「愿不愿意进来」，一个是「进来之后愿不愿意等」，
 * 两个出口刻意不重叠（同 energy / appetite 的分工）。
 */
export function slotPatienceMult(state: GameState): number {
  const pct = slotSetViews(state)
    .filter((v) => v.done)
    .reduce((n, v) => n + (v.def.patiencePct ?? 0), 0);
  return 1 + pct;
}

/**
 * 打烊时把「今天新凑齐的成套」记下来 —— 给打烊单与 AI 用，同一套只报一次。
 *
 * 原来这里发座位（`claimSlotPrizes`）。座位不进这里了（见 data/slots.ts 的注释），
 * 这一层只剩「记一笔」，所以不再改 `venue.seats`，也不与家当、事件抢同一处改动。
 */
export function announceSlotSets(state: GameState): SlotSetDef[] {
  const said = new Set(state.flow?.slotsAnnounced ?? []);
  const fresh = slotSetViews(state)
    .filter((v) => v.done && !said.has(v.def.id))
    .map((v) => v.def);
  if (fresh.length > 0) {
    state.flow = {
      ...(state.flow as object),
      slotsAnnounced: [...said, ...fresh.map((d) => d.id)],
    } as GameState["flow"];
  }
  return fresh;
}

/** 常驻的进店加成（门面齐了那一条） */
export function slotAttractMult(state: GameState): number {
  const pct = slotSetViews(state)
    .filter((v) => v.done)
    .reduce((n, v) => n + (v.def.attractPct ?? 0), 0);
  return 1 + pct;
}

/** 面板抬头：「成套 1 / 2」 */
export function slotSetSummary(state: GameState): string {
  const vs = slotSetViews(state);
  const done = vs.filter((v) => v.done).length;
  return `成套 ${done} / ${vs.length}`;
}

export function slotSetWords(v: SlotSetView): string {
  const bits: string[] = [];
  if (v.def.patiencePct) bits.push(`耐心 +${Math.round(v.def.patiencePct * 100)}%`);
  if (v.def.attractPct) bits.push(`进店 +${Math.round(v.def.attractPct * 100)}%`);
  return bits.join(" · ");
}
