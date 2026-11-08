import { describe, expect, it } from "vitest";
import { MAX_FRAME_MS, SimClock } from "./clock";

describe("SimClock", () => {
  it("攒满 1000ms 才出一分钟，余数保留", () => {
    const c = new SimClock();
    expect(c.push(200)).toBe(0);
    expect(c.push(200)).toBe(0);
    expect(c.push(200)).toBe(0);
    expect(c.push(200)).toBe(0);
    expect(c.push(200)).toBe(1);
    expect(c.push(250)).toBe(0);
    expect(c.push(250)).toBe(0);
    expect(c.push(250)).toBe(0);
    expect(c.push(250)).toBe(1);
  });

  it("余数跨帧累计，不清零也不重复计", () => {
    const c = new SimClock(100);
    expect(c.push(250)).toBe(2); // 剩 50
    expect(c.push(250)).toBe(3); // 300 → 3，剩 0
    expect(c.push(250)).toBe(2); // 剩 50
  });

  it("超长 delta 被 MAX_FRAME_MS 封顶，不会跳时间", () => {
    const c = new SimClock(100);
    expect(c.push(60_000)).toBe(Math.floor(MAX_FRAME_MS / 100));
  });

  it("非正数与 NaN 不推进", () => {
    const c = new SimClock();
    expect(c.push(0)).toBe(0);
    expect(c.push(-500)).toBe(0);
    expect(c.push(Number.NaN)).toBe(0);
    expect(c.push(Number.POSITIVE_INFINITY)).toBe(0);
  });

  it("60 帧 × 16.7ms 约等于 1 分钟", () => {
    const c = new SimClock();
    let total = 0;
    for (let i = 0; i < 60; i++) total += c.push(16.7);
    expect(total).toBe(1);
  });

  it("构造参数非法时抛错", () => {
    expect(() => new SimClock(0)).toThrow();
    expect(() => new SimClock(-1)).toThrow();
  });
});
