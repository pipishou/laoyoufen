/**
 * 双端适配（批 BJ′，解 P550）的纯函数部分。
 *
 * 只测 `fitScale()` —— 它决定了「舞台缩放倍数」这一个数，
 * 而这个数错了会以「点了没反应 / 画面被裁边」的形式出现，最难查。
 * 不测 `initViewport()`：它整个是 DOM + 事件监听，靠 `tools/gate/bj_probe.py`
 * 在真浏览器里量（探针量的是 getBoundingClientRect，含 transform）。
 */
import { describe, expect, it } from "vitest";
import { fitScale } from "./viewport";

describe("视口适配（批 BJ′，解 P550）", () => {
  it("桌面 1440×900 无安全区：按高的 768 算，1.1719", () => {
    expect(fitScale(1440, 900)).toBeCloseTo(900 / 768, 4);
  });

  it("竖屏 360×640 无安全区：按宽的 1024 算，0.3516", () => {
    expect(fitScale(360, 640)).toBeCloseTo(360 / 1024, 4);
  });

  it("刘海机左右各 44px 且宽才是瓶颈：扣掉之后舞台更小，不会溢出被裁", () => {
    // 667×375 那档高才是瓶颈（375/768 < 667/1024），扣宽度看不出差别 ——
    // 所以这里用一个「宽是瓶颈」的竖屏尺寸，才测得到 padding 的影响。
    const withPad = fitScale(375, 800, 88, 0);
    const without = fitScale(375, 800, 0, 0);
    expect(withPad).toBeLessThan(without);
    expect(withPad).toBeCloseTo((375 - 88) / 1024, 4);
  });

  it("高才是瓶颈时，扣左右 padding 不改变结果（说明只扣该扣的那一边）", () => {
    expect(fitScale(667, 375, 88, 0)).toBeCloseTo(375 / 768, 4);
  });

  it("padding 比屏还大时不让它算出负数或 0（兜到下限 0.2）", () => {
    expect(fitScale(100, 100, 400, 400)).toBe(0.2);
  });

  it("超宽屏封顶 3 倍，别把像素糊成马赛克", () => {
    expect(fitScale(8000, 6000)).toBe(3);
  });

  it("同一组数算两次结果一致（缩放不能抖）", () => {
    expect(fitScale(375, 667, 0, 0)).toBe(fitScale(375, 667, 0, 0));
  });
});
