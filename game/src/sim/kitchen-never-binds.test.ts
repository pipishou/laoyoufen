import { describe, expect, it } from "vitest";
import { FLOW } from "../data/balance";
import { capacityOf } from "./bottleneck";
import { createInitialState } from "./state";

/**
 * 批 AR′（P449）：**真实配平下厨房永远不是闸**，这是一条结构化的事实，不是漏改。
 *
 * 为什么要专门写一条测试盯着它：
 * - AO′ 给「厨房真卡」造了配平，但那配平只活在测试里（`FLOW.serveMinutes = 6`）；
 * - AN′ 之后灶项口径是对的，可默认配平下灶是 **360 碗/天**，而来客上限只有
 *   `demandCapOf`（兴宁区约 130）—— 差三倍，所以 `tight` 永远轮不到 `"stove"`；
 * - 于是 P445 的「一分钟能出多批」对玩家收益为零。这不是 bug，是配平结果。
 *
 * 这条测试的作用是**把这条事实钉住**：哪天有人调了 `FLOW.serveMinutes`、并行槽数
 * 或区客流，让厨房真的成了闸，这条会红 —— 那时候 P449 就从「已知限制」变成
 * 「玩家真的会遇到」，界面文案与文档必须跟着改。
 */

const SEAT_CASES = [4, 6, 8, 12, 20, 40];
const STOVE_CASES = [1, 2, 3, 4];

function shop(seats: number, stoves: number) {
  const s = createInitialState("p", 1);
  s.venue.seats = seats;
  s.venue.stoves = stoves;
  return s;
}

describe("P449：真实配平下灶不是闸", () => {
  it("座位 4–40 × 灶 1–4，没有一格 tight === stove", () => {
    for (const seats of SEAT_CASES) {
      for (const stoves of STOVE_CASES) {
        const c = capacityOf(shop(seats, stoves));
        expect(c.stove).toBeGreaterThan(0);
        expect(c.tight, `座位 ${seats} · 灶 ${stoves} 竟然卡在灶上`).not.toBe("stove");
      }
    }
  });

  it("灶的日碗量比来客上限高出两倍以上（这才是它轮不到的原因）", () => {
    const c = capacityOf(shop(6, 1));
    expect(c.stove).toBeGreaterThan(c.demand * 2);
  });

  it("座位到 40 也只是把 tight 从 seats 推到 demand，不动 stove", () => {
    const small = capacityOf(shop(4, 1));
    const big = capacityOf(shop(40, 1));
    expect(small.tight).toBe("seats");
    expect(big.tight).toBe("demand");
    expect(big.stove).toBe(small.stove);
  });

  it("把出碗节拍压慢到 2 分以上，厨房才真的成为闸（P449 的边界在这条线后面）", () => {
    const before = FLOW.serveMinutes;
    try {
      const slowest = FLOW.serveMinutes;
      const tightAt: Record<number, string> = {};
      for (const minutes of [slowest, 2, 3, 4, 6]) {
        FLOW.serveMinutes = minutes;
        tightAt[minutes] = capacityOf(shop(8, 2)).tight;
      }
      // 默认（1 分）根本不卡厨房
      expect(tightAt[slowest]).not.toBe("stove");
      // 至少要到 2 分以上才会轮到灶
      const firstStove = Object.keys(tightAt)
        .map(Number)
        .sort((a, b) => a - b)
        .find((m) => tightAt[m] === "stove");
      expect(firstStove).toBeGreaterThanOrEqual(2);
      // 压到 6 分时确实是灶，且灶的日碗量掉到 60 上下
      FLOW.serveMinutes = 6;
      const c = capacityOf(shop(8, 2));
      expect(c.tight).toBe("stove");
      expect(c.stove).toBeGreaterThan(40);
      expect(c.stove).toBeLessThan(90);
    } finally {
      FLOW.serveMinutes = before;
    }
  });

  it("恢复默认之后一格都不许留（免得后一个测试被带坏）", () => {
    expect(FLOW.serveMinutes).toBe(1);
    expect(capacityOf(shop(8, 2)).tight).not.toBe("stove");
  });
});
