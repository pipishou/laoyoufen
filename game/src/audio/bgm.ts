import { audioContext, masterGain, unlockAudio } from "./engine";
import { midiHz, noise, tone } from "./synth";

/**
 * 开罗式循环 BGM：138 BPM、C 大调、8 小节、方波主旋律 + 三角波贝斯 + 轻鼓。
 * 不用音频文件，靠 WebAudio 现场排程；没有随机，每次听都一样。
 *
 * 风格依据：开罗系列配乐是短循环、明亮大调、跳跃贝斯、刻意笨拙的方波音色
 * [COMMON, MED]；这里只复刻「听感配方」，不复制任何具体旋律。
 */

const BPM = 138;
const STEP_DUR = 60 / BPM / 2;
const TOTAL_STEPS = 64;

const LEAD: readonly (number | null)[] = [
  72, null, 76, 79, 76, 74, 72, null,
  74, null, 77, 81, 79, 77, 76, null,
  76, 79, 81, 79, 76, 74, 72, null,
  74, 72, 69, null, 72, 74, 76, null,
  72, 76, 79, 84, 81, 79, 76, null,
  77, 76, 74, 72, 74, 76, 79, null,
  81, 79, 76, 74, 72, 74, 76, 79,
  72, null, 67, null, 72, null, 76, null,
];

const BASS: readonly (number | null)[] = [
  48, null, null, null, 43, null, null, null,
  48, null, null, null, 45, null, null, null,
  41, null, null, null, 48, null, null, null,
  43, null, null, null, 50, null, null, null,
  48, null, null, null, 43, null, null, null,
  45, null, null, null, 48, null, null, null,
  41, null, null, null, 43, null, null, null,
  48, null, null, null, 43, null, null, null,
];

const CHORDS: readonly (readonly number[])[] = [
  [60, 64, 67],
  [57, 60, 64],
  [53, 57, 60],
  [55, 59, 62],
  [60, 64, 67],
  [57, 60, 64],
  [53, 57, 60],
  [60, 64, 67],
];

let timer: number | null = null;
let out: GainNode | null = null;
let nextTime = 0;
let stepIndex = 0;

export function isBgmPlaying(): boolean {
  return timer !== null;
}

export function startBgm(): void {
  unlockAudio();
  const ctx = audioContext();
  const master = masterGain();
  if (!ctx || !master || timer !== null) return;
  out = ctx.createGain();
  out.gain.value = 0.14;
  out.connect(master);
  nextTime = ctx.currentTime + 0.08;
  stepIndex = 0;
  timer = window.setInterval(tick, 30);
}

export function stopBgm(): void {
  if (timer !== null) window.clearInterval(timer);
  timer = null;
  if (out) {
    try {
      out.disconnect();
    } catch {
      // 已断开
    }
    out = null;
  }
}

function schedule(ctx: AudioContext, bus: AudioNode, step: number, at: number): void {
  const lead = LEAD[step];
  if (lead !== null && lead !== undefined) {
    tone(ctx, bus, "square", midiHz(lead), at, 0.16, 0.05);
  }

  const bass = BASS[step];
  if (bass !== null && bass !== undefined) {
    tone(ctx, bus, "triangle", midiHz(bass), at, STEP_DUR * 1.6, 0.075);
  }

  const bar = Math.floor(step / 8);
  const inBar = step % 8;
  if (inBar === 2 || inBar === 6) {
    const chord = CHORDS[bar] ?? CHORDS[0];
    if (chord) {
      for (const note of chord) tone(ctx, bus, "square", midiHz(note), at, 0.08, 0.012);
    }
  }

  if (inBar === 0 || inBar === 4) {
    tone(ctx, bus, "sine", 120, at, 0.09, 0.08, 55);
  }
  if (inBar === 4) {
    noise(ctx, bus, at, 0.05, 0.02, 2500);
  }
  noise(ctx, bus, at, 0.02, inBar % 2 === 0 ? 0.012 : 0.007, 6000);
}

function tick(): void {
  const ctx = audioContext();
  const bus = out;
  if (!ctx || !bus) return;
  while (nextTime < ctx.currentTime + 0.18) {
    schedule(ctx, bus, stepIndex, nextTime);
    stepIndex = (stepIndex + 1) % TOTAL_STEPS;
    nextTime += STEP_DUR;
  }
}
