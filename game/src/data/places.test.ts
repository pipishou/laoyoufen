import { describe, expect, it } from "vitest";
import { PLACES, PLACES_TOTAL, placeById, placeLineOf, placesOf } from "../data/places";
import { DISTRICTS } from "../data/nanning";

describe("二十四张熟面孔（批 N′）", () => {
  it("二十四个地方，每区两个", () => {
    expect(PLACES_TOTAL).toBe(24);
    expect(PLACES).toHaveLength(24);
    expect(new Set(PLACES.map((p) => p.id)).size).toBe(24);
    for (const d of DISTRICTS) expect(placesOf(d.id)).toHaveLength(2);
  });

  it("每条都带可点的出处，名字与说明都写得出东西", () => {
    for (const p of PLACES) {
      expect(p.name.length).toBeGreaterThan(1);
      expect(p.note.length).toBeGreaterThan(6);
      expect(p.source.label.length).toBeGreaterThan(2);
      expect(p.source.url).toMatch(/^https?:\/\//);
      expect(["day", "night", "street"]).toContain(p.kind);
    }
  });

  it("早市排在夜市前面（地图上先写白天去的那处）", () => {
    for (const d of DISTRICTS) {
      const list = placesOf(d.id);
      const order = { day: 0, street: 1, night: 2 } as const;
      expect(order[list[0]!.kind]).toBeLessThanOrEqual(order[list[1]!.kind]);
    }
  });

  it("一行说明里带得出两个地名", () => {
    const line = placeLineOf("xingning");
    expect(line).toContain("中山路夜市");
    expect(line).toContain("朝阳广场");
    expect(placeLineOf("nope")).toBe("");
  });

  it("查不到就是 null", () => {
    expect(placeById("pl.dancun")?.name).toBe("淡村市场");
    expect(placeById("nope")).toBeNull();
  });
});
