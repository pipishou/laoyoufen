import { describe, expect, it } from "vitest";

import {
  STAGE_CELLS,
  STORE_AREAS,
  floorCellsOf,
  floorVisibleCellsOf,
  isFloorCleared,
  storeAreaOf,
} from "../data/slots";
import { buyExpansion } from "./expansion";
import { layoutOf } from "./slots";
import { createInitialState } from "./state";

function fresh(seed = 11) {
  const s = createInitialState("store-area", seed);
  s.cash = 400_000;
  s.gradeLevel = 9;
  return s;
}

describe("店铺四档的铺面面积（批 T′，解「店没变大」）", () => {
  it("五档数字是 48 / 60 / 72 / 96 / 120 格，一格不比一格小", () => {
    const got = STORE_AREAS.map((a) => floorCellsOf(a.level));
    expect(got).toEqual([48, 60, 72, 96, 120]);
    for (let i = 1; i < got.length; i += 1) {
      expect(got[i]!).toBeGreaterThan(got[i - 1]!);
    }
  });

  it("画面里那 96 格：前四档 48 / 60 / 72 / 96，第四档的楼上不计入画面", () => {
    expect([0, 1, 2, 3, 4].map((lv) => floorVisibleCellsOf(lv))).toEqual([48, 60, 72, 96, 96]);
    expect(floorVisibleCellsOf(4)).toBe(STAGE_CELLS);
    expect(STORE_AREAS[4]!.upstairs).toBe(24);
    expect(STORE_AREAS.slice(0, 4).every((a) => a.upstairs === 0)).toBe(true);
  });

  it("档位超出范围会被夹住，老档给 0 也当第一档", () => {
    expect(storeAreaOf(-3).level).toBe(0);
    expect(storeAreaOf(99).level).toBe(4);
    expect(storeAreaOf(Number.NaN).level).toBe(0);
    expect(floorCellsOf(-1)).toBe(48);
    expect(floorCellsOf(99)).toBe(120);
  });

  it("铺面是嵌套的：升一档之后，原来的每一格都还在", () => {
    for (let lv = 1; lv < STORE_AREAS.length; lv += 1) {
      for (let y = 0; y < 8; y += 1) {
        for (let x = 0; x < 12; x += 1) {
          if (isFloorCleared(x, y, lv - 1)) {
            expect(isFloorCleared(x, y, lv)).toBe(true);
          }
        }
      }
    }
  });

  it("layoutOf 报的铺面格数跟着扩建档位走，未铺开的格有标记", () => {
    const s = fresh();
    const before = layoutOf(s);
    expect(before.level).toBe(0);
    expect(before.floor).toBe(48);
    expect(before.floorTotal).toBe(48);
    expect(before.cells.filter((c) => !c.floor)).toHaveLength(STAGE_CELLS - 48);

    // 买第一档（打通隔墙）：资金与段位都够
    expect(buyExpansion(s).ok).toBe(true);
    const after = layoutOf(s);
    expect(after.level).toBe(1);
    expect(after.floor).toBe(60);
    expect(after.floorTotal).toBe(60);
    expect(after.cells.filter((c) => !c.floor)).toHaveLength(STAGE_CELLS - 60);
  });

  it("灶沿后墙那条（y=0）在第三档之前不铺开，但槽位照样画", () => {
    const s = fresh();
    const l0 = layoutOf(s);
    const stoveCell = l0.cells.find((c) => c.kind === "stove")!;
    expect(stoveCell.y).toBe(0);
    expect(stoveCell.floor).toBe(false);
    expect(stoveCell.kind).toBe("stove");
  });

  it("铺面这一层不改任何数值：座位、灶位、产能、日上限买不买都一样", () => {
    const s = fresh();
    const seats0 = s.venue.seats;
    const stoves0 = s.venue.stoves;
    const cap0 = s.capacity;
    const lv0 = layoutOf(s);
    expect(lv0.cap).toEqual({ stove: 4, table: 12, prep: 6, front: 4 });
    expect(s.venue.seats).toBe(seats0);
    expect(s.venue.stoves).toBe(stoves0);
    expect(s.capacity).toBe(cap0);

    // 买下第一档：座位/灶位/日上限只按 data/expansion.ts 的既有数字涨，铺面不动它们
    const def = { seats: 2, stoves: 0, capacity: 60 };
    buyExpansion(s);
    expect(s.venue.seats).toBe(seats0 + def.seats);
    expect(s.venue.stoves).toBe(stoves0 + def.stoves);
    expect(s.capacity).toBe(cap0 + def.capacity);
  });
});
