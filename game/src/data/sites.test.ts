import { describe, expect, it } from "vitest";
import { SITES, dailyBowlCeiling, siteById } from "./sites";
import { seatBowlCeiling } from "../sim/bottleneck";

/**
 * 建店卡上的「一天最多约 N 碗」（批 BH′，解 P548）。
 *
 * 这条数字是**玩家选铺位时唯一该比的东西**：97 局线上试玩里 48 局选了免费的 2 座，
 * 中位只活 2 天 —— 因为卡片只写「2 座 / 1 口灶 / 月租约 ¥1,500」，
 * 「2 座」对玩家不是产能信息，只是「便宜」。
 */
describe("铺位的日产能（建店卡那一行）", () => {
  it("三档数字：2 座 33 · 4 座 65 · 6 座 98（2 座离 4 座差着一半）", () => {
    expect(dailyBowlCeiling(siteById("stall")!)).toBe(33);
    expect(dailyBowlCeiling(siteById("alley")!)).toBe(65);
    expect(dailyBowlCeiling(siteById("streetfront")!)).toBe(98);
    // 2 座不是「便宜一点点的 4 座」：它只有 4 座的一半多（33 / 65 = 0.51）
    expect(dailyBowlCeiling(siteById("stall")!) / dailyBowlCeiling(siteById("alley")!)).toBeLessThan(0.55);
  });

  it("与模型同一个算式：把 seatBowlCeiling 四舍五入就是它", () => {
    for (const site of SITES) {
      expect(dailyBowlCeiling(site)).toBe(Math.round(seatBowlCeiling(site.seats)));
    }
    // 原式（`seats × DAY_MINUTES × SEAT_IDLE / EAT_MINUTES`）手算一遍，防止有人改常量却不改这里
    expect(seatBowlCeiling(2)).toBeCloseTo((2 * 120 * 0.9) / 6.6, 9);
  });

  it("座位越多越大，且不会出现两档写同一个数", () => {
    const values = SITES.map((s) => dailyBowlCeiling(s));
    expect(values).toEqual([...values].sort((a, b) => a - b));
    expect(new Set(values).size).toBe(values.length);
  });
});
