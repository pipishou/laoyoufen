/**
 * 九十六格的取数（批次十）。
 *
 * 只读三个已有数：`stationCount(state,"wok")`（灶口）、`venue.seats`（座位）、
 * `stationCount(state,"bench")`（案台档），加上门面件的件数。
 * **不改任何数值** —— 这一层是画，不是玩。
 */

import { SLOTS, STAGE_CELLS, STAGE_H, STAGE_W, type SlotKind } from "../data/slots";
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
