/**
 * 九十六格的取数（批次十）。
 *
 * 只读三个已有数：`stationCount(state,"wok")`（灶口）、`venue.seats`（座位）、
 * `stationCount(state,"bench")`（案台档），加上门面件的件数。
 * **不改任何数值** —— 这一层是画，不是玩。
 */

import {
  SLOTS,
  SLOT_SETS,
  STAGE_CELLS,
  STAGE_H,
  STAGE_W,
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
}

export interface Layout {
  w: number;
  h: number;
  cells: LayoutCell[];
  /** 各类已用 / 可用 */
  used: Record<SlotKind, number>;
  cap: Record<SlotKind, number>;
}

/** 门面件的件数：锦旗、招牌、灯箱这类，按已买的家当里挑 */
const FRONT_GEAR = new Set(["banner", "lucky_statue", "aroma_fan", "wall_fan"]);

export function layoutOf(state: GameState): Layout {
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
      });
    }
  }
  const cap: Record<SlotKind, number> = { stove: 4, table: 12, prep: 6, front: 4 };
  return { w: STAGE_W, h: STAGE_H, cells, used: usedIndex, cap };
}

function labelOf(kind: SlotKind, n: number): string {
  if (kind === "stove") return `灶${n}`;
  if (kind === "table") return `桌${n}`;
  if (kind === "prep") return `案${n}`;
  return `招${n}`;
}

export function layoutSummary(state: GameState): string {
  const l = layoutOf(state);
  return `灶 ${l.used.stove}/${l.cap.stove} · 桌 ${l.used.table}/${l.cap.table} · 备料 ${l.used.prep}/${l.cap.prep} · 门面 ${l.used.front}/${l.cap.front}`;
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

/** 已经收过的那一份座位奖励（老档没有 = 没领过） */
export function slotSeatTaken(state: GameState): boolean {
  return (state.flow?.slotSeatPrize ?? 0) > 0;
}

/**
 * 把凑齐的座位奖励发下去 —— 由 `recordDay` 每天调一次。
 *
 * 为什么在打烊时发、而不是买的那一刻发：格子是画，「坐得下」要看**当天**的
 * 座位与家当；而且发座位要动 `venue.seats`，那是别处也在改的字段（家当、
 * 事件、分店），集中在打烊一处改，回滚与存档都简单。
 */
export function claimSlotPrizes(state: GameState): number {
  if (slotSeatTaken(state)) return 0;
  const room = slotSetViews(state).find((v) => v.def.id === "room_done");
  if (!room || !room.done) return 0;
  const seats = Math.max(0, room.def.seats ?? 0);
  if (seats <= 0) return 0;
  state.venue.seats = Math.max(1, (state.venue.seats ?? 2) + seats);
  state.flow = { ...(state.flow as object), slotSeatPrize: seats } as GameState["flow"];
  return seats;
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
  if (v.def.seats) bits.push(`座位 +${v.def.seats}（一次性）`);
  if (v.def.attractPct) bits.push(`进店 +${Math.round(v.def.attractPct * 100)}%`);
  return bits.join(" · ");
}
