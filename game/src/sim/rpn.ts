/**
 * 栈式后缀（RPN）求值器 —— 对应 REA 取证报告 §4/G3 的「ramencalc 脚本 VM」。
 *
 * 复用的是**编码结构与算子形状**，不是原表数值：
 * 原表 101 条程序我逐条核过，单元格分组数不等（3~6 组），
 * 且 `RamenCalc.Analysis` 的方法体不在 dump.cs 里（只有 RVA 偏移），
 * 所以「哪一列对应哪个维度」无法静态确定。这里只用同一套编码重新立表，
 * 语义由本项目自己定义并单测锁死。
 *
 * 程序格式：`["s0", "55", "-", "abs", "2", "*", "100", "-"]`
 * token 三类：数字字面量 / 变量名 / 算子。
 */
export type RpnProgram = readonly string[];

type Arity1 = (a: number) => number;
type Arity2 = (a: number, b: number) => number;

const UNARY: Record<string, Arity1> = {
  abs: (a) => Math.abs(a),
  neg: (a) => -a,
};

const BINARY: Record<string, Arity2> = {
  "+": (a, b) => a + b,
  "-": (a, b) => a - b,
  "*": (a, b) => a * b,
  "/": (a, b) => (b === 0 ? 0 : a / b),
  min: Math.min,
  max: Math.max,
};

export class RpnError extends Error {}

export function isOperator(token: string): boolean {
  return token in UNARY || token in BINARY;
}

export function evalRpn(program: RpnProgram, vars: Readonly<Record<string, number>>): number {
  if (program.length === 0) throw new RpnError("空程序");
  const stack: number[] = [];

  for (const token of program) {
    if (token in BINARY) {
      if (stack.length < 2) throw new RpnError(`栈下溢: ${token}`);
      const b = stack.pop() as number;
      const a = stack.pop() as number;
      stack.push((BINARY[token] as Arity2)(a, b));
      continue;
    }
    if (token in UNARY) {
      if (stack.length < 1) throw new RpnError(`栈下溢: ${token}`);
      stack.push((UNARY[token] as Arity1)(stack.pop() as number));
      continue;
    }
    if (typeof vars[token] === "number") {
      stack.push(vars[token] as number);
      continue;
    }
    const num = Number(token);
    if (Number.isFinite(num)) {
      stack.push(num);
      continue;
    }
    throw new RpnError(`未知 token: ${token}`);
  }

  if (stack.length !== 1) throw new RpnError(`终态栈深应为 1，实际 ${stack.length}`);
  const out = stack[0] as number;
  if (!Number.isFinite(out)) throw new RpnError("求值结果为非有限数");
  return out;
}
