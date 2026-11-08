import { describe, expect, it } from "vitest";
import { nextFloat, nextInt, nextU32, nextWeighted, seedRng, shuffled } from "./rng";

describe("rng", () => {
  it("同种子产生同序列", () => {
    const a = seedRng(12345);
    const b = seedRng(12345);
    const seqA = Array.from({ length: 32 }, () => nextU32(a));
    const seqB = Array.from({ length: 32 }, () => nextU32(b));
    expect(seqA).toEqual(seqB);
  });

  it("不同种子产生不同序列", () => {
    const a = seedRng(1);
    const b = seedRng(2);
    const seqA = Array.from({ length: 32 }, () => nextU32(a));
    const seqB = Array.from({ length: 32 }, () => nextU32(b));
    expect(seqA).not.toEqual(seqB);
  });

  it("nextU32 落在 32 位无符号区间", () => {
    const rng = seedRng(7);
    for (let i = 0; i < 5000; i++) {
      const v = nextU32(rng);
      expect(Number.isInteger(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(0xffffffff);
    }
  });

  it("nextFloat 落在 [0,1)", () => {
    const rng = seedRng(9);
    for (let i = 0; i < 5000; i++) {
      const v = nextFloat(rng);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it("nextInt 闭区间且能取到两端", () => {
    const rng = seedRng(42);
    const seen = new Set<number>();
    for (let i = 0; i < 5000; i++) {
      const v = nextInt(rng, 3, 7);
      expect(v).toBeGreaterThanOrEqual(3);
      expect(v).toBeLessThanOrEqual(7);
      seen.add(v);
    }
    expect(seen).toEqual(new Set([3, 4, 5, 6, 7]));
  });

  it("nextInt 边界非法时抛错", () => {
    const rng = seedRng(1);
    expect(() => nextInt(rng, 5, 1)).toThrow();
    expect(() => nextInt(rng, 0.5, 2)).toThrow();
  });

  it("nextWeighted 只返回有效下标", () => {
    const rng = seedRng(2024);
    for (let i = 0; i < 2000; i++) {
      const idx = nextWeighted(rng, [0, 5, 0, 5]);
      expect(idx === 1 || idx === 3).toBe(true);
    }
  });

  it("shuffled 是排列且不改原数组", () => {
    const rng = seedRng(77);
    const src = [1, 2, 3, 4, 5, 6, 7, 8];
    const out = shuffled(rng, src);
    expect(src).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect([...out].sort((x, y) => x - y)).toEqual(src);
  });
});
