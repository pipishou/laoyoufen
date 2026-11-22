import { describe, expect, it } from "vitest";
import { SLOTS, SLOT_COUNT, STAGE_CELLS, STAGE_H, STAGE_W } from "../data/slots";
import { createInitialState } from "./state";
import { filledCount, layoutOf, layoutSummary, stageCells } from "./slots";

const fresh = () => createInitialState("p1", 7);

describe("店里九十六格（批次十）", () => {
  it("12×8＝96 格，一格不多一格不少", () => {
    expect(STAGE_W * STAGE_H).toBe(STAGE_CELLS);
    expect(stageCells()).toBe(STAGE_CELLS);
    const l = layoutOf(fresh());
    expect(l.cells).toHaveLength(STAGE_CELLS);
    expect(l.w).toBe(STAGE_W);
    expect(l.h).toBe(STAGE_H);
  });

  it("26 个槽位：灶 4 · 桌 12 · 备料 6 · 门面 4", () => {
    expect(SLOTS).toHaveLength(26);
    expect(SLOT_COUNT).toEqual({ stove: 4, table: 12, prep: 6, front: 4 });
  });

  it("槽位坐标不重复、都在格子内", () => {
    const seen = new Set<string>();
    for (const s of SLOTS) {
      expect(s.x).toBeGreaterThanOrEqual(0);
      expect(s.x).toBeLessThan(STAGE_W);
      expect(s.y).toBeGreaterThanOrEqual(0);
      expect(s.y).toBeLessThan(STAGE_H);
      const key = `${s.x},${s.y}`;
      expect(seen.has(key)).toBe(false);
      seen.add(key);
    }
  });

  it("新局只看得到起始的桌与灶，摆出来的格数等于座位加灶口", () => {
    const s = fresh();
    const l = layoutOf(s);
    expect(l.used.table).toBe(Math.min(12, s.venue.seats));
    expect(l.used.stove).toBeGreaterThanOrEqual(1);
    expect(filledCount(s)).toBe(l.used.stove + l.used.table + l.used.prep + l.used.front);
  });

  it("多摆两张桌，格子跟着变多且不越 12 格上限", () => {
    const s = fresh();
    const before = layoutOf(s).used.table;
    s.venue.seats = 20;
    const after = layoutOf(s);
    expect(after.used.table).toBe(12);
    expect(after.used.table).toBeGreaterThan(before);
    expect(after.used.table).toBeLessThanOrEqual(after.cap.table);
  });

  it("灶口与案台按设备档位走，四类都不越各自的 cap", () => {
    const s = fresh();
    s.equipment.stove = 4;
    s.equipment.bench = 4;
    const l = layoutOf(s);
    expect(l.used.stove).toBe(4);
    expect(l.used.prep).toBe(4);
    for (const kind of ["stove", "table", "prep", "front"] as const) {
      expect(l.used[kind]).toBeLessThanOrEqual(l.cap[kind]);
    }
  });

  it("门面件买了才占格：锦旗、祖师像这类", () => {
    const s = fresh();
    const before = layoutOf(s).used.front;
    s.gear = [...(s.gear ?? []), "banner", "lucky_statue"];
    expect(layoutOf(s).used.front).toBeGreaterThanOrEqual(Math.min(4, before + 2));
  });

  it("summary 四类齐、每类都是「已用/可用」", () => {
    const text = layoutSummary(fresh());
    expect(text).toContain("灶 ");
    expect(text).toContain("桌 ");
    expect(text).toContain("备料 ");
    expect(text).toContain("门面 ");
    expect(text).toMatch(/灶 \d\/4/);
    expect(text).toMatch(/桌 \d+\/12/);
  });

  it("摆上的格子有短标签，空槽位没有标签", () => {
    const l = layoutOf(fresh());
    for (const c of l.cells) {
      if (c.filled) {
        expect(c.label.length).toBeGreaterThan(0);
        expect(c.kind).not.toBeNull();
      } else {
        expect(c.label).toBe("");
      }
    }
  });

  it("换门面不改格局：同一份状态换 style 后格数不变", () => {
    const s = fresh();
    const a = filledCount(s);
    s.style = "yeshi";
    expect(filledCount(s)).toBe(a);
  });
});
