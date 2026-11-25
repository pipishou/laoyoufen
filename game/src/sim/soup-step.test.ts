import { describe, expect, it } from "vitest";
import { soupStages, soupStagesWords } from "./soupbase";
import { createInitialState, type GameState } from "./state";

/**
 * 批 AC′ 起有「哪道工序最吃手」，批 AF′ 把三段全列（解 P408），
 * 并且让配方页与设备页读同一条句子（解 P409）。
 *
 * 判据不是「写了句话」，而是：三段都在、谁最慢就点谁、粉篓论筒、句子不带劝说。
 */

function stoves(s: GameState, level: number): GameState {
  s.equipment.stove = level;
  return s;
}

describe("三段工序（批 AC′ → AF′）", () => {
  it("三段都列出来，顺序是爆香、吊骨汤、冲汤下粉", () => {
    const rows = soupStages(createInitialState("p", 1));
    expect(rows.map((r) => r.step)).toEqual(["爆香", "吊骨汤", "冲汤下粉"]);
    expect(rows.map((r) => r.name)).toEqual(["炒锅", "汤锅", "粉篓"]);
    expect(rows.every((r) => r.minutes > 0)).toBe(true);
  });

  it("开局三口灶没开，卡在爆香", () => {
    const rows = soupStages(createInitialState("p", 1));
    const slow = rows.filter((r) => r.slow);
    expect(slow).toHaveLength(1);
    expect(slow[0].step).toBe("爆香");
    expect(slow[0].count).toBe(1);
  });

  it("灶加满了就轮到汤锅", () => {
    const rows = soupStages(stoves(createInitialState("p", 1), 5));
    expect(rows.find((r) => r.slow)?.step).toBe("吊骨汤");
    // 汤锅还是默认那一口 —— 这时候它真的比五口炒锅慢
    expect(rows.find((r) => r.station === "pot")?.count).toBe(1);
  });

  it("汤锅也加满，最后轮粉篓", () => {
    const s = stoves(createInitialState("p", 1), 5);
    s.equipment.pot = 5;
    expect(soupStages(s).find((r) => r.slow)?.step).toBe("冲汤下粉");
  });

  it("一句里三段都在，末尾点名卡在哪，且不劝买", () => {
    const words = soupStagesWords(stoves(createInitialState("p", 1), 5));
    for (const part of ["爆香", "吊骨汤", "冲汤下粉", "卡在「吊骨汤」", "分"]) {
      expect(words).toContain(part);
    }
    expect(words).not.toMatch(/买|升级|加快|更快|建议/);
  });

  it("粉篓论筒，灶与汤锅论口", () => {
    const rows = soupStages(createInitialState("p", 1));
    const words = soupStagesWords(createInitialState("p", 1));
    expect(rows.find((r) => r.station === "basket")?.station).toBe("basket");
    expect(words).toMatch(/爆香 \d+ 口/);
    expect(words).toMatch(/冲汤下粉 \d+ 筒/);
  });

  it("同一条句子两页共用 —— 同样的状态问两次，结果一字不差", () => {
    const s = createInitialState("p", 7);
    expect(soupStagesWords(s)).toBe(soupStagesWords(s));
    expect(soupStages(s).length).toBe(3);
  });
});
