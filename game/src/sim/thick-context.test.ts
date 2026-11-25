import { describe, expect, it } from "vitest";
import { createInitialState, type DayRecord, type GameState } from "./state";
import { thickContext } from "./soupbase";

/** 造一份「今天打烊单」（批 AH′，解 P405：挂汤那句该带着什么料）。 */
function withDay(thick: number, served: number, taste: number): GameState {
  const s = createInitialState("probe", 1);
  const rec: DayRecord = {
    month: 11,
    day: 20,
    revenue: 320,
    served,
    lost: 0,
    avgSat: 62,
    price: 10,
    taste,
    cash: 5000,
    thick,
  };
  s.dayReport = rec;
  return s;
}

describe("挂汤那句的料（批 AH′）", () => {
  it("垫底那一味说得出是猪脚卤水", () => {
    const ctx = thickContext(withDay(30, 60, 60));
    expect(ctx["底"]).toBe("猪脚卤水");
    expect(ctx["汤"]).toBe("挂得住");
    expect(ctx["嘴"]).toBe("黏");
  });

  it("多少碗走这条路分三档，不报数字", () => {
    expect(thickContext(withDay(40, 50, 60))["多"]).toBe("大半碗都走的这条路");
    expect(thickContext(withDay(15, 50, 60))["多"]).toBe("有几碗走这条路");
    expect(thickContext(withDay(2, 60, 60))["多"]).toBe("只出了一两碗");
  });

  it("当天口味分三档，说的是客人的反应", () => {
    expect(thickContext(withDay(20, 50, 78))["味"]).toBe("回头客说这口味正");
    expect(thickContext(withDay(20, 50, 52))["味"]).toBe("客人吃得下");
    expect(thickContext(withDay(20, 50, 20))["味"]).toBe("有人说口重了");
  });

  it("整块里一个阿拉伯数字都没有 —— 服务端带数量词会丢整句", () => {
    for (const [thick, served, taste] of [
      [0, 0, 0],
      [1, 100, 30],
      [70, 80, 85],
      [999, 1, 99],
    ]) {
      const ctx = thickContext(withDay(thick, served, taste));
      expect(Object.values(ctx).join("")).not.toMatch(/[0-9]/);
      expect(Object.keys(ctx).length).toBe(5);
    }
  });

  it("没有打烊单也问得出话（不报错、不吐 undefined）", () => {
    const s = createInitialState("probe", 1);
    const ctx = thickContext(s);
    expect(Object.values(ctx).join("")).not.toMatch(/undefined|null/);
    expect(ctx["多"]).toBe("只出了一两碗");
  });
});
