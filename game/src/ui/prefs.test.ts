/**
 * 设置（批 G′）的纯函数部分 —— 不碰 DOM、不碰音频，便于单测。
 * 界面上的 `prefs.ts` 直接用这些。
 */
import type { Prefs } from "./prefs";
import { describe, expect, it } from "vitest";
import {
  defaultPrefs,
  nextVolume,
  normalizePrefs,
  prefWords,
  prefsSummary,
  togglePref,
  VOLUME_GAIN,
  VOLUME_WORDS,
} from "./prefs";

describe("设置（批 G′，照开罗 text.txt 七项设置的本土化）", () => {
  it("默认值与开罗一致：音乐开、音效开、音量中、两个可访问性开关关", () => {
    const p = defaultPrefs();
    expect(p).toEqual({ music: true, sfx: true, volume: "mid", contrast: false, bigText: false });
  });

  it("三档音量各有增益，且低 < 中 < 高、都不越 0–1", () => {
    expect(VOLUME_GAIN.low).toBeLessThan(VOLUME_GAIN.mid);
    expect(VOLUME_GAIN.mid).toBeLessThan(VOLUME_GAIN.high);
    for (const g of Object.values(VOLUME_GAIN)) {
      expect(g).toBeGreaterThan(0);
      expect(g).toBeLessThanOrEqual(1);
    }
    expect(VOLUME_WORDS.low).toBe("低");
  });

  it("坏值一律退回默认（手改过的 localStorage 不能把界面搞白）", () => {
    const base = defaultPrefs();
    expect(normalizePrefs(null)).toEqual(base);
    expect(normalizePrefs("nope")).toEqual(base);
    expect(normalizePrefs({ music: "yes", volume: "loud" })).toEqual(base);
    expect(normalizePrefs({ music: false, volume: "high", contrast: true })).toEqual({
      music: false,
      sfx: true,
      volume: "high",
      contrast: true,
      bigText: false,
    });
  });

  it("开关翻面不改别的字段", () => {
    const p = togglePref(defaultPrefs(), "sfx");
    expect(p.sfx).toBe(false);
    expect(p.music).toBe(true);
    expect(togglePref(p, "sfx").sfx).toBe(true);
    for (const k of ["music", "contrast", "bigText"] as const) {
      const on = defaultPrefs()[k];
      expect(togglePref(defaultPrefs(), k)[k]).toBe(!on);
    }
  });

  it("音量按低→中→高循环，反向也一样；不越界", () => {
    let p: Prefs = { ...defaultPrefs(), volume: "low" };
    p = nextVolume(p, 1);
    expect(p.volume).toBe("mid");
    p = nextVolume(p, 1);
    expect(p.volume).toBe("high");
    p = nextVolume(p, 1);
    expect(p.volume).toBe("low");
    expect(nextVolume({ ...defaultPrefs(), volume: "low" }, -1).volume).toBe("high");
    expect(nextVolume({ ...defaultPrefs(), volume: "high" }, -1).volume).toBe("mid");
  });

  it("说明文字五项齐全、中文、不带数字", () => {
    const words = prefWords(defaultPrefs());
    expect(words).toHaveLength(5);
    expect(words[0]).toBe("音乐 开");
    expect(words[2]).toBe("音量 中");
    const line = prefsSummary(defaultPrefs());
    expect(line).toContain("高对比");
    expect(line).not.toMatch(/[0-9]/);
  });
});
