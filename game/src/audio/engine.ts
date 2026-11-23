/**
 * 音频总线：懒加载 AudioContext、总音量、静音持久化。
 *
 * 浏览器自动播放策略要求先有用户手势再出声 [KNOWN, HIGH]；
 * 所以 main 在首次 pointerdown/keydown 时调 unlockAudio()，
 * 之后才能安全地 startBgm()/playSfx()。
 */

const STORE_KEY = "laoyou.audio.v1";

interface AudioSettings {
  muted: boolean;
  volume: number;
}

function loadSettings(): AudioSettings {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) {
      const v = JSON.parse(raw) as Partial<AudioSettings>;
      if (typeof v.muted === "boolean" && typeof v.volume === "number") {
        return { muted: v.muted, volume: Math.max(0, Math.min(1, v.volume)) };
      }
    }
  } catch {
    // localStorage 被禁用时按默认值走，不阻塞游戏
  }
  return { muted: false, volume: 0.55 };
}

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let settings = loadSettings();

function persist(): void {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(settings));
  } catch {
    // 忽略
  }
}

function applyGain(): void {
  if (!master || !ctx) return;
  const target = settings.muted ? 0 : settings.volume * 0.5;
  master.gain.setTargetAtTime(target, ctx.currentTime, 0.02);
}

export function unlockAudio(): void {
  if (typeof window === "undefined") return;
  if (!ctx) {
    const ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!ctor) return;
    try {
      ctx = new ctor();
      master = ctx.createGain();
      master.connect(ctx.destination);
      applyGain();
    } catch {
      ctx = null;
      master = null;
      return;
    }
  }
  if (ctx.state === "suspended") void ctx.resume();
  applyGain();
}

export function audioContext(): AudioContext | null {
  return ctx;
}

export function masterGain(): GainNode | null {
  return master;
}

export function isMuted(): boolean {
  return settings.muted;
}

export function setMuted(muted: boolean): void {
  settings = { ...settings, muted };
  persist();
  applyGain();
}

export function toggleMuted(): boolean {
  setMuted(!settings.muted);
  return settings.muted;
}

export function getVolume(): number {
  return settings.volume;
}

/**
 * 批 G′：设置页要能调音量（开罗 `text.txt` 的「音量」一项）。
 * 三档由界面决定（低/中/高），这里只吃 0–1。
 */
export function setVolume(volume: number): void {
  settings = { ...settings, volume: Math.max(0, Math.min(1, volume)) };
  persist();
  applyGain();
}

/**
 * 批 G′：音乐与音效分开开关 —— 开罗把「音乐」「音效」「音量」列成三项，
 * 玩家常常只想关掉循环 BGM 而保留出碗音。开关放在总线上，
 * `bgm.ts` 与 `sfx.ts` 各自先问一句，避免「关了还在排程」。
 */
let bgmOn = true;
let sfxOn = true;

export function isBgmOn(): boolean {
  return bgmOn;
}

export function isSfxOn(): boolean {
  return sfxOn;
}

export function setBgmOn(on: boolean): void {
  bgmOn = on;
}

export function setSfxOn(on: boolean): void {
  sfxOn = on;
}
