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
  it("两口座：卡在座位上（试玩 11-22 的病灶）", () => {
    const s = fresh();
    s.venue.seats = 2;
    const c = capacityOf(s);
    // 吃一碗 6 分多、出一碗 2 分多，两个座位一天只接得住三十来碗 —— 这就是试玩里
    // 「买了两档灶，卖出的碗数还是 32–38」的全部原因
    expect(c.tight).toBe("seats");
    expect(c.total).toBeCloseTo(c.seats, 5);
    expect(tightWords(s)).toBe("座位坐不下");
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

  it("座位紧的时候，加一张 ¥150 的矮凳比 ¥1,500 的灶划算得多", () => {
    const s = fresh();
    s.venue.seats = 2;
    const g = capacityGain(s);
    expect(g.seat(1)).toBeGreaterThan(5);
    expect(g.seat(1)).toBeGreaterThan(g.stove);
  });

  it("灶已经顶到总闸时，再升灶也没有用", () => {
    const s = fresh();
    s.venue.seats = 12;
    s.equipment.stove = 4;
    s.capacity = 40; // 总闸卡死
    const g = capacityGain(s);
    expect(g.stove).toBeLessThan(0.5);
    expect(g.bench).toBeGreaterThan(0);
  });

  it("三句话里必须能说清谁在卡", () => {
    const s = fresh();
    s.venue.seats = 2;
    expect(tightWords(s)).toBe("座位坐不下");
    s.venue.seats = 12;
    s.equipment.stove = 4;
    s.capacity = 30;
    expect(tightWords(s)).toBe("备料不够卖");
  });

  it("批次二：三段各有各的增益，最慢那段的增益最大", () => {
    const s = fresh();
    s.venue.seats = 12;
    s.capacity = 999;
    const g = capacityGain(s);
    expect(g.stove).toBeGreaterThan(0);
    expect(g.pot).toBeGreaterThan(0);
    expect(g.basket).toBeGreaterThan(0);
    // 新局炒锅与汤锅的分钟数一样（2.2 分 / 1 口），所以两者增益相等；粉篓那段更快（1.6），增益最小
    expect(g.stove).toBeCloseTo(g.pot, 6);
    expect(g.basket).toBeLessThan(g.stove);
  });

  it("批次二：把炒锅买满之后，本轮最该添的就变成汤锅或粉篓", () => {
    const s = fresh();
    s.venue.seats = 12;
    s.capacity = 999;
    s.equipment.stove = 4;
    const g = capacityGain(s);
    expect(g.pot).toBeGreaterThan(0);
    expect(g.pot).toBeGreaterThan(g.stove);
  });
});
