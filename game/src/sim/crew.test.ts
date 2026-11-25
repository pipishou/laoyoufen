import { describe, expect, it } from "vitest";
import { createInitialState } from "./state";
import { crewFacts } from "./crew";
import { serveParallel, cookSlots, inNoodlesNum } from "./staff";
import type { StaffMember } from "./state";

/**
 * 批 AR′：灶位只是上限，真正开火的是掌勺的人。
 *
 * 这组用例锁三件事：
 * ① 开局只有 1 个人掌勺 → 第 2 口灶买了也没人看（`idle > 0`）；
 * ② 雇一个煮粉师傅之后 idle 归零，`serveParallel` 真的翻倍；
 * ③ 那句话不含价钱、不劝买，只说事实。
 */
function withStoves(seats: number, stoves: number) {
  const s = createInitialState("probe", 1);
  s.venue.seats = seats;
  s.venue.stoves = stoves;
  return s;
}

function cook(uid: string): StaffMember {
  return {
    uid,
    name: `师傅${uid}`,
    role: "cook",
    wage: 120,
    fatigue: 0,
    skill: 20,
    xp: 0,
    resting: false,
  } as StaffMember;
}

describe("批 AR′：谁在掌勺", () => {
  it("开局：灶 1 口、老板一个人，没有灶闲着", () => {
    const s = withStoves(4, 1);
    const f = crewFacts(s);
    expect(f.stoves).toBe(1);
    expect(f.slots).toBe(1);
    expect(f.idle).toBe(0);
    expect(f.words).toContain("人手够");
  });

  it("买到第 2 口灶但没雇人：第 2 口没人看", () => {
    const s = withStoves(6, 2);
    const f = crewFacts(s);
    expect(f.stoves).toBe(2);
    expect(f.slots).toBe(1);
    expect(f.idle).toBe(1);
    expect(f.words).toContain("第 2 口起没人看");
  });

  it("雇一个煮粉师傅之后，第 2 口灶烧得上了，并行槽真的翻倍", () => {
    const before = withStoves(6, 2);
    const p0 = serveParallel(before);
    const after = withStoves(6, 2);
    after.staff.roster.push(cook("c1"));
    expect(cookSlots(after)).toBe(2);
    expect(crewFacts(after).idle).toBe(0);
    expect(serveParallel(after)).toBe(p0 * 2);
  });

  it("只有一口灶时，多雇人也不会多开火（上限就是 1 口）", () => {
    const s = withStoves(4, 1);
    s.staff.roster.push(cook("c1"));
    expect(cookSlots(s)).toBe(2);
    expect(crewFacts(s).idle).toBe(0);
    expect(serveParallel(s)).toBe(inNoodlesNum(s));
  });

  it("那句话不劝买、不带价钱、不带数字以外的账", () => {
    for (const [stoves, cooks] of [
      [1, 0],
      [2, 0],
      [3, 0],
      [3, 2],
    ] as const) {
      const s = withStoves(6, stoves);
      for (let i = 0; i < cooks; i += 1) s.staff.roster.push(cook(`c${i}`));
      const words = crewFacts(s).words;
      expect(words).not.toMatch(/¥|元|买|推荐|建议|划算/);
    }
  });
});
