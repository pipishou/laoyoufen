import { describe, expect, it } from "vitest";
import { advanceMinute, createInitialState, type GameState } from "./state";
import { deserialize, serialize } from "./save";

const MINUTES = 600;

function digest(s: GameState): string {
  const t = s.trend;
  return [
    s.rng.s,
    s.todayCustomers,
    s.totalCustomers,
    s.cash,
    s.day,
    s.month,
    t.sourBamboo,
    t.douchi,
    t.porkOffal,
    t.broth,
  ].join("|");
}

function run(seed: number, minutes = MINUTES): string {
  const s = createInitialState("player-det", seed);
  for (let i = 0; i < minutes; i++) advanceMinute(s);
  return digest(s);
}

describe("确定性", () => {
  it("1000 局：同种子跑两遍摘要完全一致", () => {
    const first: string[] = [];
    const second: string[] = [];
    for (let seed = 0; seed < 1000; seed++) first.push(run(seed));
    for (let seed = 0; seed < 1000; seed++) second.push(run(seed));
    expect(second).toEqual(first);
  });

  it("1000 局：不同种子不应塌缩成同一结局", () => {
    const set = new Set<string>();
    for (let seed = 0; seed < 1000; seed++) set.add(run(seed));
    expect(set.size).toBeGreaterThan(900);
  });

  it("中途存档再续跑，与一口气跑完结果一致", () => {
    for (let seed = 0; seed < 50; seed++) {
      const straight = run(seed);

      const s = createInitialState("player-det", seed);
      for (let i = 0; i < MINUTES / 2; i++) advanceMinute(s);
      const restored = deserialize(serialize(s));
      expect(restored).not.toBeNull();
      if (!restored) return;
      for (let i = 0; i < MINUTES / 2; i++) advanceMinute(restored);
      expect(digest(restored)).toBe(straight);
    }
  });

  it("同样的 (playerId, seed) 得到同样的初始局面", () => {
    expect(createInitialState("p1", 99)).toEqual(createInitialState("p1", 99));
    expect(createInitialState("p1", 99)).not.toEqual(createInitialState("p2", 99));
  });
});
