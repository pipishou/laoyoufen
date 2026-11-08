import { describe, expect, it } from "vitest";
import { deserialize, serialize } from "./save";
import { createInitialState, makeConnectCode, SAVE_VERSION } from "./state";

describe("save", () => {
  it("序列化再反序列化得到等价状态", () => {
    const s = createInitialState("player-abc", 1234);
    const back = deserialize(serialize(s));
    expect(back).not.toBeNull();
    expect(back).toEqual(s);
  });

  it("负数现金等合法值不被误杀", () => {
    const s = createInitialState("player-neg", 5);
    s.cash = -320.5;
    const back = deserialize(serialize(s));
    expect(back?.cash).toBe(-320.5);
  });

  it("版本不匹配一律拒绝", () => {
    const s = createInitialState("player-v", 1);
    s.saveVersion = SAVE_VERSION + 1;
    expect(deserialize(serialize(s))).toBeNull();
  });

  it("坏 JSON 与结构缺失一律返回 null", () => {
    expect(deserialize("{not json")).toBeNull();
    expect(deserialize("null")).toBeNull();
    expect(deserialize("[]")).toBeNull();
    expect(deserialize(JSON.stringify({ saveVersion: SAVE_VERSION }))).toBeNull();
  });

  it("配方长度不对拒绝", () => {
    const s = createInitialState("player-recipe", 2);
    const broken = JSON.parse(serialize(s)) as Record<string, unknown>;
    (broken.recipe as Record<string, unknown>).soup = [1, 2, 3];
    expect(deserialize(JSON.stringify(broken))).toBeNull();
  });

  it("接续码是 6 位且由 playerId 唯一决定", () => {
    const code = makeConnectCode("player-fixed");
    expect(code).toHaveLength(6);
    expect(code).toMatch(/^[2-9A-HJ-NP-Z]{6}$/);
    expect(makeConnectCode("player-fixed")).toBe(code);
    expect(makeConnectCode("player-other")).not.toBe(code);
  });
});
