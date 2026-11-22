import { describe, expect, it } from "vitest";
import { GUANGXI } from "./balance";
import { BASE_COST, NOODLE_MATERIALS, SOUP_MATERIALS, TOPPINGS } from "./ingredients";

describe("配料/原料表", () => {
  it("20 种浇头，id 唯一，成本为正，荤素都有", () => {
    expect(TOPPINGS).toHaveLength(20);
    expect(new Set(TOPPINGS.map((t) => t.id)).size).toBe(20);
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

  it("每条浇头都带出处，出处是 http 链接加原文摘句", () => {
    // 2026-11-22 审计：没有出处的浇头一律不进表（紫苏、酸豆角、猪红、五花肉、
    // 牛百叶、牛肉丸、牛杂、腐竹、花生等 17 条已删）。这条测试就是那道门。
    for (const t of TOPPINGS) {
      expect(t.source, `${t.name} 缺出处`).toBeTruthy();
      expect(t.source!.length, `${t.name} 出处为空`).toBeGreaterThan(0);
      for (const src of t.source!) {
        expect(src.url, `${t.name} 的出处没有链接`).toMatch(/^https?:\/\//);
        expect(src.label.length).toBeGreaterThan(2);
        expect(src.quote.length).toBeGreaterThan(4);
      }
    }
  });

  it("青菜只留实录里真有的两样：生菜、豆芽", () => {
    const greens = TOPPINGS.filter((t) => t.tags.includes("青菜")).map((t) => t.name);
    expect(new Set(greens)).toEqual(new Set(["生菜", "豆芽"]));
  });

  it("牛腩在表里，但标成加菜而不是老友粉本体", () => {
    const brisket = TOPPINGS.find((t) => t.id === "top.brisket");
    expect(brisket).toBeTruthy();
    expect(brisket!.note ?? "").toContain("加菜");
  });

  it("被删掉的 17 条不再出现（牛腩粉、螺蛳粉的东西不许混进来）", () => {
    const gone = [
      "top.perilla", "top.suandoujiao", "top.kongxincai", "top.youmaicai", "top.caixin",
      "top.watercress", "top.muer", "top.daylily", "top.luobogan", "top.pigblood",
      "top.porkknuckle", "top.porkbelly", "top.beefoffal", "top.tripe", "top.beefball",
      "top.fuzhu", "top.peanut",
    ];
    const ids = new Set(TOPPINGS.map((t) => t.id));
    for (const id of gone) expect(ids.has(id), `${id} 不该还在`).toBe(false);
  });

  it("酸笋 / 豆豉 / 辣椒在主料表里（地方标准 DB4501/T 0046—2024）", () => {
    const ids = SOUP_MATERIALS.map((m) => m.id);
    expect(ids).toContain("soup.sourbamboo");
    expect(ids).toContain("soup.douchi");
    expect(ids).toContain("soup.chili");
    expect(ids).toContain("soup.garlic");
  });

  it("基础成本 = 一碗的料钱（南宁现实 4.2 元），不是所有料加总", () => {
    // 2026-11-14 修正：旧实现把「全部汤料 + 全部粉料」加总当一碗成本（≈6.3），
    // 等于每碗都放了所有料。改为按现实单碗料钱取 GUANGXI.bowlCostYuan。
    const allMaterials =
      SOUP_MATERIALS.reduce((a, m) => a + m.cost, 0) + NOODLE_MATERIALS.reduce((a, m) => a + m.cost, 0);
    expect(BASE_COST).toBeCloseTo(GUANGXI.bowlCostYuan, 6);
    // 一碗不可能用完全部料：料表加总必须明显高于单碗成本（现实 1.25 倍以上）
    expect(allMaterials / BASE_COST).toBeGreaterThan(1.25);
  });
});
