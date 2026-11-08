/**
 * 全局唯一随机源：mulberry32。
 * 规矩：模拟层任何地方都不得调用 Math.random()，随机数只能从这里取，
 * 且必须把推进后的状态写回 GameState.rng —— 否则存档回放会漂。
 */
export interface RngState {
  /** 32 位无符号内部状态 */
  s: number;
}

export function seedRng(seed: number): RngState {
  return { s: seed >>> 0 };
}

/** 推进并返回一个 32 位无符号整数 */
export function nextU32(rng: RngState): number {
  rng.s = (rng.s + 0x6d2b79f5) >>> 0;
  let t = rng.s;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return (t ^ (t >>> 14)) >>> 0;
}

/** [0, 1) 均匀浮点 */
export function nextFloat(rng: RngState): number {
  return nextU32(rng) / 4294967296;
}

/** 闭区间整数 [min, max] */
export function nextInt(rng: RngState, min: number, max: number): number {
  if (!Number.isInteger(min) || !Number.isInteger(max)) {
    throw new Error("nextInt 只接受整数边界");
  }
  if (max < min) throw new Error(`nextInt 边界反了: ${min}..${max}`);
  const span = max - min + 1;
  return min + (nextU32(rng) % span);
}

/** 按权重取下标；权重非负，总和须大于 0 */
export function nextWeighted(rng: RngState, weights: readonly number[]): number {
  let total = 0;
  for (const w of weights) total += w;
  if (!(total > 0)) throw new Error("nextWeighted 权重总和必须大于 0");
  let roll = nextFloat(rng) * total;
  for (let i = 0; i < weights.length; i++) {
    roll -= weights[i] ?? 0;
    if (roll < 0) return i;
  }
  return weights.length - 1;
}

/** 返回新数组，不改原数组（洗牌也走单一 rng，保证可复现） */
export function shuffled<T>(rng: RngState, items: readonly T[]): T[] {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = nextInt(rng, 0, i);
    const a = out[i] as T;
    const b = out[j] as T;
    out[i] = b;
    out[j] = a;
  }
  return out;
}
