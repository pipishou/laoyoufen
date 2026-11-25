/**
 * 设置（批 G′）：照开罗 `text.txt` 的七项设置做本土化选择。
 *
 * 开罗原文（`English.lproj__text.txt` 1173 行里能读到的设置项）只有七条：
 * 画质（高/中/低）、性能（普通/高速）、音乐、音效、音量、画面旋转（自动/固定）、
 * 中断续玩。前三项是渲染与机型适配，本作是固定 2D 像素画面，没有对应物；
 * 「中断续玩」我们本来就有（每回合自动存档）。
 *
 * 所以这里做了四项真能改变体验的，加上一项我们自己需要的：
 * 1. 音乐开/关（`bgm.ts` 的循环曲子，玩家常在后期关掉）
 * 2. 音效开/关（出碗、进账的短音）
 * 3. 音量三档（低/中/高 —— 手机的媒体音量之外还要一档，开罗也是三档思路）
 * 4. 高对比（像素风的老读者在亮屏下看不清 `--wood` 与 `--sand` 的差别）
 * 5. 大字（HUD 那三行关键数字放大，不改整站字号 —— 铺开会动版式）
 *
 * 存 `localStorage`，不进存档：换设备就该重新选，且不占 `SAVE_VERSION`。
 */

import { setBgmOn, setSfxOn, setVolume, isBgmOn, isSfxOn } from "../audio/engine";
import { startBgm, stopBgm } from "../audio/bgm";

export type VolumeStep = "low" | "mid" | "high";

export interface Prefs {
  music: boolean;
  sfx: boolean;
  volume: VolumeStep;
  contrast: boolean;
  bigText: boolean;
  /**
   * 打烊单那几行是不是展开着（批 AH′，解 P412）。
   * 这不是开罗的东西 —— 是玩家自己点开的习惯，关掉游戏再回来该还开着。
   * 存这里而不是存进存档：它也属于「这台机器上的习惯」，不跟档走、不占 `SAVE_VERSION`。
   */
  whyOpen: boolean;
}

export const PREFS_KEY = "laoyou.prefs.v1";

/** 三档音量对应的总线增益（`engine.applyGain` 还会再乘 0.5） */
export const VOLUME_GAIN: Readonly<Record<VolumeStep, number>> = {
  low: 0.3,
  mid: 0.55,
  high: 0.85,
};

export const VOLUME_WORDS: Readonly<Record<VolumeStep, string>> = {
  low: "低",
  mid: "中",
  high: "高",
};

const VOLUME_ORDER: readonly VolumeStep[] = ["low", "mid", "high"];

export function defaultPrefs(): Prefs {
  return { music: true, sfx: true, volume: "mid", contrast: false, bigText: false, whyOpen: false };
}

/** 坏值一律退回默认，不让一个手改过的 localStorage 把界面搞白 */
export function normalizePrefs(raw: unknown): Prefs {
  const base = defaultPrefs();
  if (!raw || typeof raw !== "object") return base;
  const v = raw as Partial<Record<keyof Prefs, unknown>>;
  return {
    music: typeof v.music === "boolean" ? v.music : base.music,
    sfx: typeof v.sfx === "boolean" ? v.sfx : base.sfx,
    volume: VOLUME_ORDER.includes(v.volume as VolumeStep) ? (v.volume as VolumeStep) : base.volume,
    contrast: typeof v.contrast === "boolean" ? v.contrast : base.contrast,
    bigText: typeof v.bigText === "boolean" ? v.bigText : base.bigText,
    whyOpen: typeof v.whyOpen === "boolean" ? v.whyOpen : base.whyOpen,
  };
}

export function loadPrefs(): Prefs {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (!raw) return defaultPrefs();
    return normalizePrefs(JSON.parse(raw));
  } catch {
    return defaultPrefs();
  }
}

export function savePrefs(p: Prefs): void {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(p));
  } catch {
    // localStorage 被禁用时只影响下次开局，不影响本局
  }
}

/** 把设置落到总线和根节点 class 上；开机与每次改动都调一次 */
export function applyPrefs(p: Prefs): void {
  setVolume(VOLUME_GAIN[p.volume]);
  setSfxOn(p.sfx);
  const musicWas = isBgmOn();
  setBgmOn(p.music);
  if (!p.music) {
    if (musicWas) stopBgm();
  } else if (!musicWas) {
    // 只在「从关到开」时尝试启动；没解锁音频时 `startBgm` 自己会退
    startBgm();
  }
  if (typeof document !== "undefined") {
    const root = document.documentElement;
    root.classList.toggle("prefs-contrast", p.contrast);
    root.classList.toggle("prefs-big", p.bigText);
    applyContrastPalette(root, p.contrast);
  }
  // sfx 开关读到的是引擎里的值，这里再核一遍，防止外部改过
  if (isSfxOn() !== p.sfx) setSfxOn(p.sfx);
}

/**
 * 高对比的色板。
 *
 * 踩过的坑：根节点上有一份**内联**的色板（`render/stage.ts` 按画面缩放写上去的
 * `--ink: #2f2118` 那一串），内联样式优先于任何样式表规则，
 * 所以 `html.prefs-contrast { --ink: #000 }` 根本打不过它。
 * 这里改成同样写内联：开的时候盖一层，关的时候把原值还回去。
 */
const CONTRAST_PALETTE: Readonly<Record<string, string>> = {
  "--ink": "#000000",
  "--ink2": "#241708",
  "--wood": "#463d2a",
  "--sand": "#6d5c43",
  "--cream": "#fffdf6",
  "--paper": "#fffef9",
  "--paper2": "#f2e8d4",
  "--red": "#8c1f14",
  "--orange": "#a8501f",
  "--green": "#155c30",
  "--gold": "#7a5c08",
  "--blue": "#274a63",
};

let savedPalette: Record<string, string> | null = null;

function applyContrastPalette(root: HTMLElement, on: boolean): void {
  if (on) {
    if (!savedPalette) {
      savedPalette = {};
      for (const key of Object.keys(CONTRAST_PALETTE)) {
        savedPalette[key] = root.style.getPropertyValue(key);
      }
    }
    for (const [key, value] of Object.entries(CONTRAST_PALETTE)) {
      root.style.setProperty(key, value);
    }
    return;
  }
  if (!savedPalette) return;
  for (const [key, value] of Object.entries(savedPalette)) {
    if (value) root.style.setProperty(key, value);
    else root.style.removeProperty(key);
  }
  savedPalette = null;
}

export type ToggleKey = "music" | "sfx" | "contrast" | "bigText";

export function togglePref(p: Prefs, key: ToggleKey): Prefs {
  return { ...p, [key]: !p[key] };
}

/** 音量按低→中→高循环，dir=-1 反向 */
export function nextVolume(p: Prefs, dir: 1 | -1 = 1): Prefs {
  const i = VOLUME_ORDER.indexOf(p.volume);
  const n = VOLUME_ORDER.length;
  const next = VOLUME_ORDER[(i + (dir > 0 ? 1 : n - 1)) % n] ?? "mid";
  return { ...p, volume: next };
}

export function prefWords(p: Prefs): string[] {
  return [
    `音乐 ${p.music ? "开" : "关"}`,
    `音效 ${p.sfx ? "开" : "关"}`,
    `音量 ${VOLUME_WORDS[p.volume]}`,
    `高对比 ${p.contrast ? "开" : "关"}`,
    `大字 ${p.bigText ? "开" : "关"}`,
  ];
}

export function prefsSummary(p: Prefs): string {
  return prefWords(p).join(" · ");
}
