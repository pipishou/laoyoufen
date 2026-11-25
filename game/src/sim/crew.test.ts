import { describe, expect, it } from "vitest";
import { createInitialState } from "./state";
import { crewFacts } from "./crew";
import { serveParallel, cookSlots, inNoodlesNum } from "./staff";
import type { StaffMember } from "./state";
import { FLOW } from "../data/balance";

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
      const f = crewFacts(s);
      expect(f.words).not.toMatch(/¥|元|买|推荐|建议|划算/);
    }
  });
});

/**
 * 批 AS′（解 P458）：知道「第 2 口灶没人看」之后，下一句一定是「补得起吗」。
 *
 * 三件事分开考：① 人手槽没开的时候先说「还差多少位」，别给价钱；
 * ② 开了槽就报今天候选里最便宜那个煮粉的日薪 / 介绍费 / 月薪；
 * ③ 没有缺口（灶都有人看）时一句价钱都不许出 —— 否则等于催人白花钱。
 */
describe("批 AS′：补一个人要多少", () => {
  /** 造一个「今天候选里有煮粉」的店：候选池按天重掷，这里直接摆 */
  function withCookCandidate(seats: number, stoves: number, wage = 150) {
    const s = withStoves(seats, stoves);
    s.staff.candidates = [
      {
        uid: "cand-prep",
        name: "阿珍",
        role: "prep",
        wage: 130,
        fatigue: 0,
        skill: 2,
        xp: 0,
        resting: false,
      } as StaffMember,
      {
        uid: "cand-cook",
        name: "阿强",
        role: "cook",
        wage,
        fatigue: 0,
        skill: 3,
        xp: 0,
        resting: false,
      } as StaffMember,
    ];
    return s;
  }

  it("人手槽没开：先说还差多少位累计接待，不给价钱", () => {
    const s = withCookCandidate(6, 2);
    s.totalCustomers = 0;
    const f = crewFacts(s);
    expect(f.idle).toBe(1);
    expect(f.cost).toContain("还差 300 位");
    expect(f.cost).toContain("到 300 位");
    expect(f.cost).not.toMatch(/¥/);
  });

  it("人手槽开了：报那个煮粉的日薪、介绍费（一次）与月薪，并且报技能等级", () => {
    const s = withCookCandidate(6, 2, 150);
    s.totalCustomers = 300; // 第 1 个人已开
    const f = crewFacts(s);
    expect(f.gate).toBeNull();
    expect(f.hire?.name).toBe("阿强");
    expect(f.cost).toContain("日薪 ¥150");
    expect(f.cost).toContain("介绍费 ¥300"); // HIRE_FEE_RATE = 2
    // 批 AT′（P463）：介绍费是按次收的，不是每月 —— 不说清就会被当周薪算
    expect(f.cost).toContain("介绍费 ¥300（一次）");
    expect(f.cost).toMatch(/月薪约 ¥\d+/);
    // 批 AT′（P461）：日薪高低不等于值不值，技能才决定这口灶开多快
    expect(f.hire?.skill).toBe(3);
    expect(f.cost).toContain("技能 3");
    // 只挑煮粉：备料也在候选里，但它不掌勺
    expect(f.hire?.name).not.toBe("阿珍");
  });

  it("候选里贵的那个技能更高：挑「每一块钱技能最高」，不是挑最便宜", () => {
    // 日薪由技能定（WAGE_BY_SKILL 110/130/150/180/220），所以「最便宜」等于「最弱」。
    // 这里摆一个便宜的弱师傅和一个贵的强师傅，看挑谁。
    const s = withStoves(6, 2);
    s.totalCustomers = 300;
    s.staff.candidates = [
      { uid: "c1", name: "阿弱", role: "cook", wage: 110, fatigue: 0, skill: 1, xp: 0, resting: false },
      { uid: "c2", name: "阿强", role: "cook", wage: 220, fatigue: 0, skill: 5, xp: 0, resting: false },
    ] as StaffMember[];
    const f = crewFacts(s);
    expect(f.hire?.name).toBe("阿强");
    expect(f.hire?.skill).toBe(5);
    expect(f.cost).toContain("技能 5");
  });

  it("灶都有人看：一句价钱都不出（不催人白花钱）", () => {
    const s = withCookCandidate(6, 1);
    s.totalCustomers = 300;
    const f = crewFacts(s);
    expect(f.idle).toBe(0);
    expect(f.cost).toBe("");
    expect(f.why).toBe("");
  });

  it("有缺口但今天没煮粉来问工：直说，不编一个价钱", () => {
    const s = withStoves(6, 2);
    s.staff.candidates = [];
    s.totalCustomers = 300;
    const f = crewFacts(s);
    expect(f.hire).toBeNull();
    expect(f.cost).toBe("今天没有煮粉的来问工");
    expect(f.cost).not.toMatch(/¥/);
  });

  it("厨房真是最紧那一道时，副句说「今天卡的就是灶」", () => {
    const s = withStoves(4, 2);
    // 把来客与座位抬走，只留灶：`FLOW.serveMinutes` 压慢到 6 分是唯一能让灶成为闸的办法
    const before = FLOW.serveMinutes;
    try {
      FLOW.serveMinutes = 6;
      const f = crewFacts(s);
      expect(f.kitchenBinds).toBe(true);
      expect(f.why).toContain("今天卡的就是灶");
    } finally {
      FLOW.serveMinutes = before;
    }
  });
});

/**
 * 批 AV′（解 P469 / P470 / P471）：那两句「补人也换不来碗」原来是从 `tight` 反推的，
 * 现在让模型自己算一遍「多一个人掌勺」的差值。
 *
 * 三条：① 默认配平下这个差值过不了噪声线，价钱句才该带前提；
 * ② 厨房真卡时差值是真的（4 座 2 灶压慢到 6 分：+5.45 碗），界面把这口火值几碗说出来；
 * ③ 前提的开关必须由调用方显式传（`crewCostWords` 的第二参数没有默认值）。
 */
describe("批 AV′：补一个人到底多卖几碗", () => {
  function withCookCandidateAgain(seats: number, stoves: number, wage = 150) {
    const s = withStoves(seats, stoves);
    s.staff.candidates = [
      { uid: "cand-cook", name: "阿强", role: "cook", wage, fatigue: 0, skill: 3, xp: 0, resting: false },
    ] as StaffMember[];
    s.totalCustomers = 300;
    return s;
  }

  it("默认配平：补人的差值是 0，价钱句带「换不来更多的碗」（P469）", () => {
    const s = withCookCandidateAgain(6, 2);
    const f = crewFacts(s);
    expect(f.idle).toBe(1);
    expect(f.kitchenBinds).toBe(false);
    expect(f.cookGain).toBe(0);
    expect(f.cost).toContain("换不来更多的碗");
  });

  it("厨房真卡：差值是真的，副句说清这口火值几碗（P470）", () => {
    const s = withCookCandidateAgain(4, 2);
    const before = FLOW.serveMinutes;
    try {
      FLOW.serveMinutes = 6;
      const f = crewFacts(s);
      expect(f.kitchenBinds).toBe(true);
      expect(f.cookGain).toBeGreaterThan(5);
      expect(f.why).toContain("约多卖 5 碗");
      // 真能多卖的时候，价钱句不许再说「换不来更多的碗」
      expect(f.cost).not.toContain("换不来更多的碗");
    } finally {
      FLOW.serveMinutes = before;
    }
  });

  it("只有一口灶时多雇人也不多开火：差值恒 0（min 卡在灶位数上）", () => {
    const s = withCookCandidateAgain(6, 1);
    // 一口灶、老板自己掌勺：没有缺口，多雇的那个人开不了新火
    expect(crewFacts(s).idle).toBe(0);
    expect(crewFacts(s).cookGain).toBe(0);
    s.venue.stoves = 2;
    s.staff.roster.push(cook("c1"));
    // 两口灶、两个人掌勺：再添一个人同样换不来碗
    expect(crewFacts(s).cookGain).toBe(0);
  });
});
