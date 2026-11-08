import { describe, expect, it } from "vitest";
import { BASE_COST, NOODLE_MATERIALS, SOUP_MATERIALS, TOPPINGS } from "./ingredients";

describe("配料/原料表", () => {
  it("35 种浇头，id 唯一，成本为正，荤素都有", () => {
    expect(TOPPINGS).toHaveLength(35);
    expect(new Set(TOPPINGS.map((t) => t.id)).size).toBe(35);
    for (const t of TOPPINGS) {
      expect(t.cost).toBeGreaterThan(0);
      expect(t.price).toBeGreaterThanOrEqual(0);
      expect(t.charm).toBeGreaterThan(0);
      expect(t.tier).toBeGreaterThanOrEqual(1);
      expect(t.tier).toBeLessThanOrEqual(3);
    }
    expect(TOPPINGS.some((t) => t.kind === "offal")).toBe(true);
    expect(TOPPINGS.some((t) => t.kind === "meat")).toBe(true);
    expect(TOPPINGS.some((t) => t.kind === "veg")).toBe(true);
  });

  it("青菜至少 3 种（用户指出各家店青菜不一样）", () => {
    const greens = TOPPINGS.filter((t) => t.tags.includes("青菜"));
    expect(greens.length).toBeGreaterThanOrEqual(3);
  });

  it("酸笋 / 豆豉 / 辣椒在主料表里（地方标准 DB4501/T 0046—2024）", () => {
    const ids = SOUP_MATERIALS.map((m) => m.id);
    expect(ids).toContain("soup.sourbamboo");
    expect(ids).toContain("soup.douchi");
    expect(ids).toContain("soup.chili");
    expect(ids).toContain("soup.garlic");
  });

  it("粉原料与汤料分开计价，基础成本 = 两者之和", () => {
    const sum =
      SOUP_MATERIALS.reduce((a, m) => a + m.cost, 0) + NOODLE_MATERIALS.reduce((a, m) => a + m.cost, 0);
    expect(BASE_COST).toBeCloseTo(sum, 6);
  });
});
