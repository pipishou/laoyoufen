import { describe, expect, it } from "vitest";
import { TALKS, TALK_TOTAL, talkById } from "../data/talk";
import { talkFor, talkKindOf, talkVoiceContext } from "./talk";
import { createInitialState, type QueueCustomer } from "./state";

function fresh() {
  const s = createInitialState("p1", 7);
  s.month = 0;
  s.day = 3;
  s.reputation = 4.2;
  return s;
}

function cust(patch: Partial<QueueCustomer> = {}): QueueCustomer {
  return {
    id: 101,
    archetypeId: "student",
    dishId: 0,
    status: "eating",
    elapsed: 1,
    waited: 0,
    patience: 6,
    satisfaction: -1,
    regular: false,
    survey: 0,
    ...patch,
  } as QueueCustomer;
}

describe("客人说的话（A12）", () => {
  it("六种场面都在，每样至少三句长对白", () => {
    expect(TALK_TOTAL).toBe(6);
    const ids = TALKS.map((t) => t.id).sort();
    expect(ids).toEqual(["complain", "gift", "plain", "praise", "queue", "regular"]);
    for (const t of TALKS) {
      expect(t.lines.length).toBeGreaterThanOrEqual(3);
      // 长对白：不能是一句口号，至少 20 个字
      for (const line of t.lines) expect(line.length).toBeGreaterThanOrEqual(20);
    }
  });

  it("等位的人说等位的话", () => {
    const s = fresh();
    expect(talkKindOf(s, cust({ status: "waiting" }))).toBe("queue");
  });

  it("常客一律家常，不看口碑", () => {
    const s = fresh();
    s.reputation = 1.2;
    expect(talkKindOf(s, cust({ regular: true }))).toBe("regular");
  });

  it("口碑够了、也没让客人久等 → 夸；久等 → 挑刺", () => {
    const s = fresh();
    expect(talkKindOf(s, cust({ waited: 1 }))).toBe("praise");
    expect(talkKindOf(s, cust({ waited: 9 }))).toBe("complain");
    const low = fresh();
    low.reputation = 2.0;
    expect(talkKindOf(low, cust({ waited: 1 }))).toBe("plain");
  });

  it("同一局读档回来，同一个人说同一句", () => {
    const s = fresh();
    const a = talkFor(s, cust());
    const b = talkFor(s, cust());
    expect(a.text).toBe(b.text);
    // 换一天会换（哈希里有日期）
    s.day = 4;
    const c = talkFor(s, cust());
    expect(typeof c.text).toBe("string");
    expect(c.text.length).toBeGreaterThanOrEqual(20);
  });

  it("不消耗随机数 —— 说话不该影响出货", () => {
    const s = fresh();
    const before = JSON.stringify(s.rng);
    talkFor(s, cust());
    expect(JSON.stringify(s.rng)).toBe(before);
  });

  it("AI 语境只给名词，不给分数", () => {
    const s = fresh();
    const ctx = talkVoiceContext(s, cust(), "学生仔");
    expect(ctx["人"]).toBe("学生仔");
    expect(ctx["场面"]).toBeTruthy();
    for (const v of Object.values(ctx)) expect(/\d/.test(v)).toBe(false);
  });

  it("坏 id 取不到就当没有", () => {
    expect(talkById("nope")).toBeNull();
    expect(talkById(null)).toBeNull();
  });
});
