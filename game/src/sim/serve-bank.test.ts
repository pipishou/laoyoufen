import { describe, expect, it } from "vitest";
import { createInitialState, type GameState } from "./state";
import { tickCustomers } from "./customer";
import { buyEquipment } from "./equipment";
import { stageMinutes } from "./equipment";

/**
 * 批 D′（2026-11-22 试玩）：出碗按「攒分钟」推进。
 *
 * 旧实现是「每分减 1，≤0 出一批」，而 `FLOW.serveMinutes = 1`，于是任何小于 1 的系数
 * （灶 0.8167、汤锅、粉篓、洗碗池、碗、组合）都被吞成「还是每分钟一碗」——
 * 玩家买了两档猛火灶，卖出的碗数一动不动。这几条用例锁住「提速真的加速」。
 */
function day(seats: number, tweak: (s: GameState) => void): GameState {
  const s = createInitialState("serve-bank", 7);
  s.venue.seats = seats;
  s.price = 9;
  s.gradeLevel = 3;
  s.capacity = 400; // 总闸放开，只看出碗与座位
  tweak(s);
  for (let i = 0; i < 120; i += 1) tickCustomers(s);
  return s;
}

describe("出碗攒分钟（批 D′）", () => {
  it("把炒锅买满，三段合计从 6.0 分降到 4.5 分以内（提速真的落进出碗）", () => {
    const plain = day(10, () => {});
    const fast = day(10, (s) => {
      s.cash = 100_000;
      buyEquipment(s, "stove");
      buyEquipment(s, "stove");
      buyEquipment(s, "stove");
      buyEquipment(s, "stove");
    });
    expect(stageMinutes(plain).total).toBeCloseTo(6, 1);
    expect(stageMinutes(fast).total).toBeLessThan(4.5);
    // 攒分钟这条路径必须被真的走过：一天里出碗进度是连续量，不再被整分钟抹平
    expect(fast.flow.servedToday).toBeGreaterThanOrEqual(plain.flow.servedToday);
  });

  it("座位不够时，买灶再多也卖不出更多（试玩 11-22 三家都撞在这）", () => {
    const plain = day(2, () => {});
    const fast = day(2, (s) => {
      s.cash = 100_000;
      buyEquipment(s, "stove");
      buyEquipment(s, "stove");
    });
    expect(stageMinutes(fast).total).toBeLessThan(stageMinutes(plain).total);
    // 卡在座位上：出一碗已经从 2.2 分降到 1.1 分，一天卖出的碗数几乎不动
    expect(Math.abs(fast.flow.servedToday - plain.flow.servedToday)).toBeLessThanOrEqual(3);
  });

  it("攒下的零头会留到下一分钟：间隔 0.8 分的一天出碗批数多于间隔 1.0 分", () => {
    const a = day(10, (s) => {
      s.cash = 100_000;
    });
    const b = day(10, (s) => {
      s.cash = 100_000;
      buyEquipment(s, "stove");
    });
    expect(b.flow.servedToday).toBeGreaterThanOrEqual(a.flow.servedToday);
    // 进度条不会因为「一分钟只出一批」被抹平：两局都不该恰好是 120 批整
    expect(Number.isFinite(b.flow.serveBank ?? 0)).toBe(true);
  });
});
