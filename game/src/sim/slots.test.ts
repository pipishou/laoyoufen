import { describe, expect, it } from "vitest";
import { SLOTS, SLOT_COUNT, STAGE_CELLS, STAGE_H, STAGE_W } from "../data/slots";
import { createInitialState } from "./state";
import {
  announceSlotSets,
  filledCount,
  layoutOf,
  layoutSummary,
  slotAttractMult,
  slotPatienceMult,
  slotSetSummary,
  slotSetViews,
  slotSetWords,
  stageCells,
} from "./slots";

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

  it("28 个槽位：灶 6 · 桌 12 · 备料 6 · 门面 4（批 BB1′：灶位补到六格）", () => {
    expect(SLOTS).toHaveLength(28);
    expect(SLOT_COUNT).toEqual({ stove: 6, table: 12, prep: 6, front: 4 });
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
    // 批 BB1′：设备第 4 档对应 `PARALLEL_BY_TIER.wok[4]` = 5 口；第 5 档（黄金灶）6 口
    expect(l.used.stove).toBe(5);
    expect(l.used.prep).toBe(4);
    for (const kind of ["stove", "table", "prep", "front"] as const) {
      expect(l.used[kind]).toBeLessThanOrEqual(l.cap[kind]);
    }
  });

  it("黄金灶开到六口时，图上真的画得出六个灶位（批 BB1′ 解体检 P-B）", () => {
    const s = fresh();
    s.equipment.stove = 5;
    const l = layoutOf(s);
    expect(l.used.stove).toBe(6);
    expect(l.cap.stove).toBe(6);
    const stoveCells = l.cells.filter((c) => c.kind === "stove");
    expect(stoveCells).toHaveLength(6);
    expect(stoveCells.every((c) => c.filled)).toBe(true);
    // 标签从「灶1」到「灶6」，一个不多一个不少
    expect(stoveCells.map((c) => c.label).sort()).toEqual(["灶1", "灶2", "灶3", "灶4", "灶5", "灶6"]);
  });

  it("门面件买了才占格：锦旗、祖师像这类", () => {
    const s = fresh();
    const before = layoutOf(s).used.front;
    s.gear = [...(s.gear ?? []), "banner", "lucky_statue"];
    expect(layoutOf(s).used.front).toBeGreaterThanOrEqual(Math.min(4, before + 2));
  });

  it("summary 四类齐、每类都是「已用/可用」，第一格叫「炒锅」不叫「灶」", () => {
    const text = layoutSummary(fresh());
    // 批 BB1′（解体检 P-B）：店面页抬头那个「灶 N」是扩建买来的灶位（1–3），
    // 这一格数的是设备炒锅口数（1–6）—— 两个都叫「灶」玩家分不清，所以改叫「炒锅」。
    expect(text).toContain("炒锅 ");
    expect(text).not.toMatch(/灶 \d\/\d/);
    expect(text).toContain("桌 ");
    expect(text).toContain("备料 ");
    expect(text).toContain("门面 ");
    expect(text).toMatch(/炒锅 \d\/6/);
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

describe("成套度（批 J′，解 P290）", () => {
  it("新局六条都没凑齐，进度从 0 起", () => {
    const s = fresh();
    const vs = slotSetViews(s);
    expect(vs).toHaveLength(6);
    expect(vs.every((v) => !v.done)).toBe(true);
    expect(vs[0]!.progress).toContain("/ 6");
    expect(slotSetSummary(s)).toBe("成套 0 / 6");
  });

  it("桌子六张 → 耐心 +12%，座位一个都不白送（批 P′，解 P301）", () => {
    const s = fresh();
    expect(slotPatienceMult(s)).toBe(1);
    s.venue.seats = 6;
    expect(slotPatienceMult(s)).toBeCloseTo(1.12, 5);
    // 座位是花钱买的（矮凳 ¥150 / 躺椅 ¥150），成套只管气氛
    expect(s.venue.seats).toBe(6);
  });

  it("凑齐只报一声：第一次给一条，第二次空", () => {
    const s = fresh();
    s.venue.seats = 6;
    const first = announceSlotSets(s);
    expect(first.map((d) => d.id)).toContain("room_done");
    expect(announceSlotSets(s)).toHaveLength(0);
  });

  it("桌子不够就不报，也不写标记", () => {
    const s = fresh();
    s.venue.seats = 5;
    expect(announceSlotSets(s)).toHaveLength(0);
    expect(s.flow.slotsAnnounced).toBeUndefined();
  });

  it("门面四件齐了：进店 +4%，且是常驻", () => {
    const s = fresh();
    expect(slotAttractMult(s)).toBe(1);
    s.gear = ["banner", "lucky_statue", "aroma_fan", "wall_fan"];
    expect(slotAttractMult(s)).toBeCloseTo(1.04, 5);
    expect(slotSetSummary(s)).toContain("1 / 6");
  });

  it("六条的奖励只走耐心与进店两个出口，句子都带因果", () => {
    const vs = slotSetViews(fresh());
    expect(slotSetWords(vs[0]!)).toContain("耐心 +12%");
    expect(slotSetWords(vs[5]!)).toContain("进店 +4%");
    for (const v of vs) {
      expect(v.def.line.length).toBeGreaterThan(8);
      const p = v.def.patiencePct ?? 0;
      const a = v.def.attractPct ?? 0;
      // 只给这两个出口，且每条只给一个（不给第六层乘数）
      expect(p > 0 !== a > 0).toBe(true);
    }
  });

  it("灶排开、案子摆开、灶桌对上号、门口一条街：四条新成套各认自己的条件", () => {
    const s = fresh();
    s.equipment.stove = 3;
    const ids = () => slotSetViews(s).filter((v) => v.done).map((v) => v.def.id);
    expect(ids()).toContain("wok_done");
    expect(ids()).not.toContain("prep_done");
    s.equipment.bench = 4;
    expect(ids()).toContain("prep_done");
    s.venue.seats = 8;
    expect(ids()).toContain("full_house");
    s.gear = ["banner", "lucky_statue", "aroma_fan", "wall_fan"];
    expect(ids()).toContain("lane_show");
    expect(slotSetSummary(s)).toBe("成套 6 / 6");
    // 四条新成套加起来：耐心 +8%（灶 3 + 满堂 5）、进店 +7%（案子 3 + 门口 4）
    expect(slotPatienceMult(s)).toBeCloseTo(1 + 0.12 + 0.03 + 0.05, 5);
    expect(slotAttractMult(s)).toBeCloseTo(1 + 0.04 + 0.03 + 0.04, 5);
  });
});
