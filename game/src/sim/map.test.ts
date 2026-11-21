import { describe, expect, it } from "vitest";
import { MAP_H, MAP_SPOTS, MAP_W, shortNameOf } from "../data/map";
import { DISTRICTS } from "../data/nanning";
import { districtPitchOf, mapCells, mapSize, mapSummary, unvisitedDistricts } from "./map";
import { createInitialState, type GameState } from "./state";

function fresh(): GameState {
  return createInitialState("map-test", 3);
}

describe("南宁轻地图（A10）", () => {
  it("十二个区各占一格，格子在 6×4 里且不重叠", () => {
    expect(MAP_SPOTS.length).toBe(12);
    expect(MAP_SPOTS.length).toBe(DISTRICTS.length);
    expect(mapSize()).toEqual({ w: MAP_W, h: MAP_H });
    const seen = new Set<string>();
    for (const s of MAP_SPOTS) {
      expect(s.x).toBeGreaterThanOrEqual(0);
      expect(s.x).toBeLessThan(MAP_W);
      expect(s.y).toBeGreaterThanOrEqual(0);
      expect(s.y).toBeLessThan(MAP_H);
      const key = `${s.x},${s.y}`;
      expect(seen.has(key)).toBe(false);
      seen.add(key);
    }
  });

  it("方位大致对：马山在西北、青秀在东南、武鸣在北", () => {
    const at = (id: string) => MAP_SPOTS.find((s) => s.id === id)!;
    expect(at("mashan").x).toBeLessThan(at("xingning").x);
    expect(at("mashan").y).toBeLessThan(at("xingning").y);
    expect(at("qingxiu").x).toBeGreaterThan(at("xingning").x);
    expect(at("wuming").y).toBeLessThan(at("yongning").y);
  });

  it("短名去掉行政后缀，全名保留", () => {
    expect(shortNameOf("兴宁区")).toBe("兴宁");
    expect(shortNameOf("横州市")).toBe("横州");
    expect(shortNameOf("马山县")).toBe("马山");
  });

  it("开局只有所在的区亮「在这」，没有分店", () => {
    const s = fresh();
    const cells = mapCells(s);
    expect(cells.filter((c) => c.here).length).toBe(1);
    expect(cells.find((c) => c.here)!.id).toBe(s.district);
    expect(cells.filter((c) => c.branch).length).toBe(0);
    expect(cells.every((c) => c.traffic > 0)).toBe(true);
  });

  it("有分店的区标出来，且不会再算「还没去过」", () => {
    const s = fresh();
    s.branches = [
      { id: "b1", district: "qingxiu", size: "small", since: 0, warmth: 0.6, bowlsTotal: 0 },
    ] as GameState["branches"];
    const cells = mapCells(s);
    expect(cells.find((c) => c.id === "qingxiu")!.branch).toBe(true);
    const left = unvisitedDistricts(s).map((d) => d.id);
    expect(left).not.toContain("qingxiu");
    expect(left).not.toContain(s.district);
    expect(left.length).toBe(10);
  });

  it("同行数字只落在当前区（RivalState 没有区字段）", () => {
    const s = fresh();
    const cells = mapCells(s);
    const withRivals = cells.filter((c) => c.rivals > 0);
    expect(withRivals.length).toBe(1);
    expect(withRivals[0]!.id).toBe(s.district);
    s.rivals = (s.rivals ?? []).map((r) => ({ ...r, closed: true }));
    expect(mapCells(s).filter((c) => c.rivals > 0).length).toBe(0);
  });

  it("摘要说清「我在哪、几家分店、谁在抢」", () => {
    const s = fresh();
    const txt = mapSummary(s);
    expect(txt).toContain("分店 0 家");
    expect(txt).toContain("在");
    expect(txt.length).toBeGreaterThan(6);
  });

  it("还没去过的区按人流降序，青秀排第一", () => {
    const s = fresh();
    const left = unvisitedDistricts(s);
    expect(left[0]!.id).toBe("qingxiu");
    expect(left[0]!.traffic).toBeGreaterThan(left[left.length - 1]!.traffic);
  });

  it("区县一句话能取到，坏 id 不抛", () => {
    expect(districtPitchOf("xingning")).toContain("老城");
    expect(districtPitchOf("nope")).toBe("");
  });
});
