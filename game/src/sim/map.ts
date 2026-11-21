/**
 * 轻地图的取数（A10）。
 *
 * 只读三个已有来源：`state.district`（我在这）、`state.branches`（我的分店）、
 * `state.rivals`（同行在哪）。不新增任何存档字段 —— 地图是**视图**，不是状态。
 */

import { DISTRICTS, districtById, districtNameOf, dailyTrafficOf, type DistrictId } from "../data/nanning";
import { MAP_H, MAP_SPOTS, MAP_W, shortNameOf, type MapCell } from "../data/map";
import type { GameState } from "./state";

export function mapCells(state: GameState): MapCell[] {
  const branchDistricts = new Set((state.branches ?? []).map((b) => b.district));
  /**
   * 同行只记「同一条街」——`RivalState` 没有区字段，8 家都在你所在的区。
   * 所以地图上只有当前区会跳出数字，别的区留给以后真开了分店再说。
   */
  const rivalCount = new Map<string, number>();
  const openRivals = (state.rivals ?? []).filter((r) => !r.closed).length;
  if (openRivals > 0) rivalCount.set(state.district, openRivals);
  return MAP_SPOTS.map((spot) => {
    const id = spot.id as DistrictId;
    const name = districtNameOf(id);
    return {
      id: spot.id,
      name,
      short: shortNameOf(name),
      x: spot.x,
      y: spot.y,
      here: state.district === spot.id,
      branch: branchDistricts.has(spot.id),
      rivals: rivalCount.get(spot.id) ?? 0,
      traffic: Math.round(dailyTrafficOf(id)),
    };
  });
}

export function mapSize(): { w: number; h: number } {
  return { w: MAP_W, h: MAP_H };
}

/** 「在兴宁 · 分店 2 家 · 青秀还有 3 家在抢」 */
export function mapSummary(state: GameState): string {
  const here = districtNameOf(state.district as DistrictId);
  const branches = (state.branches ?? []).length;
  const cells = mapCells(state);
  const hot = cells
    .filter((c) => !c.here && !c.branch && c.rivals > 0)
    .sort((a, b) => b.rivals - a.rivals)[0];
  const tail = hot ? ` · ${hot.name}还有 ${hot.rivals} 家在抢` : " · 别的区还没人插手";
  return `在${here} · 分店 ${branches} 家${tail}`;
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
