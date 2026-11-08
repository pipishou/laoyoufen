import { audioContext, masterGain, unlockAudio } from "./engine";
import { noise, tone } from "./synth";

/**
 * 程序化音效：不加载任何音频文件，全部用振荡器 + 噪声现场合成。
 * 走开罗式「短、干、笨」的电子音，单条 40-180ms，不拖尾 [COMMON, MED]。
 */

export type SfxId = "ui" | "bowl" | "coin" | "door" | "sad" | "event" | "upgrade" | "month" | "contest";

/** 同一种音效的最小间隔，避免 ×16 倍速下连成噪音墙 */
const MIN_GAP = 0.055;
const lastAt: Partial<Record<SfxId, number>> = {};

export function playSfx(id: SfxId): void {
  if (!audioContext()) unlockAudio();
  const ctx = audioContext();
  const out = masterGain();
  if (!ctx || !out) return;

  const now = ctx.currentTime;
  const prev = lastAt[id];
  if (prev !== undefined && now - prev < MIN_GAP) return;
  lastAt[id] = now;
  const t = now + 0.005;

  switch (id) {
    case "ui":
      tone(ctx, out, "square", 880, t, 0.05, 0.05, 660);
      break;
    case "bowl":
      noise(ctx, out, t, 0.1, 0.05, 900);
      tone(ctx, out, "sine", 240, t, 0.14, 0.09, 120);
      break;
    case "coin":
      tone(ctx, out, "triangle", 1046, t, 0.07, 0.06);
      tone(ctx, out, "triangle", 1568, t + 0.06, 0.1, 0.05);
      break;
    case "door":
      noise(ctx, out, t, 0.08, 0.02, 2400);
      tone(ctx, out, "sine", 523, t, 0.16, 0.05, 494);
      break;
    case "sad":
      tone(ctx, out, "sawtooth", 233, t, 0.22, 0.035, 174);
      break;
    case "event":
      tone(ctx, out, "square", 523, t, 0.09, 0.045);
      tone(ctx, out, "square", 659, t + 0.08, 0.09, 0.045);
      tone(ctx, out, "square", 784, t + 0.16, 0.14, 0.045);
      break;
    case "upgrade":
      tone(ctx, out, "square", 523, t, 0.08, 0.05);
      tone(ctx, out, "square", 659, t + 0.07, 0.08, 0.05);
      tone(ctx, out, "square", 784, t + 0.14, 0.08, 0.05);
      tone(ctx, out, "square", 1046, t + 0.21, 0.18, 0.05);
      break;
    case "month":
      tone(ctx, out, "sine", 196, t, 0.5, 0.09, 147);
      tone(ctx, out, "triangle", 262, t, 0.4, 0.045, 196);
      break;
    case "contest":
      tone(ctx, out, "square", 659, t, 0.08, 0.045);
      tone(ctx, out, "square", 784, t + 0.07, 0.08, 0.045);
      tone(ctx, out, "square", 988, t + 0.14, 0.08, 0.045);
      tone(ctx, out, "square", 1318, t + 0.21, 0.22, 0.05);
      break;
  }
}
