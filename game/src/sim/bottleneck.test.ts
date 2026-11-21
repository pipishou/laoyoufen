import { describe, expect, it } from "vitest";
import { createInitialState, type GameState } from "./state";
import { openForBusiness } from "./setup";
import { capacityGain, capacityOf, tightWords } from "./bottleneck";

function fresh(): GameState {
  const s = createInitialState("bottleneck-player", 7);
  expect(openForBusiness(s, "alley", "测试老友粉").ok).toBe(true);
  return s;
}

describe("今天最多卖几碗：灶、座位、总闸取最小", () => {
  it("两口座 + 一口灶：卡在灶上，不是座位", () => {
    const s = fresh();
    s.venue.seats = 2;
    const c = capacityOf(s);
    expect(c.tight).toBe("stove");
    expect(c.total).toBeCloseTo(c.stove, 5);
    expect(tightWords(s)).toBe("灶台出得慢");
  });

  it("灶升档之后，灶这一项的产能真的涨（不是只换文案）", () => {
    const s = fresh();
    s.venue.seats = 2;
    const before = capacityOf(s).stove;
    s.equipment.stove = 4;
    const after = capacityOf(s);
    expect(after.stove).toBeGreaterThan(before);
    // 每碗分钟数必须跟着下来，否则 HUD 那两个数字就是在骗人
    expect(after.serveNow).toBeLessThan(capacityOf(fresh()).serveNow);
  });

  it("扩座在灶还慢的时候一点用都没有（试玩 11-20 阿兰的坑）", () => {
    const s = fresh();
    s.venue.seats = 2;
    const g = capacityGain(s);
    expect(g.seat(2)).toBeLessThan(0.5);
    // 同一家店，把灶升一档是实打实的一天多十碗
    expect(g.stove).toBeGreaterThan(5);
  });

  it("灶已经顶到总闸时，再升灶也没有用", () => {
    const s = fresh();
    s.venue.seats = 2;
    s.equipment.stove = 4;
    s.capacity = 40; // 总闸卡死
    const g = capacityGain(s);
    expect(g.stove).toBeLessThan(0.5);
    expect(g.bench).toBeGreaterThan(0);
  });

  it("三句话里必须能说清谁在卡", () => {
    const s = fresh();
    s.venue.seats = 2;
    expect(tightWords(s)).toBe("灶台出得慢");
    s.equipment.stove = 4;
    s.capacity = 30;
    expect(tightWords(s)).toBe("备料不够卖");
  });
});
