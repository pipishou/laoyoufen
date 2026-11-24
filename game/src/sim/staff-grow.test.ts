import { describe, expect, it } from "vitest";
import {
  ATTR_MAX,
  FINISH_ATTR_NEED,
  FINISH_BY_ROLE,
  FINISH_SKILLS,
  STAFF_ATTR_ORDER,
  STAFF_SKILLS,
  finishSkillById,
  staffSkillById,
} from "../data/staff-skill";
import {
  attrsOf,
  effectsOf,
  finishOf,
  growDay,
  growWords,
  learnedOf,
  levelOfXp,
  staffEffects,
  staffLevelOf,
} from "./staff-grow";
import { inNoodlesNum, settleStaffDay } from "./staff";
import { createInitialState, type StaffMember } from "./state";

function member(role: StaffMember["role"], xp = 0, extra: Partial<StaffMember> = {}): StaffMember {
  return {
    uid: `t-${role}-${xp}`,
    templateId: "st.test",
    name: "测试员",
    role,
    skill: 3,
    wage: 150,
    fatigue: 0,
    resting: false,
    xp,
    ...extra,
  };
}

function fresh() {
  const s = createInitialState("staff-grow", 11);
  s.staff.roster = [];
  return s;
}

describe("店员成长表（批 L'）", () => {
  it("二十一项手艺、六门毕业技，四项属性都有，且每项都写得出开罗出处", () => {
    expect(STAFF_SKILLS.length).toBe(21);
    expect(FINISH_SKILLS.length).toBe(6);
    for (const a of STAFF_ATTR_ORDER) {
      expect(STAFF_SKILLS.filter((d) => d.attr === a).length).toBeGreaterThan(0);
    }
    for (const d of [...STAFF_SKILLS, ...FINISH_SKILLS]) {
      expect(d.kairo.length).toBeGreaterThan(3);
      expect(d.name.length).toBeGreaterThan(1);
    }
    // 每个岗位的毕业技 id 都要真在表里
    for (const id of Object.values(FINISH_BY_ROLE)) {
      expect(finishSkillById(id)).not.toBeNull();
    }
  });

  it("门槛不超出属性上限，学会的手艺不会永远学不到", () => {
    for (const d of STAFF_SKILLS) {
      expect(d.need).toBeGreaterThanOrEqual(2);
      expect(d.need).toBeLessThanOrEqual(ATTR_MAX);
    }
    expect(FINISH_ATTR_NEED).toBeLessThanOrEqual(ATTR_MAX);
  });
});

describe("xp 现算属性（批 L'）", () => {
  it("新来的四属性都是 1 级，一门手艺都不会", () => {
    const m = member("cook");
    expect(levelOfXp(0)).toBe(0);
    expect(attrsOf(m)).toEqual({ fire: 1, serve: 1, feet: 1, grit: 1 });
    expect(learnedOf(m)).toEqual([]);
    expect(finishOf(m)).toBeNull();
  });

  it("煮粉的先长火候：干到 3 天升 1 级、火候到 2 学会「看火」", () => {
    const m = member("cook", 3);
    expect(staffLevelOf(m)).toBe(1);
    expect(attrsOf(m).fire).toBe(2);
    expect(learnedOf(m)).toContain("sk.watchfire");
  });

  it("跑堂的先长待客：3 天有「招呼」，问口味速率加上去", () => {
    const s = fresh();
    const m = member("server", 3);
    s.staff.roster = [m];
    expect(attrsOf(m).serve).toBe(2);
    expect(learnedOf(m)).toContain("sk.greet");
    expect(staffEffects(s).survey).toBeGreaterThan(0);
  });

  it("封顶守得住：练到头也只有 8 级属性，效果不会越叠越大", () => {
    const m = member("cook", 9999);
    const a = attrsOf(m);
    expect(a.fire).toBeLessThanOrEqual(ATTR_MAX);
    const e = effectsOf(m);
    expect(e.noodle).toBeLessThanOrEqual(2);
    expect(e.fatigue).toBeLessThanOrEqual(0.35);
    expect(e.survey).toBeLessThanOrEqual(14);
    expect(e.rest).toBeLessThanOrEqual(40);
    expect(e.keep).toBeLessThanOrEqual(20);
    expect(e.xp).toBeLessThanOrEqual(3);
  });

  it("四属性都到 5 级才出毕业技，煮粉的拿「多下一份」", () => {
    const mid = member("cook", 24); // 3 级：火候 5，其余 2
    expect(finishOf(mid)).toBeNull();
    const vet = member("cook", 9999);
    expect(finishOf(vet)).toBe("fs.onemore");
    expect(finishSkillById(finishOf(vet)!)?.name).toBe("多下一份");
  });
});

describe("日结长进（批 L'）", () => {
  it("在职的每天 +1 点，休息的这半天不算", () => {
    const s = fresh();
    const working = member("cook", 0);
    const resting = member("prep", 0, { uid: "rest-1", resting: true });
    s.staff.roster = [working, resting];
    settleStaffDay(s);
    expect(working.xp).toBe(1);
    expect(resting.xp).toBe(0);
  });

  it("累到 60 以上只算半格：硬撑着的人学不进东西", () => {
    const s = fresh();
    const tired = member("cook", 0, { fatigue: 70 });
    s.staff.roster = [tired];
    settleStaffDay(s);
    expect(tired.xp).toBe(0.5);
  });

  it("长进会报一句，让玩家看见人熟了", () => {
    const s = fresh();
    s.staff.roster = [member("cook", 2)];
    const lines = growDay(s);
    expect(lines.some((t) => t.includes("看火"))).toBe(true);

    const s2 = fresh();
    s2.staff.roster = [member("cook", 2)];
    settleStaffDay(s2);
    expect(s2.staff.lastEvent).toContain("看火");
  });
});

describe("成长接进产能与面板（批 L'）", () => {
  it("手艺让一口锅多下份数，但仍压在原来那个封顶里", () => {
    const s = fresh();
    const base = inNoodlesNum(s);
    s.staff.roster = [member("cook", 9999)];
    const grown = inNoodlesNum(s);
    expect(grown).toBeGreaterThan(base);
    expect(grown).toBeLessThanOrEqual(base + 2);
  });

  it("面板那一句写得出四项属性与下一级还差几天", () => {
    const words = growWords(member("server", 3));
    expect(words).toContain("火候");
    expect(words).toContain("待客");
    expect(words).toContain("脚力");
    expect(words).toContain("耐磨");
    expect(words).toMatch(/再干 \d+ 天升一级/);
    expect(staffSkillById("sk.greet")?.name).toBe("招呼");
  });
});
