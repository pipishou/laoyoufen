import { describe, expect, it } from "vitest";
import { createInitialState } from "./state";
import { bowlMinutes, cookSlots, inNoodlesNum, serveParallel, serveMultiplier } from "./staff";
import { buyEquipment } from "./equipment";
import { SERVE_MINUTES } from "./customer";

/**
 * 出餐吞吐：开罗 Staff 2 原文是「cooking 高了能**同时煮更多碗**、service 高了能**一次端更多碗**」，
 * 所以产能是**并行槽**，不是「把冷却时间除一下」。
 *
 * 这一组用例锁的是 2026-11-15 那次改动的形状（P35）：
 * 一、`serveParallel` 必须同时受灶位、人手、粉篓三者影响；
 * 二、HUD 显示的「几分/碗」必须等于 `冷却 / 并行槽`，否则玩家看到的和引擎跑的不是一回事。
 */
describe("出餐吞吐＝并行槽（P35）", () => {
  it("新店：1 灶 1 人手 1 粉篓 = 一轮 3 碗（粉篓本来就有几格）", () => {
    const s = createInitialState("serve", 1);
    s.phase = "prep";
    expect(cookSlots(s)).toBe(1);
    expect(inNoodlesNum(s)).toBe(3);
    expect(serveParallel(s)).toBe(3);
  });

  it("加灶但不加人：并行槽不变（多买的锅没人看）", () => {
    const s = createInitialState("serve", 2);
    s.phase = "prep";
    s.venue.stoves = 3;
    expect(serveParallel(s)).toBe(3);
  });

  it("雇一个掌勺后才用得上第二口灶", () => {
    const s = createInitialState("serve", 3);
    s.phase = "prep";
    s.venue.stoves = 2;
    s.staff.roster.push({
      uid: "cook-1",
      name: "阿强",
      role: "cook",
      skill: 60,
      wage: 180,
      fatigue: 0,
      resting: false,
      hiredDay: 0,
    } as never);
    expect(cookSlots(s)).toBe(2);
    // 2 口灶 ×（基础 3 + 技能 60/50 取整 1 = 4 碗/锅）= 8
    expect(inNoodlesNum(s)).toBe(4);
    expect(serveParallel(s)).toBe(8);
  });

  it("粉篓每升一档，一轮多煮一碗", () => {
    const s = createInitialState("serve", 4);
    s.phase = "prep";
    s.cash = 200_000;
    const before = serveParallel(s);
    expect(buyEquipment(s, "strainer").ok).toBe(true);
    expect(serveParallel(s)).toBe(before + 1);
  });

  it("每碗平均时间 = 一轮冷却 / 并行槽，且随并行槽变大而变小", () => {
    const s = createInitialState("serve", 5);
    s.phase = "prep";
    const per = bowlMinutes(s, SERVE_MINUTES, 1);
    expect(per).toBeCloseTo((SERVE_MINUTES * serveMultiplier(s)) / serveParallel(s), 6);
    s.venue.stoves = 2;
    s.staff.roster.push({
      uid: "cook-2",
      name: "阿珍",
      role: "cook",
      skill: 10,
      wage: 130,
      fatigue: 0,
      resting: false,
      hiredDay: 0,
    } as never);
    expect(bowlMinutes(s, SERVE_MINUTES, 1)).toBeLessThan(per);
  });
});
