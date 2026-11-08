/**
 * 真实毫秒 → 游戏分钟的蓄时器。
 * 抽出来是为了能脱离 Phaser 单测：无头浏览器里 rAF 帧数不可控，
 * 靠截图验不出时钟；逻辑一旦放进 Scene.update 就只能靠肉眼。
 */
export const MS_PER_MINUTE = 1000;

/** 单帧最大计入时长：标签页切后台再回来，delta 可能是几十秒，不封顶会瞬间跳一天 */
export const MAX_FRAME_MS = 250;

export class SimClock {
  private acc = 0;

  constructor(private readonly msPerMinute: number = MS_PER_MINUTE) {
    if (!(msPerMinute > 0)) throw new Error("msPerMinute 必须大于 0");
  }

  /** 返回本次应当推进的整分钟数；余数留到下一帧 */
  push(deltaMs: number): number {
    if (!Number.isFinite(deltaMs) || deltaMs <= 0) return 0;
    this.acc += Math.min(deltaMs, MAX_FRAME_MS);
    const minutes = Math.floor(this.acc / this.msPerMinute);
    this.acc -= minutes * this.msPerMinute;
    return minutes;
  }

  reset(): void {
    this.acc = 0;
  }
}
