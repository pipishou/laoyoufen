import { describe, expect, it } from "vitest";
import { soupStepHeld, soupStepHeldWords } from "./soupbase";
import { createInitialState, type GameState } from "./state";

/**
 * 批 AC′：工序反馈（解 P398）。
 *
 * 判据不是「写了句话」，而是「谁最慢就指谁」—— 这句必须跟着设备走。
 */

function stoves(s: GameState, level: number): GameState {
  s.equipment.stove = level;
  return s;
}

describe("哪道工序最吃手（批 AC′）", () => {
  it("开局三口灶没开，卡在爆香", () => {
    const s = createInitialState("p", 1);
    const held = soupStepHeld(s);
    expect(held.step).toBe("爆香");
    expect(held.station).toBe("炒锅");
    expect(held.count).toBe(1);
  });

  it("灶加满了就轮到汤锅", () => {
    const s = stoves(createInitialState("p", 1), 5);
    const held = soupStepHeld(s);
    expect(held.step).toBe("吊骨汤");
    expect(held.station).toBe("汤锅");
    // 汤锅还是默认那一口 —— 这时候它真的比五口炒锅慢
    expect(held.count).toBe(1);
    expect(soupStepHeldWords(s)).toContain("吊骨汤");
  });

  it("汤锅也加满，最后轮粉篓", () => {
    const s = stoves(createInitialState("p", 1), 5);
    s.equipment.pot = 5;
    const held = soupStepHeld(s);
    expect(held.step).toBe("冲汤下粉");
    expect(held.station).toBe("粉篓");
  });

  it("这句话里必须有步子名与口数，且不劝买什么", () => {
    const s = createInitialState("p", 1);
    const words = soupStepHeldWords(s);
    expect(words).toMatch(/^眼下最吃手的是.+ —— .+ \d+ 口，一段 [\d.]+ 分钟$/);
    expect(words).toContain("爆香");
    expect(words).not.toMatch(/买|升级|加快|更快/);
  });
});
