/**
 * 店内小图里「有人」的那一层（P57）
 *
 * `shopGrid()` 只回答「这件家当摆在哪」，不回答「店里现在有几个活人」。
 * 这里在它上面叠一层标记：排队等位的客人从门口往里排，员工的班位在后厨与堂食。
 *
 * 口径：
 *  - 只在空格上落人，不覆盖家当（家当格子的含义比人重要）；
 *  - 客人从门口（右下）往左排，最多 12 个 —— 再多就看排队条，不用小图数人头；
 *  - 员工按角色分班位：掌勺在后厨，跑堂在堂食；
 *  - 全部确定性，不消耗随机数（同一份存档画出来一模一样）。
 */
import type { GameState } from "./state";
import { shopGrid, type GearSpot } from "../data/gear";

export type MapMark = GearSpot | "cust" | "staff";
export type ShopMap = (MapMark | null)[][];

const W = 12;
const H = 8;

/** 门口那一列往里数：客人站位（先右下，再往左、往上一格一格退） */
function customerSpots(): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  for (let x = W - 1; x >= 4; x -= 1) {
    for (let y = H - 1; y >= 3; y -= 1) out.push([x, y]);
  }
  return out;
}

/** 后厨四列先给掌勺，再往堂食给跑堂 */
function staffSpots(): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  for (let x = 0; x <= 3; x += 1) {
    for (let y = H - 1; y >= 4; y -= 1) out.push([x, y]);
  }
  for (let x = 4; x <= 8; x += 1) {
    for (let y = 6; y >= 4; y -= 1) out.push([x, y]);
  }
  return out;
}

const CUST_SPOTS = customerSpots();
const STAFF_SPOTS = staffSpots();

function take(spot: [number, number], map: ShopMap): boolean {
  const [x, y] = spot;
  const row = map[y];
  if (!row) return false;
  if (row[x] !== null) return false;
  return true;
}

/**
 * 12×8 的店内视图：家当 + 排队客人 + 在职员工。
 *
 * 返回的每一格要么是 `null`（空），要么是家当位置类型，要么是 `"cust"` / `"staff"`。
 */
export function shopMap(state: GameState): ShopMap {
  const map: ShopMap = shopGrid(state).map((row) => row.slice());

  // 员工：在职的才画（休息中的不在店里）
  const staff = (state.staff?.roster ?? []).filter((m) => !m.resting).slice(0, STAFF_SPOTS.length);
  for (const member of staff) {
    // 掌勺优先占后厨，其余人从后厨剩余位往后站
    const spots = member.role === "cook" ? STAFF_SPOTS : [...STAFF_SPOTS].reverse();
    for (const spot of spots) {
      if (take(spot, map)) {
        map[spot[1]]![spot[0]] = "staff";
        break;
      }
    }
  }

  // 客人：从门口往里
  const waiting = Math.min(12, (state.flow?.customers ?? []).length);
  let placedCust = 0;
  for (const spot of CUST_SPOTS) {
    if (placedCust >= waiting) break;
    if (take(spot, map)) {
      map[spot[1]]![spot[0]] = "cust";
      placedCust += 1;
    }
  }

  return map;
}

/** 图例与标题用的一句话 */
export function shopMapSummary(state: GameState): string {
  const waiting = (state.flow?.customers ?? []).length;
  const staff = (state.staff?.roster ?? []).filter((m) => !m.resting).length;
  const parts = [`排队 ${waiting} 人`, `店里 ${staff} 人帮忙`];
  return parts.join(" · ");
}
