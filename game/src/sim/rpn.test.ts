import { describe, expect, it } from "vitest";
import { evalRpn, isOperator, RpnError } from "./rpn";

describe("RPN 求值器", () => {
  it("报告 §4 的样例一：(s0/30 + n0/50)/2", () => {
    expect(evalRpn(["s0", "30", "/", "n0", "50", "/", "+", "2", "/"], { s0: 60, n0: 50 })).toBe(1.5);
  });

  it("报告 §4 的样例二：s0*(n4+1)/50/2", () => {
    expect(evalRpn(["s0", "n4", "1", "+", "*", "50", "/", "2", "/"], { s0: 50, n4: 35 })).toBe(18);
  });

  it("报告 §4 的样例三（惩罚项）：(n1*120 - s7*80)/100/2", () => {
    expect(evalRpn(["n1", "120", "*", "s7", "80", "*", "-", "100", "/", "2", "/"], { n1: 50, s7: 50 })).toBe(10);
  });

  it("支持一元 abs / neg 与 min / max", () => {
    expect(evalRpn(["5", "8", "-", "abs"], {})).toBe(3);
    expect(evalRpn(["7", "neg"], {})).toBe(-7);
    expect(evalRpn(["5", "8", "min"], {})).toBe(5);
    expect(evalRpn(["5", "8", "max"], {})).toBe(8);
  });

  it("除零返回 0 而不是 Infinity", () => {
    expect(evalRpn(["5", "0", "/"], {})).toBe(0);
  });

  it("变量名优先于数字解析，未知 token 抛错", () => {
    expect(evalRpn(["n6"], { n6: 2 })).toBe(2);
    expect(() => evalRpn(["w1"], {})).toThrow(RpnError);
  });

  it("栈不平衡抛错（含下溢与终态多值）", () => {
    expect(() => evalRpn(["1", "2"], {})).toThrow(RpnError);
    expect(() => evalRpn(["+", "1"], {})).toThrow(RpnError);
    expect(() => evalRpn([], {})).toThrow(RpnError);
  });

  it("isOperator 只认已注册算子", () => {
    expect(isOperator("+")).toBe(true);
    expect(isOperator("abs")).toBe(true);
    expect(isOperator("s0")).toBe(false);
  });
});
