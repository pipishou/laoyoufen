/**
 * 轻地图的取数（A10 / 批次九扩成四圈）。
 *
 * 只读已有来源：`state.district`（我在这）、`state.branches`（我的分店）、
 * `state.rivals`（同行在哪）、`state.gradeLevel`（能看见第几圈）。
 * 不新增任何存档字段 —— 地图是**视图**，不是状态。
 */

import { DISTRICTS, districtById, districtNameOf, dailyTrafficOf, type DistrictId } from "../data/nanning";
import {
  MAP_H,
  MAP_RINGS,
  MAP_SPOTS,
  MAP_W,
  ringDef,
  ringOfSpot,
  shortNameOf,
  visibleRingOf,
  type MapCell,
  type MapRing,
} from "../data/map";
import { localOfDistrict } from "../data/local";
import type { GameState } from "./state";

export function mapCells(state: GameState): MapCell[] {
  const branchDistricts = new Set((state.branches ?? []).map((b) => b.district));
  const seen = visibleRingOf(state.gradeLevel ?? 0);
  /**
   * 同行只记「同一条街」—— `RivalState` 的区字段是批次九才补的，
   * 老档（v34 及以前）可能还是空，所以按区名兜底：只算当前区。
   */
  const rivalCount = new Map<string, number>();
  for (const r of state.rivals ?? []) {
    if (r.closed) continue;
    const d = String(r.district ?? state.district);
    rivalCount.set(d, (rivalCount.get(d) ?? 0) + 1);
  }
  return MAP_SPOTS.map((spot) => {
    const id = spot.id as DistrictId;
    const name = districtNameOf(id);
    const ring = ringOfSpot(spot.id);
    const def = ringDef(ring);
    const local = localOfDistrict(spot.id);
    return {
      id: spot.id,
      name,
      short: shortNameOf(name),
      x: spot.x,
      y: spot.y,
      ring,
      gate: def.gate,
      locked: ring > seen,
      local: local ? local.name : null,
      here: state.district === spot.id,
      branch: branchDistricts.has(spot.id),
      rivals: ring > seen ? 0 : (rivalCount.get(spot.id) ?? 0),
      traffic: Math.round(dailyTrafficOf(id)),
    };
  });
}

export function mapSize(): { w: number; h: number } {
  return { w: MAP_W, h: MAP_H };
}

/** 「在兴宁 · 分店 2 家 · 看得见 2 / 4 圈」
 *
 * 圈的信息比同行更重要：同行是「今天谁在抢」，圈是「这城还有多大」。
 */
export function mapSummary(state: GameState): string {
  const here = districtNameOf(state.district as DistrictId);
  const branches = (state.branches ?? []).length;
  const seen = visibleRingOf(state.gradeLevel ?? 0);
  const rings = MAP_RINGS.filter((r) => r.ring <= seen).length;
  const local = localOfDistrict(String(state.district ?? ""));
  const tail = local ? ` · 这一片产${local.name}` : "";
  return `在${here} · 分店 ${branches} 家 · 看得见 ${rings} / ${MAP_RINGS.length} 圈${tail}`;
}

/** 下一圈要多少段位才看得见（已全开返回 null） */
export function nextRing(state: GameState): { ring: MapRing; gate: number; note: string } | null {
  const seen = visibleRingOf(state.gradeLevel ?? 0);
  const next = MAP_RINGS.find((r) => r.ring === seen + 1);
  return next ? { ring: next.ring, gate: next.gate, note: next.note } : null;
}

/** 还没去过的区（按人流降序），给「要不要搬」一个参照 */
export function unvisitedDistricts(state: GameState): { id: string; name: string; traffic: number }[] {
  return DISTRICTS.filter((d) => d.id !== state.district && !(state.branches ?? []).some((b) => b.district === d.id))
    .map((d) => ({ id: d.id, name: d.name, traffic: Math.round(dailyTrafficOf(d.id)) }))
    .sort((a, b) => b.traffic - a.traffic);
}

export function districtPitchOf(id: string): string {
  try {
    return districtById(id as DistrictId).pitch;
  } catch {
    return "";
  }
}
