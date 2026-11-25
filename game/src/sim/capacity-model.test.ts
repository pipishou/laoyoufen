import { describe, expect, it } from "vitest";
import { capacityGain, capacityOf, tightWords } from "./bottleneck";
import type { GameState } from "./state";
import { createInitialState } from "./state";
import { FLOW } from "../data/balance";

/**
 * 容量模型对实测（批 AN′，P443 / P444 / P445）。
 *
 * 这里钉的是**同一天里「最多卖几碗」这个数字准不准**，不是某一批的界面。
 * 实测口径（`tmp_an2` 临时脚本，已删）：默认配平、`createInitialState` 只改座位数、
 * 连跑 6 天、取后 3 天均值、种子 1/2/3。表里第一行就是那三个种子的均值。
 *
 * 为什么要这张表：批 AM′ 发现「4 座时钩子劝人买灶、买完一碗不多」，
 * 根因是 `capacityOf` 把座位算成 `×120/(每碗分钟+6)`（4 座 = 60 碗，与灶打平，平局判给灶），
 * 而实测 4 座能卖 64 碗。模型错，钩子就会把人往错的方向带。
 */
const MEASURED: ReadonlyArray<{ seats: number; bowls: number }> = [
  { seats: 2, bowls: 36.3 },
  { seats: 3, bowls: 50.7 },
  { seats: 4, bowls: 64.0 },
  { seats: 5, bowls: 70.3 },
  { seats: 6, bowls: 71.7 },
  { seats: 8, bowls: 72.3 },
  { seats: 12, bowls: 72.0 },
];

function withSeats(seats: number): GameState {
  const s = createInitialState("cap-model", 1);
  s.venue.seats = seats;
  return s;
}

describe("容量模型：一天最多卖几碗（批 AN′，P443）", () => {
  it("每种座位数上，模型与实测相差不超过 12%", () => {
    for (const row of MEASURED) {
      const model = capacityOf(withSeats(row.seats)).total;
      const err = Math.abs(model - row.bowls) / row.bowls;
      // 最小的一档（2 座）误差最大：实测 2 座几乎零空转（36.3 vs 理想 36.4），
      // 而模型统一打 0.9 折 → 32.7，差 9.8%。留到 12% 是为了别把这条测试写成「按实测凑数」。
      expect(err, `座位 ${row.seats}：模型 ${model.toFixed(1)} vs 实测 ${row.bowls}`).toBeLessThan(0.12);
    }
  });

  it("五座往上，闸就是「街上就这么多人」——不是座位，也不是灶", () => {
    for (const seats of [5, 6, 8, 12]) {
      const c = capacityOf(withSeats(seats));
      expect(c.tight, `座位 ${seats}`).toBe("demand");
      expect(tightWords(withSeats(seats))).toBe("街上就这么多人");
    }
  });

  it("四座添一张凳，模型说多卖五碗（实测多卖 6.3 碗）；八座添凳一碗不多", () => {
    const four = capacityGain(withSeats(4)).seat(1);
    expect(four).toBeGreaterThan(3);
    expect(four).toBeLessThan(8);
    expect(capacityGain(withSeats(8)).seat(1)).toBe(0);
  });

  it("十二座时换灶一碗都不多 —— 这就是「买灶没反应」的真相（P443 / P444）", () => {
    const g = capacityGain(withSeats(12));
    expect(g.stove).toBe(0);
    expect(g.pot).toBe(0);
    expect(g.basket).toBe(0);
  });

  it("出碗节拍不是瓶颈这件事，也钉在模型里（P445 的修法与 P447 的缺口）", () => {
    // 批 AN′ 把出碗主循环从「一分钟只判一次」改成「一分钟最多判六批」（P445）。
    // 但在默认配平下，出碗节拍压根不是瓶颈：40 座、炒锅 0/1/2/4 档，一天都是 76 碗
    // （实测，`FLOW.spawnScale=6` 也只到 76 —— 卡的是来客量与总闸，不是灶）。
    // 所以这个修法现在**没法用卖碗数验证**，只能保证「节拍压到地板时不会退化成 1 分钟一批」。
    // 要真验证，得先造一个「厨房比来客慢」的配平（P447）。
    const s = withSeats(40);
    s.capacity = 99999;
    const slowest = capacityOf(s).total;
    s.equipment.stove = 4;
    expect(capacityOf(s).total).toBeCloseTo(slowest, 6);
  });

  it("换灶换不出碗数，是因为闸不在灶上 —— 模型自己会说清楚卡在哪", () => {
    const s = withSeats(12);
    const c = capacityOf(s);
    // 十二座：座位闸 196 碗、灶 600 碗、来客 70.6 碗 → 卡在来客
    expect(c.tight).toBe("demand");
    expect(c.total).toBeLessThan(c.stove);
    expect(c.total).toBeLessThanOrEqual(c.demand + 0.001);
  });

  /**
   * 批 AO′（解 P446）：来客封顶时，增益口径要能一眼看出「不是厨房的事」。
   */
  it("来客封顶又能再抬闸时，模型报 demandBlocked；抬不动时就不报", () => {
    const lazy = withSeats(8);
    const g8 = capacityGain(lazy);
    expect(tightWords(lazy)).toBe("街上就这么多人");
    expect(g8.demandBlocked).toBe(true);

    // 两座时座位闸只有三十来碗，压得比来客量低：这时抬座位还能多卖，不能说「卖不动」
    const tightSeat = withSeats(2);
    expect(capacityOf(tightSeat).tight).toBe("seats");
    expect(capacityGain(tightSeat).demandBlocked).toBe(false);
  });

  /**
   * 批 AO′（解 P447）：把厨房压慢，模型与实测对得上。
   *
   * 默认配平下出碗节拍不是瓶颈（`FLOW.serveMinutes = 1` → 灶 360 碗，来客才 70），
   * 所以 `P445` 的「一分钟能出多批」那个修法，用卖碗数根本验证不了。
   * 这里临时把 `FLOW.serveMinutes` 抬到 6（一次出碗 6 分钟），厨房就真的成为瓶颈：
   * 实测（8 座、口碑 500、累计 5000 位、总闸 9999、6 天取后 3 天均值、3 种子）
   * = **58.6 碗**；模型 `stove = 120/6 = 60` → total 60，差 2.4%。
   * 三档对照（实测 / 模型）：serve 3 → 112.9 / 120，serve 6 → 58.6 / 60，serve 12 → 29.0 / 30。
   */
  it("厨房比来客慢时（serve 6），模型与实测只差几个百分点 —— 这条才验证得了 P445", () => {
    const before = FLOW.serveMinutes;
    try {
      FLOW.serveMinutes = 6;
      const s = createInitialState("cap-model-kitchen", 1);
      s.venue.seats = 8;
      s.capacity = 9999;
      s.reputation = 500;
      s.totalCustomers = 5000;
      const c = capacityOf(s);
      expect(c.tight).toBe("stove");
      // 实测 58.6 碗
      expect(Math.abs(c.total - 58.6) / 58.6).toBeLessThan(0.08);
      // 这时抬灶是真有用（默认配平下是 0）
      expect(capacityGain(s).stove).toBeGreaterThan(5);
    } finally {
      FLOW.serveMinutes = before;
    }
  });
});
