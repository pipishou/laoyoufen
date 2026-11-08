/** 合成原语：振荡器单音与确定性噪声。sfx 与 bgm 共用。 */

let noiseSeed = 0x2f6e2b1;

/** 确定性噪声：不用 Math.random，音频也不污染「同种子同结局」的约定 */
export function noiseSample(): number {
  noiseSeed = (Math.imul(noiseSeed, 1664525) + 1013904223) >>> 0;
  return (noiseSeed / 0xffffffff) * 2 - 1;
}

export function midiHz(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

export function tone(
  ctx: AudioContext,
  out: AudioNode,
  type: OscillatorType,
  freq: number,
  at: number,
  dur: number,
  gain: number,
  slideTo?: number,
): void {
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, at);
  if (slideTo !== undefined) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), at + dur);
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), at + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  osc.connect(g).connect(out);
  osc.start(at);
  osc.stop(at + dur + 0.03);
}

export function noise(
  ctx: AudioContext,
  out: AudioNode,
  at: number,
  dur: number,
  gain: number,
  hp: number,
): void {
  const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
  const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = noiseSample() * (1 - i / len);
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  const filter = ctx.createBiquadFilter();
  filter.type = "highpass";
  filter.frequency.value = hp;
  const g = ctx.createGain();
  g.gain.value = gain;
  src.connect(filter).connect(g).connect(out);
  src.start(at);
}
