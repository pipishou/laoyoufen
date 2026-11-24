import { describe, expect, it } from "vitest";
import { LOCALS, LOCAL_TOTAL, localById, localOfDistrict } from "../data/local";
import { MAP_RINGS, MAP_SPOTS, ringOfSpot, visibleRingOf } from "../data/map";
import { createInitialState, SAVE_VERSION } from "./state";
import { localCostFactor, localNow, localPatienceMult, localSideCostFactor, localSummary, localWords } from "./local";

function fresh() {
  return createInitialState("p1", 3);
}

describe("物产（批次九）", () => {
  it("三处物产，都是南宁的区", () => {
    expect(LOCAL_TOTAL).toBe(3);
    expect(new Set(LOCALS.map((l) => l.district)).size).toBe(3);
    for (const l of LOCALS) expect(l.district.length).toBeGreaterThan(3);
  });

  it("每处都有出处，出处带 http 与原文", () => {
    for (const l of LOCALS) {
      expect(l.source.length).toBeGreaterThan(0);
      for (const src of l.source) {
        expect(src.url.startsWith("http")).toBe(true);
        expect(src.quote.length).toBeGreaterThan(10);
      }
    }
  });

  it("每处至少改一个出口，且幅度不超过 3%", () => {
    for (const l of LOCALS) {
      const vals = [l.effect.costPct, l.effect.sideCostPct, l.effect.patiencePct].filter(
        (v): v is number => typeof v === "number",
      );
      expect(vals.length).toBeGreaterThan(0);
      for (const v of vals) expect(Math.abs(v)).toBeLessThanOrEqual(0.03);
    }
  });

  it("没有「全是好处」的物产：每处都要么只改一项，要么幅度小", () => {
    for (const l of LOCALS) {
      const n = [l.effect.costPct, l.effect.sideCostPct, l.effect.patiencePct].filter(
        (v) => typeof v === "number",
      ).length;
      expect(n).toBe(1);
    }
  });

  it("坏 id 返回 null，区名查得到", () => {
    expect(localById("nope")).toBeNull();
    expect(localOfDistrict("mashan")?.name).toBe("马山八角");
    expect(localOfDistrict("xingning")).toBeNull();
  });

  it("新局在兴宁，什么物产都没有，三个乘数都是 1", () => {
    const s = fresh();
    expect(s.district).toBe("xingning");
    expect(localNow(s)).toBeNull();
    expect(localCostFactor(s)).toBe(1);
    expect(localSideCostFactor(s)).toBe(1);
    expect(localPatienceMult(s)).toBe(1);
    expect(localSummary(s)).toContain("没什么特别");
  });

  it("搬到马山：料钱降两个点，其余不动", () => {
    const s = fresh();
    s.district = "mashan";
    expect(localCostFactor(s)).toBeCloseTo(0.98, 5);
    expect(localSideCostFactor(s)).toBe(1);
    expect(localPatienceMult(s)).toBe(1);
    expect(localSummary(s)).toContain("马山八角");
  });

  it("搬到武鸣：饮料成本降三个点；搬到横州：耐心涨三个点", () => {
    const s = fresh();
    s.district = "wuming";
    expect(localSideCostFactor(s)).toBeCloseTo(0.97, 5);
    s.district = "hengzhou";
    expect(localPatienceMult(s)).toBeCloseTo(1.03, 5);
  });

  it("文案不写百分号以外的花哨符号，负数用「−」", () => {
    const def = LOCALS[0]!;
    const w = localWords(def);
    expect(w).toContain("料钱");
    expect(w).toContain("−2%");
    expect(w.includes("-2%")).toBe(false);
  });
});

describe("地图四圈（批次九）", () => {
  it("四圈，门槛递增，第一圈从段 0 就开", () => {
    expect(MAP_RINGS.length).toBe(4);
    expect(MAP_RINGS[0]!.gate).toBe(0);
    for (let i = 1; i < MAP_RINGS.length; i += 1) {
      expect(MAP_RINGS[i]!.gate).toBeGreaterThan(MAP_RINGS[i - 1]!.gate);
    }
  });

  it("十二格都归了圈，每圈都有人", () => {
    for (const spot of MAP_SPOTS) expect([1, 2, 3, 4]).toContain(ringOfSpot(spot.id));
    for (const r of MAP_RINGS) expect(MAP_SPOTS.some((sp) => ringOfSpot(sp.id) === r.ring)).toBe(true);
  });

  it("方位锁：最贵的三个区在城心圈", () => {
    expect(ringOfSpot("qingxiu")).toBe(4);
    expect(ringOfSpot("jiangnan")).toBe(4);
    expect(ringOfSpot("xixiangtang")).toBe(4);
    expect(ringOfSpot("mashan")).toBe(1);
  });

  it("段位决定看得见第几圈：0→1、2→2、4→3、6→4，再高也是 4", () => {
    expect(visibleRingOf(0)).toBe(1);
    expect(visibleRingOf(1)).toBe(1);
    expect(visibleRingOf(2)).toBe(2);
    expect(visibleRingOf(3)).toBe(2);
    expect(visibleRingOf(4)).toBe(3);
    expect(visibleRingOf(6)).toBe(4);
    expect(visibleRingOf(10)).toBe(4);
  });

  it("存档版本到 35", () => {
    expect(SAVE_VERSION).toBe(37);
  });
});
